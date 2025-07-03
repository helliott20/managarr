// backend/routes/localMedia.js
const { createLogger } = require('../logger');
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { PathMapping, LocalScanStatus, Media } = require('../database');
const { Op } = require('sequelize');

const log = createLogger('localMedia');

// Get all path mappings
router.get('/mappings', async (req, res) => {
  try {
    const mappings = await PathMapping.findAll();
    res.json(mappings);
  } catch (error) {
    log.error({ error }, 'Error getting path mappings');
    res.status(500).json({ error: 'Failed to get path mappings' });
  }
});

// Add a new path mapping
router.post('/mappings', async (req, res) => {
  try {
    const { plexPath, localPath, enabled, description } = req.body;
    
    if (!plexPath || !localPath) {
      return res.status(400).json({ error: 'Plex path and local path are required' });
    }
    
    const newMapping = await PathMapping.create({
      plexPath,
      localPath,
      enabled: enabled !== undefined ? enabled : true,
      description
    });
    
    res.status(201).json(newMapping);
  } catch (error) {
    log.error({ error }, 'Error adding path mapping');
    res.status(500).json({ error: 'Failed to add path mapping' });
  }
});

// Update a path mapping
router.put('/mappings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { plexPath, localPath, enabled, description } = req.body;
    
    const mapping = await PathMapping.findByPk(id);
    
    if (!mapping) {
      return res.status(404).json({ error: 'Path mapping not found' });
    }
    
    if (plexPath) mapping.plexPath = plexPath;
    if (localPath) mapping.localPath = localPath;
    if (enabled !== undefined) mapping.enabled = enabled;
    if (description !== undefined) mapping.description = description;
    
    await mapping.save();
    
    res.json(mapping);
  } catch (error) {
    log.error({ error }, 'Error updating path mapping');
    res.status(500).json({ error: 'Failed to update path mapping' });
  }
});

// Delete a path mapping
router.delete('/mappings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const mapping = await PathMapping.findByPk(id);
    
    if (!mapping) {
      return res.status(404).json({ error: 'Path mapping not found' });
    }
    
    await mapping.destroy();
    
    res.json({ success: true });
  } catch (error) {
    log.error({ error }, 'Error deleting path mapping');
    res.status(500).json({ error: 'Failed to delete path mapping' });
  }
});

// Get all local files
router.get('/', async (req, res) => {
  try {
    const { type, sort, search } = req.query;
    
    // Build query conditions
    const where = {};
    
    if (type) {
      where.type = type;
    }
    
    if (search) {
      where[Op.or] = [
        { filename: { [Op.like]: `%${search}%` } },
        { path: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // Build sort options
    let order = [['createdAt', 'DESC']];
    
    if (sort) {
      switch (sort) {
        case 'newest':
          order = [['created', 'DESC']];
          break;
        case 'oldest':
          order = [['created', 'ASC']];
          break;
        case 'largest':
          order = [['size', 'DESC']];
          break;
        case 'smallest':
          order = [['size', 'ASC']];
          break;
        case 'name':
          order = [['filename', 'ASC']];
          break;
        default:
          order = [['createdAt', 'DESC']];
      }
    }
    
    const files = await Media.findAll({
      where,
      order
    });
    
    res.json({ media: files });
  } catch (error) {
    log.error({ error }, 'Error getting local files');
    res.status(500).json({ error: 'Failed to get local files' });
  }
});

// Scan directory for media files
router.post('/scan', async (req, res) => {
  try {
    const { directory } = req.body;
    
    log.info({ directory }, 'Received scan request');
    
    if (!directory) {
      log.warn('Directory path is required');
      return res.status(400).json({ error: 'Directory path is required' });
    }
    
    // Check if directory exists
    try {
      log.debug({ directory }, 'Checking if directory exists');
      await fs.access(directory);
      log.debug({ directory }, 'Directory exists and is accessible');
    } catch (error) {
      log.error({ error, directory }, 'Directory access error');
      return res.status(400).json({ error: `Directory does not exist or is not accessible: ${directory}` });
    }
    
    // Initialize scan status
    log.debug('Checking for existing scan in progress');
    let scanStatus = await LocalScanStatus.findOne({ where: { status: { [Op.ne]: 'idle' } } });
    
    if (scanStatus) {
      log.info({ scanId: scanStatus.id }, 'Found existing scan in progress');
      // If there's already a scan in progress, return its status
      return res.json(scanStatus);
    }
    
    // Create new scan status
    log.debug('Creating new scan status');
    scanStatus = await LocalScanStatus.create({
      status: 'counting',
      progress: 0,
      currentFile: null,
      filesProcessed: 0,
      totalFiles: 0,
      startTime: new Date(),
      details: { directory }
    });
    
    log.info({ scanId: scanStatus.id }, 'Created new scan status');
    
    // Return the initial scan status to the client
    res.json(scanStatus);
    
    // Count files first (in the background)
    log.info({ directory }, 'Counting files in directory');
    try {
      const totalFiles = await countFiles(directory);
      log.info({ totalFiles, directory }, 'Found media files in directory');
      
      // Update scan status with total files and change status to scanning
      scanStatus.totalFiles = totalFiles;
      scanStatus.status = 'scanning';
      await scanStatus.save();
      log.debug({ totalFiles }, 'Updated scan status with total files');
      
      // Start scan process in background
      log.info({ directory }, 'Starting scan process');
      await processDirectory(directory, scanStatus);
      
      // Update scan status to completed
      scanStatus.status = 'completed';
      scanStatus.progress = 100;
      scanStatus.endTime = new Date();
      await scanStatus.save();
      log.info({ directory }, 'Scan completed');
    } catch (countError) {
      log.error({ error: countError }, 'Error counting or processing files');
      
      // Update scan status to error
      scanStatus.status = 'error';
      scanStatus.error = `Error counting or processing files: ${countError.message}`;
      scanStatus.endTime = new Date();
      await scanStatus.save();
    }
  } catch (error) {
    log.error({ error }, 'Error starting directory scan');
    res.status(500).json({ error: `Failed to start directory scan: ${error.message}` });
  }
});

// Get scan progress
router.get('/scan/progress', async (req, res) => {
  try {
    // Get the most recent scan status
    const scanStatus = await LocalScanStatus.findOne({
      order: [['createdAt', 'DESC']]
    });
    
    if (!scanStatus) {
      return res.json({
        status: 'idle',
        progress: 0,
        currentFile: null,
        filesProcessed: 0,
        totalFiles: 0,
        startTime: null,
        endTime: null,
        error: null
      });
    }
    
    res.json(scanStatus);
  } catch (error) {
    log.error({ error }, 'Error getting scan progress');
    res.status(500).json({ error: 'Failed to get scan progress' });
  }
});

// Reset scan status (for debugging)
router.post('/scan/reset', async (req, res) => {
  try {
    log.info('Resetting all scan statuses to idle');
    
    // Find all scan statuses
    const scanStatuses = await LocalScanStatus.findAll();
    
    // Update all scan statuses to idle
    for (const status of scanStatuses) {
      status.status = 'idle';
      status.progress = 0;
      status.currentFile = null;
      status.filesProcessed = 0;
      status.endTime = new Date();
      await status.save();
      log.debug({ statusId: status.id }, 'Reset scan status');
    }
    
    res.json({ success: true, message: 'All scan statuses reset to idle' });
  } catch (error) {
    log.error({ error }, 'Error resetting scan statuses');
    res.status(500).json({ error: 'Failed to reset scan statuses' });
  }
});

// Delete file
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the file in the database
    const file = await Media.findByPk(id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check if file is protected
    if (file.protected) {
      return res.status(403).json({ error: 'Cannot delete protected file' });
    }
    
    // Delete from the filesystem
    try {
      await fs.unlink(file.path);
    } catch (fsError) {
      log.error({ error: fsError }, 'Error deleting file from filesystem');
      // Continue even if file doesn't exist on filesystem
    }
    
    // Delete the file from the database
    await file.destroy();
    
    res.json({ success: true });
  } catch (error) {
    log.error({ error }, 'Error deleting file');
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Toggle file protection
router.patch('/:id/protect', async (req, res) => {
  try {
    const { id } = req.params;
    const { isProtected } = req.body;
    
    // Find the file in the database
    const file = await Media.findByPk(id);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Toggle protection status
    file.protected = isProtected !== undefined ? isProtected : !file.protected;
    await file.save();
    
    res.json(file);
  } catch (error) {
    log.error({ error }, 'Error toggling file protection');
    res.status(500).json({ error: 'Failed to toggle file protection' });
  }
});

// Helper function to scan directory recursively
async function scanDirectory(directoryPath, scanStatusId) {
  log.debug({ directoryPath, scanStatusId }, 'scanDirectory called');
  
  try {
    // Get scan status
    log.debug({ scanStatusId }, 'Fetching scan status');
    const scanStatus = await LocalScanStatus.findByPk(scanStatusId);
    
    if (!scanStatus) {
      log.error({ scanStatusId }, 'Scan status not found');
      return;
    }
    
    log.debug({ scanStatus: scanStatus.toJSON() }, 'Found scan status');
    
    // Check if directory exists before proceeding
    try {
      log.debug({ directoryPath }, 'Checking if directory exists in scan');
      await fs.access(directoryPath);
      log.debug({ directoryPath }, 'Directory exists and is accessible in scan');
    } catch (accessError) {
      log.error({ error: accessError, directoryPath }, 'Directory access error in scan');
      
      // Update scan status to error
      log.info('Updating scan status to error: Directory not accessible');
      scanStatus.status = 'error';
      scanStatus.error = `Directory does not exist or is not accessible: ${directoryPath}`;
      scanStatus.endTime = new Date();
      await scanStatus.save();
      log.debug('Scan status updated to error');
      return;
    }
    
    // Count total files first (for progress tracking)
    log.info({ directoryPath }, 'Counting files in directory for scan');
    const totalFiles = await countFiles(directoryPath);
    log.info({ totalFiles, directoryPath }, 'Found media files in directory for scan');
    
    // Update scan status with total files
    log.debug({ totalFiles }, 'Updating scan status with total files');
    scanStatus.totalFiles = totalFiles;
    await scanStatus.save();
    log.debug('Scan status updated with total files');
    
    // Process files
    log.info({ directoryPath }, 'Processing directory');
    await processDirectory(directoryPath, scanStatus);
    log.info({ directoryPath }, 'Finished processing files in directory');
    
    // Update scan status to completed
    log.info('Updating scan status to completed');
    scanStatus.status = 'completed';
    scanStatus.progress = 100;
    scanStatus.endTime = new Date();
    await scanStatus.save();
    log.debug('Scan status updated to completed');
  } catch (error) {
    log.error({ error, stack: error.stack }, 'Error scanning directory');
    
    // Update scan status to error
    log.info({ errorMessage: error.message }, 'Updating scan status to error');
    const scanStatus = await LocalScanStatus.findByPk(scanStatusId);
    if (scanStatus) {
      scanStatus.status = 'error';
      
      // Format error message to be more user-friendly
      let errorMessage = error.message;
      
      // Handle ENOENT errors specifically
      if (error.code === 'ENOENT') {
        const missingPath = error.path || 'unknown path';
        errorMessage = `File or directory not found: ${missingPath}`;
      }
      
      scanStatus.error = errorMessage;
      scanStatus.endTime = new Date();
      await scanStatus.save();
      log.debug({ errorMessage }, 'Scan status updated to error');
    } else {
      log.error({ scanStatusId }, 'Could not find scan status to update error');
    }
  }
}

// Helper function to count files recursively
async function countFiles(directoryPath) {
  log.debug({ directoryPath }, 'countFiles called');
  let count = 0;
  
  try {
    // Check if directory exists
    try {
      log.debug({ directoryPath }, 'Checking if directory exists for counting');
      await fs.access(directoryPath);
      log.debug({ directoryPath }, 'Directory exists and is accessible for counting');
    } catch (accessError) {
      log.error({ error: accessError, directoryPath }, 'Directory does not exist or is not accessible for counting');
      return 0;
    }
    
    // Read directory contents
    log.debug({ directoryPath }, 'Reading directory contents for counting');
    const items = await fs.readdir(directoryPath);
    log.debug({ itemCount: items.length, directoryPath }, 'Found items in directory for counting');
    
    for (const item of items) {
      try {
        const itemPath = path.join(directoryPath, item);
        log.debug({ itemPath }, 'Processing item for counting');
        
        // Check if item exists
        try {
          await fs.access(itemPath);
        } catch (itemAccessError) {
          log.warn({ error: itemAccessError, itemPath }, 'Item does not exist or is not accessible');
          continue;
        }
        
        log.debug({ itemPath }, 'Getting stats for item');
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          log.debug({ itemPath }, 'Item is a directory, recursing');
          const subCount = await countFiles(itemPath);
          log.debug({ subCount, itemPath }, 'Subdirectory contains media files');
          count += subCount;
        } else if (isMediaFile(item)) {
          log.debug({ itemPath }, 'Found media file');
          count++;
        } else {
          log.debug({ itemPath }, 'Skipping non-media file');
        }
      } catch (itemError) {
        log.error({ error: itemError, directoryPath }, 'Error processing item in directory');
        // Continue with next item
      }
    }
    
    log.info({ directoryPath, count }, 'Directory contains media files (including subdirectories)');
  } catch (error) {
    log.error({ error, stack: error.stack, directoryPath }, 'Error counting files in directory');
  }
  
  return count;
}

// Helper function to process directory recursively
async function processDirectory(directoryPath, scanStatus) {
  log.debug({ directoryPath }, 'processDirectory called');
  
  try {
    // Check if directory exists
    try {
      console.log(`Checking if directory exists: ${directoryPath}`);
      await fs.access(directoryPath);
      console.log(`Directory exists and is accessible: ${directoryPath}`);
    } catch (accessError) {
      console.error(`Directory does not exist or is not accessible: ${directoryPath}`, accessError);
      return;
    }
    
    // Read directory contents
    console.log(`Reading directory contents: ${directoryPath}`);
    const items = await fs.readdir(directoryPath);
    console.log(`Found ${items.length} items in directory: ${directoryPath}`);
    
    for (const item of items) {
      try {
        const itemPath = path.join(directoryPath, item);
        console.log(`Processing item: ${itemPath}`);
        
        // Check if item exists
        try {
          await fs.access(itemPath);
        } catch (itemAccessError) {
          log.warn({ error: itemAccessError, itemPath }, 'Item does not exist or is not accessible');
          continue;
        }
        
        log.debug({ itemPath }, 'Getting stats for item');
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          log.debug({ itemPath }, 'Item is a directory, recursing');
          await processDirectory(itemPath, scanStatus);
        } else if (isMediaFile(item)) {
          console.log(`Found media file, processing: ${itemPath}`);
          
          // Update scan status
          console.log(`Updating scan status for file: ${itemPath}`);
          scanStatus.currentFile = itemPath;
          scanStatus.filesProcessed++;
          scanStatus.progress = Math.floor((scanStatus.filesProcessed / scanStatus.totalFiles) * 100);
          await scanStatus.save();
          console.log(`Scan status updated: ${scanStatus.filesProcessed}/${scanStatus.totalFiles} (${scanStatus.progress}%)`);
          
          // Process file
          console.log(`Adding/updating file in database: ${itemPath}`);
          await processFile(itemPath, stats);
          console.log(`File processed: ${itemPath}`);
        } else {
          log.debug({ itemPath }, 'Skipping non-media file');
        }
      } catch (itemError) {
        log.error({ error: itemError, directoryPath }, 'Error processing item in directory');
        console.error('Error stack:', itemError.stack);
        // Continue with next item
      }
    }
    
    console.log(`Finished processing directory: ${directoryPath}`);
  } catch (error) {
    console.error(`Error processing directory ${directoryPath}:`, error);
    console.error('Error stack:', error.stack);
  }
}

// Helper function to process a file
async function processFile(filePath, stats) {
  log.debug({ filePath }, 'processFile called');
  
  try {
    const filename = path.basename(filePath);
    log.debug({ filename }, 'Processing file');
    
    const fileType = getFileType(filename);
    log.debug({ fileType, filename }, 'Determined file type');
    
    // Check if file already exists in database
    log.debug({ filePath }, 'Checking if file already exists in database');
    const existingFile = await Media.findOne({
      where: { path: filePath }
    });
    
    if (existingFile) {
      log.debug({ filePath }, 'File exists in database, updating');
      // Update existing file
      existingFile.size = stats.size;
      existingFile.lastAccessed = stats.atime;
      await existingFile.save();
      log.debug({ filePath }, 'File updated in database');
    } else {
      log.debug({ filePath }, 'File does not exist in database, creating');
      // Create new file
      const newFile = await Media.create({
        path: filePath,
        filename,
        size: stats.size,
        type: fileType,
        created: stats.birthtime || stats.ctime,
        lastAccessed: stats.atime
      });
      log.debug({ filePath, fileId: newFile.id }, 'File created in database');
    }
  } catch (error) {
    log.error({ error, stack: error.stack, filePath }, 'Error processing file');
    // Continue with next file
  }
}

// Helper function to check if file is a media file
function isMediaFile(filename) {
  const mediaExtensions = [
    // Video
    '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg',
    // Audio
    '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a',
    // Image
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'
  ];
  
  const ext = path.extname(filename).toLowerCase();
  return mediaExtensions.includes(ext);
}

// Helper function to get file type
function getFileType(filename) {
  const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'];
  const audioExtensions = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'];
  
  const ext = path.extname(filename).toLowerCase();
  
  if (videoExtensions.includes(ext)) {
    // Try to determine if it's a movie or show based on path/filename
    if (filename.match(/[sS]\d{1,2}[eE]\d{1,2}/) || filename.match(/season\s*\d+/i)) {
      return 'show';
    }
    return 'movie';
  } else if (audioExtensions.includes(ext)) {
    return 'music';
  } else if (imageExtensions.includes(ext)) {
    return 'photo';
  } else {
    return 'other';
  }
}

module.exports = router;

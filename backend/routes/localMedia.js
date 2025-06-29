// backend/routes/localMedia.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { PathMapping, LocalScanStatus, Media } = require('../database');
const { Op } = require('sequelize');

// Get all path mappings
router.get('/mappings', async (req, res) => {
  try {
    const mappings = await PathMapping.findAll();
    res.json(mappings);
  } catch (error) {
    console.error('Error getting path mappings:', error);
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
    console.error('Error adding path mapping:', error);
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
    console.error('Error updating path mapping:', error);
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
    console.error('Error deleting path mapping:', error);
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
    console.error('Error getting local files:', error);
    res.status(500).json({ error: 'Failed to get local files' });
  }
});

// Scan directory for media files
router.post('/scan', async (req, res) => {
  try {
    const { directory } = req.body;
    
    console.log(`Received scan request for directory: ${directory}`);
    
    if (!directory) {
      console.log('Error: Directory path is required');
      return res.status(400).json({ error: 'Directory path is required' });
    }
    
    // Check if directory exists
    try {
      console.log(`Checking if directory exists: ${directory}`);
      await fs.access(directory);
      console.log(`Directory exists and is accessible: ${directory}`);
    } catch (error) {
      console.error(`Directory access error:`, error);
      return res.status(400).json({ error: `Directory does not exist or is not accessible: ${directory}` });
    }
    
    // Initialize scan status
    console.log('Checking for existing scan in progress');
    let scanStatus = await LocalScanStatus.findOne({ where: { status: { [Op.ne]: 'idle' } } });
    
    if (scanStatus) {
      console.log(`Found existing scan in progress: ${scanStatus.id}`);
      // If there's already a scan in progress, return its status
      return res.json(scanStatus);
    }
    
    // Create new scan status
    console.log('Creating new scan status');
    scanStatus = await LocalScanStatus.create({
      status: 'counting',
      progress: 0,
      currentFile: null,
      filesProcessed: 0,
      totalFiles: 0,
      startTime: new Date(),
      details: { directory }
    });
    
    console.log(`Created new scan status with ID: ${scanStatus.id}`);
    
    // Return the initial scan status to the client
    res.json(scanStatus);
    
    // Count files first (in the background)
    console.log(`Counting files in directory: ${directory}`);
    try {
      const totalFiles = await countFiles(directory);
      console.log(`Found ${totalFiles} media files in directory: ${directory}`);
      
      // Update scan status with total files and change status to scanning
      scanStatus.totalFiles = totalFiles;
      scanStatus.status = 'scanning';
      await scanStatus.save();
      console.log(`Updated scan status with total files: ${totalFiles}`);
      
      // Start scan process in background
      console.log(`Starting scan process for directory: ${directory}`);
      await processDirectory(directory, scanStatus);
      
      // Update scan status to completed
      scanStatus.status = 'completed';
      scanStatus.progress = 100;
      scanStatus.endTime = new Date();
      await scanStatus.save();
      console.log(`Scan completed for directory: ${directory}`);
    } catch (countError) {
      console.error('Error counting or processing files:', countError);
      
      // Update scan status to error
      scanStatus.status = 'error';
      scanStatus.error = `Error counting or processing files: ${countError.message}`;
      scanStatus.endTime = new Date();
      await scanStatus.save();
    }
  } catch (error) {
    console.error('Error starting directory scan:', error);
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
    console.error('Error getting scan progress:', error);
    res.status(500).json({ error: 'Failed to get scan progress' });
  }
});

// Reset scan status (for debugging)
router.post('/scan/reset', async (req, res) => {
  try {
    console.log('Resetting all scan statuses to idle');
    
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
      console.log(`Reset scan status with ID: ${status.id}`);
    }
    
    res.json({ success: true, message: 'All scan statuses reset to idle' });
  } catch (error) {
    console.error('Error resetting scan statuses:', error);
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
      console.error('Error deleting file from filesystem:', fsError);
      // Continue even if file doesn't exist on filesystem
    }
    
    // Delete the file from the database
    await file.destroy();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
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
    console.error('Error toggling file protection:', error);
    res.status(500).json({ error: 'Failed to toggle file protection' });
  }
});

// Helper function to scan directory recursively
async function scanDirectory(directoryPath, scanStatusId) {
  console.log(`scanDirectory called with path: ${directoryPath}, scanStatusId: ${scanStatusId}`);
  
  try {
    // Get scan status
    console.log(`Fetching scan status with ID: ${scanStatusId}`);
    const scanStatus = await LocalScanStatus.findByPk(scanStatusId);
    
    if (!scanStatus) {
      console.error(`Scan status not found for ID: ${scanStatusId}`);
      return;
    }
    
    console.log(`Found scan status: ${JSON.stringify(scanStatus.toJSON())}`);
    
    // Check if directory exists before proceeding
    try {
      console.log(`Checking if directory exists: ${directoryPath}`);
      await fs.access(directoryPath);
      console.log(`Directory exists and is accessible: ${directoryPath}`);
    } catch (accessError) {
      console.error(`Directory access error:`, accessError);
      
      // Update scan status to error
      console.log(`Updating scan status to error: Directory not accessible`);
      scanStatus.status = 'error';
      scanStatus.error = `Directory does not exist or is not accessible: ${directoryPath}`;
      scanStatus.endTime = new Date();
      await scanStatus.save();
      console.log(`Scan status updated to error`);
      return;
    }
    
    // Count total files first (for progress tracking)
    console.log(`Counting files in directory: ${directoryPath}`);
    const totalFiles = await countFiles(directoryPath);
    console.log(`Found ${totalFiles} media files in directory: ${directoryPath}`);
    
    // Update scan status with total files
    console.log(`Updating scan status with total files: ${totalFiles}`);
    scanStatus.totalFiles = totalFiles;
    await scanStatus.save();
    console.log(`Scan status updated with total files`);
    
    // Process files
    console.log(`Processing directory: ${directoryPath}`);
    await processDirectory(directoryPath, scanStatus);
    console.log(`Finished processing files in directory: ${directoryPath}`);
    
    // Update scan status to completed
    console.log(`Updating scan status to completed`);
    scanStatus.status = 'completed';
    scanStatus.progress = 100;
    scanStatus.endTime = new Date();
    await scanStatus.save();
    console.log(`Scan status updated to completed`);
  } catch (error) {
    console.error('Error scanning directory:', error);
    console.error('Error stack:', error.stack);
    
    // Update scan status to error
    console.log(`Updating scan status to error due to: ${error.message}`);
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
      console.log(`Scan status updated to error: ${errorMessage}`);
    } else {
      console.error(`Could not find scan status with ID: ${scanStatusId} to update error`);
    }
  }
}

// Helper function to count files recursively
async function countFiles(directoryPath) {
  console.log(`countFiles called with path: ${directoryPath}`);
  let count = 0;
  
  try {
    // Check if directory exists
    try {
      console.log(`Checking if directory exists: ${directoryPath}`);
      await fs.access(directoryPath);
      console.log(`Directory exists and is accessible: ${directoryPath}`);
    } catch (accessError) {
      console.error(`Directory does not exist or is not accessible: ${directoryPath}`, accessError);
      return 0;
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
          console.error(`Item does not exist or is not accessible: ${itemPath}`, itemAccessError);
          continue;
        }
        
        console.log(`Getting stats for item: ${itemPath}`);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          console.log(`Item is a directory, recursing: ${itemPath}`);
          const subCount = await countFiles(itemPath);
          console.log(`Subdirectory ${itemPath} contains ${subCount} media files`);
          count += subCount;
        } else if (isMediaFile(item)) {
          console.log(`Found media file: ${itemPath}`);
          count++;
        } else {
          console.log(`Skipping non-media file: ${itemPath}`);
        }
      } catch (itemError) {
        console.error(`Error processing item in directory ${directoryPath}:`, itemError);
        // Continue with next item
      }
    }
    
    console.log(`Directory ${directoryPath} contains ${count} media files (including subdirectories)`);
  } catch (error) {
    console.error(`Error counting files in directory ${directoryPath}:`, error);
    console.error('Error stack:', error.stack);
  }
  
  return count;
}

// Helper function to process directory recursively
async function processDirectory(directoryPath, scanStatus) {
  console.log(`processDirectory called with path: ${directoryPath}`);
  
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
          console.error(`Item does not exist or is not accessible: ${itemPath}`, itemAccessError);
          continue;
        }
        
        console.log(`Getting stats for item: ${itemPath}`);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          console.log(`Item is a directory, recursing: ${itemPath}`);
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
          console.log(`Skipping non-media file: ${itemPath}`);
        }
      } catch (itemError) {
        console.error(`Error processing item in directory ${directoryPath}:`, itemError);
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
  console.log(`processFile called with path: ${filePath}`);
  
  try {
    const filename = path.basename(filePath);
    console.log(`Processing file: ${filename}`);
    
    const fileType = getFileType(filename);
    console.log(`Determined file type: ${fileType}`);
    
    // Check if file already exists in database
    console.log(`Checking if file already exists in database: ${filePath}`);
    const existingFile = await Media.findOne({
      where: { path: filePath }
    });
    
    if (existingFile) {
      console.log(`File exists in database, updating: ${filePath}`);
      // Update existing file
      existingFile.size = stats.size;
      existingFile.lastAccessed = stats.atime;
      await existingFile.save();
      console.log(`File updated in database: ${filePath}`);
    } else {
      console.log(`File does not exist in database, creating: ${filePath}`);
      // Create new file
      const newFile = await Media.create({
        path: filePath,
        filename,
        size: stats.size,
        type: fileType,
        created: stats.birthtime || stats.ctime,
        lastAccessed: stats.atime
      });
      console.log(`File created in database with ID: ${newFile.id}`);
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    console.error('Error stack:', error.stack);
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

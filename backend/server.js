const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const axios = require('axios');
const pinoHttp = require('pino-http');
const { logger, createLogger } = require('./logger');
const { 
  sequelize, 
  Media, 
  DeletionRule, 
  DeletionHistory, 
  PendingDeletion,
  Settings, 
  SyncStatus,
  PlexLibrary,
  PathMapping,
  LocalScanStatus,
  initializeDatabase 
} = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;
const log = createLogger('server');

// Middleware
app.use(cors());
app.use(express.json());

// HTTP logging middleware
app.use(pinoHttp({
  logger: createLogger('http'),
  level: 'info',
  autoLogging: {
    ignore: (req) => {
      // Skip logging for static files, health checks, and frequent polling
      const skipPaths = ['/health', '/favicon.ico', '/api/notifications/summary'];
      const skipMethods = req.method === 'OPTIONS';
      return skipPaths.includes(req.url) || skipMethods;
    }
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 400) return 'error';
    if (res.statusCode >= 300) return 'warn';
    return 'silent'; // Hide successful requests completely
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url
    }),
    res: (res) => ({
      status: res.statusCode
    })
  }
}));

// Import and mount safe routes FIRST to give them precedence over dangerous direct routes
const localMediaRoutes = require('./routes/localMedia');
const integrationsRoutes = require('./routes/integrations');
const rulesRoutes = require('./routes/rules');
const syncRoutes = require('./routes/sync_enhanced');
const pendingDeletionsRoutes = require('./routes/pendingDeletions');
const notificationRoutes = require('./routes/notifications');

// Mount safe routes with precedence
app.use('/api/local-media', localMediaRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/rules', rulesRoutes);  // SAFE: Uses pending deletions workflow
app.use('/api/sync', syncRoutes);
app.use('/api/pending-deletions', pendingDeletionsRoutes);
app.use('/api/notifications', notificationRoutes);

// Initialize database
initializeDatabase().then(async () => {
  log.info('Database initialized');
  
  // Initialize deletion executor service
  const deletionExecutor = require('./services/deletionExecutor');
  log.info('Deletion executor service loaded');
  
  // Initialize sync scheduler service
  try {
    const syncScheduler = require('./services/syncScheduler');
    await syncScheduler.startScheduledSync();
    log.info('Sync scheduler service started');
  } catch (error) {
    log.error({ error }, 'Error starting sync scheduler');
  }
}).catch(err => {
  log.error({ error: err }, 'Database initialization error');
});

// Mock database for fallback if needed
const mockDb = {
  settings: {
    general: {
      darkMode: true,
      autoCleanup: true,
      cleanupThreshold: 90,
      notifyBeforeDelete: true,
      storageWarningThreshold: 90,
      language: 'en',
      dateFormat: 'MM/DD/YYYY'
    },
    plex: {
      serverUrl: 'http://192.168.1.100:32400',
      authToken: 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz',
      connectionStatus: 'connected',
      lastSynced: new Date(Date.now() - 3600000 * 3),
      autoSync: true,
      syncInterval: 60
    },
    notifications: {
      email: {
        enabled: false,
        address: '',
        smtpSettings: {
          host: '',
          port: 587,
          secure: false,
          user: '',
          password: ''
        }
      },
      webhook: {
        enabled: false,
        url: ''
      }
    }
  },
  media: [
    {
      _id: '1',
      path: '/media/movies/Movie1.mp4',
      filename: 'Movie1.mp4',
      size: 3.5 * 1024 * 1024 * 1024,
      type: 'movie',
      created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      lastAccessed: new Date(),
      watched: true,
      protected: false
    },
    {
      _id: '2',
      path: '/media/movies/Movie2.mp4',
      filename: 'Movie2.mp4',
      size: 4.2 * 1024 * 1024 * 1024,
      type: 'movie',
      created: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      lastAccessed: new Date(),
      watched: false,
      protected: false
    },
    {
      _id: '3',
      path: '/media/tv/Show1/S01E01.mp4',
      filename: 'S01E01.mp4',
      size: 1.8 * 1024 * 1024 * 1024,
      type: 'show',
      created: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      lastAccessed: new Date(),
      watched: true,
      protected: false
    },
    {
      _id: '4',
      path: '/media/tv/Show1/S01E02.mp4',
      filename: 'S01E02.mp4',
      size: 1.7 * 1024 * 1024 * 1024,
      type: 'show',
      created: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      lastAccessed: new Date(),
      watched: false,
      protected: false
    },
    {
      _id: '5',
      path: '/media/music/Album1/Song1.mp3',
      filename: 'Song1.mp3',
      size: 15 * 1024 * 1024,
      type: 'music',
      created: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      lastAccessed: new Date(),
      watched: false,
      protected: false
    }
  ],
  rules: [
    {
      _id: '1',
      name: 'Old Movies',
      description: 'Delete old movies that have been watched',
      mediaTypes: ['movie'],
      conditions: {
        olderThan: 90,
        watchedStatus: 'watched',
        minRating: 0,
        maxRating: 7
      },
      enabled: true,
      created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      _id: '2',
      name: 'Old TV Shows',
      description: 'Delete old TV shows that have been watched',
      mediaTypes: ['show'],
      conditions: {
        olderThan: 60,
        watchedStatus: 'watched',
        minRating: 0,
        maxRating: 10
      },
      enabled: true,
      created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    }
  ],
  deletionHistory: [
    {
      _id: '1',
      ruleId: '1',
      ruleName: 'Old Movies',
      timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      mediaDeleted: [
        {
          filename: 'OldMovie1.mp4',
          path: '/media/movies/OldMovie1.mp4',
          size: 4.5 * 1024 * 1024 * 1024,
          type: 'movie'
        }
      ],
      totalSizeFreed: 4.5 * 1024 * 1024 * 1024,
      success: true
    },
    {
      _id: '2',
      ruleId: '2',
      ruleName: 'Old TV Shows',
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      mediaDeleted: [
        {
          filename: 'S01E01.mp4',
          path: '/media/tv/OldShow/S01E01.mp4',
          size: 1.8 * 1024 * 1024 * 1024,
          type: 'show'
        },
        {
          filename: 'S01E02.mp4',
          path: '/media/tv/OldShow/S01E02.mp4',
          size: 1.7 * 1024 * 1024 * 1024,
          type: 'show'
        }
      ],
      totalSizeFreed: 3.5 * 1024 * 1024 * 1024,
      success: true
    }
  ]
};

// Flag to determine if we should use SQLite or fallback to mock data
const useSqlite = process.env.USE_SQLITE !== 'false';

// Routes

// Media routes
// Protect/unprotect media
app.patch('/api/media/:id/protect', async (req, res) => {
  try {
    const { id } = req.params;
    const { protected } = req.body;
    
    req.log.info({ id, protected }, 'Protect API called');
    
    if (protected === undefined) {
      req.log.warn('Protected status is required');
      return res.status(400).json({ 
        success: false, 
        message: 'Protected status is required' 
      });
    }
    
    if (!useSqlite) {
      // Use mock data
      req.log.info('Using mock data');
      const mediaIndex = mockDb.media.findIndex(m => m._id === id);
      if (mediaIndex === -1) {
        req.log.warn({ id }, 'Media not found in mock DB');
        return res.status(404).json({ 
          success: false, 
          message: 'Media not found' 
        });
      }
      
      mockDb.media[mediaIndex].protected = protected;
      req.log.info({ media: mockDb.media[mediaIndex] }, 'Updated mock media');
      
      return res.json({
        success: true,
        media: mockDb.media[mediaIndex]
      });
    }
    
    // Use SQLite with Sequelize
    req.log.info('Using SQLite database');
    
    // Import Sequelize operators
    const { Op } = require('sequelize');
    
    // First try to find by primary key
    let media = await Media.findByPk(id);
    
    // If not found, try to find by metadata.plexId or other identifiers
    if (!media) {
      req.log.info({ id }, 'Media not found by primary key, trying to find by metadata');
      
      // Import Sequelize operators
      const { Op } = require('sequelize');
      
      try {
        // Try to find by metadata.plexId or metadata.sonarrId or metadata.radarrId
        media = await Media.findOne({
          where: {
            [Op.or]: [
              sequelize.literal(`json_extract(metadata, '$.plexId') = '${id}'`),
              sequelize.literal(`json_extract(metadata, '$.sonarrId') = '${id}'`),
              sequelize.literal(`json_extract(metadata, '$.radarrId') = '${id}'`)
            ]
          }
        });
      } catch (findError) {
        req.log.error({ error: findError }, 'Error finding media by metadata');
        // Try a simpler query if the complex one fails
        try {
          media = await Media.findOne({
            where: sequelize.literal(`json_extract(metadata, '$.sonarrId') = '${id}'`)
          });
        } catch (simpleError) {
          req.log.error({ error: simpleError }, 'Error with simple query');
        }
      }
      
      // If still not found, create a new media entry
      if (!media) {
        req.log.info({ id }, 'Media not found by metadata, creating new entry');
        media = await Media.create({
          path: `/virtual/${id}`,
          filename: `virtual-${id}`,
          size: 0,
          type: 'other',
          protected: protected,
          metadata: {
            sonarrId: id.toString(),
            radarrId: id.toString(),
            virtual: true
          }
        });
        req.log.info({ media: media.toJSON() }, 'Created new media entry');
      } else {
        req.log.info({ media: media.toJSON() }, 'Found media by metadata');
      }
    } else {
      req.log.info({ media: media.toJSON() }, 'Found media by primary key');
    }
    
    // Update the protected status
    await media.update({ protected });
    req.log.info({ id, protected }, 'Updated media protected status');
    
    res.json({
      success: true,
      media
    });
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/media/:id/protect PATCH');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

app.get('/api/media', async (req, res) => {
  try {
    const { type, sort, limit = 100, page = 1 } = req.query;
    const offset = (page - 1) * parseInt(limit);
    const pageSize = parseInt(limit);
    
    if (!useSqlite) {
      // Use mock data
      let filteredMedia = [...mockDb.media];
      
      // Apply type filter
      if (type) {
        filteredMedia = filteredMedia.filter(item => item.type === type);
      }
      
      // Apply sorting
      if (sort === 'size') {
        filteredMedia.sort((a, b) => b.size - a.size);
      } else if (sort === 'date') {
        filteredMedia.sort((a, b) => new Date(b.created) - new Date(a.created));
      } else {
        filteredMedia.sort((a, b) => a.filename.localeCompare(b.filename));
      }
      
      // Apply pagination
      const paginatedMedia = filteredMedia.slice(offset, offset + pageSize);
      
      return res.json({
        media: paginatedMedia,
        pagination: {
          total: filteredMedia.length,
          page: parseInt(page),
          pages: Math.ceil(filteredMedia.length / pageSize)
        }
      });
    }
    
    // Use SQLite with Sequelize
    const query = type ? { type } : {};
    const order = sort === 'size' ? [['size', 'DESC']] : 
                  sort === 'date' ? [['created', 'DESC']] : 
                  [['filename', 'ASC']];
    
    const { count, rows: media } = await Media.findAndCountAll({
      where: query,
      order,
      offset,
      limit: pageSize
    });
    
    res.json({
      media,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / pageSize)
      }
    });
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/media GET');
    
    // Fallback to mock data
    let filteredMedia = [...mockDb.media];
    const { type, sort, limit = 100, page = 1 } = req.query;
    const offset = (page - 1) * parseInt(limit);
    const pageSize = parseInt(limit);
    
    // Apply type filter
    if (type) {
      filteredMedia = filteredMedia.filter(item => item.type === type);
    }
    
    // Apply sorting
    if (sort === 'size') {
      filteredMedia.sort((a, b) => b.size - a.size);
    } else if (sort === 'date') {
      filteredMedia.sort((a, b) => new Date(b.created) - new Date(a.created));
    } else {
      filteredMedia.sort((a, b) => a.filename.localeCompare(b.filename));
    }
    
    // Apply pagination
    const paginatedMedia = filteredMedia.slice(offset, offset + pageSize);
    
    res.json({
      media: paginatedMedia,
      pagination: {
        total: filteredMedia.length,
        page: parseInt(page),
        pages: Math.ceil(filteredMedia.length / pageSize)
      }
    });
  }
});

// Stats for dashboard
app.get('/api/media/stats', async (req, res) => {
  try {
    if (!useSqlite) {
      // Use mock data
      // Calculate total size
      const totalSize = mockDb.media.reduce((sum, file) => sum + file.size, 0);
      
      // Count by media type
      const typeDistribution = [];
      const typeMap = {};
      
      mockDb.media.forEach(file => {
        if (!typeMap[file.type]) {
          typeMap[file.type] = { count: 0, size: 0 };
        }
        typeMap[file.type].count++;
        typeMap[file.type].size += file.size;
      });
      
      Object.keys(typeMap).forEach(type => {
        typeDistribution.push({
          _id: type,
          count: typeMap[type].count,
          size: typeMap[type].size
        });
      });
      
      // Recent additions (sort by created date)
      const recentAdditions = [...mockDb.media]
        .sort((a, b) => new Date(b.created) - new Date(a.created))
        .slice(0, 5);
      
      // Recent deletions - flatten mock data to match expected structure
      const recentDeletions = [];
      mockDb.deletionHistory.forEach((historyEntry, historyIndex) => {
        if (historyEntry.mediaDeleted && Array.isArray(historyEntry.mediaDeleted)) {
          historyEntry.mediaDeleted.forEach((media, mediaIndex) => {
            recentDeletions.push({
              id: `mock-${historyIndex}-${mediaIndex}`,
              name: media.filename || media.name || 'Unknown File',
              path: media.path || 'Unknown Path',
              size: media.size || 0,
              reason: historyEntry.ruleName || 'Manual Deletion',
              deletedAt: historyEntry.timestamp,
              ruleId: historyEntry.ruleId
            });
          });
        }
      });
      
      // Sort by deletion date and take the 5 most recent
      recentDeletions.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
      const finalRecentDeletions = recentDeletions.slice(0, 5);
      
      
      return res.json({
        totalSize,
        typeDistribution,
        recentAdditions,
        recentDeletions: finalRecentDeletions
      });
    }
    
    // Use SQLite with Sequelize
    const { sequelize } = require('./database');
    
    // Total storage usage
    const totalSizeResult = await Media.sum('size');
    const totalSize = totalSizeResult || 0;
    
    // Count by media type
    const typeDistribution = await Media.findAll({
      attributes: [
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('size')), 'size']
      ],
      group: ['type']
    });
    
    // Format the type distribution to match the expected format
    const formattedTypeDistribution = typeDistribution.map(item => ({
      _id: item.type,
      count: parseInt(item.getDataValue('count')),
      size: parseInt(item.getDataValue('size'))
    }));
    
    // Recent additions
    const recentAdditions = await Media.findAll({
      order: [['created', 'DESC']],
      limit: 5
    });
    
    // Recent deletions - get recently completed pending deletions
    const completedPendingDeletions = await PendingDeletion.findAll({
      where: {
        status: 'completed'
      },
      order: [['completedAt', 'DESC']],
      limit: 5
    });
    
    const recentDeletions = completedPendingDeletions.map((pendingDeletion, index) => {
      const mediaSnapshot = pendingDeletion.mediaSnapshot || {};
      const ruleSnapshot = pendingDeletion.ruleSnapshot || {};
      
      return {
        id: `pending-${pendingDeletion.id}`,
        name: mediaSnapshot.filename || mediaSnapshot.name || 'Unknown File',
        path: mediaSnapshot.path || 'Unknown Path', 
        size: mediaSnapshot.size || 0,
        reason: ruleSnapshot.name || 'Manual Deletion',
        deletedAt: pendingDeletion.completedAt || pendingDeletion.updatedAt,
        ruleId: pendingDeletion.ruleId,
        status: pendingDeletion.status
      };
    });
    
    
    res.json({
      totalSize,
      typeDistribution: formattedTypeDistribution,
      recentAdditions,
      recentDeletions: recentDeletions
    });
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/media/stats');
    
    // Fallback to mock data on error
    // Calculate total size
    const totalSize = mockDb.media.reduce((sum, file) => sum + file.size, 0);
    
    // Count by media type
    const typeDistribution = [];
    const typeMap = {};
    
    mockDb.media.forEach(file => {
      if (!typeMap[file.type]) {
        typeMap[file.type] = { count: 0, size: 0 };
      }
      typeMap[file.type].count++;
      typeMap[file.type].size += file.size;
    });
    
    Object.keys(typeMap).forEach(type => {
      typeDistribution.push({
        _id: type,
        count: typeMap[type].count,
        size: typeMap[type].size
      });
    });
    
    // Recent additions (sort by created date)
    const recentAdditions = [...mockDb.media]
      .sort((a, b) => new Date(b.created) - new Date(a.created))
      .slice(0, 5);
    
    // Recent deletions - flatten mock data to match expected structure
    const recentDeletions = [];
    mockDb.deletionHistory.forEach((historyEntry, historyIndex) => {
      if (historyEntry.mediaDeleted && Array.isArray(historyEntry.mediaDeleted)) {
        historyEntry.mediaDeleted.forEach((media, mediaIndex) => {
          recentDeletions.push({
            id: `error-${historyIndex}-${mediaIndex}`,
            name: media.filename || media.name || 'Unknown File',
            path: media.path || 'Unknown Path',
            size: media.size || 0,
            reason: historyEntry.ruleName || 'Manual Deletion',
            deletedAt: historyEntry.timestamp,
            ruleId: historyEntry.ruleId
          });
        });
      }
    });
    
    // Sort by deletion date and take the 5 most recent
    recentDeletions.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    const errorFallbackDeletions = recentDeletions.slice(0, 5);
    
    
    res.json({
      totalSize,
      typeDistribution,
      recentAdditions,
      recentDeletions: errorFallbackDeletions
    });
  }
});

// Scan directory for new media
app.post('/api/scan', async (req, res) => {
  const { directory } = req.body;
  
  // Validate directory
  if (!directory) {
    return res.status(400).json({ message: 'Directory is required' });
  }
  
  try {
    // Check if directory exists
    if (!fs.existsSync(directory)) {
      return res.status(400).json({ message: 'Directory does not exist' });
    }
    
    // Start scan in background
    res.json({ message: 'Scan initiated', status: 'processing' });
    
    // This would be a background job in a production app
    // For demo purposes, we'll do a simple scan
    scanDirectory(directory);
    
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Helper function to scan directory
async function scanDirectory(directory) {
  try {
    if (!useSqlite) {
      log.info({ directory }, 'Mock scanning directory');
      return;
    }
    
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        // Recursively scan subdirectories
        await scanDirectory(filePath);
      } else {
        // Check if file already exists in database
        const existingFile = await Media.findOne({ 
          where: { path: filePath }
        });
        
        if (!existingFile) {
          // Determine file type
          const ext = path.extname(file).toLowerCase();
          let type = 'other';
          
          if (['.mp4', '.mkv', '.avi', '.mov'].includes(ext)) {
            type = 'movie';
          } else if (['.mp3', '.flac', '.wav', '.aac'].includes(ext)) {
            type = 'music';
          } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
            type = 'photo';
          }
          
          // Add file to database
          await Media.create({
            path: filePath,
            filename: file,
            size: stats.size,
            type,
            created: stats.birthtime,
            lastAccessed: stats.atime
          });
        }
      }
    }
    
    log.info({ directory }, 'Scan completed for directory');
  } catch (err) {
    log.error({ error: err, directory }, 'Error scanning directory');
  }
}

// Deletion Rules routes
app.get('/api/rules', async (req, res) => {
  try {
    if (!useSqlite) {
      return res.json(mockDb.rules);
    }
    
    const rules = await DeletionRule.findAll();
    res.json(rules);
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/rules GET');
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/rules', async (req, res) => {
  try {
    if (!useSqlite) {
      const newId = Math.max(0, ...mockDb.rules.map(r => parseInt(r._id))) + 1;
      const newRule = {
        _id: newId.toString(),
        ...req.body,
        created: new Date()
      };
      mockDb.rules.push(newRule);
      return res.status(201).json(newRule);
    }
    
    const newRule = await DeletionRule.create(req.body);
    res.status(201).json(newRule);
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/rules POST');
    res.status(400).json({ message: err.message });
  }
});

app.get('/api/rules/:id', async (req, res) => {
  try {
    if (!useSqlite) {
      const rule = mockDb.rules.find(r => r._id === req.params.id);
      if (!rule) {
        return res.status(404).json({ message: 'Rule not found' });
      }
      return res.json(rule);
    }
    
    const rule = await DeletionRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }
    res.json(rule);
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/rules/:id GET');
    res.status(500).json({ message: err.message });
  }
});

app.put('/api/rules/:id', async (req, res) => {
  try {
    if (!useSqlite) {
      const ruleIndex = mockDb.rules.findIndex(r => r._id === req.params.id);
      if (ruleIndex === -1) {
        return res.status(404).json({ message: 'Rule not found' });
      }
      mockDb.rules[ruleIndex] = {
        ...mockDb.rules[ruleIndex],
        ...req.body
      };
      return res.json(mockDb.rules[ruleIndex]);
    }
    
    const rule = await DeletionRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }
    
    await rule.update(req.body);
    res.json(rule);
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/rules/:id PUT');
    res.status(400).json({ message: err.message });
  }
});

app.delete('/api/rules/:id', async (req, res) => {
  try {
    if (!useSqlite) {
      const ruleIndex = mockDb.rules.findIndex(r => r._id === req.params.id);
      if (ruleIndex === -1) {
        return res.status(404).json({ message: 'Rule not found' });
      }
      mockDb.rules.splice(ruleIndex, 1);
      return res.json({ message: 'Rule deleted successfully' });
    }
    
    const rule = await DeletionRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }
    
    await rule.destroy();
    res.json({ message: 'Rule deleted successfully' });
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/rules/:id DELETE');
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/rules/:id/run', async (req, res) => {
  try {
    // SAFETY REDIRECT: This endpoint is dangerous as it directly deletes files.
    // Redirect to the safe pending deletions workflow instead.
    req.log.warn({ ruleId: req.params.id }, 'SAFETY REDIRECT: Dangerous direct deletion endpoint blocked. Use /api/rules/:id/create-pending-deletions instead.');
    res.status(400).json({ 
      success: false,
      message: 'This endpoint has been disabled for safety. Direct file deletion is not allowed. Use the pending deletions workflow instead.',
      error: 'DANGEROUS_ENDPOINT_DISABLED',
      recommendation: 'Use the safe pending deletions workflow via routes/rules.js'
    });
    
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/rules/:id/run');
    res.status(500).json({ message: err.message });
  }
});

// Helper function to execute a deletion rule
async function executeRule(rule) {
  // SAFETY MEASURE: Disable direct file deletion to prevent accidental data loss
  const ENABLE_DIRECT_FILE_DELETION = false;
  
  if (!ENABLE_DIRECT_FILE_DELETION) {
    log.warn({ ruleName: rule.name }, 'SAFETY MODE: Direct file deletion is disabled. Rule would have deleted files but this is blocked for safety.');
    log.warn('Use the safe pending deletions workflow in routes/rules.js instead.');
    return {
      success: false,
      message: 'Direct file deletion is disabled for safety. Use pending deletions workflow instead.',
      filesAffected: 0,
      sizeFreed: 0
    };
  }
  
  try {
    const { mediaTypes, conditions } = rule;
    const cutoffDate = moment().subtract(conditions.olderThan, 'days').toDate();
    
    // Build query for Sequelize
    const { Op } = require('sequelize');
    const query = {
      type: { [Op.in]: mediaTypes },
      created: { [Op.lt]: cutoffDate },
      protected: false
    };
    
    // Add watched status condition if specified
    if (conditions.watchedStatus === 'watched') {
      query.watched = true;
    } else if (conditions.watchedStatus === 'unwatched') {
      query.watched = false;
    }
    
    // Add rating conditions if specified
    // Note: For JSON fields in SQLite, we need a different approach
    // This is a simplified version - in a real app, you might need more complex queries
    let filesToDelete = await Media.findAll({ where: query });
    
    // Filter by rating if needed (client-side filtering for JSON fields)
    if (conditions.minRating !== undefined || conditions.maxRating !== undefined) {
      filesToDelete = filesToDelete.filter(file => {
        const rating = file.metadata?.rating;
        if (rating === undefined) return false;
        
        if (conditions.minRating !== undefined && rating < conditions.minRating) {
          return false;
        }
        
        if (conditions.maxRating !== undefined && rating > conditions.maxRating) {
          return false;
        }
        
        return true;
      });
    }
    
    // Create deletion history record
    const deletionHistory = await DeletionHistory.create({
      ruleId: rule.id,
      ruleName: rule.name,
      mediaDeleted: [],
      totalSizeFreed: 0,
      success: true
    });
    
    // Delete files and update database
    const mediaDeleted = [];
    let totalSizeFreed = 0;
    
    for (const file of filesToDelete) {
      try {
        // Try to delete the file from the filesystem
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        
        // Add to deletion history
        mediaDeleted.push({
          filename: file.filename,
          path: file.path,
          size: file.size,
          type: file.type
        });
        
        totalSizeFreed += file.size;
        
        // Remove from database
        await file.destroy();
      } catch (err) {
        log.error({ error: err, filePath: file.path }, 'Error deleting file');
      }
    }
    
    // Update deletion history
    await deletionHistory.update({
      mediaDeleted,
      totalSizeFreed
    });
    
    // Update rule's lastRun timestamp
    rule.lastRun = new Date();
    await rule.save();
    
    log.info({ ruleName: rule.name, filesDeleted: filesToDelete.length }, 'Rule executed');
  } catch (err) {
    log.error({ error: err, ruleName: rule.name }, 'Error executing rule');
  }
}

// Cleanup based on rules
app.post('/api/cleanup', async (req, res) => {
  try {
    // SAFETY BLOCK: This endpoint is dangerous as it directly deletes files via executeRule.
    // Block all cleanup operations that use direct file deletion.
    req.log.warn('SAFETY BLOCK: Dangerous cleanup endpoint blocked. This would directly delete files without confirmation.');
    res.status(400).json({ 
      success: false,
      message: 'This cleanup endpoint has been disabled for safety. Direct file deletion is not allowed. Use the pending deletions workflow instead.',
      error: 'DANGEROUS_CLEANUP_DISABLED',
      recommendation: 'Use the safe pending deletions workflow to review files before deletion'
    });
    
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/cleanup POST');
    res.status(500).json({ message: err.message });
  }
});

// Get cleanup history
app.get('/api/cleanup/history', async (req, res) => {
  try {
    if (!useSqlite) {
      return res.json(mockDb.deletionHistory);
    }
    
    const history = await DeletionHistory.findAll({
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    
    res.json(history);
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/cleanup/history GET');
    res.status(500).json({ message: err.message });
  }
});

// Settings routes
app.get('/api/settings', async (req, res) => {
  try {
    if (!useSqlite) {
      // Use mock data
      return res.json(mockDb.settings);
    }
    
    // Use SQLite with Sequelize
    const settings = await Settings.findOne();
    res.json(settings || {});
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/settings GET');
    // Fallback to mock data
    res.json(mockDb.settings);
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    if (!useSqlite) {
      // Use mock data
      mockDb.settings = {
        ...mockDb.settings,
        ...req.body
      };
      
      // Restart sync scheduler if integration settings changed
      if (req.body.sonarr || req.body.radarr) {
        try {
          const syncScheduler = require('./services/syncScheduler');
          await syncScheduler.restartScheduledSync();
          req.log.info('Sync scheduler restarted with new settings');
        } catch (error) {
          req.log.error({ error }, 'Error restarting sync scheduler');
        }
      }
      
      return res.json(mockDb.settings);
    }
    
    // Use SQLite with Sequelize
    const [settings, created] = await Settings.findOrCreate({
      where: { id: 1 }, // Always use ID 1 for settings
      defaults: req.body
    });
    
    if (!created) {
      // Update existing settings
      await settings.update(req.body);
    }
    
    // Get the updated settings
    const updatedSettings = await Settings.findOne();
    
    // Restart sync scheduler if integration settings changed
    if (req.body.sonarr || req.body.radarr) {
      try {
        const syncScheduler = require('./services/syncScheduler');
        await syncScheduler.restartScheduledSync();
        req.log.info('Sync scheduler restarted with new settings');
      } catch (error) {
        req.log.error({ error }, 'Error restarting sync scheduler');
      }
    }
    
    res.json(updatedSettings);
  } catch (err) {
    req.log.error({ error: err }, 'Error in /api/settings PUT');
    // Update mock data and return
    mockDb.settings = {
      ...mockDb.settings,
      ...req.body
    };
    res.json(mockDb.settings);
  }
});

// Clear deletion data endpoint (for testing/development)
app.delete('/api/admin/clear-deletions', async (req, res) => {
  try {
    req.log.info('Clearing deletion data...');
    
    // Clear all deletion history
    const deletionHistoryCount = await DeletionHistory.count();
    req.log.info({ deletionHistoryCount }, 'Found deletion history records');
    
    if (deletionHistoryCount > 0) {
      await DeletionHistory.destroy({ where: {} });
      req.log.info('Cleared all deletion history records');
    }

    // Clear all pending deletions 
    const pendingDeletionsCount = await PendingDeletion.count();
    req.log.info({ pendingDeletionsCount }, 'Found pending deletion records');
    
    if (pendingDeletionsCount > 0) {
      await PendingDeletion.destroy({ where: {} });
      req.log.info('Cleared all pending deletion records');
    }

    res.json({
      success: true,
      message: 'Deletion data cleared successfully',
      deletionHistoryCleared: deletionHistoryCount,
      pendingDeletionsCleared: pendingDeletionsCount
    });
  } catch (error) {
    req.log.error({ error }, 'Error clearing deletion data');
    res.status(500).json({
      success: false,
      message: 'Error clearing deletion data',
      error: error.message
    });
  }
});

// Helper function for making API requests with retries
async function makeRequestWithRetry(url, options, maxRetries = 5, retryDelay = 3000) {
  let lastError;
  
  // Set a default timeout if not provided
  if (!options.timeout) {
    options.timeout = 30000; // 30 seconds default timeout
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info({ attempt, maxRetries, url }, 'API request attempt');
      const response = await axios(url, options);
      return response;
    } catch (error) {
      lastError = error;
      
      // Log the error details
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        log.error({ attempt, maxRetries, status: error.response.status, error: error.message }, 'Request failed with status');
        log.error({ responseData: error.response.data }, 'Response data');
      } else if (error.request) {
        // The request was made but no response was received
        log.error({ attempt, maxRetries, error: error.message }, 'Request failed (no response)');
        if (error.code === 'ECONNABORTED') {
          log.error('Request timed out. Consider increasing the timeout value.');
        }
      } else {
        // Something happened in setting up the request that triggered an Error
        log.error({ attempt, maxRetries, error: error.message }, 'Request failed (request setup)');
      }
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = retryDelay * attempt; // Exponential backoff
        log.info({ delay }, 'Retrying request');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError;
}

// Plex API helper functions
const plexApi = {
  // Test connection to Plex server
  testConnection: async (serverUrl, authToken) => {
    try {
      // Make a request to the Plex server to check if it's reachable
      const response = await makeRequestWithRetry(
        `${serverUrl}/identity`, 
        {
          method: 'get',
          headers: {
            'X-Plex-Token': authToken,
            'Accept': 'application/json'
          },
          timeout: 30000 // Increased to 30 second timeout
        }
      );
      
      // If we get a response, the connection is successful
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      log.error({ error: error.message }, 'Plex connection test failed');
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  // Get libraries from Plex server
  getLibraries: async (serverUrl, authToken) => {
    try {
      // Make a request to get the libraries
      const response = await makeRequestWithRetry(
        `${serverUrl}/library/sections`, 
        {
          method: 'get',
          headers: {
            'X-Plex-Token': authToken,
            'Accept': 'application/json'
          },
          timeout: 30000 // Increased to 30 second timeout
        }
      );
      
      // Parse the response to get the libraries
      const libraryData = response.data.MediaContainer.Directory || [];
      
      // Transform the data to match our format
      const libraries = libraryData.map(library => ({
        id: library.key,
        name: library.title,
        type: library.type === 'movie' ? 'movie' : 
              library.type === 'show' ? 'show' : 
              library.type === 'artist' ? 'music' : 
              library.type === 'photo' ? 'photo' : 'other',
        path: library.path || `/media/${library.title.toLowerCase()}`,
        items: library.count || 0,
        size: library.size || 0, // This might not be available directly from Plex
        enabled: true,
        lastScanned: new Date(),
        mapped: true
      }));
      
      return {
        success: true,
        libraries
      };
    } catch (error) {
      log.error({ error: error.message }, 'Error getting Plex libraries');
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  // Get library content
  getLibraryContent: async (serverUrl, authToken, libraryId) => {
    try {
      log.info({ libraryId }, 'Fetching content for library');
      
      // Make a request to get the library content
      const response = await makeRequestWithRetry(
        `${serverUrl}/library/sections/${libraryId}/all`, 
        {
          method: 'get',
          headers: {
            'X-Plex-Token': authToken,
            'Accept': 'application/json'
          },
          timeout: 120000 // Increased to 120 second timeout for larger libraries
        }
      );
      
      // Parse the response to get the content
      const contentData = response.data.MediaContainer.Metadata || [];
      log.info({ itemCount: contentData.length, libraryId }, 'Found items in library');
      
      // Transform the data to match our format
      const content = [];
      
      for (const item of contentData) {
        try {
          // Get more details for each item
          let size = 0;
          let mediaPath = '';
          
          // For movies and episodes, we need to get the media info
          if (item.Media && item.Media.length > 0) {
            // Sum up the sizes of all media parts
            for (const media of item.Media) {
              if (media.Part && media.Part.length > 0) {
                for (const part of media.Part) {
                  size += part.size || 0;
                  if (part.file) {
                    mediaPath = part.file;
                  }
                }
              }
            }
          }
          
          // Create the content item
          const contentItem = {
            id: item.ratingKey,
            title: item.title,
            year: item.year || (item.originallyAvailableAt ? new Date(item.originallyAvailableAt).getFullYear() : null),
            type: item.type === 'movie' ? 'movie' : 
                  item.type === 'show' || item.type === 'episode' ? 'show' : 
                  item.type === 'artist' || item.type === 'album' || item.type === 'track' ? 'music' : 
                  item.type === 'photo' ? 'photo' : 'other',
            poster: item.thumb ? `${serverUrl}${item.thumb}?X-Plex-Token=${authToken}` : null,
            created: item.addedAt ? new Date(item.addedAt * 1000) : new Date(),
            size: size,
            path: mediaPath,
            filename: mediaPath.split('/').pop(),
            watched: item.viewCount > 0,
            protected: false,
            metadata: {
              title: item.title,
              year: item.year,
              rating: item.rating,
              genre: item.Genre ? item.Genre.map(g => g.tag) : [],
              runtime: item.duration ? Math.floor(item.duration / 1000) : 0, // Convert from milliseconds to seconds
              plexId: item.ratingKey
            }
          };
          
          content.push(contentItem);
        } catch (itemError) {
          log.error({ error: itemError.message, itemTitle: item.title }, 'Error processing item');
        }
      }
      
      return {
        success: true,
        content
      };
    } catch (error) {
      log.error({ error: error.message, libraryId }, 'Error getting content for library');
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  // Calculate library size and save media items
  calculateLibrarySize: async (serverUrl, authToken, libraryId, libraryType) => {
    try {
      // Get the library content
      const contentResult = await plexApi.getLibraryContent(serverUrl, authToken, libraryId);
      
      if (!contentResult.success) {
        return {
          success: false,
          error: contentResult.error,
          items: 0,
          size: 0
        };
      }
      
      // Calculate the total size
      let totalSize = 0;
      const itemCount = contentResult.content.length;
      
      // Process each item to get accurate size
      for (const item of contentResult.content) {
        // For items with no size, try to get more details
        if (!item.size && item.id) {
          try {
            // Get more details for the item
            const itemDetails = await makeRequestWithRetry(
              `${serverUrl}/library/metadata/${item.id}`, 
              {
                method: 'get',
                headers: {
                  'X-Plex-Token': authToken,
                  'Accept': 'application/json'
                },
                timeout: 30000 // Increased to 30 second timeout
              }
            );
            
            // Extract media info
            if (itemDetails.data && 
                itemDetails.data.MediaContainer && 
                itemDetails.data.MediaContainer.Metadata && 
                itemDetails.data.MediaContainer.Metadata.length > 0) {
              
              const metadata = itemDetails.data.MediaContainer.Metadata[0];
              
              // Get media parts
              if (metadata.Media && metadata.Media.length > 0) {
                for (const media of metadata.Media) {
                  if (media.Part && media.Part.length > 0) {
                    for (const part of media.Part) {
                      item.size = (item.size || 0) + (part.size || 0);
                    }
                  }
                }
              }
            }
          } catch (detailsError) {
            log.error({ error: detailsError.message, itemId: item.id }, 'Error getting details for item');
          }
        }
        
        // Add to total size
        totalSize += (item.size || 0);
      }
      
      log.info({ libraryId, itemCount, totalSize }, 'Library size calculated');
      
      // Save media items to database if SQLite is available
      if (useSqlite) {
        try {
          // Use a transaction to prevent database locks
          await sequelize.transaction(async (t) => {
            // Process items in batches to avoid overwhelming the database
            const batchSize = 50;
            const batches = Math.ceil(contentResult.content.length / batchSize);
            
            for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
              const batchStart = batchIndex * batchSize;
              const batchEnd = Math.min((batchIndex + 1) * batchSize, contentResult.content.length);
              const batchItems = contentResult.content.slice(batchStart, batchEnd);
              
              // Process each item in the batch
              for (const item of batchItems) {
                try {
                  // Skip items with no path
                  if (!item.path) continue;
                  
                  // Check if the item already exists
                  const { Op } = require('sequelize');
                  const existingItem = await Media.findOne({ 
                    where: {
                      [Op.or]: [
                        { path: item.path },
                        { metadata: { plexId: item.id } }
                      ]
                    },
                    transaction: t
                  });
                  
                  if (existingItem) {
                    // Update existing item
                    await existingItem.update({
                      size: item.size || existingItem.size,
                      watched: item.watched,
                      metadata: item.metadata,
                      lastAccessed: new Date()
                    }, { transaction: t });
                  } else {
                    // Create new item
                    await Media.create({
                      path: item.path,
                      filename: item.filename || item.path.split('/').pop(),
                      size: item.size || 0,
                      type: item.type,
                      created: item.created,
                      lastAccessed: new Date(),
                      watched: item.watched,
                      protected: item.protected || false,
                      metadata: item.metadata
                    }, { transaction: t });
                  }
                } catch (itemErr) {
                  log.error({ error: itemErr, itemPath: item.path }, 'Error processing item');
                  // Continue with next item
                }
              }
            }
          });
          
          log.info({ itemCount: contentResult.content.length, libraryId }, 'Saved media items to database for library');
        } catch (dbErr) {
          log.error({ error: dbErr, libraryId }, 'Error saving media items to database for library');
        }
      }
      
      return {
        success: true,
        size: totalSize,
        items: itemCount
      };
    } catch (error) {
      log.error({ error: error.message, libraryId }, 'Error calculating size for library');
      return {
        success: false,
        error: error.message,
        items: 0,
        size: 0
      };
    }
  }
};

// Plex API routes
app.post('/api/plex/test', async (req, res) => {
  try {
    const { serverUrl, authToken } = req.body;
    
    if (!serverUrl || !authToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Server URL and Authentication Token are required' 
      });
    }
    
    req.log.info({ serverUrl }, 'Testing Plex connection');
    
    // Test the connection to the Plex server
    const connectionResult = await plexApi.testConnection(serverUrl, authToken);
    
    if (!connectionResult.success) {
      return res.status(400).json({
        success: false,
        message: `Failed to connect to Plex server: ${connectionResult.error}`
      });
    }
    
    // Save the Plex server details to the database
    if (useSqlite) {
      try {
        // Get current settings or create if they don't exist
        const [settings, created] = await Settings.findOrCreate({
          where: { id: 1 }, // Always use ID 1 for settings
          defaults: {
            plex: {
              serverUrl,
              authToken,
              connectionStatus: 'connected',
              lastSynced: new Date()
            }
          }
        });
        
        if (!created) {
          // Update existing settings
          const currentPlex = settings.plex || {};
          await settings.update({
            plex: {
              ...currentPlex,
              serverUrl,
              authToken,
              connectionStatus: 'connected',
              lastSynced: new Date()
            }
          });
        }
        
        req.log.info('Plex settings saved to database');
      } catch (dbErr) {
        req.log.error({ error: dbErr }, 'Error saving Plex settings to database');
      }
    }
    
    // Return success
    res.json({ 
      success: true, 
      message: 'Connection successful',
      data: connectionResult.data
    });
  } catch (err) {
    req.log.error({ error: err }, 'Error testing Plex connection');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// Sync status routes
app.get('/api/plex/sync/status', async (req, res) => {
  try {
    if (!useSqlite) {
      return res.json({
        status: 'idle',
        progress: 0,
        currentLibrary: null,
        libraryProgress: 0,
        totalLibraries: 0,
        startTime: null,
        endTime: null,
        error: null
      });
    }
    
    // Get the current sync status
    const syncStatus = await SyncStatus.findOne({
      order: [['createdAt', 'DESC']]
    });
    
    if (!syncStatus) {
      return res.json({
        status: 'idle',
        progress: 0,
        currentLibrary: null,
        libraryProgress: 0,
        totalLibraries: 0,
        startTime: null,
        endTime: null,
        error: null
      });
    }
    
    res.json(syncStatus);
  } catch (err) {
    req.log.error({ error: err }, 'Error getting sync status');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// Get all Plex libraries
app.get('/api/plex/libraries', async (req, res) => {
  try {
    if (!useSqlite) {
      return res.json([]);
    }
    
    // Get all libraries
    const libraries = await PlexLibrary.findAll({
      order: [['name', 'ASC']]
    });
    
    res.json(libraries);
  } catch (err) {
    req.log.error({ error: err }, 'Error getting Plex libraries');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// Update library mapping
app.put('/api/plex/libraries/:id', async (req, res) => {
  try {
    if (!useSqlite) {
      return res.json({ success: true });
    }
    
    const { id } = req.params;
    const { localPath, enabled, mapped } = req.body;
    
    // Find the library
    const library = await PlexLibrary.findOne({
      where: { id }
    });
    
    if (!library) {
      return res.status(404).json({
        success: false,
        message: 'Library not found'
      });
    }
    
    // Update the library
    await library.update({
      localPath: localPath || library.localPath,
      enabled: enabled !== undefined ? enabled : library.enabled,
      mapped: mapped !== undefined ? mapped : library.mapped
    });
    
    res.json({
      success: true,
      library
    });
  } catch (err) {
    req.log.error({ error: err }, 'Error updating Plex library');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

app.post('/api/plex/sync', async (req, res) => {
  try {
    const { serverUrl, authToken } = req.body;
    
    if (!serverUrl || !authToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Server URL and Authentication Token are required' 
      });
    }
    
    req.log.info({ serverUrl }, 'Syncing Plex libraries');
    
    // Create or update sync status
    let syncStatus;
    if (useSqlite) {
      syncStatus = await SyncStatus.create({
        status: 'syncing',
        progress: 0,
        currentLibrary: null,
        libraryProgress: 0,
        totalLibraries: 0,
        startTime: new Date(),
        endTime: null,
        error: null
      });
    }
    
    // Return immediately to the client
    res.json({ 
      success: true, 
      message: 'Sync started',
      syncId: syncStatus ? syncStatus.id : null
    });
    
    // Continue processing in the background
    syncPlexLibraries(serverUrl, authToken, syncStatus ? syncStatus.id : null);
    
  } catch (err) {
    req.log.error({ error: err }, 'Error starting Plex sync');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// Background function to sync Plex libraries
async function syncPlexLibraries(serverUrl, authToken, syncId) {
  let syncStatus = null;
  
  try {
    if (useSqlite && syncId) {
      syncStatus = await SyncStatus.findByPk(syncId);
    }
    
    // Get libraries from the Plex server
    const librariesResult = await plexApi.getLibraries(serverUrl, authToken);
    
    if (!librariesResult.success) {
      if (syncStatus) {
        await syncStatus.update({
          status: 'error',
          progress: 0,
          endTime: new Date(),
          error: `Failed to get libraries from Plex server: ${librariesResult.error}`
        });
      }
      return;
    }
    
    // Get the libraries
    const libraries = librariesResult.libraries;
    
    if (syncStatus) {
      await syncStatus.update({
        totalLibraries: libraries.length,
        progress: 5, // 5% progress after getting libraries list
        details: { libraries: libraries.map(lib => lib.name) }
      });
    }
    
    // Save libraries to database
    if (useSqlite) {
      try {
        // Use a transaction to prevent database locks
        await sequelize.transaction(async (t) => {
          for (const library of libraries) {
            try {
              // Check if library already exists
              const existingLibrary = await PlexLibrary.findOne({
                where: { plexId: library.id },
                transaction: t
              });
              
              if (existingLibrary) {
                // Update existing library
                await existingLibrary.update({
                  name: library.name,
                  type: library.type,
                  plexPath: library.path,
                  items: library.items || 0,
                  size: library.size || 0,
                  lastScanned: new Date()
                }, { transaction: t });
              } else {
                // Create new library
                await PlexLibrary.create({
                  plexId: library.id,
                  name: library.name,
                  type: library.type,
                  plexPath: library.path,
                  items: library.items || 0,
                  size: library.size || 0,
                  enabled: true,
                  lastScanned: new Date(),
                  mapped: false
                }, { transaction: t });
              }
            } catch (libErr) {
              log.error({ error: libErr, libraryName: library.name }, 'Error saving library');
              // Continue with next library
            }
          }
        });
      } catch (txErr) {
        log.error({ error: txErr }, 'Transaction error saving libraries');
        if (syncStatus) {
          await syncStatus.update({
            details: {
              ...syncStatus.details,
              errors: [
                ...(syncStatus.details.errors || []),
                {
                  type: 'database',
                  error: txErr.message
                }
              ]
            }
          });
        }
      }
    }
    
    // Calculate the size of each library and save media items
    for (let i = 0; i < libraries.length; i++) {
      const library = libraries[i];
      
      if (syncStatus) {
        await syncStatus.update({
          currentLibrary: library.name,
          libraryProgress: 0,
          progress: 5 + Math.floor((i / libraries.length) * 95) // 5-100% progress
        });
      }
      
      try {
        const sizeResult = await plexApi.calculateLibrarySize(
          serverUrl, 
          authToken, 
          library.id,
          library.type
        );
        
        if (sizeResult.success) {
          library.size = sizeResult.size;
          library.items = sizeResult.items;
          
          // Update library in database
          if (useSqlite) {
            const plexLibrary = await PlexLibrary.findOne({
              where: { plexId: library.id }
            });
            
            if (plexLibrary) {
              await plexLibrary.update({
                items: library.items,
                size: library.size
              });
            }
          }
        }
        
        if (syncStatus) {
          await syncStatus.update({
            libraryProgress: 100,
            progress: 5 + Math.floor(((i + 1) / libraries.length) * 95) // 5-100% progress
          });
        }
      } catch (sizeErr) {
        log.error({ error: sizeErr, libraryId: library.id }, 'Error calculating size for library');
        
        if (syncStatus) {
          await syncStatus.update({
            libraryProgress: 100, // Mark as complete even though there was an error
            details: {
              ...syncStatus.details,
              errors: [
                ...(syncStatus.details.errors || []),
                {
                  library: library.name,
                  error: sizeErr.message
                }
              ]
            }
          });
        }
      }
    }
    
    // Update the last synced time in the database
    if (useSqlite) {
      try {
        // Get current settings or create if they don't exist
        const [settings, created] = await Settings.findOrCreate({
          where: { id: 1 }, // Always use ID 1 for settings
          defaults: {
            plex: {
              serverUrl,
              authToken,
              lastSynced: new Date()
            }
          }
        });
        
        if (!created) {
          // Update existing settings
          const currentPlex = settings.plex || {};
          await settings.update({
            plex: {
              ...currentPlex,
              serverUrl,
              authToken,
              lastSynced: new Date()
            }
          });
        }
        
        log.info('Plex settings updated with last sync time');
      } catch (dbErr) {
        log.error({ error: dbErr }, 'Error updating Plex settings in database');
      }
    }
    
    // Mark sync as completed
    if (syncStatus) {
      await syncStatus.update({
        status: 'completed',
        progress: 100,
        currentLibrary: null,
        libraryProgress: 100,
        endTime: new Date()
      });
    }
    
    log.info({ libraries }, 'Libraries synced');
  } catch (err) {
    log.error({ error: err }, 'Error syncing Plex libraries');
    
    // Update sync status with error
    if (syncStatus) {
      await syncStatus.update({
        status: 'error',
        endTime: new Date(),
        error: err.message
      });
    }
  }
}

// Add a route for schedule events
app.get('/api/schedule/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    
    req.log.info({ year, month }, 'Getting schedule events');
    
    // Generate schedule events based on Plex data
    const events = {};
    
    // Get settings to get the Plex server details
    let serverUrl = '';
    let authToken = '';
    
    if (useSqlite) {
      try {
        const settings = await Settings.findOne({ where: { id: 1 } });
        if (settings && settings.plex) {
          serverUrl = settings.plex.serverUrl;
          authToken = settings.plex.authToken;
        }
      } catch (dbErr) {
        req.log.error({ error: dbErr }, 'Error getting Plex settings from database');
      }
    }
    
    // Generate dates in the specified month
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // If we have Plex server details, we can generate events based on Plex data
    if (serverUrl && authToken) {
      try {
        // Get libraries from the Plex server
        const librariesResult = await plexApi.getLibraries(serverUrl, authToken);
        
        if (librariesResult.success) {
          // Generate events based on libraries
          for (let day = 1; day <= daysInMonth; day++) {
            // Add cleanup events for movies on even days
            if (day % 2 === 0) {
              const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              events[dateString] = [{ type: 'CLEANUP' }];
            }
            
            // Add scan events for TV shows on odd days
            if (day % 3 === 0) {
              const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              if (!events[dateString]) {
                events[dateString] = [];
              }
              events[dateString].push({ type: 'SCAN' });
            }
            
            // Add "New Season" events for TV shows on days divisible by 5
            if (day % 5 === 0) {
              const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              if (!events[dateString]) {
                events[dateString] = [];
              }
              events[dateString].push({ type: 'CLEANUP', title: 'New Season' });
            }
          }
        }
      } catch (plexErr) {
        req.log.error({ error: plexErr }, 'Error generating events from Plex data');
      }
    } else {
      // Generate mock events
      for (let day = 1; day <= daysInMonth; day++) {
        // Add events to some days
        if (day % 3 === 0) {
          const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          events[dateString] = [{ type: 'CLEANUP' }];
        }
        
        if (day % 5 === 0) {
          const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (!events[dateString]) {
            events[dateString] = [];
          }
          events[dateString].push({ type: 'SCAN' });
        }
        
        // Add "New Season" to some days
        if (day % 10 === 0) {
          const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (!events[dateString]) {
            events[dateString] = [];
          }
          events[dateString].push({ type: 'CLEANUP', title: 'New Season' });
        }
      }
    }
    
    res.json({ 
      success: true, 
      events
    });
  } catch (err) {
    req.log.error({ error: err }, 'Error getting schedule events');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// Routes are now mounted at the top of the file for proper precedence

// Start server
app.listen(PORT, () => {
  log.info({ port: PORT }, 'Server running on port');
});

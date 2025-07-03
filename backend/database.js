const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('./logger');

// Create logger for database module
const log = createLogger('database');

// Get database path from environment or use default
const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'managarr.db');

// Ensure the directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: process.env.LOG_SQL === 'true' ? (msg) => log.debug({ sql: msg }, 'SQL Query') : false,
  define: {
    timestamps: true // Adds createdAt and updatedAt to all models
  }
});

// Define models
const Media = sequelize.define('Media', {
  path: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  filename: {
    type: DataTypes.STRING,
    allowNull: false
  },
  size: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['movie', 'show', 'music', 'photo', 'other']]
    }
  },
  created: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  lastAccessed: {
    type: DataTypes.DATE
  },
  watched: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  protected: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Enhanced metadata fields for Phase 2
  title: {
    type: DataTypes.STRING,
    allowNull: true
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  rating: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  // Quality metadata
  qualityProfile: {
    type: DataTypes.STRING,
    allowNull: true
  },
  qualityName: {
    type: DataTypes.STRING,
    allowNull: true // HD-1080p, Ultra-HD, HD-720p, etc.
  },
  resolution: {
    type: DataTypes.STRING,
    allowNull: true // 720p, 1080p, 4K, etc.
  },
  codec: {
    type: DataTypes.STRING,
    allowNull: true
  },
  audioChannels: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  audioLanguage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Series-specific fields
  seriesStatus: {
    type: DataTypes.STRING,
    allowNull: true // continuing, ended
  },
  network: {
    type: DataTypes.STRING,
    allowNull: true
  },
  seasonCount: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  episodeCount: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  // Movie-specific fields
  studio: {
    type: DataTypes.STRING,
    allowNull: true
  },
  certification: {
    type: DataTypes.STRING,
    allowNull: true // PG, PG-13, R, etc.
  },
  collection: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Plex integration fields
  plexViewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastWatchedDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  userWatchData: {
    type: DataTypes.JSON,
    defaultValue: {} // Store per-user watch info
  },
  // Tautulli integration fields
  tautulliViewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  tautulliLastPlayed: {
    type: DataTypes.DATE,
    allowNull: true
  },
  tautulliDuration: {
    type: DataTypes.INTEGER,
    allowNull: true // In seconds
  },
  tautulliWatchTime: {
    type: DataTypes.INTEGER,
    defaultValue: 0 // Total watch time in seconds
  },
  tautulliUsers: {
    type: DataTypes.JSON,
    defaultValue: [] // Array of users who have watched this
  },
  // Sonarr/Radarr integration fields
  sonarrId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  radarrId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: [] // Array of tag strings
  },
  // Store additional metadata as JSON
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
});

const DeletionRule = sequelize.define('DeletionRule', {
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  mediaTypes: {
    type: DataTypes.JSON, // Array of strings
    defaultValue: []
  },
  conditions: {
    type: DataTypes.JSON,
    defaultValue: {
      olderThan: 30,
      watchedStatus: 'any',
      minRating: 0,
      maxRating: 10
    }
  },
  filtersEnabled: {
    type: DataTypes.JSON,
    defaultValue: {
      age: false,
      quality: false,
      enhancedQuality: false,
      size: false,
      status: false,
      title: false,
      plexData: false,
      mediaSpecific: false,
      arrIntegration: false,
      tautulli: false
    }
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastRun: {
    type: DataTypes.DATE
  },
  nextRun: {
    type: DataTypes.DATE
  },
  schedule: {
    type: DataTypes.JSON,
    defaultValue: {
      enabled: false,
      frequency: 'manual', // manual, daily, weekly, monthly, custom
      interval: 1, // for custom frequency
      unit: 'days', // days, weeks, months
      time: '02:00' // time of day for daily/weekly schedules
    }
  },
  deletionStrategy: {
    type: DataTypes.JSON,
    defaultValue: {
      sonarr: 'file_only', // file_only, unmonitor, remove_series
      radarr: 'file_only', // file_only, remove_movie
      deleteFiles: true, // whether to delete actual files when removing from *arr
      addImportExclusion: false // add to import exclusion list to prevent re-download
    }
  }
});

const DeletionHistory = sequelize.define('DeletionHistory', {
  ruleId: {
    type: DataTypes.INTEGER,
    references: {
      model: DeletionRule,
      key: 'id'
    }
  },
  ruleName: {
    type: DataTypes.STRING
  },
  mediaDeleted: {
    type: DataTypes.JSON, // Array of objects
    defaultValue: []
  },
  totalSizeFreed: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  success: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  error: {
    type: DataTypes.TEXT
  }
});

const Settings = sequelize.define('Settings', {
  general: {
    type: DataTypes.JSON,
    defaultValue: {
      darkMode: true,
      autoCleanup: true,
      cleanupThreshold: 90,
      notifyBeforeDelete: true,
      storageWarningThreshold: 90,
      language: 'en',
      dateFormat: 'MM/DD/YYYY'
    }
  },
  plex: {
    type: DataTypes.JSON,
    defaultValue: {
      serverUrl: 'http://localhost:32400',
      authToken: '',
      autoSync: true,
      syncInterval: 60
    }
  },
  notifications: {
    type: DataTypes.JSON,
    defaultValue: {
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
  sonarr: {
    type: DataTypes.JSON,
    defaultValue: {
      enabled: false,
      url: '',
      apiKey: '',
      connectionStatus: 'disconnected',
      version: null,
      syncIntervalValue: 24, // Default to 24
      syncIntervalUnit: 'hours' // Default to hours
    }
  },
  radarr: {
    type: DataTypes.JSON,
    defaultValue: {
      enabled: false,
      url: '',
      apiKey: '',
      connectionStatus: 'disconnected',
      version: null,
      syncIntervalValue: 24, // Default to 24
      syncIntervalUnit: 'hours' // Default to hours
    }
  },
  tautulli: {
    type: DataTypes.JSON,
    defaultValue: {
      enabled: false,
      url: '',
      apiKey: '',
      connectionStatus: 'disconnected',
      version: null,
      syncIntervalValue: 6, // Default to 6 hours for watch history
      syncIntervalUnit: 'hours',
      lastConnectionTest: null,
      // Tautulli-specific settings
      historyDaysToSync: 30, // How many days of history to sync
      syncWatchHistory: true,
      syncActiveStreams: true,
      syncLibraryStats: true
    }
  }
});

// Define SyncStatus model to track library sync progress
const SyncStatus = sequelize.define('SyncStatus', {
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'idle', // idle, syncing, completed, error
  },
  progress: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  currentLibrary: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  libraryProgress: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  totalLibraries: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  details: {
    type: DataTypes.JSON,
    defaultValue: {},
  }
});

// Define PathMapping model to store path mappings between Plex and local filesystem
const PathMapping = sequelize.define('PathMapping', {
  plexPath: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  localPath: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
  }
});

// Define ScanStatus model to track local directory scan progress
const LocalScanStatus = sequelize.define('LocalScanStatus', {
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'idle', // idle, scanning, completed, error
  },
  progress: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  currentFile: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  filesProcessed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  totalFiles: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  details: {
    type: DataTypes.JSON,
    defaultValue: {},
  }
});

// Define PlexLibrary model to store library information
const PlexLibrary = sequelize.define('PlexLibrary', {
  plexId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  plexPath: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  localPath: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  items: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  size: {
    type: DataTypes.BIGINT,
    defaultValue: 0,
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  lastScanned: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  mapped: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  details: {
    type: DataTypes.JSON,
    defaultValue: {},
  }
});

// Define PendingDeletion model for Phase 3 - Pending Deletions System
const PendingDeletion = sequelize.define('PendingDeletion', {
  mediaId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Media,
      key: 'id'
    }
  },
  ruleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: DeletionRule,
      key: 'id'
    }
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending', // pending, approved, cancelled, completed, failed
    validate: {
      isIn: [['pending', 'approved', 'cancelled', 'completed', 'failed']]
    }
  },
  scheduledDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  approvedBy: {
    type: DataTypes.STRING,
    allowNull: true
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelledBy: {
    type: DataTypes.STRING,
    allowNull: true
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Execution tracking fields
  executionResults: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Store snapshot of media data at time of rule execution
  mediaSnapshot: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  // Store rule conditions that triggered this deletion
  ruleSnapshot: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
});

// Define associations
PendingDeletion.belongsTo(Media, { foreignKey: 'mediaId', as: 'Media' });
PendingDeletion.belongsTo(DeletionRule, { foreignKey: 'ruleId', as: 'DeletionRule' });
Media.hasMany(PendingDeletion, { foreignKey: 'mediaId' });
DeletionRule.hasMany(PendingDeletion, { foreignKey: 'ruleId', onDelete: 'CASCADE' });

// DeletionHistory associations
DeletionHistory.belongsTo(DeletionRule, { foreignKey: 'ruleId' });
DeletionRule.hasMany(DeletionHistory, { foreignKey: 'ruleId', onDelete: 'CASCADE' });

// Initialize database
async function initializeDatabase() {
  try {
    // Sync database without alterations to avoid constraint conflicts
    await sequelize.sync({ force: false, alter: false });
    
    // Manually add missing columns to PendingDeletions table
    try {
      await sequelize.query('ALTER TABLE PendingDeletions ADD COLUMN executionResults JSON DEFAULT \'[]\';');
      log.debug('Added executionResults column to PendingDeletions table');
    } catch (error) {
      // Column already exists or other issue
      log.debug({ error: error.message }, 'executionResults column exists or failed to add');
    }
    
    try {
      await sequelize.query('ALTER TABLE PendingDeletions ADD COLUMN error TEXT;');
      log.debug('Added error column to PendingDeletions table');
    } catch (error) {
      // Column already exists or other issue
      log.debug({ error: error.message }, 'error column exists or failed to add');
    }
    
    // Add Tautulli column to Settings table if it doesn't exist
    try {
      await sequelize.query(`ALTER TABLE Settings ADD COLUMN tautulli JSON DEFAULT '${JSON.stringify({
        enabled: false,
        url: '',
        apiKey: '',
        connectionStatus: 'disconnected',
        version: null,
        syncIntervalValue: 6,
        syncIntervalUnit: 'hours',
        lastConnectionTest: null,
        historyDaysToSync: 30,
        syncWatchHistory: true,
        syncActiveStreams: true,
        syncLibraryStats: true
      })}';`);
      log.debug('Added tautulli column to Settings table');
    } catch (error) {
      // Column already exists or other issue
      log.debug({ error: error.message }, 'tautulli column exists or failed to add');
    }
    
    // Add Tautulli fields to Media table if they don't exist
    const tautulliFields = [
      { name: 'tautulliViewCount', type: 'INTEGER DEFAULT 0' },
      { name: 'tautulliLastPlayed', type: 'DATE' },
      { name: 'tautulliDuration', type: 'INTEGER' },
      { name: 'tautulliWatchTime', type: 'INTEGER DEFAULT 0' },
      { name: 'tautulliUsers', type: 'JSON DEFAULT \'[]\'' }
    ];
    
    for (const field of tautulliFields) {
      try {
        await sequelize.query(`ALTER TABLE Media ADD COLUMN ${field.name} ${field.type};`);
        log.debug({ fieldName: field.name }, 'Added column to Media table');
      } catch (error) {
        // Column already exists or other issue
        log.debug({ fieldName: field.name, error: error.message }, 'Column exists or failed to add');
      }
    }
    
    log.info('Database synchronized successfully');

    // Create default settings if they don't exist
    const settingsCount = await Settings.count();
    if (settingsCount === 0) {
      await Settings.create({});
      log.info('Default settings initialized');
    }
  } catch (error) {
    log.error({ error }, 'Error initializing database');
  }
}

module.exports = {
  sequelize,
  Media,
  DeletionRule,
  DeletionHistory,
  Settings,
  SyncStatus,
  PlexLibrary,
  PathMapping,
  LocalScanStatus,
  PendingDeletion,
  initializeDatabase
};

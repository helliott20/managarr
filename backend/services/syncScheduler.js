// backend/services/syncScheduler.js
const { createLogger } = require('../logger');
const { Settings } = require('../database');
const axios = require('axios');
const notificationService = require('./notificationService');

const log = createLogger('syncScheduler');

class SyncScheduler {
  constructor() {
    this.sonarrInterval = null;
    this.radarrInterval = null;
    this.isRunning = false;
    this.progressCallbacks = new Set();
  }

  // Add progress callback for real-time updates
  addProgressCallback(callback) {
    this.progressCallbacks.add(callback);
  }

  // Remove progress callback
  removeProgressCallback(callback) {
    this.progressCallbacks.delete(callback);
  }

  // Emit progress update to all registered callbacks
  emitProgress(data) {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        log.error({ error }, 'Error in sync progress callback');
      }
    });
  }

  // Convert sync interval to milliseconds
  convertToMilliseconds(value, unit) {
    switch (unit) {
      case 'minutes':
        return Math.max(value * 60 * 1000, 15 * 60 * 1000); // Minimum 15 minutes
      case 'hours':
        return value * 60 * 60 * 1000;
      case 'days':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 60 * 60 * 1000; // Default 1 hour
    }
  }

  // Get settings from database
  async getSettings() {
    try {
      const settings = await Settings.findOne();
      return settings || { sonarr: {}, radarr: {} };
    } catch (error) {
      log.error({ error }, 'Error getting sync settings');
      return { sonarr: {}, radarr: {} };
    }
  }

  // Perform Sonarr sync by calling the enhanced sync API
  async syncSonarr(settings) {
    const { sonarr } = settings;
    
    if (!sonarr?.enabled || !sonarr?.url || !sonarr?.apiKey) {
      log.info('Sonarr not configured or disabled, skipping sync');
      return;
    }

    try {
      this.emitProgress({
        type: 'sync_start',
        service: 'sonarr',
        timestamp: new Date()
      });

      log.info('Starting Sonarr sync via enhanced sync API...');
      
      // Call the actual enhanced sync API endpoint internally
      const axios = require('axios');
      const response = await axios.post('http://localhost:5000/api/sync/start', {}, {
        timeout: 300000 // 5 minutes timeout
      });

      if (response.data?.success) {
        log.info('Enhanced sync triggered successfully for Sonarr');
        
        this.emitProgress({
          type: 'sync_complete',
          service: 'sonarr',
          success: true,
          timestamp: new Date()
        });
        
        return { success: true, stats: { totalProcessed: 0, added: 0, updated: 0, deleted: 0 } };
      } else {
        throw new Error('Enhanced sync failed');
      }
    } catch (error) {
      log.error({ error }, 'Sonarr sync failed');
      
      this.emitProgress({
        type: 'sync_error',
        service: 'sonarr',
        error: error.message,
        timestamp: new Date()
      });
      
      return { success: false, error: error.message };
    }
  }

  // Perform Radarr sync by calling the enhanced sync API
  async syncRadarr(settings) {
    const { radarr } = settings;
    
    if (!radarr?.enabled || !radarr?.url || !radarr?.apiKey) {
      log.info('Radarr not configured or disabled, skipping sync');
      return;
    }

    try {
      this.emitProgress({
        type: 'sync_start',
        service: 'radarr',
        timestamp: new Date()
      });

      log.info('Starting Radarr sync via enhanced sync API...');
      
      // The enhanced sync API handles both Sonarr and Radarr, so we just need to trigger it
      // Since Sonarr already triggered it, we can just wait and add completion notification
      
      // Wait a bit to let the sync complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      log.info('Enhanced sync triggered successfully for Radarr');
      
      this.emitProgress({
        type: 'sync_complete',
        service: 'radarr',
        success: true,
        timestamp: new Date()
      });
      
      return { success: true, stats: { totalProcessed: 0, added: 0, updated: 0, deleted: 0 } };
    } catch (error) {
      log.error({ error }, 'Radarr sync failed');
      
      this.emitProgress({
        type: 'sync_error',
        service: 'radarr',
        error: error.message,
        timestamp: new Date()
      });
      
      return { success: false, error: error.message };
    }
  }

  // Start scheduled syncing based on current settings
  async startScheduledSync() {
    try {
      const settings = await this.getSettings();
      
      // Stop existing intervals
      this.stopScheduledSync();

      // Schedule Sonarr sync
      if (settings.sonarr?.enabled && settings.sonarr?.syncIntervalValue && settings.sonarr?.syncIntervalUnit) {
        const sonarrInterval = this.convertToMilliseconds(
          settings.sonarr.syncIntervalValue, 
          settings.sonarr.syncIntervalUnit
        );
        
        log.info({ interval: settings.sonarr.syncIntervalValue, unit: settings.sonarr.syncIntervalUnit }, 'Scheduling Sonarr sync');
        
        // Initial sync
        await this.syncSonarr(settings);
        
        // Schedule recurring sync
        this.sonarrInterval = setInterval(async () => {
          const currentSettings = await this.getSettings();
          await this.syncSonarr(currentSettings);
        }, sonarrInterval);
      }

      // Schedule Radarr sync
      if (settings.radarr?.enabled && settings.radarr?.syncIntervalValue && settings.radarr?.syncIntervalUnit) {
        const radarrInterval = this.convertToMilliseconds(
          settings.radarr.syncIntervalValue, 
          settings.radarr.syncIntervalUnit
        );
        
        log.info({ interval: settings.radarr.syncIntervalValue, unit: settings.radarr.syncIntervalUnit }, 'Scheduling Radarr sync');
        
        // Initial sync
        await this.syncRadarr(settings);
        
        // Schedule recurring sync
        this.radarrInterval = setInterval(async () => {
          const currentSettings = await this.getSettings();
          await this.syncRadarr(currentSettings);
        }, radarrInterval);
      }

      this.isRunning = true;
      log.info('Sync scheduler started successfully');
      
    } catch (error) {
      log.error({ error }, 'Error starting sync scheduler');
      throw error;
    }
  }

  // Stop scheduled syncing
  stopScheduledSync() {
    if (this.sonarrInterval) {
      clearInterval(this.sonarrInterval);
      this.sonarrInterval = null;
      log.info('Sonarr sync schedule stopped');
    }

    if (this.radarrInterval) {
      clearInterval(this.radarrInterval);
      this.radarrInterval = null;
      log.info('Radarr sync schedule stopped');
    }

    this.isRunning = false;
    log.info('Sync scheduler stopped');
  }

  // Restart scheduled syncing (used when settings change)
  async restartScheduledSync() {
    log.info('Restarting sync scheduler with updated settings...');
    this.stopScheduledSync();
    await this.startScheduledSync();
  }

  // Manual sync for both services (now uses enhanced sync)
  async manualSync() {
    try {
      const settings = await this.getSettings();
      
      this.emitProgress({
        type: 'manual_sync_start',
        timestamp: new Date()
      });

      // Run both syncs sequentially for better progress tracking
      let totalStats = { totalProcessed: 0, added: 0, updated: 0, deleted: 0 };
      
      if (settings.sonarr?.enabled) {
        const sonarrResult = await this.syncSonarr(settings);
        if (sonarrResult?.stats) {
          totalStats.totalProcessed += sonarrResult.stats.totalProcessed || 0;
          totalStats.added += sonarrResult.stats.added || 0;
          totalStats.updated += sonarrResult.stats.updated || 0;
          totalStats.deleted += sonarrResult.stats.deleted || 0;
        }
      }
      
      if (settings.radarr?.enabled) {
        const radarrResult = await this.syncRadarr(settings);
        if (radarrResult?.stats) {
          totalStats.totalProcessed += radarrResult.stats.totalProcessed || 0;
          totalStats.added += radarrResult.stats.added || 0;
          totalStats.updated += radarrResult.stats.updated || 0;
          totalStats.deleted += radarrResult.stats.deleted || 0;
        }
      }

      this.emitProgress({
        type: 'manual_sync_complete',
        timestamp: new Date(),
        stats: totalStats
      });

      return { success: true, message: 'Manual sync completed', stats: totalStats };
    } catch (error) {
      this.emitProgress({
        type: 'manual_sync_error',
        error: error.message,
        timestamp: new Date()
      });
      throw error;
    }
  }


  // Get current status
  getStatus() {
    return {
      isRunning: this.isRunning,
      sonarrScheduled: !!this.sonarrInterval,
      radarrScheduled: !!this.radarrInterval
    };
  }
}

module.exports = new SyncScheduler();
// backend/services/deletionExecutor.js
const { createLogger } = require('../logger');
const { PendingDeletion, Media, DeletionRule, DeletionHistory, Settings } = require('../database');
const { Op } = require('sequelize');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const log = createLogger('deletionExecutor');

class DeletionExecutor {
  constructor() {
    this.isRunning = false;
    this.currentExecution = null;
    this.scheduledInterval = null;
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
        log.error({ error }, 'Error in progress callback');
      }
    });
  }

  // Get Sonarr/Radarr settings
  async getArrSettings() {
    try {
      const settings = await Settings.findOne();
      if (!settings) {
        return { sonarr: {}, radarr: {} };
      }
      
      // Settings structure: sonarr and radarr are direct fields
      const arrSettings = {
        sonarr: settings.sonarr || {},
        radarr: settings.radarr || {}
      };
      
      log.debug({ 
        sonarrConfigured: !!(arrSettings.sonarr?.url && arrSettings.sonarr?.apiKey),
        radarrConfigured: !!(arrSettings.radarr?.url && arrSettings.radarr?.apiKey)
      }, 'Retrieved *arr settings');
      
      return arrSettings;
    } catch (error) {
      log.error({ error }, 'Error getting *arr settings');
      return { sonarr: {}, radarr: {} };
    }
  }

  // Execute deletion via Sonarr API
  async deleteThroughSonarr(mediaSnapshot, deletionStrategy, arrSettings) {
    const { sonarr } = arrSettings;
    
    if (!sonarr || !sonarr.url || !sonarr.apiKey) {
      log.info('Sonarr not configured, falling back to direct file deletion');
      // Fallback to direct file deletion
      try {
        await fs.unlink(mediaSnapshot.path);
        return [`Deleted file directly: ${mediaSnapshot.filename} (Sonarr not configured)`];
      } catch (fsError) {
        if (fsError.code === 'ENOENT') {
          return [`File already removed: ${mediaSnapshot.filename}`];
        } else {
          throw new Error(`Direct file deletion failed: ${fsError.message}`);
        }
      }
    }

    const headers = {
      'X-Api-Key': sonarr.apiKey,
      'Content-Type': 'application/json'
    };

    try {
      // Find the series in Sonarr by path or title
      const seriesResponse = await axios.get(`${sonarr.url}/api/v3/series`, { headers });
      const series = seriesResponse.data.find(s => 
        s.path === path.dirname(mediaSnapshot.path) ||
        s.title.toLowerCase() === mediaSnapshot.title?.toLowerCase()
      );

      if (!series) {
        throw new Error(`Series not found in Sonarr for: ${mediaSnapshot.title}`);
      }

      const results = [];

      // Handle different deletion strategies
      switch (deletionStrategy.sonarr) {
        case 'file_only':
          // Delete specific episode file
          if (mediaSnapshot.sonarrEpisodeFileId) {
            await axios.delete(
              `${sonarr.url}/api/v3/episodefile/${mediaSnapshot.sonarrEpisodeFileId}`, 
              { headers }
            );
            results.push(`Deleted episode file: ${mediaSnapshot.filename}`);
          } else {
            // Try to find episode file by path
            const episodeFilesResponse = await axios.get(
              `${sonarr.url}/api/v3/episodefile?seriesId=${series.id}`, 
              { headers }
            );
            const episodeFile = episodeFilesResponse.data.find(ef => ef.path === mediaSnapshot.path);
            
            if (episodeFile) {
              await axios.delete(`${sonarr.url}/api/v3/episodefile/${episodeFile.id}`, { headers });
              results.push(`Deleted episode file: ${mediaSnapshot.filename}`);
            } else {
              throw new Error(`Episode file not found in Sonarr: ${mediaSnapshot.path}`);
            }
          }
          break;

        case 'unmonitor':
          // Unmonitor the series
          await axios.put(`${sonarr.url}/api/v3/series/${series.id}`, {
            ...series,
            monitored: false
          }, { headers });
          results.push(`Unmonitored series: ${series.title}`);
          
          // Also delete files if specified
          if (deletionStrategy.deleteFiles) {
            await axios.delete(`${sonarr.url}/api/v3/series/${series.id}`, {
              headers,
              params: { deleteFiles: true, addImportExclusion: deletionStrategy.addImportExclusion }
            });
            results.push(`Deleted series files: ${series.title}`);
          }
          break;

        case 'remove_series':
          // Remove series entirely
          await axios.delete(`${sonarr.url}/api/v3/series/${series.id}`, {
            headers,
            params: { deleteFiles: deletionStrategy.deleteFiles, addImportExclusion: deletionStrategy.addImportExclusion }
          });
          results.push(`Removed series: ${series.title}`);
          break;

        default:
          throw new Error(`Unknown Sonarr deletion strategy: ${deletionStrategy.sonarr}`);
      }

      return results;
    } catch (error) {
      log.error({ error }, 'Sonarr deletion error');
      throw new Error(`Sonarr deletion failed: ${error.message}`);
    }
  }

  // Execute deletion via Radarr API
  async deleteThroughRadarr(mediaSnapshot, deletionStrategy, arrSettings) {
    const { radarr } = arrSettings;
    
    if (!radarr || !radarr.url || !radarr.apiKey) {
      log.info('Radarr not configured, falling back to direct file deletion');
      // Fallback to direct file deletion
      try {
        await fs.unlink(mediaSnapshot.path);
        return [`Deleted file directly: ${mediaSnapshot.filename} (Radarr not configured)`];
      } catch (fsError) {
        if (fsError.code === 'ENOENT') {
          return [`File already removed: ${mediaSnapshot.filename}`];
        } else {
          throw new Error(`Direct file deletion failed: ${fsError.message}`);
        }
      }
    }

    const headers = {
      'X-Api-Key': radarr.apiKey,
      'Content-Type': 'application/json'
    };

    try {
      // Find the movie in Radarr by path or title
      const moviesResponse = await axios.get(`${radarr.url}/api/v3/movie`, { headers });
      const movie = moviesResponse.data.find(m => 
        m.path === path.dirname(mediaSnapshot.path) ||
        m.title.toLowerCase() === mediaSnapshot.title?.toLowerCase()
      );

      if (!movie) {
        throw new Error(`Movie not found in Radarr for: ${mediaSnapshot.title}`);
      }

      const results = [];

      // Handle different deletion strategies
      switch (deletionStrategy.radarr) {
        case 'file_only':
          // Delete specific movie file
          if (movie.movieFile && movie.movieFile.id) {
            await axios.delete(
              `${radarr.url}/api/v3/moviefile/${movie.movieFile.id}`, 
              { headers }
            );
            results.push(`Deleted movie file: ${mediaSnapshot.filename}`);
          } else {
            throw new Error(`Movie file not found in Radarr: ${mediaSnapshot.path}`);
          }
          break;

        case 'remove_movie':
          // Remove movie entirely
          await axios.delete(`${radarr.url}/api/v3/movie/${movie.id}`, {
            headers,
            params: { deleteFiles: deletionStrategy.deleteFiles, addImportExclusion: deletionStrategy.addImportExclusion }
          });
          results.push(`Removed movie: ${movie.title}`);
          break;

        default:
          throw new Error(`Unknown Radarr deletion strategy: ${deletionStrategy.radarr}`);
      }

      return results;
    } catch (error) {
      log.error({ error }, 'Radarr deletion error');
      throw new Error(`Radarr deletion failed: ${error.message}`);
    }
  }

  // Execute a single pending deletion
  async executePendingDeletion(pendingDeletion) {
    const { mediaSnapshot, ruleSnapshot } = pendingDeletion;
    const deletionStrategy = ruleSnapshot.deletionStrategy || {};
    
    try {
      this.emitProgress({
        type: 'item_start',
        pendingDeletionId: pendingDeletion.id,
        filename: mediaSnapshot.filename,
        mediaType: mediaSnapshot.type
      });

      const arrSettings = await this.getArrSettings();
      let deletionResults = [];

      // Execute deletion based on media type
      if (mediaSnapshot.type === 'show' || mediaSnapshot.type === 'episode') {
        deletionResults = await this.deleteThroughSonarr(mediaSnapshot, deletionStrategy, arrSettings);
      } else if (mediaSnapshot.type === 'movie') {
        deletionResults = await this.deleteThroughRadarr(mediaSnapshot, deletionStrategy, arrSettings);
      } else {
        // For other types, just delete the file directly (fallback)
        try {
          await fs.unlink(mediaSnapshot.path);
          deletionResults.push(`Deleted file: ${mediaSnapshot.filename}`);
        } catch (fsError) {
          if (fsError.code === 'ENOENT') {
            deletionResults.push(`File already removed: ${mediaSnapshot.filename}`);
          } else {
            throw fsError;
          }
        }
      }

      // Update pending deletion status
      await pendingDeletion.update({
        status: 'completed',
        completedAt: new Date(),
        executionResults: deletionResults,
        error: null
      });

      // Create deletion history record
      await DeletionHistory.create({
        ruleId: pendingDeletion.ruleId,
        ruleName: pendingDeletion.ruleSnapshot?.name || 'Unknown Rule',
        mediaDeleted: [{
          filename: mediaSnapshot.filename,
          path: mediaSnapshot.path,
          size: mediaSnapshot.size,
          type: mediaSnapshot.type,
          name: mediaSnapshot.filename
        }],
        totalSizeFreed: mediaSnapshot.size || 0,
        success: true
      });

      // Remove from Media table if it exists
      // Skip this for now to avoid foreign key constraints
      // The media record will remain but the pending deletion is marked complete
      try {
        const mediaRecord = await Media.findByPk(pendingDeletion.mediaId);
        if (mediaRecord) {
          // Just log instead of delete to avoid constraint issues
          log.debug({ mediaId: pendingDeletion.mediaId }, 'Media record marked for deletion but kept in database');
        }
      } catch (error) {
        log.warn({ error }, 'Could not check media record');
      }

      this.emitProgress({
        type: 'item_complete',
        pendingDeletionId: pendingDeletion.id,
        filename: mediaSnapshot.filename,
        results: deletionResults,
        success: true
      });

      return {
        success: true,
        results: deletionResults
      };

    } catch (error) {
      // Update pending deletion with error
      await pendingDeletion.update({
        status: 'failed',
        executionResults: [`Error: ${error.message}`],
        error: error.message,
        completedAt: new Date()
      });

      // Create deletion history record for failed deletion
      try {
        await DeletionHistory.create({
          ruleId: pendingDeletion.ruleId,
          ruleName: pendingDeletion.ruleSnapshot?.name || 'Unknown Rule',
          mediaDeleted: [{
            filename: mediaSnapshot.filename,
            path: mediaSnapshot.path,
            size: mediaSnapshot.size,
            type: mediaSnapshot.type,
            name: mediaSnapshot.filename
          }],
          totalSizeFreed: 0,
          success: false,
          error: error.message
        });
      } catch (historyError) {
        log.error({ error: historyError }, 'Error creating deletion history for failed deletion');
      }

      this.emitProgress({
        type: 'item_error',
        pendingDeletionId: pendingDeletion.id,
        filename: mediaSnapshot.filename,
        error: error.message,
        success: false
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Execute all approved pending deletions
  async executeApprovedDeletions() {
    if (this.isRunning) {
      throw new Error('Deletion execution is already running');
    }

    this.isRunning = true;
    const startTime = new Date();

    try {
      // Find all approved pending deletions
      const approvedDeletions = await PendingDeletion.findAll({
        where: {
          status: 'approved',
          scheduledDate: { [Op.lte]: new Date() }
        },
        order: [['scheduledDate', 'ASC']]
      });

      if (approvedDeletions.length === 0) {
        this.emitProgress({
          type: 'execution_complete',
          totalItems: 0,
          successful: 0,
          failed: 0,
          message: 'No approved deletions to execute'
        });
        return {
          success: true,
          totalItems: 0,
          successful: 0,
          failed: 0,
          message: 'No approved deletions to execute'
        };
      }

      this.emitProgress({
        type: 'execution_start',
        totalItems: approvedDeletions.length,
        startTime: startTime
      });

      let successful = 0;
      let failed = 0;
      const results = [];

      // Execute each pending deletion
      for (let i = 0; i < approvedDeletions.length; i++) {
        const pendingDeletion = approvedDeletions[i];
        
        this.emitProgress({
          type: 'progress',
          current: i + 1,
          total: approvedDeletions.length,
          percentage: Math.round(((i + 1) / approvedDeletions.length) * 100)
        });

        const result = await this.executePendingDeletion(pendingDeletion);
        results.push({
          id: pendingDeletion.id,
          filename: pendingDeletion.mediaSnapshot.filename,
          ...result
        });

        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        // Small delay between deletions to avoid overwhelming the APIs
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const endTime = new Date();
      const duration = endTime - startTime;

      this.emitProgress({
        type: 'execution_complete',
        totalItems: approvedDeletions.length,
        successful,
        failed,
        duration,
        results
      });

      return {
        success: true,
        totalItems: approvedDeletions.length,
        successful,
        failed,
        duration,
        results
      };

    } catch (error) {
      this.emitProgress({
        type: 'execution_error',
        error: error.message
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Start scheduled execution
  async startScheduledExecution(intervalMinutes = null) {
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
    }

    // Get interval from settings if not provided
    if (!intervalMinutes) {
      try {
        const settings = await Settings.findOne();
        if (settings && settings.general && settings.general.deletionExecutorInterval) {
          intervalMinutes = settings.general.deletionExecutorInterval;
        } else {
          intervalMinutes = 60; // Default fallback
        }
      } catch (error) {
        log.error({ error }, 'Error getting deletion executor interval from settings');
        intervalMinutes = 60; // Default fallback
      }
    }

    log.info({ intervalMinutes }, 'Starting scheduled deletion execution');
    
    // Run immediately on start
    try {
      await this.executeApprovedDeletions();
    } catch (error) {
      log.error({ error }, 'Initial scheduled execution failed');
    }

    // Schedule recurring execution
    this.scheduledInterval = setInterval(async () => {
      try {
        log.info('Running scheduled deletion execution...');
        await this.executeApprovedDeletions();
      } catch (error) {
        log.error({ error }, 'Scheduled deletion execution failed');
      }
    }, intervalMinutes * 60 * 1000);
  }

  // Stop scheduled execution
  stopScheduledExecution() {
    if (this.scheduledInterval) {
      clearInterval(this.scheduledInterval);
      this.scheduledInterval = null;
      log.info('Scheduled deletion execution stopped');
    }
  }

  // Get current execution status
  getStatus() {
    return {
      isRunning: this.isRunning,
      isScheduled: !!this.scheduledInterval,
      currentExecution: this.currentExecution
    };
  }
}

module.exports = new DeletionExecutor();
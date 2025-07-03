// Enhanced sync routes with comprehensive data extraction from Plex, Sonarr, and Radarr
const { createLogger } = require('../logger');
const express = require('express');
const router = express.Router();
const { Media, Settings, SyncStatus, PendingDeletion } = require('../database');
const { Op } = require('sequelize');
const axios = require('axios');
const notificationService = require('../services/notificationService');

const log = createLogger('sync_enhanced');

// Create axios instance with connection pooling for better performance
const http = require('http');
const https = require('https');

const axiosInstance = axios.create({
  httpAgent: new http.Agent({ 
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5
  }),
  httpsAgent: new https.Agent({ 
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5
  })
});

// Batch size for database operations
const BATCH_SIZE = 100;

// Cache for API responses to reduce redundant requests
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to safely delete media records (handles foreign key constraints)
async function safeDeleteMedia(mediaRecord) {
  try {
    // First, check for PendingDeletion records that reference this media
    const allPendingDeletions = await PendingDeletion.findAll({
      where: { mediaId: mediaRecord.id }
    });
    
    if (allPendingDeletions.length > 0) {
      // Separate completed (historical) from non-completed records
      const completedDeletions = allPendingDeletions.filter(pd => pd.status === 'completed');
      const nonCompletedDeletions = allPendingDeletions.filter(pd => pd.status !== 'completed');
      
      log.debug({ 
        mediaId: mediaRecord.id, 
        totalPendingDeletions: allPendingDeletions.length, 
        completedDeletions: completedDeletions.length, 
        nonCompletedDeletions: nonCompletedDeletions.length 
      }, 'Found pending deletions for media');
      
      // Only remove non-completed pending deletions (preserve history)
      if (nonCompletedDeletions.length > 0) {
        await PendingDeletion.destroy({
          where: { 
            mediaId: mediaRecord.id,
            status: { [Op.ne]: 'completed' }  // Remove all except completed
          }
        });
      }
      
      // If there are completed deletions (history), don't delete the media record
      if (completedDeletions.length > 0) {
        log.debug({ 
          mediaId: mediaRecord.id, 
          completedDeletionsCount: completedDeletions.length 
        }, 'Preserving media due to completed deletion history records');
        return false; // Don't delete the media
      }
    }
    
    // Now safe to delete the media record (no completed deletions to preserve)
    await mediaRecord.destroy();
    return true;
  } catch (error) {
    log.error({ error, mediaId: mediaRecord.id }, 'Error safely deleting media');
    return false;
  }
}

// Helper function for making API requests with retries and caching
async function makeRequestWithRetry(url, options, maxRetries = 3, retryDelay = 2000) {
  let lastError;
  
  if (!options.timeout) {
    options.timeout = 30000;
  }
  
  // Check cache for GET requests
  if (options.method === 'get') {
    const cacheKey = `${url}_${JSON.stringify(options.headers)}`;
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      log.debug({ url }, 'Using cached response');
      return { data: cached.data };
    }
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.debug({ attempt, maxRetries, url }, 'API request attempt');
      const response = await axiosInstance(url, options);
      
      // Cache successful GET responses
      if (options.method === 'get') {
        const cacheKey = `${url}_${JSON.stringify(options.headers)}`;
        apiCache.set(cacheKey, {
          data: response.data,
          timestamp: Date.now()
        });
      }
      
      return response;
    } catch (error) {
      lastError = error;
      log.error({ attempt, maxRetries, error: error.message }, 'API request attempt failed');
      
      if (attempt < maxRetries) {
        const delay = retryDelay * attempt;
        log.info({ delay }, 'Retrying API request');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Helper function for batch database operations
async function batchUpsertMedia(mediaItems) {
  if (mediaItems.length === 0) return;
  
  const chunks = [];
  for (let i = 0; i < mediaItems.length; i += BATCH_SIZE) {
    chunks.push(mediaItems.slice(i, i + BATCH_SIZE));
  }
  
  log.info({ mediaItemsCount: mediaItems.length, chunksCount: chunks.length }, 'Batch upserting media items');
  
  for (const chunk of chunks) {
    try {
      await Media.bulkCreate(chunk, {
        updateOnDuplicate: [
          'size', 'watched', 'title', 'year', 'rating', 'qualityProfile',
          'qualityName', 'resolution', 'codec', 'audioChannels', 'audioLanguage',
          'seriesStatus', 'network', 'seasonCount', 'episodeCount', 'sonarrId',
          'radarrId', 'tags', 'metadata', 'studio', 'certification', 'collection',
          'plexViewCount', 'lastWatchedDate', 'userWatchData', 'tautulliViewCount',
          'tautulliLastPlayed', 'tautulliDuration', 'tautulliWatchTime', 'tautulliUsers'
        ],
        ignoreDuplicates: false // Ensure we update on duplicate
      });
    } catch (error) {
      log.warn({ error: error.message }, 'Error in bulk upsert, falling back to individual upserts');
      // Fallback to individual upserts if bulk fails
      for (const item of chunk) {
        try {
          await Media.upsert(item, {
            fields: [
              'size', 'watched', 'title', 'year', 'rating', 'qualityProfile',
              'qualityName', 'resolution', 'codec', 'audioChannels', 'audioLanguage',
              'seriesStatus', 'network', 'seasonCount', 'episodeCount', 'sonarrId',
              'radarrId', 'tags', 'metadata', 'studio', 'certification', 'collection',
              'plexViewCount', 'lastWatchedDate', 'userWatchData', 'tautulliViewCount',
              'tautulliLastPlayed', 'tautulliDuration', 'tautulliWatchTime', 'tautulliUsers'
            ]
          });
        } catch (itemError) {
          log.error({ error: itemError.message, path: item.path }, 'Failed to upsert media item');
        }
      }
    }
  }
}

// Helper function to get settings
async function getSettings() {
  try {
    const settings = await Settings.findOne({ where: { id: 1 } });
    return settings || {};
  } catch (error) {
    log.error({ error }, 'Error getting settings');
    return {};
  }
}

// Get sync status
router.get('/status', async (req, res) => {
  try {
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
    log.error({ error: err }, 'Error getting sync status');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// Start enhanced sync
router.post('/start', async (req, res) => {
  try {
    const settings = await getSettings();
    const sonarrEnabled = settings.sonarr && settings.sonarr.enabled && settings.sonarr.url && settings.sonarr.apiKey;
    const radarrEnabled = settings.radarr && settings.radarr.enabled && settings.radarr.url && settings.radarr.apiKey;
    const plexEnabled = settings.plex && settings.plex.serverUrl && settings.plex.authToken;
    const tautulliEnabled = settings.tautulli && settings.tautulli.enabled && settings.tautulli.url && settings.tautulli.apiKey;
    
    if (!sonarrEnabled && !radarrEnabled && !plexEnabled && !tautulliEnabled) {
      return res.status(400).json({
        success: false,
        message: 'No services are configured. Please configure at least one of Sonarr, Radarr, Plex, or Tautulli in the settings.'
      });
    }
    
    // Calculate total libraries
    let totalLibraries = 0;
    if (sonarrEnabled) totalLibraries++;
    if (radarrEnabled) totalLibraries++;
    if (plexEnabled) totalLibraries++;
    if (tautulliEnabled) totalLibraries++;
    
    // Create sync status
    const syncStatus = await SyncStatus.create({
      status: 'syncing',
      progress: 0,
      currentLibrary: null,
      libraryProgress: 0,
      totalLibraries: totalLibraries,
      startTime: new Date(),
      endTime: null,
      error: null,
      details: {
        sonarrEnabled,
        radarrEnabled,
        plexEnabled,
        tautulliEnabled,
        enhancedSync: true
      }
    });
    
    // Add notification for sync start
    notificationService.addNotification({
      type: 'info',
      category: 'sync',
      title: 'Sync Started',
      message: `Starting sync for ${totalLibraries} services...`
    });
    
    // Return immediately to the client
    res.json({ 
      success: true, 
      message: 'Enhanced sync started',
      syncId: syncStatus.id
    });
    
    // Continue processing in the background
    enhancedSyncMediaData(syncStatus.id);
    
  } catch (err) {
    log.error({ error: err }, 'Error starting enhanced sync');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

// Enhanced background sync function
async function enhancedSyncMediaData(syncId) {
  let syncStatus = null;
  
  try {
    syncStatus = await SyncStatus.findByPk(syncId);
    if (!syncStatus) {
      log.error({ syncId }, 'Sync status not found');
      return;
    }
    
    const settings = await getSettings();
    const sonarrEnabled = settings.sonarr && settings.sonarr.enabled && settings.sonarr.url && settings.sonarr.apiKey;
    const radarrEnabled = settings.radarr && settings.radarr.enabled && settings.radarr.url && settings.radarr.apiKey;
    const plexEnabled = settings.plex && settings.plex.serverUrl && settings.plex.authToken;
    const tautulliEnabled = settings.tautulli && settings.tautulli.enabled && settings.tautulli.url && settings.tautulli.apiKey;
    
    // Run all sync tasks in parallel for better performance
    const syncTasks = [];
    
    if (sonarrEnabled) {
      syncTasks.push({
        name: 'Sonarr',
        fn: () => enhancedSyncSonarrData(settings.sonarr, syncStatus)
      });
    }
    
    if (radarrEnabled) {
      syncTasks.push({
        name: 'Radarr',
        fn: () => enhancedSyncRadarrData(settings.radarr, syncStatus)
      });
    }
    
    if (plexEnabled) {
      syncTasks.push({
        name: 'Plex',
        fn: () => enhancedSyncPlexData(settings.plex, syncStatus)
      });
    }
    
    if (tautulliEnabled) {
      syncTasks.push({
        name: 'Tautulli',
        fn: () => enhancedSyncTautulliData(settings.tautulli, syncStatus)
      });
    }
    
    log.info({ servicesCount: syncTasks.length }, 'Starting parallel sync for services');
    
    // Update status to indicate parallel processing
    await syncStatus.update({
      currentLibrary: 'Processing all services in parallel',
      libraryProgress: 0,
      progress: 10
    });
    
    // Execute all syncs in parallel
    const results = await Promise.allSettled(
      syncTasks.map(task => task.fn())
    );
    
    // Check for any failures
    const failures = results
      .map((result, index) => ({
        service: syncTasks[index].name,
        error: result.status === 'rejected' ? result.reason : null
      }))
      .filter(r => r.error);
    
    if (failures.length > 0) {
      log.error({ failures }, 'Some services failed to sync');
      // Continue with successful syncs rather than failing entirely
    }
    
    // Mark sync as completed
    await syncStatus.update({
      status: 'completed',
      progress: 100,
      currentLibrary: null,
      libraryProgress: 100,
      endTime: new Date()
    });
    
    log.info('Enhanced media data sync completed successfully');
    
    // Add completion notification
    notificationService.addNotification({
      type: 'success',
      category: 'sync',
      title: 'Sync Complete',
      message: 'Sync completed successfully for all services.'
    });
    
    // Update settings with last sync time
    if (settings) {
      const updatedSettings = {
        ...settings.toJSON(),
        lastSync: new Date()
      };
      
      await Settings.update(updatedSettings, { where: { id: 1 } });
    }
  } catch (err) {
    log.error({ error: err }, 'Error in enhanced sync');
    
    // Add error notification
    notificationService.addNotification({
      type: 'error',
      category: 'sync',
      title: 'Enhanced Sync Failed',
      message: `Sync failed: ${err.message}`
    });
    
    if (syncStatus) {
      await syncStatus.update({
        status: 'error',
        endTime: new Date(),
        error: err.message
      });
    }
  }
}

// Enhanced Sonarr sync function
async function enhancedSyncSonarrData(sonarrSettings, syncStatus) {
  try {
    const { url, apiKey } = sonarrSettings;
    
    log.info('Starting enhanced Sonarr sync...');
    
    await syncStatus.update({
      libraryProgress: 10,
      details: {
        ...syncStatus.details,
        currentStep: 'Fetching series from Sonarr (Enhanced)'
      }
    });
    
    // Track files that exist in Sonarr for cleanup
    const sonarrFilePaths = new Set();
    
    const seriesResponse = await makeRequestWithRetry(
      `${url}/api/v3/series`, 
      {
        method: 'get',
        headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
        timeout: 30000
      }
    );
    
    const series = seriesResponse.data;
    log.info({ seriesCount: series.length }, 'Retrieved series from Sonarr');
    
    await syncStatus.update({
      libraryProgress: 20,
      details: {
        ...syncStatus.details,
        seriesCount: series.length,
        currentStep: 'Processing series data with enhanced fields'
      }
    });
    
    // Try to get all episode files in one request for better performance
    let allEpisodeFiles = [];
    let useBulkEndpoint = true;
    
    try {
      log.debug('Attempting to fetch all episode files from Sonarr in bulk');
      const episodeFilesResponse = await makeRequestWithRetry(
        `${url}/api/v3/episodefile`, 
        {
          method: 'get',
          headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
          timeout: 60000 // Longer timeout for large request
        }
      );
      
      allEpisodeFiles = episodeFilesResponse.data;
      log.info({ episodeFilesCount: allEpisodeFiles.length }, 'Retrieved episode files using bulk endpoint');
    } catch (bulkError) {
      log.warn('Bulk episode files endpoint failed, falling back to per-series method');
      log.debug({ status: bulkError.response?.status, message: bulkError.message }, 'Bulk endpoint error details');
      useBulkEndpoint = false;
    }
    
    // Create lookup maps for efficient processing
    const seriesMap = new Map(series.map(s => [s.id, s]));
    let episodeFilesBySeriesId = new Map();
    
    if (useBulkEndpoint) {
      // Process bulk episode files
      allEpisodeFiles.forEach(ef => {
        if (!episodeFilesBySeriesId.has(ef.seriesId)) {
          episodeFilesBySeriesId.set(ef.seriesId, []);
        }
        episodeFilesBySeriesId.get(ef.seriesId).push(ef);
      });
    }
    
    // Process series with files
    const seriesWithFiles = series.filter(s => s.statistics?.episodeFileCount > 0);
    const CONCURRENT_LIMIT = 5;
    const mediaToUpsert = [];
    
    log.info({ seriesWithFilesCount: seriesWithFiles.length }, 'Processing series with files');
    
    if (useBulkEndpoint) {
      // Fast path: Use bulk episode files data
      log.debug('Using bulk episode files for fast processing');
      
      // Process series in batches to get episode metadata
      for (let i = 0; i < seriesWithFiles.length; i += CONCURRENT_LIMIT) {
        const batch = seriesWithFiles.slice(i, i + CONCURRENT_LIMIT);
        const progress = 20 + Math.floor((i / seriesWithFiles.length) * 60);
        
        await syncStatus.update({
          libraryProgress: Math.min(Math.max(progress, 0), 100),
          details: {
            ...syncStatus.details,
            currentStep: `Fast processing series batch ${Math.ceil(i/CONCURRENT_LIMIT) + 1}/${Math.ceil(seriesWithFiles.length/CONCURRENT_LIMIT)}`
          }
        });
        
        // Fetch episodes for batch in parallel
        const batchPromises = batch.map(async (show) => {
          try {
            const episodesResponse = await makeRequestWithRetry(
              `${url}/api/v3/episode?seriesId=${show.id}`, 
              {
                method: 'get',
                headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
                timeout: 30000
              }
            );
            
            return {
              show,
              episodes: episodesResponse.data
            };
          } catch (err) {
            log.error({ error: err, seriesTitle: show.title }, 'Error fetching episodes for series');
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Process results and prepare media for batch insert
        for (const result of batchResults) {
          if (!result) continue;
          
          const { show, episodes } = result;
          const seriesEpisodeFiles = episodeFilesBySeriesId.get(show.id) || [];
          
          for (const episode of episodes) {
            if (!episode.hasFile) continue;
            
            const episodeFile = seriesEpisodeFiles.find(ef => ef.id === episode.episodeFileId);
            if (!episodeFile) continue;
            
            sonarrFilePaths.add(episodeFile.path);
            
            const episodeTitle = `${show.title} - ${episode.seasonNumber}x${episode.episodeNumber} - ${episode.title}`;
            const rating = show.ratings?.value || null;
            const resolution = episodeFile.quality?.quality?.resolution || episodeFile.mediaInfo?.resolution || null;
            const qualityName = episodeFile.quality?.quality?.name || resolution || 'Unknown';
            
            mediaToUpsert.push({
              path: episodeFile.path,
              filename: episodeFile.path.split('/').pop(),
              type: 'show',
              size: episodeFile.size,
              watched: show.statistics.percentOfEpisodes === 100,
              title: episodeTitle,
              year: show.year,
              rating: rating,
              qualityProfile: show.qualityProfileId?.toString(),
              qualityName: qualityName,
              resolution: resolution,
              codec: episodeFile.mediaInfo?.videoCodec || null,
              audioChannels: episodeFile.mediaInfo?.audioChannels || null,
              audioLanguage: episodeFile.mediaInfo?.audioLanguages || null,
              seriesStatus: show.status,
              network: show.network,
              seasonCount: show.statistics.seasonCount,
              episodeCount: show.statistics.episodeFileCount,
              sonarrId: episodeFile.id,
              tags: JSON.stringify(show.tags || []),
              metadata: JSON.stringify({
                title: episodeTitle,
                year: show.year,
                rating: rating,
                sonarrId: episodeFile.id,
                seriesId: show.id,
                episodeId: episode.id,
                seasonNumber: episode.seasonNumber,
                episodeNumber: episode.episodeNumber,
                airDate: episode.airDate,
                network: show.network,
                status: show.status
              }),
              created: new Date(show.added),
              lastAccessed: new Date(),
              protected: false
            });
          }
        }
      }
    } else {
      // Fallback path: Original method with per-series episode file requests
      log.debug('Using fallback method with per-series requests');
      
      for (let i = 0; i < seriesWithFiles.length; i += CONCURRENT_LIMIT) {
        const batch = seriesWithFiles.slice(i, i + CONCURRENT_LIMIT);
        const progress = 20 + Math.floor((i / seriesWithFiles.length) * 60);
        
        await syncStatus.update({
          libraryProgress: Math.min(Math.max(progress, 0), 100),
          details: {
            ...syncStatus.details,
            currentStep: `Fallback processing series batch ${Math.ceil(i/CONCURRENT_LIMIT) + 1}/${Math.ceil(seriesWithFiles.length/CONCURRENT_LIMIT)}`
          }
        });
        
        // Process each series with episode files
        const batchPromises = batch.map(async (show) => {
          try {
            const episodesResponse = await makeRequestWithRetry(
              `${url}/api/v3/episode?seriesId=${show.id}&includeEpisodeFile=true`, 
              {
                method: 'get',
                headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
                timeout: 30000
              }
            );
            
            const episodes = episodesResponse.data;
            const showMediaItems = [];
            
            for (const episode of episodes) {
              if (!episode.hasFile || !episode.episodeFile) continue;
              
              const episodeFile = episode.episodeFile;
              sonarrFilePaths.add(episodeFile.path);
              
              const episodeTitle = `${show.title} - ${episode.seasonNumber}x${episode.episodeNumber} - ${episode.title}`;
              const rating = show.ratings?.value || null;
              const resolution = episodeFile.quality?.quality?.resolution || episodeFile.mediaInfo?.resolution || null;
              const qualityName = episodeFile.quality?.quality?.name || resolution || 'Unknown';
              
              showMediaItems.push({
                path: episodeFile.path,
                filename: episodeFile.path.split('/').pop(),
                type: 'show',
                size: episodeFile.size,
                watched: show.statistics.percentOfEpisodes === 100,
                title: episodeTitle,
                year: show.year,
                rating: rating,
                qualityProfile: show.qualityProfileId?.toString(),
                qualityName: qualityName,
                resolution: resolution,
                codec: episodeFile.mediaInfo?.videoCodec || null,
                audioChannels: episodeFile.mediaInfo?.audioChannels || null,
                audioLanguage: episodeFile.mediaInfo?.audioLanguages || null,
                seriesStatus: show.status,
                network: show.network,
                seasonCount: show.statistics.seasonCount,
                episodeCount: show.statistics.episodeFileCount,
                sonarrId: episodeFile.id,
                tags: JSON.stringify(show.tags || []),
                metadata: JSON.stringify({
                  title: episodeTitle,
                  year: show.year,
                  rating: rating,
                  sonarrId: episodeFile.id,
                  seriesId: show.id,
                  episodeId: episode.id,
                  seasonNumber: episode.seasonNumber,
                  episodeNumber: episode.episodeNumber,
                  airDate: episode.airDate,
                  network: show.network,
                  status: show.status
                }),
                created: new Date(show.added),
                lastAccessed: new Date(),
                protected: false
              });
            }
            
            return showMediaItems;
          } catch (err) {
            log.error({ error: err, seriesTitle: show.title }, 'Error processing series');
            return [];
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Flatten and add to main array
        for (const showItems of batchResults) {
          mediaToUpsert.push(...showItems);
        }
      }
    }
    
    // Batch upsert all media
    log.info({ mediaCount: mediaToUpsert.length }, 'Batch upserting TV shows');
    await batchUpsertMedia(mediaToUpsert);
    
    await syncStatus.update({
      libraryProgress: 90,
      details: {
        ...syncStatus.details,
        currentStep: 'Cleaning up deleted Sonarr files'
      }
    });
    
    log.info('Starting Sonarr cleanup process');
    log.debug({ currentFilePathsCount: sonarrFilePaths.size }, 'Found current file paths in Sonarr');
    
    // Cleanup: Remove media files that no longer exist in Sonarr
    try {
      const orphanedSonarrMedia = await Media.findAll({
      where: {
        type: 'show',
        path: {
          [Op.notIn]: Array.from(sonarrFilePaths)
        },
        // Only remove files that have sonarrId (came from Sonarr originally)
        sonarrId: {
          [Op.not]: null
        }
      }
    });
    
    // Also find shows without sonarrId that are not in current Sonarr file paths
    const orphanedShowsWithoutSonarrId = await Media.findAll({
      where: {
        type: 'show',
        path: {
          [Op.notIn]: Array.from(sonarrFilePaths)
        },
        sonarrId: null
      }
    });
    
    log.debug({ orphanedShowsCount: orphanedShowsWithoutSonarrId.length }, 'Found shows without sonarrId not in current Sonarr paths');
    
    // Remove orphaned shows with sonarrId
    if (orphanedSonarrMedia.length > 0) {
      log.info({ orphanedFilesCount: orphanedSonarrMedia.length }, 'Removing orphaned Sonarr files from database');
      for (const orphan of orphanedSonarrMedia) {
        log.debug({ filePath: orphan.path, sonarrId: orphan.sonarrId }, 'Removing orphaned file with sonarrId');
        await safeDeleteMedia(orphan);
      }
    }
    
    // Also remove shows without sonarrId that are not in current Sonarr paths
    if (orphanedShowsWithoutSonarrId.length > 0) {
      log.info({ orphanedShowsCount: orphanedShowsWithoutSonarrId.length }, 'Removing orphaned shows without sonarrId from database');
      for (const orphan of orphanedShowsWithoutSonarrId) {
        log.debug({ filePath: orphan.path }, 'Removing orphaned file without sonarrId');
        await safeDeleteMedia(orphan);
      }
    }
    
    const totalSonarrOrphanedRemoved = orphanedSonarrMedia.length + orphanedShowsWithoutSonarrId.length;
    
    await syncStatus.update({
      libraryProgress: 95,
      details: {
        ...syncStatus.details,
        currentStep: 'Finalizing enhanced Sonarr sync',
        orphanedFilesRemoved: totalSonarrOrphanedRemoved
      }
    });
    
    } catch (cleanupError) {
      log.error({ error: cleanupError }, 'Error during Sonarr cleanup');
      // Continue with sync even if cleanup fails
    }
    
    log.info('Enhanced Sonarr data sync completed');
  } catch (err) {
    log.error({ error: err }, 'Error in enhanced Sonarr sync');
    throw err;
  }
}

// Enhanced Radarr sync function
async function enhancedSyncRadarrData(radarrSettings, syncStatus) {
  try {
    const { url, apiKey } = radarrSettings;
    
    log.info('Starting enhanced Radarr sync...');
    
    await syncStatus.update({
      libraryProgress: 10,
      details: {
        ...syncStatus.details,
        currentStep: 'Fetching movies from Radarr (Enhanced)'
      }
    });
    
    // Track files that exist in Radarr for cleanup
    const radarrFilePaths = new Set();
    
    const moviesResponse = await makeRequestWithRetry(
      `${url}/api/v3/movie`, 
      {
        method: 'get',
        headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
        timeout: 30000
      }
    );
    
    const movies = moviesResponse.data;
    log.info({ moviesCount: movies.length }, 'Retrieved movies from Radarr');
    
    await syncStatus.update({
      libraryProgress: 20,
      details: {
        ...syncStatus.details,
        moviesCount: movies.length,
        currentStep: 'Processing movie data with enhanced fields'
      }
    });
    
    // Try to get all movie files in one request for better performance
    let allMovieFiles = [];
    let useBulkEndpoint = true;
    
    try {
      log.debug('Attempting to fetch all movie files from Radarr in bulk');
      const movieFilesResponse = await makeRequestWithRetry(
        `${url}/api/v3/moviefile`, 
        {
          method: 'get',
          headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
          timeout: 60000 // Longer timeout for large request
        }
      );
      
      allMovieFiles = movieFilesResponse.data;
      log.info({ movieFilesCount: allMovieFiles.length }, 'Retrieved movie files using bulk endpoint');
    } catch (bulkError) {
      log.warn('Bulk movie files endpoint failed, falling back to per-movie method');
      log.debug({ status: bulkError.response?.status, message: bulkError.message }, 'Bulk endpoint error details');
      useBulkEndpoint = false;
    }
    
    // Create lookup maps for efficient processing
    const movieFilesMap = useBulkEndpoint ? new Map(allMovieFiles.map(mf => [mf.id, mf])) : new Map();
    const mediaToUpsert = [];
    
    // Process movies with files
    const moviesWithFiles = movies.filter(m => m.hasFile && m.movieFile?.id);
    log.info({ moviesWithFilesCount: moviesWithFiles.length }, 'Processing movies with files');
    
    if (useBulkEndpoint) {
      // Fast path: Use bulk movie files data
      log.debug('Using bulk movie files for fast processing');
      
      for (let i = 0; i < moviesWithFiles.length; i++) {
        const movie = moviesWithFiles[i];
        const progress = 20 + Math.floor((i / moviesWithFiles.length) * 70);
        
        if (i % 100 === 0) { // Update progress every 100 movies
          await syncStatus.update({
            libraryProgress: Math.min(Math.max(progress, 0), 100),
            details: {
              ...syncStatus.details,
              currentStep: `Fast processing movies: ${i}/${moviesWithFiles.length}`
            }
          });
        }
        
        const movieFile = movieFilesMap.get(movie.movieFile.id);
        if (!movieFile) continue;
        
        // Track this file path as existing in Radarr
        radarrFilePaths.add(movieFile.path);
        
        // Extract comprehensive rating data (prioritize IMDB, then TMDB)
        let rating = null;
        if (movie.ratings) {
          rating = movie.ratings.imdb?.value || 
                  movie.ratings.tmdb?.value || 
                  movie.ratings.metacritic?.value || 
                  movie.ratings.rottenTomatoes?.value || 
                  null;
        }
        
        const resolution = movieFile.quality?.quality?.resolution || movieFile.mediaInfo?.resolution || null;
        const qualityName = movieFile.quality?.quality?.name || resolution || 'Unknown';
        
        mediaToUpsert.push({
          path: movieFile.path,
          filename: movieFile.path.split('/').pop(),
          type: 'movie',
          size: movieFile.size,
          watched: movie.movieFile?.mediaInfo?.isWatched || false,
          title: movie.title,
          year: movie.year,
          rating: rating,
          qualityProfile: movie.qualityProfileId?.toString(),
          qualityName: qualityName,
          resolution: resolution,
          codec: movieFile.mediaInfo?.videoCodec || null,
          audioChannels: movieFile.mediaInfo?.audioChannels || null,
          audioLanguage: movieFile.mediaInfo?.audioLanguages || null,
          studio: movie.studio,
          certification: movie.certification,
          collection: movie.collection?.name || null,
          radarrId: movieFile.id,
          tags: JSON.stringify(movie.tags || []),
          metadata: JSON.stringify({
            title: movie.title,
            year: movie.year,
            rating: rating,
            radarrId: movieFile.id,
            movieId: movie.id,
            studio: movie.studio,
            certification: movie.certification,
            collection: movie.collection,
            ratings: movie.ratings,
            status: movie.status
          }),
          created: new Date(movie.added),
          lastAccessed: new Date(),
          protected: false
        });
      }
    } else {
      // Fallback path: Original method with individual movie file requests
      log.debug('Using fallback method with individual movie file requests');
      
      const MOVIE_BATCH_SIZE = 10; // Process movies in smaller batches
      
      for (let i = 0; i < moviesWithFiles.length; i += MOVIE_BATCH_SIZE) {
        const batch = moviesWithFiles.slice(i, i + MOVIE_BATCH_SIZE);
        const progress = 20 + Math.floor((i / moviesWithFiles.length) * 70);
        
        await syncStatus.update({
          libraryProgress: Math.min(Math.max(progress, 0), 100),
          details: {
            ...syncStatus.details,
            currentStep: `Fallback processing movies batch: ${Math.ceil(i/MOVIE_BATCH_SIZE) + 1}/${Math.ceil(moviesWithFiles.length/MOVIE_BATCH_SIZE)}`
          }
        });
        
        // Process movies in parallel batches
        const batchPromises = batch.map(async (movie) => {
          try {
            const movieFileResponse = await makeRequestWithRetry(
              `${url}/api/v3/moviefile/${movie.movieFile.id}`, 
              {
                method: 'get',
                headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
                timeout: 10000
              }
            );
            
            const movieFile = movieFileResponse.data;
            
            // Track this file path as existing in Radarr
            radarrFilePaths.add(movieFile.path);
            
            // Extract comprehensive rating data (prioritize IMDB, then TMDB)
            let rating = null;
            if (movie.ratings) {
              rating = movie.ratings.imdb?.value || 
                      movie.ratings.tmdb?.value || 
                      movie.ratings.metacritic?.value || 
                      movie.ratings.rottenTomatoes?.value || 
                      null;
            }
            
            const resolution = movieFile.quality?.quality?.resolution || movieFile.mediaInfo?.resolution || null;
            const qualityName = movieFile.quality?.quality?.name || resolution || 'Unknown';
            
            return {
              path: movieFile.path,
              filename: movieFile.path.split('/').pop(),
              type: 'movie',
              size: movieFile.size,
              watched: movie.movieFile?.mediaInfo?.isWatched || false,
              title: movie.title,
              year: movie.year,
              rating: rating,
              qualityProfile: movie.qualityProfileId?.toString(),
              qualityName: qualityName,
              resolution: resolution,
              codec: movieFile.mediaInfo?.videoCodec || null,
              audioChannels: movieFile.mediaInfo?.audioChannels || null,
              audioLanguage: movieFile.mediaInfo?.audioLanguages || null,
              studio: movie.studio,
              certification: movie.certification,
              collection: movie.collection?.name || null,
              radarrId: movieFile.id,
              tags: JSON.stringify(movie.tags || []),
              metadata: JSON.stringify({
                title: movie.title,
                year: movie.year,
                rating: rating,
                radarrId: movieFile.id,
                movieId: movie.id,
                studio: movie.studio,
                certification: movie.certification,
                collection: movie.collection,
                ratings: movie.ratings,
                status: movie.status
              }),
              created: new Date(movie.added),
              lastAccessed: new Date(),
              protected: false
            };
          } catch (movieErr) {
            log.error({ error: movieErr, movieTitle: movie.title }, 'Error processing movie');
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        // Add successful results to the main array
        for (const movieData of batchResults) {
          if (movieData) {
            mediaToUpsert.push(movieData);
          }
        }
      }
    }
    
    // Batch upsert all media
    log.info({ mediaCount: mediaToUpsert.length }, 'Batch upserting movies');
    await batchUpsertMedia(mediaToUpsert);
    
    await syncStatus.update({
      libraryProgress: 90,
      details: {
        ...syncStatus.details,
        currentStep: 'Cleaning up deleted Radarr files'
      }
    });
    
    log.info('Starting Radarr cleanup process');
    log.debug({ currentFilePathsCount: radarrFilePaths.size }, 'Found current file paths in Radarr');
    
    // Cleanup: Remove media files that no longer exist in Radarr
    try {
      const orphanedRadarrMedia = await Media.findAll({
      where: {
        type: 'movie',
        path: {
          [Op.notIn]: Array.from(radarrFilePaths)
        },
        // Only remove files that have radarrId (came from Radarr originally)
        radarrId: {
          [Op.not]: null
        }
      }
    });
    
    log.debug({ orphanedFilesCount: orphanedRadarrMedia.length }, 'Found potentially orphaned Radarr files');
    
    // Also check for movies without radarrId that might be orphaned
    const allMovies = await Media.findAll({
      where: { type: 'movie' },
      attributes: ['id', 'path', 'filename', 'radarrId']
    });
    
    log.debug({ totalMoviesCount: allMovies.length }, 'Total movies in database');
    log.debug({ moviesWithoutRadarrIdCount: allMovies.filter(m => !m.radarrId).length }, 'Movies without radarrId');
    
    // Also find movies without radarrId that are not in current Radarr file paths
    const orphanedMoviesWithoutRadarrId = await Media.findAll({
      where: {
        type: 'movie',
        path: {
          [Op.notIn]: Array.from(radarrFilePaths)
        },
        radarrId: null
      }
    });
    
    log.debug({ orphanedMoviesCount: orphanedMoviesWithoutRadarrId.length }, 'Found movies without radarrId not in current Radarr paths');
    
    // Remove orphaned movies with radarrId
    if (orphanedRadarrMedia.length > 0) {
      log.info({ orphanedFilesCount: orphanedRadarrMedia.length }, 'Removing orphaned Radarr files from database');
      for (const orphan of orphanedRadarrMedia) {
        log.debug({ filePath: orphan.path, radarrId: orphan.radarrId }, 'Removing orphaned file with radarrId');
        await safeDeleteMedia(orphan);
      }
    }
    
    // Also remove movies without radarrId that are not in current Radarr paths
    // This handles movies that were added before radarrId field existed
    if (orphanedMoviesWithoutRadarrId.length > 0) {
      log.info({ orphanedMoviesCount: orphanedMoviesWithoutRadarrId.length }, 'Removing orphaned movies without radarrId from database');
      for (const orphan of orphanedMoviesWithoutRadarrId) {
        log.debug({ filePath: orphan.path }, 'Removing orphaned file without radarrId');
        await safeDeleteMedia(orphan);
      }
    }
    
    const totalOrphanedRemoved = orphanedRadarrMedia.length + orphanedMoviesWithoutRadarrId.length;
    
    await syncStatus.update({
      libraryProgress: 95,
      details: {
        ...syncStatus.details,
        currentStep: 'Finalizing enhanced Radarr sync',
        orphanedFilesRemoved: totalOrphanedRemoved
      }
    });
    
    } catch (cleanupError) {
      log.error({ error: cleanupError }, 'Error during Radarr cleanup');
      // Continue with sync even if cleanup fails
    }
    
    log.info('Enhanced Radarr data sync completed');
  } catch (err) {
    log.error({ error: err }, 'Error in enhanced Radarr sync');
    throw err;
  }
}

// Enhanced Plex sync function
async function enhancedSyncPlexData(plexSettings, syncStatus) {
  try {
    const { serverUrl, authToken } = plexSettings;
    
    log.info('Starting enhanced Plex sync...');
    
    await syncStatus.update({
      libraryProgress: 10,
      details: {
        ...syncStatus.details,
        currentStep: 'Fetching Plex libraries'
      }
    });
    
    const librariesResponse = await makeRequestWithRetry(
      `${serverUrl}/library/sections?X-Plex-Token=${authToken}`, 
      {
        method: 'get',
        headers: { 'Accept': 'application/json' },
        timeout: 30000
      }
    );
    
    if (!librariesResponse.data?.MediaContainer?.Directory) {
      log.info('No Plex libraries found');
      return;
    }
    
    const libraries = librariesResponse.data.MediaContainer.Directory;
    log.info({ librariesCount: libraries.length }, 'Found Plex libraries');
    
    let totalItems = 0;
    let processedItems = 0;
    
    // Fetch all library items in parallel for better performance
    const libraryPromises = libraries.map(library => 
      makeRequestWithRetry(
        `${serverUrl}/library/sections/${library.key}/all?X-Plex-Token=${authToken}`,
        {
          method: 'get',
          headers: { 'Accept': 'application/json' },
          timeout: 30000
        }
      ).then(response => ({
        library: library,
        items: response.data?.MediaContainer?.Metadata || []
      })).catch(err => {
        log.error({ error: err, libraryTitle: library.title }, 'Error fetching Plex library');
        return null;
      })
    );
    
    log.debug({ librariesCount: libraries.length }, 'Fetching data from Plex libraries in parallel');
    const libraryResults = await Promise.all(libraryPromises);
    const validResults = libraryResults.filter(r => r !== null);
    
    // Create a map of file paths to Plex data for batch update
    const plexDataMap = new Map();
    
    for (const { library, items } of validResults) {
      totalItems += items.length;
      log.debug({ itemsCount: items.length, libraryTitle: library.title }, 'Processing items from library');
      
      for (const item of items) {
        if (!item.Media?.[0]?.Part?.[0]?.file) continue;
        
        const filePath = item.Media[0].Part[0].file;
        plexDataMap.set(filePath, {
          plexViewCount: item.viewCount || 0,
          lastWatchedDate: item.lastViewedAt ? new Date(item.lastViewedAt * 1000) : null,
          userWatchData: JSON.stringify({
            plexRating: item.userRating || null,
            duration: item.duration || null,
            addedAt: item.addedAt ? new Date(item.addedAt * 1000) : null,
            updatedAt: item.updatedAt ? new Date(item.updatedAt * 1000) : null
          })
        });
        processedItems++;
      }
    }
    
    log.info({ plexItemsCount: plexDataMap.size }, 'Found Plex items with watch data');
    
    // Get all existing media and prepare batch update
    const allMedia = await Media.findAll({
      attributes: ['id', 'path']
    });
    
    const mediaToUpdate = [];
    
    for (const media of allMedia) {
      const plexData = plexDataMap.get(media.path);
      if (plexData) {
        mediaToUpdate.push({
          id: media.id,
          path: media.path,
          ...plexData
        });
      }
    }
    
    // Batch update Plex data
    if (mediaToUpdate.length > 0) {
      log.info({ mediaCount: mediaToUpdate.length }, 'Batch updating media items with Plex data');
      await batchUpsertMedia(mediaToUpdate);
    }
    
    await syncStatus.update({
      libraryProgress: 90,
      details: {
        ...syncStatus.details,
        currentStep: 'Finalizing enhanced Plex sync',
        plexItemsProcessed: processedItems,
        plexTotalItems: totalItems
      }
    });
    
    log.info({ processedItemsCount: processedItems }, 'Enhanced Plex data sync completed');
  } catch (err) {
    log.error({ error: err }, 'Error in enhanced Plex sync');
    throw err;
  }
}

// Enhanced Tautulli sync function
async function enhancedSyncTautulliData(tautulliSettings, syncStatus) {
  try {
    const { url, apiKey, historyDaysToSync = 30 } = tautulliSettings;
    
    log.info('Starting enhanced Tautulli sync...');
    
    await syncStatus.update({
      libraryProgress: 10,
      details: {
        ...syncStatus.details,
        currentStep: 'Fetching watch history from Tautulli'
      }
    });
    
    // Calculate date range for history sync - REMOVED DATE FILTER FOR FULL SYNC
    // const afterTimestamp = Math.floor(Date.now() / 1000) - (historyDaysToSync * 24 * 60 * 60);
    log.info({ historyDaysToSync }, 'Sync settings: DATE FILTER DISABLED - syncing ALL history');
    
    // Fetch watch history in batches
    let allHistory = [];
    let start = 0;
    const batchSize = 1000;
    let totalRecords = 0;
    
    log.debug('Fetching ALL Tautulli history (no date filter)');
    
    // Clear ALL cache for fresh Tautulli data
    log.debug({ cacheSize: apiCache.size }, 'API cache size before clearing');
    apiCache.clear();
    log.debug('Cleared ALL API cache for fresh Tautulli data');
    
    // Get total record count first
    const initialResponse = await makeRequestWithRetry(
      `${url}/api/v2`, 
      {
        method: 'get',
        params: {
          apikey: apiKey,
          cmd: 'get_history',
          start: 0,
          length: 1,
          // after: afterTimestamp, // REMOVED - no date filter
          order_column: 'date',
          order_dir: 'desc',
          include_activity: 1,
          media_type: 'episode,movie'
        },
        timeout: 30000
      }
    );
    
    if (initialResponse.data?.response?.result === 'success') {
      totalRecords = initialResponse.data.response.data.recordsTotal || 0;
      log.info({ totalRecords }, 'Found total Tautulli history records (no date filter applied)');
    } else {
      throw new Error('Failed to get Tautulli history count');
    }
    
    if (totalRecords === 0) {
      log.info('No Tautulli history records found, skipping sync');
      return;
    }
    
    log.info({ totalRecords, batchSize }, 'Will process records in batches');
    
    // Fetch all history in batches
    while (start < totalRecords) {
      const progress = 10 + Math.floor((start / totalRecords) * 50);
      
      await syncStatus.update({
        libraryProgress: Math.min(Math.max(progress, 0), 100),
        details: {
          ...syncStatus.details,
          currentStep: `Fetching Tautulli history batch: ${start}-${Math.min(start + batchSize, totalRecords)} of ${totalRecords}`
        }
      });
      
      try {
        const response = await makeRequestWithRetry(
          `${url}/api/v2`, 
          {
            method: 'get',
            params: {
              apikey: apiKey,
              cmd: 'get_history',
              start: start,
              length: batchSize,
              // after: afterTimestamp, // REMOVED - no date filter
              order_column: 'date',
              order_dir: 'desc',
              include_activity: 1,
              media_type: 'episode,movie'
            },
            timeout: 30000
          }
        );
        
        if (response.data?.response?.result === 'success') {
          const historyData = response.data.response.data.data || [];
          log.debug({ batchNumber: Math.floor(start/batchSize) + 1, recordsCount: historyData.length }, 'Retrieved history records batch');
          
          // Log first item of first batch for debugging
          if (start === 0 && historyData.length > 0) {
            log.debug({ firstHistoryItem: historyData[0] }, 'First history item structure');
          }
          
          // For items without file path, try to get metadata
          const enrichedHistoryData = [];
          for (const item of historyData) {
            if (!item.file && item.rating_key) {
              try {
                log.debug({ ratingKey: item.rating_key }, 'Fetching metadata for rating_key');
                const metadataResponse = await axiosInstance(`${url}/api/v2`, {
                  method: 'get',
                  params: {
                    apikey: apiKey,
                    cmd: 'get_metadata',
                    rating_key: item.rating_key
                  },
                  timeout: 10000
                });
                
                if (metadataResponse.data?.response?.result === 'success') {
                  const metadata = metadataResponse.data.response.data;
                  log.debug({ ratingKey: item.rating_key, metadata }, 'Metadata structure for rating_key');
                  
                  if (metadata.file) {
                    item.file = metadata.file;
                    log.debug({ filePath: metadata.file }, 'Found file path from metadata');
                  } else if (metadata.media_info && metadata.media_info.length > 0) {
                    // Try to get file from media_info parts
                    const firstPart = metadata.media_info[0]?.parts?.[0];
                    if (firstPart?.file) {
                      item.file = firstPart.file;
                      log.debug({ filePath: firstPart.file }, 'Found file path from media_info');
                    } else {
                      log.debug({ ratingKey: item.rating_key }, 'No file path found in media_info');
                    }
                  } else {
                    log.debug({ ratingKey: item.rating_key }, 'No media_info found');
                  }
                } else {
                  log.debug({ ratingKey: item.rating_key, responseData: metadataResponse.data }, 'Metadata request failed');
                }
                
                // Small delay between metadata requests
                await new Promise(resolve => setTimeout(resolve, 50));
              } catch (metadataError) {
                log.error({ error: metadataError, ratingKey: item.rating_key }, 'Error fetching metadata for rating_key');
              }
            }
            enrichedHistoryData.push(item);
          }
          
          log.debug({ itemsWithFilePaths: enrichedHistoryData.filter(item => item.file).length, totalItems: enrichedHistoryData.length }, 'Enriched batch data - items with file paths');
          allHistory.push(...enrichedHistoryData);
          start += batchSize;
          
          // Add small delay to avoid overwhelming Tautulli
          if (start < totalRecords) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } else {
          log.error({ responseData: response.data }, 'Failed to fetch Tautulli history batch');
          log.error({ responseStructure: response.data }, 'API response structure');
          break;
        }
      } catch (batchError) {
        log.error({ error: batchError, startIndex: start }, 'Error fetching Tautulli history batch');
        // Continue with next batch on error
        start += batchSize;
      }
    }
    
    log.info({ historyRecordsCount: allHistory.length }, 'Retrieved Tautulli history records');
    log.info({ recordsWithFilePaths: allHistory.filter(item => item.file).length, totalRecords: allHistory.length }, 'Records with file paths');
    
    // Show unique titles/files being processed
    const uniqueTitles = [...new Set(allHistory.map(item => item.title))];
    const uniqueFiles = [...new Set(allHistory.filter(item => item.file).map(item => item.file.split('/').pop()))];
    const uniqueFilePaths = [...new Set(allHistory.filter(item => item.file).map(item => item.file))];
    
    log.debug({ uniqueTitlesCount: uniqueTitles.length, sampleTitles: uniqueTitles.slice(0, 10) }, 'Unique titles in history');
    log.debug({ uniqueFilesCount: uniqueFiles.length, sampleFiles: uniqueFiles.slice(0, 5) }, 'Unique files in history');
    log.debug({ uniqueFilePathsCount: uniqueFilePaths.length }, 'Unique file paths');
    
    // Show items without file paths
    const itemsWithoutFiles = allHistory.filter(item => !item.file);
    log.debug({ itemsWithoutFilePaths: itemsWithoutFiles.length, totalItems: allHistory.length }, 'Items without file paths');
    if (itemsWithoutFiles.length > 0) {
      log.debug({ sampleTitles: itemsWithoutFiles.slice(0, 5).map(item => item.title) }, 'Sample titles without files');
    }
    
    await syncStatus.update({
      libraryProgress: 60,
      details: {
        ...syncStatus.details,
        currentStep: 'Processing Tautulli watch data'
      }
    });
    
    // Create a map to aggregate watch data by file path
    const watchDataMap = new Map();
    
    log.debug('Processing Tautulli history items');
    for (let i = 0; i < allHistory.length; i++) {
      const historyItem = allHistory[i];
      
      // Debug logging for first few items
      if (i < 5) {
        log.debug({ 
          itemIndex: i + 1,
          file: historyItem.file,
          title: historyItem.title,
          stopped: historyItem.stopped,
          duration: historyItem.duration,
          paused_counter: historyItem.paused_counter,
          friendly_name: historyItem.friendly_name,
          user: historyItem.user
        }, 'History item details');
      }
      
      if (!historyItem.file || !historyItem.file.trim()) {
        if (i < 5) log.debug({ itemIndex: i + 1 }, 'Skipping item: no file path');
        continue;
      }
      
      const filePath = historyItem.file.trim();
      const viewedAt = historyItem.stopped ? new Date(historyItem.stopped * 1000) : null;
      const duration = parseInt(historyItem.duration) || 0;
      // Use played_time instead of paused_counter for actual watch time
      const watchTime = parseInt(historyItem.played_time) || parseInt(historyItem.paused_counter) || 0;
      const username = historyItem.friendly_name || historyItem.user || 'Unknown';
      
      if (!watchDataMap.has(filePath)) {
        watchDataMap.set(filePath, {
          tautulliViewCount: 0,
          tautulliLastPlayed: null,
          tautulliDuration: duration,
          tautulliWatchTime: 0,
          tautulliUsers: new Set()
        });
      }
      
      const existing = watchDataMap.get(filePath);
      
      // Increment view count
      existing.tautulliViewCount++;
      
      // Update last played date (keep most recent)
      if (!existing.tautulliLastPlayed || (viewedAt && viewedAt > existing.tautulliLastPlayed)) {
        existing.tautulliLastPlayed = viewedAt;
      }
      
      // Update duration (use longest duration seen)
      if (duration > existing.tautulliDuration) {
        existing.tautulliDuration = duration;
      }
      
      // Add watch time
      existing.tautulliWatchTime += watchTime;
      
      // Add user to set
      if (username && username !== 'Unknown') {
        existing.tautulliUsers.add(username);
      }
      
      if (i < 10) { // Log first 10 for debugging
        log.debug({ viewCount: existing.tautulliViewCount, title: historyItem.title, username }, 'Added view for title');
      }
    }
    
    log.info({ uniqueFilesCount: watchDataMap.size }, 'Processed watch data for unique files');
    
    // Show summary of watch data
    for (const [filePath, data] of watchDataMap) {
      const filename = filePath.split('/').pop();
      log.debug({ 
        filename, 
        viewCount: data.tautulliViewCount, 
        watchTimeMinutes: Math.round(data.tautulliWatchTime/60), 
        users: Array.from(data.tautulliUsers)
      }, 'Watch data summary');
    }
    
    await syncStatus.update({
      libraryProgress: 80,
      details: {
        ...syncStatus.details,
        currentStep: 'Updating database with Tautulli data'
      }
    });
    
    // Find existing media and update with Tautulli data
    const mediaToUpdate = [];
    
    log.debug({ uniqueFilePathsCount: watchDataMap.size }, 'Looking up unique file paths in media database');
    
    let foundCount = 0;
    let notFoundCount = 0;
    
    for (const [filePath, watchData] of watchDataMap) {
      try {
        const media = await Media.findOne({
          where: { path: filePath },
          attributes: ['id', 'path']
        });
        
        if (media) {
          foundCount++;
          
          // Get the full media record to preserve existing fields
          const fullMedia = await Media.findByPk(media.id);
          if (fullMedia) {
            mediaToUpdate.push({
              id: fullMedia.id,
              path: fullMedia.path,
              filename: fullMedia.filename,
              size: fullMedia.size, // Preserve existing size
              type: fullMedia.type,
              created: fullMedia.created,
              lastAccessed: fullMedia.lastAccessed,
              watched: fullMedia.watched,
              protected: fullMedia.protected,
              // Update only Tautulli fields
              tautulliViewCount: watchData.tautulliViewCount,
              tautulliLastPlayed: watchData.tautulliLastPlayed,
              tautulliDuration: watchData.tautulliDuration,
              tautulliWatchTime: watchData.tautulliWatchTime,
              tautulliUsers: JSON.stringify(Array.from(watchData.tautulliUsers))
            });
          }
        } else {
          notFoundCount++;
          if (notFoundCount <= 3) {
            log.debug({ filePath }, 'Media not found for Tautulli path');
          }
        }
      } catch (findError) {
        log.error({ error: findError, filePath }, 'Error finding media for path');
      }
    }
    
    log.info({ foundCount, notFoundCount }, 'Media lookup results');
    
    // Try some fuzzy matching if no exact matches found
    if (foundCount === 0 && watchDataMap.size > 0) {
      log.debug('No exact matches found, attempting fuzzy filename matching');
      
      // Get all media with filenames for fuzzy matching
      const allMedia = await Media.findAll({
        attributes: ['id', 'path', 'filename'],
        where: {
          filename: {
            [Op.not]: null
          }
        }
      });
      
      log.debug({ mediaRecordsCount: allMedia.length }, 'Found media records for fuzzy matching');
      
      for (const [filePath, watchData] of watchDataMap) {
        // Extract filename from Tautulli path
        const tautulliFilename = filePath.split('/').pop();
        
        // Look for media with matching filename
        const matchingMedia = allMedia.find(media => media.filename === tautulliFilename);
        
        if (matchingMedia) {
          log.debug({ tautulliPath: filePath, mediaPath: matchingMedia.path }, 'Fuzzy match found');
          foundCount++;
          
          // Get the full media record to preserve existing fields
          const fullMedia = await Media.findByPk(matchingMedia.id);
          if (fullMedia) {
            mediaToUpdate.push({
              id: fullMedia.id,
              path: fullMedia.path,
              filename: fullMedia.filename,
              size: fullMedia.size, // Preserve existing size
              type: fullMedia.type,
              created: fullMedia.created,
              lastAccessed: fullMedia.lastAccessed,
              watched: fullMedia.watched,
              protected: fullMedia.protected,
              // Update only Tautulli fields
              tautulliViewCount: watchData.tautulliViewCount,
              tautulliLastPlayed: watchData.tautulliLastPlayed,
              tautulliDuration: watchData.tautulliDuration,
              tautulliWatchTime: watchData.tautulliWatchTime,
              tautulliUsers: JSON.stringify(Array.from(watchData.tautulliUsers))
            });
          }
        }
      }
      
      log.debug({ totalMatchesFound: foundCount }, 'After fuzzy matching');
    }
    
    // Batch update media with Tautulli data
    if (mediaToUpdate.length > 0) {
      log.info({ mediaCount: mediaToUpdate.length }, 'Batch updating media items with Tautulli data');
      await batchUpsertMedia(mediaToUpdate);
    } else {
      log.info('No media items found to update with Tautulli data');
    }
    
    await syncStatus.update({
      libraryProgress: 95,
      details: {
        ...syncStatus.details,
        currentStep: 'Finalizing Tautulli sync',
        tautulliHistoryRecords: allHistory.length,
        tautulliUniqueFiles: watchDataMap.size,
        tautulliUpdatedMedia: mediaToUpdate.length
      }
    });
    
    log.info({ updatedMediaCount: mediaToUpdate.length }, 'Enhanced Tautulli data sync completed');
  } catch (err) {
    log.error({ error: err }, 'Error in enhanced Tautulli sync');
    throw err;
  }
}

// Clear API cache endpoint for fresh data
router.post('/clear-cache', async (req, res) => {
  try {
    apiCache.clear();
    log.info('API cache cleared');
    res.json({ 
      success: true, 
      message: 'API cache cleared successfully' 
    });
  } catch (err) {
    log.error({ error: err }, 'Error clearing cache');
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

module.exports = router;

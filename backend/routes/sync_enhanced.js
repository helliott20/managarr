// Enhanced sync routes with comprehensive data extraction from Plex, Sonarr, and Radarr
const express = require('express');
const router = express.Router();
const { Media, Settings, SyncStatus, PendingDeletion } = require('../database');
const { Op } = require('sequelize');
const axios = require('axios');
const notificationService = require('../services/notificationService');

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
      
      console.log(`Found ${allPendingDeletions.length} pending deletions for media ${mediaRecord.id}: ${completedDeletions.length} completed (keeping), ${nonCompletedDeletions.length} non-completed (removing)`);
      
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
        console.log(`Preserving media ${mediaRecord.id} due to ${completedDeletions.length} completed deletion history records`);
        return false; // Don't delete the media
      }
    }
    
    // Now safe to delete the media record (no completed deletions to preserve)
    await mediaRecord.destroy();
    return true;
  } catch (error) {
    console.error(`Error safely deleting media ${mediaRecord.id}:`, error);
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
      console.log(`Using cached response for: ${url}`);
      return { data: cached.data };
    }
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`API request attempt ${attempt}/${maxRetries}: ${url}`);
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
      console.error(`Attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = retryDelay * attempt;
        console.log(`Retrying in ${delay}ms...`);
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
  
  console.log(`Batch upserting ${mediaItems.length} media items in ${chunks.length} chunks...`);
  
  for (const chunk of chunks) {
    await Media.bulkCreate(chunk, {
      updateOnDuplicate: [
        'size', 'watched', 'title', 'year', 'rating', 'qualityProfile',
        'qualityName', 'resolution', 'codec', 'audioChannels', 'audioLanguage',
        'seriesStatus', 'network', 'seasonCount', 'episodeCount', 'sonarrId',
        'radarrId', 'tags', 'metadata', 'studio', 'certification', 'collection',
        'plexViewCount', 'lastWatchedDate', 'userWatchData'
      ]
    });
  }
}

// Helper function to get settings
async function getSettings() {
  try {
    const settings = await Settings.findOne({ where: { id: 1 } });
    return settings || {};
  } catch (error) {
    console.error('Error getting settings:', error);
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
    console.error('Error getting sync status:', err);
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
    
    if (!sonarrEnabled && !radarrEnabled && !plexEnabled) {
      return res.status(400).json({
        success: false,
        message: 'No services are configured. Please configure at least one of Sonarr, Radarr, or Plex in the settings.'
      });
    }
    
    // Calculate total libraries
    let totalLibraries = 0;
    if (sonarrEnabled) totalLibraries++;
    if (radarrEnabled) totalLibraries++;
    if (plexEnabled) totalLibraries++;
    
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
    console.error('Error starting enhanced sync:', err);
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
      console.error(`Sync status with ID ${syncId} not found`);
      return;
    }
    
    const settings = await getSettings();
    const sonarrEnabled = settings.sonarr && settings.sonarr.enabled && settings.sonarr.url && settings.sonarr.apiKey;
    const radarrEnabled = settings.radarr && settings.radarr.enabled && settings.radarr.url && settings.radarr.apiKey;
    const plexEnabled = settings.plex && settings.plex.serverUrl && settings.plex.authToken;
    
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
    
    console.log(`Starting parallel sync for ${syncTasks.length} services...`);
    
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
      console.error('Some services failed to sync:', failures);
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
    
    console.log('Enhanced media data sync completed successfully');
    
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
    console.error('Error in enhanced sync:', err);
    
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
    
    console.log('Starting enhanced Sonarr sync...');
    
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
    console.log(`Retrieved ${series.length} series from Sonarr`);
    
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
      console.log('Attempting to fetch all episode files from Sonarr in bulk...');
      const episodeFilesResponse = await makeRequestWithRetry(
        `${url}/api/v3/episodefile`, 
        {
          method: 'get',
          headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
          timeout: 60000 // Longer timeout for large request
        }
      );
      
      allEpisodeFiles = episodeFilesResponse.data;
      console.log(`✅ Retrieved ${allEpisodeFiles.length} episode files using bulk endpoint`);
    } catch (bulkError) {
      console.log('❌ Bulk episode files endpoint failed, falling back to per-series method');
      console.log('Bulk error:', bulkError.response?.status, bulkError.message);
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
    
    console.log(`Processing ${seriesWithFiles.length} series with files...`);
    
    if (useBulkEndpoint) {
      // Fast path: Use bulk episode files data
      console.log('Using bulk episode files for fast processing...');
      
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
            console.error(`Error fetching episodes for series ${show.title}:`, err);
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
      console.log('Using fallback method with per-series requests...');
      
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
            console.error(`Error processing series ${show.title}:`, err);
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
    console.log(`Batch upserting ${mediaToUpsert.length} TV shows...`);
    await batchUpsertMedia(mediaToUpsert);
    
    await syncStatus.update({
      libraryProgress: 90,
      details: {
        ...syncStatus.details,
        currentStep: 'Cleaning up deleted Sonarr files'
      }
    });
    
    console.log('🧹 STARTING SONARR CLEANUP PROCESS');
    console.log('Sonarr cleanup: Found', sonarrFilePaths.size, 'current file paths in Sonarr');
    
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
    
    console.log('Found', orphanedShowsWithoutSonarrId.length, 'shows without sonarrId that are not in current Sonarr paths');
    
    // Remove orphaned shows with sonarrId
    if (orphanedSonarrMedia.length > 0) {
      console.log(`Removing ${orphanedSonarrMedia.length} orphaned Sonarr files from database`);
      for (const orphan of orphanedSonarrMedia) {
        console.log(`Removing orphaned file with sonarrId: ${orphan.path}`);
        await safeDeleteMedia(orphan);
      }
    }
    
    // Also remove shows without sonarrId that are not in current Sonarr paths
    if (orphanedShowsWithoutSonarrId.length > 0) {
      console.log(`Removing ${orphanedShowsWithoutSonarrId.length} orphaned shows without sonarrId from database`);
      for (const orphan of orphanedShowsWithoutSonarrId) {
        console.log(`Removing orphaned file without sonarrId: ${orphan.path}`);
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
      console.error('Error during Sonarr cleanup:', cleanupError);
      // Continue with sync even if cleanup fails
    }
    
    console.log('Enhanced Sonarr data sync completed');
  } catch (err) {
    console.error('Error in enhanced Sonarr sync:', err);
    throw err;
  }
}

// Enhanced Radarr sync function
async function enhancedSyncRadarrData(radarrSettings, syncStatus) {
  try {
    const { url, apiKey } = radarrSettings;
    
    console.log('Starting enhanced Radarr sync...');
    
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
    console.log(`Retrieved ${movies.length} movies from Radarr`);
    
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
      console.log('Attempting to fetch all movie files from Radarr in bulk...');
      const movieFilesResponse = await makeRequestWithRetry(
        `${url}/api/v3/moviefile`, 
        {
          method: 'get',
          headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
          timeout: 60000 // Longer timeout for large request
        }
      );
      
      allMovieFiles = movieFilesResponse.data;
      console.log(`✅ Retrieved ${allMovieFiles.length} movie files using bulk endpoint`);
    } catch (bulkError) {
      console.log('❌ Bulk movie files endpoint failed, falling back to per-movie method');
      console.log('Bulk error:', bulkError.response?.status, bulkError.message);
      useBulkEndpoint = false;
    }
    
    // Create lookup maps for efficient processing
    const movieFilesMap = useBulkEndpoint ? new Map(allMovieFiles.map(mf => [mf.id, mf])) : new Map();
    const mediaToUpsert = [];
    
    // Process movies with files
    const moviesWithFiles = movies.filter(m => m.hasFile && m.movieFile?.id);
    console.log(`Processing ${moviesWithFiles.length} movies with files...`);
    
    if (useBulkEndpoint) {
      // Fast path: Use bulk movie files data
      console.log('Using bulk movie files for fast processing...');
      
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
      console.log('Using fallback method with individual movie file requests...');
      
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
            console.error(`Error processing movie ${movie.title}:`, movieErr);
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
    console.log(`Batch upserting ${mediaToUpsert.length} movies...`);
    await batchUpsertMedia(mediaToUpsert);
    
    await syncStatus.update({
      libraryProgress: 90,
      details: {
        ...syncStatus.details,
        currentStep: 'Cleaning up deleted Radarr files'
      }
    });
    
    console.log('🧹 STARTING RADARR CLEANUP PROCESS');
    console.log('Radarr cleanup: Found', radarrFilePaths.size, 'current file paths in Radarr');
    
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
    
    console.log('Found', orphanedRadarrMedia.length, 'potentially orphaned Radarr files');
    
    // Also check for movies without radarrId that might be orphaned
    const allMovies = await Media.findAll({
      where: { type: 'movie' },
      attributes: ['id', 'path', 'filename', 'radarrId']
    });
    
    console.log('Total movies in database:', allMovies.length);
    console.log('Movies without radarrId:', allMovies.filter(m => !m.radarrId).length);
    
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
    
    console.log('Found', orphanedMoviesWithoutRadarrId.length, 'movies without radarrId that are not in current Radarr paths');
    
    // Remove orphaned movies with radarrId
    if (orphanedRadarrMedia.length > 0) {
      console.log(`Removing ${orphanedRadarrMedia.length} orphaned Radarr files from database`);
      for (const orphan of orphanedRadarrMedia) {
        console.log(`Removing orphaned file with radarrId: ${orphan.path}`);
        await safeDeleteMedia(orphan);
      }
    }
    
    // Also remove movies without radarrId that are not in current Radarr paths
    // This handles movies that were added before radarrId field existed
    if (orphanedMoviesWithoutRadarrId.length > 0) {
      console.log(`Removing ${orphanedMoviesWithoutRadarrId.length} orphaned movies without radarrId from database`);
      for (const orphan of orphanedMoviesWithoutRadarrId) {
        console.log(`Removing orphaned file without radarrId: ${orphan.path}`);
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
      console.error('Error during Radarr cleanup:', cleanupError);
      // Continue with sync even if cleanup fails
    }
    
    console.log('Enhanced Radarr data sync completed');
  } catch (err) {
    console.error('Error in enhanced Radarr sync:', err);
    throw err;
  }
}

// Enhanced Plex sync function
async function enhancedSyncPlexData(plexSettings, syncStatus) {
  try {
    const { serverUrl, authToken } = plexSettings;
    
    console.log('Starting enhanced Plex sync...');
    
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
      console.log('No Plex libraries found');
      return;
    }
    
    const libraries = librariesResponse.data.MediaContainer.Directory;
    console.log(`Found ${libraries.length} Plex libraries`);
    
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
        console.error(`Error fetching Plex library ${library.title}:`, err);
        return null;
      })
    );
    
    console.log(`Fetching data from ${libraries.length} Plex libraries in parallel...`);
    const libraryResults = await Promise.all(libraryPromises);
    const validResults = libraryResults.filter(r => r !== null);
    
    // Create a map of file paths to Plex data for batch update
    const plexDataMap = new Map();
    
    for (const { library, items } of validResults) {
      totalItems += items.length;
      console.log(`Processing ${items.length} items from library: ${library.title}`);
      
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
    
    console.log(`Found ${plexDataMap.size} Plex items with watch data`);
    
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
      console.log(`Batch updating ${mediaToUpdate.length} media items with Plex data...`);
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
    
    console.log(`Enhanced Plex data sync completed. Processed ${processedItems} items.`);
  } catch (err) {
    console.error('Error in enhanced Plex sync:', err);
    throw err;
  }
}

// Clear API cache endpoint for fresh data
router.post('/clear-cache', async (req, res) => {
  try {
    apiCache.clear();
    console.log('API cache cleared');
    res.json({ 
      success: true, 
      message: 'API cache cleared successfully' 
    });
  } catch (err) {
    console.error('Error clearing cache:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
});

module.exports = router;

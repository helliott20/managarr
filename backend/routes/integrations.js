// backend/routes/integrations.js
const { createLogger } = require('../logger');
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Settings } = require('../database');

const log = createLogger('integrations');

// Helper function for making API requests with retries
async function makeRequestWithRetry(url, options, maxRetries = 3, retryDelay = 2000) {
  let lastError;
  
  // Set a default timeout if not provided
  if (!options.timeout) {
    options.timeout = 30000; // 30 seconds default timeout
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.debug({ attempt, maxRetries, url }, 'API request attempt');
      const response = await axios(url, options);
      return response;
    } catch (error) {
      lastError = error;
      
      // Log the error details
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        log.error({ 
          attempt, 
          maxRetries, 
          status: error.response.status, 
          message: error.message,
          responseData: error.response.data 
        }, 'API request failed with response error');
      } else if (error.request) {
        // The request was made but no response was received
        log.error({ 
          attempt, 
          maxRetries, 
          message: error.message,
          code: error.code 
        }, 'API request failed with no response');
        if (error.code === 'ECONNABORTED') {
          log.warn('Request timed out. Consider increasing the timeout value.');
        }
      } else {
        // Something happened in setting up the request that triggered an Error
        log.error({ 
          attempt, 
          maxRetries, 
          message: error.message 
        }, 'API request failed during setup');
      }
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = retryDelay * attempt; // Exponential backoff
        log.info({ delay }, 'Retrying API request');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError;
}

// Helper function to get settings
async function getSettings() {
  try {
    const settings = await Settings.findOne({ where: { id: 1 } });
    if (!settings) {
      return {};
    }
    // Return the individual fields as an object
    return {
      sonarr: settings.sonarr,
      radarr: settings.radarr,
      tautulli: settings.tautulli,
      general: settings.general,
      plex: settings.plex,
      notifications: settings.notifications
    };
  } catch (error) {
    log.error({ error }, 'Error getting settings');
    return {};
  }
}

// Test Sonarr connection
router.post('/sonarr/test', async (req, res) => {
  try {
    const { url, apiKey, saveStatus = false } = req.body;
    
    if (!url || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL and API Key are required' 
      });
    }
    
    let connectionStatus = 'disconnected';
    let version = null;
    let error = null;
    
    try {
      // Make a request to the Sonarr API to check if it's reachable
      const response = await makeRequestWithRetry(
        `${url}/api/v3/system/status`, 
        {
          method: 'get',
          headers: {
            'X-Api-Key': apiKey,
            'Accept': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        }
      );
      
      connectionStatus = 'connected';
      version = response.data.version;
    } catch (testError) {
      connectionStatus = 'error';
      error = testError.message;
    }
    
    // If saveStatus is true, update the settings in the database
    if (saveStatus) {
      try {
        const settings = await Settings.findOne({ where: { id: 1 } });
        const currentSonarrSettings = settings ? settings.sonarr : {};
        
        const updatedSonarrSettings = {
          ...currentSonarrSettings,
          url,
          apiKey,
          connectionStatus,
          version,
          lastConnectionTest: new Date().toISOString()
        };
        
        if (settings) {
          await settings.update({ sonarr: updatedSonarrSettings });
        } else {
          await Settings.create({ 
            id: 1, 
            sonarr: updatedSonarrSettings 
          });
        }
      } catch (saveError) {
        log.error({ error: saveError }, 'Error saving Sonarr connection status');
      }
    }
    
    if (connectionStatus === 'connected') {
      return res.json({
        success: true,
        version,
        connectionStatus,
        lastConnectionTest: new Date().toISOString()
      });
    } else {
      return res.status(400).json({
        success: false,
        error,
        connectionStatus,
        lastConnectionTest: new Date().toISOString()
      });
    }
  } catch (error) {
    log.error({ error }, 'Sonarr connection test failed');
    return res.status(400).json({
      success: false,
      error: error.message,
      connectionStatus: 'error',
      lastConnectionTest: new Date().toISOString()
    });
  }
});

// Get all series from Sonarr
router.get('/sonarr/series', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.sonarr || !settings.sonarr.enabled || !settings.sonarr.url || !settings.sonarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sonarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.sonarr;
    
    // Make a request to the Sonarr API to get all series
    const response = await makeRequestWithRetry(
      `${url}/api/v3/series`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Return the series
    return res.json({
      success: true,
      series: response.data
    });
  } catch (error) {
    log.error({ error }, 'Error getting Sonarr series');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get series by ID from Sonarr
router.get('/sonarr/series/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get settings
    const settings = await getSettings();
    
    if (!settings.sonarr || !settings.sonarr.enabled || !settings.sonarr.url || !settings.sonarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sonarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.sonarr;
    
    // Make a request to the Sonarr API to get the series
    const seriesResponse = await makeRequestWithRetry(
      `${url}/api/v3/series/${id}`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    // Get episodes for the series with episode files included
    const episodesResponse = await makeRequestWithRetry(
      `${url}/api/v3/episode?seriesId=${id}&includeEpisodeFile=true`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Process episodes
    const episodes = episodesResponse.data;
    const episodesWithFiles = episodes.filter(episode => episode.hasFile);
    
    log.debug({ 
      totalEpisodes: episodes.length, 
      episodesWithFiles: episodesWithFiles.length 
    }, 'Retrieved episodes from Sonarr');
    
    // Log a sample episode with hasFile=true to see its structure
    const sampleEpisodeWithFile = episodesWithFiles[0];
    if (sampleEpisodeWithFile) {
      log.debug({ 
        sampleEpisode: {
          id: sampleEpisodeWithFile.id,
          title: sampleEpisodeWithFile.title,
          hasFile: sampleEpisodeWithFile.hasFile,
          episodeFileId: sampleEpisodeWithFile.episodeFileId,
          episodeFile: sampleEpisodeWithFile.episodeFile ? {
            id: sampleEpisodeWithFile.episodeFile.id,
            size: sampleEpisodeWithFile.episodeFile.size,
            path: sampleEpisodeWithFile.episodeFile.path
          } : null
        }
      }, 'Sample episode with file');
    }
    
    // Return the series and episodes
    return res.json({
      success: true,
      series: seriesResponse.data,
      episodes: episodes
    });
  } catch (error) {
    log.error({ error, seriesId: req.params.id }, 'Error getting Sonarr series by ID');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete a file from Sonarr
router.delete('/sonarr/series/:seriesId/file/:fileId', async (req, res) => {
  try {
    const { seriesId, fileId } = req.params;
    
    // Get settings
    const settings = await getSettings();
    
    if (!settings.sonarr || !settings.sonarr.enabled || !settings.sonarr.url || !settings.sonarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sonarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.sonarr;
    
    // Make a request to the Sonarr API to delete the file
    const response = await makeRequestWithRetry(
      `${url}/api/v3/episodefile/${fileId}`, 
      {
        method: 'delete',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Return success
    return res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    log.error({ error, fileId: req.params.fileId }, 'Error deleting Sonarr file');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test Radarr connection
router.post('/radarr/test', async (req, res) => {
  try {
    const { url, apiKey, saveStatus = false } = req.body;
    
    if (!url || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL and API Key are required' 
      });
    }
    
    let connectionStatus = 'disconnected';
    let version = null;
    let error = null;
    
    try {
      // Make a request to the Radarr API to check if it's reachable
      const response = await makeRequestWithRetry(
        `${url}/api/v3/system/status`, 
        {
          method: 'get',
          headers: {
            'X-Api-Key': apiKey,
            'Accept': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        }
      );
      
      connectionStatus = 'connected';
      version = response.data.version;
    } catch (testError) {
      connectionStatus = 'error';
      error = testError.message;
    }
    
    // If saveStatus is true, update the settings in the database
    if (saveStatus) {
      try {
        const settings = await Settings.findOne({ where: { id: 1 } });
        const currentRadarrSettings = settings ? settings.radarr : {};
        
        const updatedRadarrSettings = {
          ...currentRadarrSettings,
          url,
          apiKey,
          connectionStatus,
          version,
          lastConnectionTest: new Date().toISOString()
        };
        
        if (settings) {
          await settings.update({ radarr: updatedRadarrSettings });
        } else {
          await Settings.create({ 
            id: 1, 
            radarr: updatedRadarrSettings 
          });
        }
      } catch (saveError) {
        log.error({ error: saveError }, 'Error saving Radarr connection status');
      }
    }
    
    if (connectionStatus === 'connected') {
      return res.json({
        success: true,
        version,
        connectionStatus,
        lastConnectionTest: new Date().toISOString()
      });
    } else {
      return res.status(400).json({
        success: false,
        error,
        connectionStatus,
        lastConnectionTest: new Date().toISOString()
      });
    }
  } catch (error) {
    log.error({ error }, 'Radarr connection test failed');
    return res.status(400).json({
      success: false,
      error: error.message,
      connectionStatus: 'error',
      lastConnectionTest: new Date().toISOString()
    });
  }
});

// Get all movies from Radarr
router.get('/radarr/movies', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.radarr || !settings.radarr.enabled || !settings.radarr.url || !settings.radarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Radarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.radarr;
    
    // Make a request to the Radarr API to get all movies
    const response = await makeRequestWithRetry(
      `${url}/api/v3/movie`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Return the movies
    return res.json({
      success: true,
      movies: response.data
    });
  } catch (error) {
    log.error({ error }, 'Error getting Radarr movies');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get movie by ID from Radarr
router.get('/radarr/movies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get settings
    const settings = await getSettings();
    
    if (!settings.radarr || !settings.radarr.enabled || !settings.radarr.url || !settings.radarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Radarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.radarr;
    
    // Make a request to the Radarr API to get the movie
    const movieResponse = await makeRequestWithRetry(
      `${url}/api/v3/movie/${id}`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    // Get movie files
    const filesResponse = await makeRequestWithRetry(
      `${url}/api/v3/moviefile?movieId=${id}`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    // Return the movie and files
    return res.json({
      success: true,
      movie: movieResponse.data,
      files: filesResponse.data
    });
  } catch (error) {
    log.error({ error, movieId: req.params.id }, 'Error getting Radarr movie by ID');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete a file from Radarr
router.delete('/radarr/movies/:movieId/file/:fileId', async (req, res) => {
  try {
    const { movieId, fileId } = req.params;
    
    // Get settings
    const settings = await getSettings();
    
    if (!settings.radarr || !settings.radarr.enabled || !settings.radarr.url || !settings.radarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Radarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.radarr;
    
    // Make a request to the Radarr API to delete the file
    const response = await makeRequestWithRetry(
      `${url}/api/v3/moviefile/${fileId}`, 
      {
        method: 'delete',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Return success
    return res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    log.error({ error, fileId: req.params.fileId }, 'Error deleting Radarr file');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get disk space from Sonarr
router.get('/sonarr/diskspace', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.sonarr || !settings.sonarr.enabled || !settings.sonarr.url || !settings.sonarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sonarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.sonarr;
    
    // Make a request to the Sonarr API to get disk space
    const response = await makeRequestWithRetry(
      `${url}/api/v3/diskspace`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    // Return the disk space information
    return res.json({
      success: true,
      diskspace: response.data
    });
  } catch (error) {
    log.error({ error }, 'Error getting Sonarr disk space');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get disk space from Radarr
router.get('/radarr/diskspace', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.radarr || !settings.radarr.enabled || !settings.radarr.url || !settings.radarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Radarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.radarr;
    
    // Make a request to the Radarr API to get disk space
    const response = await makeRequestWithRetry(
      `${url}/api/v3/diskspace`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );
    
    // Return the disk space information
    return res.json({
      success: true,
      diskspace: response.data
    });
  } catch (error) {
    log.error({ error }, 'Error getting Radarr disk space');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test Tautulli connection
router.post('/tautulli/test', async (req, res) => {
  try {
    const { url, apiKey, saveStatus = false } = req.body;
    
    if (!url || !apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'URL and API Key are required' 
      });
    }
    
    let connectionStatus = 'disconnected';
    let version = null;
    let error = null;
    
    try {
      // Make a request to the Tautulli API to check if it's reachable
      const response = await makeRequestWithRetry(
        `${url}/api/v2`, 
        {
          method: 'get',
          params: {
            apikey: apiKey,
            cmd: 'get_server_info'
          },
          timeout: 10000 // 10 second timeout
        }
      );
      
      if (response.data && response.data.response && response.data.response.result === 'success') {
        connectionStatus = 'connected';
        version = response.data.response.data?.version || 'Unknown';
      } else {
        connectionStatus = 'error';
        error = 'Invalid API response';
      }
    } catch (testError) {
      connectionStatus = 'error';
      error = testError.message;
    }
    
    // If saveStatus is true, update the settings in the database
    if (saveStatus) {
      try {
        const settings = await Settings.findOne({ where: { id: 1 } });
        const currentTautulliSettings = settings ? settings.tautulli : {};
        
        const updatedTautulliSettings = {
          ...currentTautulliSettings,
          url,
          apiKey,
          connectionStatus,
          version,
          lastConnectionTest: new Date().toISOString()
        };
        
        if (settings) {
          await settings.update({ tautulli: updatedTautulliSettings });
        } else {
          await Settings.create({ 
            id: 1, 
            tautulli: updatedTautulliSettings 
          });
        }
      } catch (saveError) {
        log.error({ error: saveError }, 'Error saving Tautulli connection status');
      }
    }
    
    if (connectionStatus === 'connected') {
      return res.json({
        success: true,
        version,
        connectionStatus,
        lastConnectionTest: new Date().toISOString()
      });
    } else {
      return res.status(400).json({
        success: false,
        error,
        connectionStatus,
        lastConnectionTest: new Date().toISOString()
      });
    }
  } catch (error) {
    log.error({ error }, 'Tautulli connection test failed');
    return res.status(400).json({
      success: false,
      error: error.message,
      connectionStatus: 'error',
      lastConnectionTest: new Date().toISOString()
    });
  }
});

// Get watch history from Tautulli
router.get('/tautulli/history', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.tautulli || !settings.tautulli.enabled || !settings.tautulli.url || !settings.tautulli.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tautulli is not configured or enabled' 
      });
    }
    
    const { url, apiKey, historyDaysToSync = 30 } = settings.tautulli;
    const { start = 0, length = 1000 } = req.query;
    
    // Calculate date range
    const afterDate = Math.floor(Date.now() / 1000) - (historyDaysToSync * 24 * 60 * 60);
    
    // Make a request to the Tautulli API to get history
    const response = await makeRequestWithRetry(
      `${url}/api/v2`, 
      {
        method: 'get',
        params: {
          apikey: apiKey,
          cmd: 'get_history',
          start: start,
          length: length,
          after: afterDate,
          order_column: 'date',
          order_dir: 'desc'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    if (response.data && response.data.response && response.data.response.result === 'success') {
      return res.json({
        success: true,
        history: response.data.response.data
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid API response'
      });
    }
  } catch (error) {
    log.error({ error }, 'Error getting Tautulli history');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get library statistics from Tautulli
router.get('/tautulli/library-stats', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.tautulli || !settings.tautulli.enabled || !settings.tautulli.url || !settings.tautulli.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tautulli is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.tautulli;
    
    // Make a request to the Tautulli API to get library stats
    const response = await makeRequestWithRetry(
      `${url}/api/v2`, 
      {
        method: 'get',
        params: {
          apikey: apiKey,
          cmd: 'get_libraries'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    if (response.data && response.data.response && response.data.response.result === 'success') {
      return res.json({
        success: true,
        libraries: response.data.response.data
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid API response'
      });
    }
  } catch (error) {
    log.error({ error }, 'Error getting Tautulli library stats');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test all configured integrations and update their status
router.post('/test-all', async (req, res) => {
  try {
    const settings = await getSettings();
    const results = {
      sonarr: null,
      radarr: null,
      tautulli: null
    };
    
    // Test Sonarr if configured
    if (settings.sonarr && settings.sonarr.enabled && settings.sonarr.url && settings.sonarr.apiKey) {
      try {
        const response = await makeRequestWithRetry(
          `${settings.sonarr.url}/api/v3/system/status`, 
          {
            method: 'get',
            headers: {
              'X-Api-Key': settings.sonarr.apiKey,
              'Accept': 'application/json'
            },
            timeout: 10000
          }
        );
        
        results.sonarr = {
          success: true,
          connectionStatus: 'connected',
          version: response.data.version,
          lastConnectionTest: new Date().toISOString()
        };
      } catch (error) {
        results.sonarr = {
          success: false,
          connectionStatus: 'error',
          error: error.message,
          lastConnectionTest: new Date().toISOString()
        };
      }
    }
    
    // Test Radarr if configured
    if (settings.radarr && settings.radarr.enabled && settings.radarr.url && settings.radarr.apiKey) {
      try {
        const response = await makeRequestWithRetry(
          `${settings.radarr.url}/api/v3/system/status`, 
          {
            method: 'get',
            headers: {
              'X-Api-Key': settings.radarr.apiKey,
              'Accept': 'application/json'
            },
            timeout: 10000
          }
        );
        
        results.radarr = {
          success: true,
          connectionStatus: 'connected',
          version: response.data.version,
          lastConnectionTest: new Date().toISOString()
        };
      } catch (error) {
        results.radarr = {
          success: false,
          connectionStatus: 'error',
          error: error.message,
          lastConnectionTest: new Date().toISOString()
        };
      }
    }
    
    // Test Tautulli if configured
    if (settings.tautulli && settings.tautulli.enabled && settings.tautulli.url && settings.tautulli.apiKey) {
      try {
        const response = await makeRequestWithRetry(
          `${settings.tautulli.url}/api/v2`, 
          {
            method: 'get',
            params: {
              apikey: settings.tautulli.apiKey,
              cmd: 'get_server_info'
            },
            timeout: 10000
          }
        );
        
        if (response.data && response.data.response && response.data.response.result === 'success') {
          results.tautulli = {
            success: true,
            connectionStatus: 'connected',
            version: response.data.response.data?.version || 'Unknown',
            lastConnectionTest: new Date().toISOString()
          };
        } else {
          results.tautulli = {
            success: false,
            connectionStatus: 'error',
            error: 'Invalid API response',
            lastConnectionTest: new Date().toISOString()
          };
        }
      } catch (error) {
        results.tautulli = {
          success: false,
          connectionStatus: 'error',
          error: error.message,
          lastConnectionTest: new Date().toISOString()
        };
      }
    }
    
    // Update settings with new connection statuses
    try {
      const settingsRecord = await Settings.findOne({ where: { id: 1 } });
      const updateData = {};
      
      if (results.sonarr) {
        updateData.sonarr = {
          ...settings.sonarr,
          connectionStatus: results.sonarr.connectionStatus,
          version: results.sonarr.version,
          lastConnectionTest: results.sonarr.lastConnectionTest
        };
      }
      
      if (results.radarr) {
        updateData.radarr = {
          ...settings.radarr,
          connectionStatus: results.radarr.connectionStatus,
          version: results.radarr.version,
          lastConnectionTest: results.radarr.lastConnectionTest
        };
      }
      
      if (results.tautulli) {
        updateData.tautulli = {
          ...settings.tautulli,
          connectionStatus: results.tautulli.connectionStatus,
          version: results.tautulli.version,
          lastConnectionTest: results.tautulli.lastConnectionTest
        };
      }
      
      if (settingsRecord) {
        await settingsRecord.update(updateData);
      } else {
        await Settings.create({ id: 1, ...updateData });
      }
    } catch (saveError) {
      log.error({ error: saveError }, 'Error saving connection test results');
    }
    
    return res.json({
      success: true,
      results
    });
  } catch (error) {
    log.error({ error }, 'Error testing integrations');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get quality profiles from Sonarr
router.get('/sonarr/qualityprofiles', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.sonarr || !settings.sonarr.enabled || !settings.sonarr.url || !settings.sonarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sonarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.sonarr;
    
    // Make a request to the Sonarr API to get quality profiles
    const response = await makeRequestWithRetry(
      `${url}/api/v3/qualityprofile`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Return the quality profiles
    return res.json({
      success: true,
      qualityProfiles: response.data
    });
  } catch (error) {
    log.error({ error }, 'Error getting Sonarr quality profiles');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get quality definitions from Sonarr
router.get('/sonarr/qualitydefinitions', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.sonarr || !settings.sonarr.enabled || !settings.sonarr.url || !settings.sonarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Sonarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.sonarr;
    
    // Make a request to the Sonarr API to get quality definitions
    const response = await makeRequestWithRetry(
      `${url}/api/v3/qualitydefinition`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Return the quality definitions
    return res.json({
      success: true,
      qualityDefinitions: response.data
    });
  } catch (error) {
    log.error({ error }, 'Error getting Sonarr quality definitions');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get quality profiles from Radarr
router.get('/radarr/qualityprofiles', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.radarr || !settings.radarr.enabled || !settings.radarr.url || !settings.radarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Radarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.radarr;
    
    // Make a request to the Radarr API to get quality profiles
    const response = await makeRequestWithRetry(
      `${url}/api/v3/qualityprofile`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Return the quality profiles
    return res.json({
      success: true,
      qualityProfiles: response.data
    });
  } catch (error) {
    log.error({ error }, 'Error getting Radarr quality profiles');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get quality definitions from Radarr
router.get('/radarr/qualitydefinitions', async (req, res) => {
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.radarr || !settings.radarr.enabled || !settings.radarr.url || !settings.radarr.apiKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Radarr is not configured or enabled' 
      });
    }
    
    const { url, apiKey } = settings.radarr;
    
    // Make a request to the Radarr API to get quality definitions
    const response = await makeRequestWithRetry(
      `${url}/api/v3/qualitydefinition`, 
      {
        method: 'get',
        headers: {
          'X-Api-Key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    // Return the quality definitions
    return res.json({
      success: true,
      qualityDefinitions: response.data
    });
  } catch (error) {
    log.error({ error }, 'Error getting Radarr quality definitions');
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

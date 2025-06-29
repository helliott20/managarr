// backend/routes/integrations.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Settings } = require('../database');

// Helper function for making API requests with retries
async function makeRequestWithRetry(url, options, maxRetries = 3, retryDelay = 2000) {
  let lastError;
  
  // Set a default timeout if not provided
  if (!options.timeout) {
    options.timeout = 30000; // 30 seconds default timeout
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`API request attempt ${attempt}/${maxRetries}: ${url}`);
      const response = await axios(url, options);
      return response;
    } catch (error) {
      lastError = error;
      
      // Log the error details
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error(`Attempt ${attempt}/${maxRetries} failed with status ${error.response.status}:`, error.message);
        console.error('Response data:', error.response.data);
      } else if (error.request) {
        // The request was made but no response was received
        console.error(`Attempt ${attempt}/${maxRetries} failed (no response):`, error.message);
        if (error.code === 'ECONNABORTED') {
          console.error('Request timed out. Consider increasing the timeout value.');
        }
      } else {
        // Something happened in setting up the request that triggered an Error
        console.error(`Attempt ${attempt}/${maxRetries} failed (request setup):`, error.message);
      }
      
      // If this is not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delay = retryDelay * attempt; // Exponential backoff
        console.log(`Retrying in ${delay}ms...`);
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
      general: settings.general,
      plex: settings.plex,
      notifications: settings.notifications
    };
  } catch (error) {
    console.error('Error getting settings:', error);
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
        console.error('Error saving Sonarr connection status:', saveError.message);
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
    console.error('Sonarr connection test failed:', error.message);
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
    console.error('Error getting Sonarr series:', error.message);
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
    
    console.log(`Retrieved ${episodes.length} episodes, ${episodesWithFiles.length} have files`);
    
    // Log a sample episode with hasFile=true to see its structure
    const sampleEpisodeWithFile = episodesWithFiles[0];
    if (sampleEpisodeWithFile) {
      console.log(`Sample episode with hasFile=true and episodeFile:`, 
        JSON.stringify({
          id: sampleEpisodeWithFile.id,
          title: sampleEpisodeWithFile.title,
          hasFile: sampleEpisodeWithFile.hasFile,
          episodeFileId: sampleEpisodeWithFile.episodeFileId,
          episodeFile: sampleEpisodeWithFile.episodeFile ? {
            id: sampleEpisodeWithFile.episodeFile.id,
            size: sampleEpisodeWithFile.episodeFile.size,
            path: sampleEpisodeWithFile.episodeFile.path
          } : null
        })
      );
    }
    
    // Return the series and episodes
    return res.json({
      success: true,
      series: seriesResponse.data,
      episodes: episodes
    });
  } catch (error) {
    console.error(`Error getting Sonarr series ${req.params.id}:`, error.message);
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
    console.error(`Error deleting Sonarr file ${req.params.fileId}:`, error.message);
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
        console.error('Error saving Radarr connection status:', saveError.message);
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
    console.error('Radarr connection test failed:', error.message);
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
    console.error('Error getting Radarr movies:', error.message);
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
    console.error(`Error getting Radarr movie ${req.params.id}:`, error.message);
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
    console.error(`Error deleting Radarr file ${req.params.fileId}:`, error.message);
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
    console.error('Error getting Sonarr disk space:', error.message);
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
    console.error('Error getting Radarr disk space:', error.message);
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
      radarr: null
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
      
      if (settingsRecord) {
        await settingsRecord.update(updateData);
      } else {
        await Settings.create({ id: 1, ...updateData });
      }
    } catch (saveError) {
      console.error('Error saving connection test results:', saveError.message);
    }
    
    return res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error testing integrations:', error.message);
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
    console.error('Error getting Sonarr quality profiles:', error.message);
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
    console.error('Error getting Sonarr quality definitions:', error.message);
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
    console.error('Error getting Radarr quality profiles:', error.message);
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
    console.error('Error getting Radarr quality definitions:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

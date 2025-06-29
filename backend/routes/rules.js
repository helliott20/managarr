// backend/routes/rules.js
const express = require('express');
const router = express.Router();
const { Media, DeletionRule, DeletionHistory, Settings, PendingDeletion } = require('../database');
const { Op } = require('sequelize');
const axios = require('axios');

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
    return settings || {};
  } catch (error) {
    console.error('Error getting settings:', error);
    return {};
  }
}

// Get all rules
router.get('/', async (req, res) => {
  try {
    const rules = await DeletionRule.findAll();
    res.json(rules);
  } catch (err) {
    console.error('Error in /rules GET:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create a new rule
router.post('/', async (req, res) => {
  try {
    const newRule = await DeletionRule.create(req.body);
    res.status(201).json(newRule);
  } catch (err) {
    console.error('Error in /rules POST:', err);
    res.status(400).json({ message: err.message });
  }
});

// Get a rule by ID
router.get('/:id', async (req, res) => {
  try {
    const rule = await DeletionRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }
    res.json(rule);
  } catch (err) {
    console.error('Error in /rules/:id GET:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update a rule
router.put('/:id', async (req, res) => {
  try {
    console.log(`Updating rule ${req.params.id} with data:`, JSON.stringify(req.body, null, 2));
    
    const rule = await DeletionRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }
    
    console.log('Current rule before update:', JSON.stringify(rule.toJSON(), null, 2));
    
    // Update the rule with the new data
    await rule.update(req.body);
    
    // Fetch the updated rule to return
    const updatedRule = await DeletionRule.findByPk(req.params.id);
    console.log('Rule after update:', JSON.stringify(updatedRule.toJSON(), null, 2));
    
    res.json(updatedRule);
  } catch (err) {
    console.error('Error in /rules/:id PUT:', err);
    console.error('Request body that caused error:', req.body);
    res.status(400).json({ message: err.message });
  }
});

// Delete a rule
router.delete('/:id', async (req, res) => {
  try {
    const rule = await DeletionRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }
    
    // First, delete all pending deletions associated with this rule
    await PendingDeletion.destroy({
      where: { ruleId: req.params.id }
    });
    
    // Delete all deletion history associated with this rule
    await DeletionHistory.destroy({
      where: { ruleId: req.params.id }
    });
    
    // Now delete the rule itself
    await rule.destroy();
    res.json({ message: 'Rule deleted successfully' });
  } catch (err) {
    console.error('Error in /rules/:id DELETE:', err);
    res.status(500).json({ message: err.message });
  }
});

// Preview affected media for a rule
router.post('/preview', async (req, res) => {
  try {
    const rule = req.body;
    const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true' || false;
    
    // Debug logging
    console.log('Preview API received rule:', {
      conditions: rule.conditions,
      filtersEnabled: rule.filtersEnabled
    });
    
    let affectedMedia = [];
    let totalSize = 0;
    const stats = {
      byType: { movie: 0, show: 0, other: 0 },
      byWatchStatus: { watched: 0, unwatched: 0, 'in-progress': 0 }
    };
    
    // Filter statistics for summary
    const filterStats = {
      totalProcessed: 0,
      includedCount: 0,
      excludedByFilter: {
        age: 0,
        quality: 0,
        enhancedQuality: 0,
        size: 0,
        status: 0,
        title: 0,
        mediaSpecific: 0,
        arrIntegration: 0
      },
      qualityDataStats: {
        hasResolution: 0,
        hasQualityName: 0,
        hasQualityProfile: 0,
        hasCodec: 0,
        noQualityData: 0
      }
    };
    
    // Build where clause for library filtering
    let whereClause = {};
    if (rule.libraries && rule.libraries.length > 0) {
      const typeConditions = [];
      if (rule.libraries.includes('TV Shows')) {
        typeConditions.push('show');
      }
      if (rule.libraries.includes('Movies')) {
        typeConditions.push('movie');
      }
      if (typeConditions.length > 0) {
        whereClause.type = { [Op.in]: typeConditions };
      }
    }
    
    // Query local database for media
    const mediaRecords = await Media.findAll({ where: whereClause });
    
    // Process each media record
    for (const media of mediaRecords) {
      filterStats.totalProcessed++;
      
      // Collect quality data statistics
      if (media.resolution) filterStats.qualityDataStats.hasResolution++;
      if (media.qualityName) filterStats.qualityDataStats.hasQualityName++;
      if (media.qualityProfile) filterStats.qualityDataStats.hasQualityProfile++;
      if (media.codec) filterStats.qualityDataStats.hasCodec++;
      if (!media.resolution && !media.qualityName && !media.qualityProfile && !media.codec) {
        filterStats.qualityDataStats.noQualityData++;
      }
      
      // Transform database record to match expected format
      const mediaItem = {
        id: media.id.toString(),
        title: media.title || media.filename,
        type: media.type,
        added: media.created || media.createdAt,
        size: parseInt(media.size) || 0,
        quality: {
          quality: {
            name: media.qualityName || media.resolution || 'Unknown'
          },
          qualityVersion: 1
        },
        ratings: media.rating ? [{ source: 'database', value: media.rating }] : [],
        status: media.seriesStatus || 'available',
        network: media.network,
        tags: media.tags || [],
        monitored: true, // Default to monitored since it's in our database
        statistics: {},
        watchStatus: media.watched ? 'watched' : 
                    (media.plexViewCount > 0 ? 'watched' : 'unwatched'),
        // Additional fields for filtering - keep original database fields
        qualityName: media.qualityName,
        qualityProfile: media.qualityProfile,
        resolution: media.resolution,
        codec: media.codec,
        studio: media.studio,
        certification: media.certification,
        collection: media.collection
      };
      
      // Apply filters using existing helper function
      if (shouldIncludeMedia(mediaItem, rule, filterStats, VERBOSE_LOGGING)) {
        affectedMedia.push(mediaItem);
        totalSize += mediaItem.size;
        stats.byType[mediaItem.type]++;
        updateWatchStatusStats(stats, mediaItem);
        filterStats.includedCount++;
      }
    }
    
    // Sort affected media by size (largest first)
    affectedMedia.sort((a, b) => b.size - a.size);
    
    // Log summary statistics
    console.log('=== FILTER SUMMARY ===');
    console.log(`Total media processed: ${filterStats.totalProcessed}`);
    console.log(`Media included: ${filterStats.includedCount}`);
    console.log(`Media excluded: ${filterStats.totalProcessed - filterStats.includedCount}`);
    console.log(`Exclusions by filter:`, filterStats.excludedByFilter);
    console.log(`Quality data availability:`, filterStats.qualityDataStats);
    console.log('=====================');
    
    return res.json({
      success: true,
      affectedMedia,
      totalSize,
      stats
    });
  } catch (error) {
    console.error('Error previewing rule:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to determine if media should be included based on rule conditions
function shouldIncludeMedia(media, rule, filterStats = null, verbose = false) {
  const { conditions, filtersEnabled } = rule;
  
  // Age filter
  if (filtersEnabled.age && conditions.minAge > 0) {
    const daysSinceAdded = Math.floor((new Date() - new Date(media.added)) / (1000 * 60 * 60 * 24));
    if (daysSinceAdded < conditions.minAge) {
      if (filterStats) filterStats.excludedByFilter.age++;
      if (verbose) console.log(`Media excluded by age filter: ${media.title} (${daysSinceAdded} days old, need ${conditions.minAge})`);
      return false;
    }
  }
  
  // Quality filter (rating-based)
  if (filtersEnabled.quality && conditions.minRating > 0) {
    const rating = getRatingValue(media.ratings) || 0;
    if (rating < conditions.minRating) {
      if (filterStats) filterStats.excludedByFilter.quality++;
      if (verbose) console.log(`Media excluded by rating filter: ${media.title} (rating ${rating}, need ${conditions.minRating})`);
      return false;
    }
  }
  
  // Quality filter (resolution-based)
  if (filtersEnabled.quality) {
    if (conditions.minQuality && conditions.minQuality !== '') {
      const mediaQuality = media.qualityName || media.resolution || '';
      const minQualityOrder = getQualityOrder(conditions.minQuality);
      const mediaQualityOrder = getQualityOrder(mediaQuality);
      
      if (mediaQualityOrder < minQualityOrder) {
        return false;
      }
    }
    
    if (conditions.maxQuality && conditions.maxQuality !== '') {
      const mediaQuality = media.qualityName || media.resolution || '';
      const maxQualityOrder = getQualityOrder(conditions.maxQuality);
      const mediaQualityOrder = getQualityOrder(mediaQuality);
      
      if (mediaQualityOrder > maxQualityOrder) {
        return false;
      }
    }
  }
  
  // Enhanced quality filters
  if (filtersEnabled.enhancedQuality) {
    if (verbose) console.log('Enhanced quality filter enabled, checking resolution and quality profile...');
    
    if (conditions.resolution && conditions.resolution !== 'any') {
      // Try to get resolution from multiple sources
      const mediaResolution = media.resolution || '';
      const mediaQualityName = media.qualityName || '';
      const mediaQualityProfile = media.qualityProfile || '';
      const mediaCodec = media.codec || '';
      
      if (verbose) console.log(`Resolution filter: looking for "${conditions.resolution}", media has resolution="${mediaResolution}", qualityName="${mediaQualityName}", qualityProfile="${mediaQualityProfile}", codec="${mediaCodec}"`);
      
      // If media has no resolution data, don't filter it out (include it)
      if (!mediaResolution && !mediaQualityName && !mediaQualityProfile) {
        if (verbose) console.log(`Media has no resolution/quality data, including: ${media.title}`);
      } else {
        // Check if the condition matches any of the quality-related fields
        const conditionLower = conditions.resolution.toLowerCase();
        const mediaResolutionLower = mediaResolution.toLowerCase();
        const mediaQualityNameLower = mediaQualityName.toLowerCase();
        const mediaQualityProfileLower = mediaQualityProfile.toLowerCase();
        const mediaCodecLower = mediaCodec.toLowerCase();
        
        const matchesResolution = mediaResolutionLower.includes(conditionLower);
        const matchesQualityName = mediaQualityNameLower.includes(conditionLower);
        const matchesQualityProfile = mediaQualityProfileLower.includes(conditionLower);
        const matchesCodec = mediaCodecLower.includes(conditionLower);
        
        if (conditions.resolution !== 'other' && !matchesResolution && !matchesQualityName && !matchesQualityProfile && !matchesCodec) {
          if (filterStats) filterStats.excludedByFilter.enhancedQuality++;
          if (verbose) console.log(`Media excluded due to resolution filter: ${media.title}`);
          return false;
        }
      }
    }
    
    if (conditions.qualityProfile && conditions.qualityProfile !== 'any') {
      const mediaQualityProfile = media.qualityProfile || '';
      const mediaQualityName = media.qualityName || '';
      if (verbose) console.log(`Quality profile filter: looking for "${conditions.qualityProfile}", media has qualityProfile="${mediaQualityProfile}", qualityName="${mediaQualityName}"`);
      
      // If media has no quality data, don't filter it out (include it)
      if (!mediaQualityProfile && !mediaQualityName) {
        if (verbose) console.log(`Media has no quality profile data, including: ${media.title}`);
      } else {
        const conditionLower = conditions.qualityProfile.toLowerCase();
        const mediaQualityProfileLower = mediaQualityProfile.toLowerCase();
        const mediaQualityNameLower = mediaQualityName.toLowerCase();
        
        const matchesProfile = mediaQualityProfileLower.includes(conditionLower);
        const matchesName = mediaQualityNameLower.includes(conditionLower);
        
        if (!matchesProfile && !matchesName) {
          if (filterStats) filterStats.excludedByFilter.enhancedQuality++;
          if (verbose) console.log(`Media excluded due to quality profile filter: ${media.title}`);
          return false;
        }
      }
    }
  }
  
  // Size filter
  if (filtersEnabled.size) {
    const sizeGB = media.size / (1024 * 1024 * 1024);
    
    if (conditions.minSize > 0 && sizeGB < conditions.minSize) {
      if (filterStats) filterStats.excludedByFilter.size++;
      if (verbose) console.log(`Media excluded by size filter (too small): ${media.title} (${sizeGB.toFixed(2)}GB < ${conditions.minSize}GB)`);
      return false;
    }
    
    if (conditions.maxSize > 0 && sizeGB > conditions.maxSize) {
      if (filterStats) filterStats.excludedByFilter.size++;
      if (verbose) console.log(`Media excluded by size filter (too large): ${media.title} (${sizeGB.toFixed(2)}GB > ${conditions.maxSize}GB)`);
      return false;
    }
  }
  
  // Watch status filter
  if (filtersEnabled.status && conditions.watchStatus !== 'any') {
    if (media.watchStatus !== conditions.watchStatus) {
      if (filterStats) filterStats.excludedByFilter.status++;
      if (verbose) console.log(`Media excluded by watch status filter: ${media.title} (status: ${media.watchStatus}, need: ${conditions.watchStatus})`);
      return false;
    }
  }
  
  // Title filter
  if (filtersEnabled.title) {
    const mediaTitle = media.title || '';
    
    // Title contains filter
    if (conditions.titleContains && conditions.titleContains.trim() !== '') {
      const titleContainsLower = conditions.titleContains.toLowerCase();
      const mediaTitleLower = mediaTitle.toLowerCase();
      
      if (!mediaTitleLower.includes(titleContainsLower)) {
        if (filterStats) filterStats.excludedByFilter.title++;
        if (verbose) console.log(`Media excluded by title contains filter: ${media.title} (does not contain "${conditions.titleContains}")`);
        return false;
      }
    }
    
    // Title exact match filter
    if (conditions.titleExact && conditions.titleExact.trim() !== '') {
      const titleExactLower = conditions.titleExact.toLowerCase();
      const mediaTitleLower = mediaTitle.toLowerCase();
      
      if (mediaTitleLower !== titleExactLower) {
        if (filterStats) filterStats.excludedByFilter.title++;
        if (verbose) console.log(`Media excluded by title exact filter: ${media.title} (does not exactly match "${conditions.titleExact}")`);
        return false;
      }
    }
  }
  
  // Media-specific filters
  if (filtersEnabled.mediaSpecific) {
    if (conditions.seriesStatus && conditions.seriesStatus !== 'any') {
      if (media.status !== conditions.seriesStatus) {
        if (filterStats) filterStats.excludedByFilter.mediaSpecific++;
        if (verbose) console.log(`Media excluded by series status filter: ${media.title} (status: ${media.status}, need: ${conditions.seriesStatus})`);
        return false;
      }
    }
    
    if (conditions.network && conditions.network !== 'any') {
      if (media.network !== conditions.network) {
        if (filterStats) filterStats.excludedByFilter.mediaSpecific++;
        if (verbose) console.log(`Media excluded by network filter: ${media.title} (network: ${media.network}, need: ${conditions.network})`);
        return false;
      }
    }
  }
  
  // Sonarr/Radarr integration filters
  if (filtersEnabled.arrIntegration) {
    if (conditions.monitoringStatus && conditions.monitoringStatus !== 'any') {
      if (media.monitored !== (conditions.monitoringStatus === 'monitored')) {
        if (filterStats) filterStats.excludedByFilter.arrIntegration++;
        if (verbose) console.log(`Media excluded by monitoring status filter: ${media.title} (monitored: ${media.monitored}, need: ${conditions.monitoringStatus})`);
        return false;
      }
    }
    
    if (conditions.downloadStatus && conditions.downloadStatus !== 'any') {
      if (media.status !== conditions.downloadStatus) {
        if (filterStats) filterStats.excludedByFilter.arrIntegration++;
        if (verbose) console.log(`Media excluded by download status filter: ${media.title} (status: ${media.status}, need: ${conditions.downloadStatus})`);
        return false;
      }
    }
    
    if (conditions.tags) {
      const mediaTags = media.tags || [];
      const ruleTags = conditions.tags.split(',').map(tag => tag.trim());
      if (!ruleTags.some(tag => mediaTags.includes(tag))) {
        if (filterStats) filterStats.excludedByFilter.arrIntegration++;
        if (verbose) console.log(`Media excluded by tags filter: ${media.title} (tags: ${mediaTags.join(',')}, need one of: ${ruleTags.join(',')})`);
        return false;
      }
    }
  }
  
  return true;
}

// Helper function to get quality order for comparison
function getQualityOrder(quality) {
  if (!quality) return 0;
  
  const qualityStr = quality.toLowerCase();
  const qualityOrder = {
    // Resolution-based
    '4k': 5,
    '2160p': 5,
    'ultra-hd': 5,
    'uhd': 5,
    '1080p': 4,
    'hd-1080p': 4,
    'full-hd': 4,
    '720p': 3,
    'hd-720p': 3,
    'hd': 3,
    '480p': 2,
    'sd': 1,
    'dvd': 1
  };
  
  // Check for exact matches first
  if (qualityOrder[qualityStr]) {
    return qualityOrder[qualityStr];
  }
  
  // Check for partial matches
  for (const [key, value] of Object.entries(qualityOrder)) {
    if (qualityStr.includes(key)) {
      return value;
    }
  }
  
  return 0;
}

// Helper function to get rating value from ratings object
function getRatingValue(ratings) {
  if (!ratings || !Array.isArray(ratings)) return 0;
  
  // Look for IMDB rating first, then any other rating
  const imdbRating = ratings.find(r => r.source === 'imdb');
  if (imdbRating && imdbRating.value) {
    return imdbRating.value;
  }
  
  // Fallback to first available rating
  const firstRating = ratings.find(r => r.value);
  return firstRating ? firstRating.value : 0;
}

// Helper function to update watch status statistics
function updateWatchStatusStats(stats, media) {
  const watchStatus = media.watchStatus || 'unwatched';
  stats.byWatchStatus[watchStatus]++;
}

// Run a specific rule
router.post('/:id/run', async (req, res) => {
  try {
    const rule = await DeletionRule.findByPk(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }
    
    if (!rule.enabled) {
      return res.status(400).json({ message: 'Rule is disabled' });
    }
    
    console.log(`Running rule: ${rule.name} (ID: ${rule.id})`);
    
    // Create pending deletions instead of immediate deletion
    const result = await createPendingDeletions(rule);
    
    // Update rule's last run time
    await rule.update({ lastRun: new Date() });
    
    res.json({ 
      success: true,
      message: `Rule executed successfully. ${result.pendingCount} items added to pending deletions.`,
      ruleId: rule.id,
      pendingCount: result.pendingCount,
      totalSize: result.totalSize,
      stats: result.stats
    });
    
  } catch (err) {
    console.error('Error in /rules/:id/run:', err);
    res.status(500).json({ message: err.message });
  }
});

// Helper function to create pending deletions from rule execution
async function createPendingDeletions(rule) {
  console.log(`Creating pending deletions for rule: ${rule.name}`);
  
  const { conditions, filtersEnabled } = rule;
  
  // Filter statistics for reporting
  const filterStats = {
    totalProcessed: 0,
    includedCount: 0,
    excludedByFilter: {
      age: 0,
      quality: 0,
      enhancedQuality: 0,
      size: 0,
      status: 0,
      title: 0,
      mediaSpecific: 0,
      arrIntegration: 0
    }
  };

  // Get all media
  const allMedia = await Media.findAll({
    where: {
      protected: false // Don't include protected media
    }
  });

  console.log(`Found ${allMedia.length} media items to process`);
  
  let affectedMedia = [];
  let totalSize = 0;
  
  // Apply rule filters to each media item
  for (const media of allMedia) {
    filterStats.totalProcessed++;
    
    if (shouldIncludeMedia(media, rule, filterStats, true)) {
      affectedMedia.push(media);
      totalSize += media.size || 0;
      filterStats.includedCount++;
    }
  }

  console.log(`${affectedMedia.length} media items match the rule conditions`);
  
  // Create pending deletion records
  const pendingDeletions = [];
  
  for (const media of affectedMedia) {
    try {
      // Check if pending deletion already exists for this media and rule
      const existingPending = await PendingDeletion.findOne({
        where: {
          mediaId: media.id,
          ruleId: rule.id,
          status: 'pending'
        }
      });
      
      if (existingPending) {
        console.log(`Pending deletion already exists for media ${media.id}, skipping`);
        continue;
      }
      
      const pendingDeletion = await PendingDeletion.create({
        mediaId: media.id,
        ruleId: rule.id,
        status: 'pending',
        scheduledDate: new Date(),
        mediaSnapshot: {
          id: media.id,
          title: media.title,
          path: media.path,
          filename: media.filename,
          size: media.size,
          type: media.type,
          added: media.added,
          watched: media.watched,
          watchStatus: media.watchStatus,
          qualityName: media.qualityName,
          resolution: media.resolution,
          ratings: media.ratings
        },
        ruleSnapshot: {
          id: rule.id,
          name: rule.name,
          conditions: rule.conditions,
          filtersEnabled: rule.filtersEnabled,
          deletionStrategy: rule.deletionStrategy,
          executedAt: new Date()
        }
      });
      
      pendingDeletions.push(pendingDeletion);
      
    } catch (error) {
      console.error(`Error creating pending deletion for media ${media.id}:`, error);
    }
  }

  console.log(`Created ${pendingDeletions.length} pending deletions`);

  return {
    pendingCount: pendingDeletions.length,
    totalSize,
    stats: {
      totalProcessed: filterStats.totalProcessed,
      includedCount: filterStats.includedCount,
      excludedByFilter: filterStats.excludedByFilter,
      byType: affectedMedia.reduce((acc, media) => {
        acc[media.type] = (acc[media.type] || 0) + 1;
        return acc;
      }, { movie: 0, show: 0, other: 0 }),
      byWatchStatus: affectedMedia.reduce((acc, media) => {
        const status = media.watchStatus || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, { watched: 0, unwatched: 0, 'in-progress': 0 })
    }
  };
}

// DANGEROUS FUNCTION - DISABLED FOR SAFETY
// This function was previously deleting files directly without user confirmation
// It has been replaced by createPendingDeletions for safety
async function executeRule_DISABLED_FOR_SAFETY(rule) {
  console.error('⚠️  SAFETY WARNING: executeRule function has been disabled!');
  console.error('⚠️  This function was directly deleting files without user confirmation.');
  console.error('⚠️  Use createPendingDeletions instead to create pending deletions for user approval.');
  throw new Error('executeRule function has been disabled for safety. Use createPendingDeletions instead.');
  
  // ORIGINAL DANGEROUS CODE COMMENTED OUT:
  /*
  try {
    const { mediaTypes, conditions } = rule;
    
    // Get settings to check if Sonarr and Radarr are configured
    const settings = await getSettings();
    const sonarrEnabled = settings.sonarr && settings.sonarr.enabled && settings.sonarr.url && settings.sonarr.apiKey;
    const radarrEnabled = settings.radarr && settings.radarr.enabled && settings.radarr.url && settings.radarr.apiKey;
    
    // Create deletion history record
    const deletionHistory = await DeletionHistory.create({
      ruleId: rule.id,
      ruleName: rule.name,
      mediaDeleted: [],
      totalSizeFreed: 0,
      success: true
    });
    
    // If neither Sonarr nor Radarr are configured, use local database
    if (!sonarrEnabled && !radarrEnabled) {
      console.log('Neither Sonarr nor Radarr are configured, using local database');
      
      const cutoffDate = new Date(Date.now() - conditions.olderThan * 24 * 60 * 60 * 1000);
      
      // Build query for Sequelize
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
      
      // Find affected media
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
      
      // Delete files and update database
      const mediaDeleted = [];
      let totalSizeFreed = 0;
      
      for (const file of filesToDelete) {
        try {
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
          console.error(`Error deleting ${file.path}:`, err);
        }
      }
      
      // Update deletion history
      await deletionHistory.update({
        mediaDeleted,
        totalSizeFreed
      });
    } else {
      // Otherwise, delete from Sonarr and Radarr directly
      console.log('Deleting from Sonarr and Radarr directly');
      
      const mediaDeleted = [];
      let totalSizeFreed = 0;
      
      // Delete from Sonarr if enabled and TV shows are included in mediaTypes
      if (sonarrEnabled && (mediaTypes.includes('show') || mediaTypes.length === 0)) {
        console.log('Deleting from Sonarr');
        
        try {
          const { url, apiKey } = settings.sonarr;
          
          // Get all series from Sonarr
          const seriesResponse = await makeRequestWithRetry(
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
          
          const series = seriesResponse.data;
          
          // For each series, get episodes
          for (const show of series) {
            // Skip if no files
            if (!show.hasFile) continue;
            
            // Check age condition
            if (conditions.olderThan) {
              const cutoffDate = new Date(Date.now() - conditions.olderThan * 24 * 60 * 60 * 1000);
              if (new Date(show.added) >= cutoffDate) continue;
            }
            
            // Get episodes for this series
            const episodesResponse = await makeRequestWithRetry(
              `${url}/api/v3/episode?seriesId=${show.id}&includeEpisodeFile=true`, 
              {
                method: 'get',
                headers: {
                  'X-Api-Key': apiKey,
                  'Accept': 'application/json'
                },
                timeout: 30000 // 30 second timeout
              }
            );
            
            const episodes = episodesResponse.data;
            const episodesWithFiles = episodes.filter(episode => episode.hasFile);
            
            // Check watch status condition
            if (conditions.watchedStatus === 'watched' && !show.statistics.percentOfEpisodes === 100) {
              continue;
            } else if (conditions.watchedStatus === 'unwatched' && show.statistics.percentOfEpisodes > 0) {
              continue;
            }
            
            // Check rating condition
            if (conditions.minRating !== undefined && show.ratings && show.ratings.value < conditions.minRating) {
              continue;
            }
            
            if (conditions.maxRating !== undefined && show.ratings && show.ratings.value > conditions.maxRating) {
              continue;
            }
            
            // Delete each episode file
            for (const episode of episodesWithFiles) {
              if (!episode.episodeFile) continue;
              
              // Check size condition
              if (conditions.minSize && episode.episodeFile.size < conditions.minSize) {
                continue;
              }
              
              try {
                // Delete the file from Sonarr
                await makeRequestWithRetry(
                  `${url}/api/v3/episodefile/${episode.episodeFile.id}`, 
                  {
                    method: 'delete',
                    headers: {
                      'X-Api-Key': apiKey,
                      'Accept': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                  }
                );
                
                // Add to deletion history
                mediaDeleted.push({
                  filename: episode.episodeFile.relativePath,
                  path: episode.episodeFile.path,
                  size: episode.episodeFile.size,
                  type: 'show'
                });
                
                totalSizeFreed += episode.episodeFile.size;
              } catch (deleteError) {
                console.error(`Error deleting episode file ${episode.episodeFile.id}:`, deleteError);
              }
            }
          }
        } catch (sonarrError) {
          console.error('Error deleting from Sonarr:', sonarrError);
        }
      }
      
      // Delete from Radarr if enabled and movies are included in mediaTypes
      if (radarrEnabled && (mediaTypes.includes('movie') || mediaTypes.length === 0)) {
        console.log('Deleting from Radarr');
        
        try {
          const { url, apiKey } = settings.radarr;
          
          // Get all movies from Radarr
          const moviesResponse = await makeRequestWithRetry(
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
          
          const movies = moviesResponse.data;
          
          // Filter movies based on conditions
          for (const movie of movies) {
            // Skip if no file
            if (!movie.hasFile) continue;
            
            // Check age condition
            if (conditions.olderThan) {
              const cutoffDate = new Date(Date.now() - conditions.olderThan * 24 * 60 * 60 * 1000);
              if (new Date(movie.added) >= cutoffDate) continue;
            }
            
            // Check watch status condition
            if (conditions.watchedStatus === 'watched' && !movie.movieFile.mediaInfo.isWatched) {
              continue;
            } else if (conditions.watchedStatus === 'unwatched' && movie.movieFile.mediaInfo.isWatched) {
              continue;
            }
            
            // Check rating condition
            if (conditions.minRating !== undefined && movie.ratings && movie.ratings.value < conditions.minRating) {
              continue;
            }
            
            if (conditions.maxRating !== undefined && movie.ratings && movie.ratings.value > conditions.maxRating) {
              continue;
            }
            
            // Check size condition
            if (conditions.minSize && movie.movieFile.size < conditions.minSize) {
              continue;
            }
            
            try {
              // Delete the file from Radarr
              await makeRequestWithRetry(
                `${url}/api/v3/moviefile/${movie.movieFile.id}`, 
                {
                  method: 'delete',
                  headers: {
                    'X-Api-Key': apiKey,
                    'Accept': 'application/json'
                  },
                  timeout: 30000 // 30 second timeout
                }
              );
              
              // Add to deletion history
              mediaDeleted.push({
                filename: movie.movieFile.relativePath,
                path: movie.movieFile.path,
                size: movie.movieFile.size,
                type: 'movie'
              });
              
              totalSizeFreed += movie.movieFile.size;
            } catch (deleteError) {
              console.error(`Error deleting movie file ${movie.movieFile.id}:`, deleteError);
            }
          }
        } catch (radarrError) {
          console.error('Error deleting from Radarr:', radarrError);
        }
      }
      
      // Update deletion history
      await deletionHistory.update({
        mediaDeleted,
        totalSizeFreed
      });
    }
    
    // Update rule's lastRun timestamp
    rule.lastRun = new Date();
    await rule.save();
    
    console.log(`Rule "${rule.name}" executed successfully`);
  } catch (err) {
    console.error(`Error executing rule "${rule.name}":`, err);
  }
  */
}

// Get deletion statistics for a specific rule
router.get('/:id/stats', async (req, res) => {
  try {
    const ruleId = req.params.id;
    
    // Get all deletion history for this rule
    const histories = await DeletionHistory.findAll({
      where: { ruleId }
    });
    
    // Calculate statistics
    let totalExecutions = histories.length;
    let totalMediaDeleted = 0;
    let totalSizeFreed = 0;
    
    histories.forEach(history => {
      // Count media items in the mediaDeleted JSON array
      totalMediaDeleted += (history.mediaDeleted || []).length;
      totalSizeFreed += parseInt(history.totalSizeFreed) || 0;
    });
    
    res.json({
      ruleId,
      totalExecutions,
      totalMediaDeleted,
      totalSizeFreed,
      // Convert bytes to GB for display
      totalSizeFreedGB: (totalSizeFreed / (1024 * 1024 * 1024)).toFixed(2)
    });
  } catch (err) {
    console.error('Error getting rule statistics:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get deletion statistics for all rules
router.get('/stats/all', async (req, res) => {
  try {
    // Get all rules
    const rules = await DeletionRule.findAll();
    
    // Get statistics for each rule
    const statsPromises = rules.map(async (rule) => {
      const histories = await DeletionHistory.findAll({
        where: { ruleId: rule.id }
      });
      
      let totalMediaDeleted = 0;
      let totalSizeFreed = 0;
      
      histories.forEach(history => {
        totalMediaDeleted += (history.mediaDeleted || []).length;
        totalSizeFreed += parseInt(history.totalSizeFreed) || 0;
      });
      
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        totalExecutions: histories.length,
        totalMediaDeleted,
        totalSizeFreed,
        totalSizeFreedGB: (totalSizeFreed / (1024 * 1024 * 1024)).toFixed(2)
      };
    });
    
    const allStats = await Promise.all(statsPromises);
    res.json(allStats);
  } catch (err) {
    console.error('Error getting all rules statistics:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

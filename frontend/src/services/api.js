import axios from 'axios';

// Base API URL - would be configured based on environment
const API_URL = 'http://localhost:5000/api';

// Create axios instance with base configuration
const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Media endpoints
export const mediaAPI = {
  // Get all media files with optional filtering
  getAll: (params = {}) => apiClient.get('/media', { params }),
  
  // Get media file by ID
  getById: (id) => apiClient.get(`/media/${id}`),
  
  // Delete media file
  delete: (id) => apiClient.delete(`/media/${id}`),
  
  // Protect media file from auto-deletion
  protect: (id, status) => apiClient.patch(`/media/${id}/protect`, { protected: status }),
  
  // Get media stats for dashboard
  getStats: () => apiClient.get('/media/stats')
};

// Deletion rules endpoints
export const rulesAPI = {
  // Get all rules
  getAll: () => apiClient.get('/rules'),
  
  // Get rule by ID
  getById: (id) => apiClient.get(`/rules/${id}`),
  
  // Create new rule
  create: (rule) => apiClient.post('/rules', rule),
  
  // Update rule
  update: (id, rule) => apiClient.put(`/rules/${id}`, rule),
  
  // Delete rule
  delete: (id) => apiClient.delete(`/rules/${id}`),
  
  // Run a specific rule
  run: (id) => apiClient.post(`/rules/${id}/run`),
  
  // Preview affected media for a rule without running it
  preview: (rule) => apiClient.post('/rules/preview', rule),
  
  // Get deletion statistics for a specific rule
  getStats: (id) => apiClient.get(`/rules/${id}/stats`),
  
  // Get deletion statistics for all rules
  getAllStats: () => apiClient.get('/rules/stats/all')
};

// Settings endpoints
export const settingsAPI = {
  // Get settings
  get: () => apiClient.get('/settings'),
  
  // Update settings
  update: (settings) => apiClient.put('/settings', settings)
};

// Scan endpoints
export const scanAPI = {
  // Start a media scan
  start: (directory) => apiClient.post('/scan', { directory })
};

// Cleanup endpoints 
export const cleanupAPI = {
  // Run cleanup based on rules
  run: (ruleIds = []) => apiClient.post('/cleanup', { ruleIds }),
  
  // Get cleanup history
  getHistory: () => apiClient.get('/cleanup/history')
};

// Plex endpoints
export const plexAPI = {
  // Test Plex server connection
  testConnection: (serverUrl, authToken) => 
    apiClient.post('/plex/test', { serverUrl, authToken }),
  
  // Sync libraries from Plex
  syncLibraries: (serverUrl, authToken) => 
    apiClient.post('/plex/sync', { serverUrl, authToken }),
  
  // Get sync status
  getSyncStatus: () => 
    apiClient.get('/plex/sync/status'),
  
  // Get all libraries
  getLibraries: () => 
    apiClient.get('/plex/libraries'),
  
  // Update library mapping
  updateLibrary: (id, data) => 
    apiClient.put(`/plex/libraries/${id}`, data),
    
  // Get month events for schedule
  getMonthEvents: (year, month) => 
    apiClient.get(`/schedule/${year}/${month}`)
};

// Error handler
apiClient.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error.response || error);
    return Promise.reject(error);
  }
);

// Local media manager endpoints
export const localMediaAPI = {
  // Get all local files
  getFiles: (params = {}) => apiClient.get('/local-media', { params }),
  
  // Scan directory for media files
  scanDirectory: (directory) => apiClient.post('/local-media/scan', { directory }),
  
  // Get scan progress
  getScanProgress: () => apiClient.get('/local-media/scan/progress'),
  
  // Reset scan status (for debugging)
  resetScanStatus: () => apiClient.post('/local-media/scan/reset'),
  
  // Match local files with Plex
  matchWithPlex: () => apiClient.post('/local-media/match-plex'),
  
  // Get file details
  getFileDetails: (id) => apiClient.get(`/local-media/${id}`),
  
  // Delete file
  deleteFile: (id) => apiClient.delete(`/local-media/${id}`),
  
  // Protect/unprotect file
  toggleProtection: (id, status) => apiClient.patch(`/local-media/${id}/protect`, { protected: status }),
  
  // Get path mappings
  getMappings: () => apiClient.get('/local-media/mappings'),
  
  // Add path mapping
  addMapping: (mapping) => apiClient.post('/local-media/mappings', mapping),
  
  // Update path mapping
  updateMapping: (id, mapping) => apiClient.put(`/local-media/mappings/${id}`, mapping),
  
  // Delete path mapping
  deleteMapping: (id) => apiClient.delete(`/local-media/mappings/${id}`)
};

// Integrations endpoints
export const integrationsAPI = {
  // Test Sonarr connection
  testSonarr: (config) => apiClient.post('/integrations/sonarr/test', config),
  
  // Get Sonarr series
  getSonarrSeries: () => apiClient.get('/integrations/sonarr/series'),
  
  // Get Sonarr series by ID
  getSonarrSeriesById: (id) => apiClient.get(`/integrations/sonarr/series/${id}`),
  
  // Delete Sonarr series file
  deleteSonarrFile: (seriesId, fileId) => apiClient.delete(`/integrations/sonarr/series/${seriesId}/file/${fileId}`),
  
  // Get Sonarr disk space
  getSonarrDiskSpace: () => apiClient.get('/integrations/sonarr/diskspace'),
  
  // Get Sonarr quality profiles
  getSonarrQualityProfiles: () => apiClient.get('/integrations/sonarr/qualityprofiles'),
  
  // Get Sonarr quality definitions
  getSonarrQualityDefinitions: () => apiClient.get('/integrations/sonarr/qualitydefinitions'),
  
  // Test Radarr connection
  testRadarr: (config) => apiClient.post('/integrations/radarr/test', config),
  
  // Get Radarr movies
  getRadarrMovies: () => apiClient.get('/integrations/radarr/movies'),
  
  // Get Radarr movie by ID
  getRadarrMovieById: (id) => apiClient.get(`/integrations/radarr/movies/${id}`),
  
  // Delete Radarr movie file
  deleteRadarrFile: (movieId, fileId) => apiClient.delete(`/integrations/radarr/movies/${movieId}/file/${fileId}`),
  
  // Get Radarr disk space
  getRadarrDiskSpace: () => apiClient.get('/integrations/radarr/diskspace'),
  
  // Get Radarr quality profiles
  getRadarrQualityProfiles: () => apiClient.get('/integrations/radarr/qualityprofiles'),
  
  // Get Radarr quality definitions
  getRadarrQualityDefinitions: () => apiClient.get('/integrations/radarr/qualitydefinitions'),
  
  // Test all integrations
  testAll: () => apiClient.post('/integrations/test-all')
};

// Sync endpoints for Sonarr and Radarr
export const syncAPI = {
  // Start a sync from Sonarr and Radarr (now optimized)
  start: () => apiClient.post('/sync/start'),
  
  // Get sync status
  getStatus: () => apiClient.get('/sync/status'),
  
  // Clear sync cache for fresh data
  clearCache: () => apiClient.post('/sync/clear-cache')
};

// Pending deletions endpoints
export const pendingDeletionsAPI = {
  // Get all pending deletions with pagination and filtering
  getAll: (params = {}) => apiClient.get('/pending-deletions', { params }),
  
  // Get pending deletion by ID
  getById: (id) => apiClient.get(`/pending-deletions/${id}`),
  
  // Approve a pending deletion
  approve: (id, data = {}) => apiClient.post(`/pending-deletions/${id}/approve`, data),
  
  // Cancel a pending deletion
  cancel: (id, data = {}) => apiClient.post(`/pending-deletions/${id}/cancel`, data),
  
  // Bulk approve pending deletions
  bulkApprove: (data) => apiClient.post('/pending-deletions/bulk-approve', data),
  
  // Bulk cancel pending deletions
  bulkCancel: (data) => apiClient.post('/pending-deletions/bulk-cancel', data),
  
  // Get pending deletions summary/statistics
  getSummary: () => apiClient.get('/pending-deletions/stats/summary'),
  
  // Execute approved pending deletions immediately
  execute: () => apiClient.post('/pending-deletions/execute'),
  
  // Get execution status
  getExecutionStatus: () => apiClient.get('/pending-deletions/execution/status'),
  
  // Start scheduled execution
  startScheduledExecution: (intervalMinutes = 60) => 
    apiClient.post('/pending-deletions/execution/schedule/start', { intervalMinutes }),
  
  // Stop scheduled execution
  stopScheduledExecution: () => apiClient.post('/pending-deletions/execution/schedule/stop')
};

// Notifications endpoints
export const notificationsAPI = {
  // Get all notifications
  getAll: () => apiClient.get('/notifications'),
  
  // Get notification summary
  getSummary: () => apiClient.get('/notifications/summary'),
  
  // Mark notification as read
  markAsRead: (id) => apiClient.post(`/notifications/${id}/read`),
  
  // Mark all notifications as read
  markAllAsRead: () => apiClient.post('/notifications/read-all'),
  
  // Remove notification
  remove: (id) => apiClient.delete(`/notifications/${id}`),
  
  // Clear all notifications
  clearAll: () => apiClient.delete('/notifications'),
  
  // Add test notification
  addTest: (notification) => apiClient.post('/notifications/test', notification)
};

export default {
  media: mediaAPI,
  rules: rulesAPI,
  settings: settingsAPI,
  scan: scanAPI,
  cleanup: cleanupAPI,
  plex: plexAPI,
  localMedia: localMediaAPI,
  integrations: integrationsAPI,
  sync: syncAPI,
  pendingDeletions: pendingDeletionsAPI,
  notifications: notificationsAPI
};

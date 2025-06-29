// src/components/DeletionRules/CreateRule.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Box, Typography, Button, Paper, AppBar, Toolbar, IconButton,
  TextField, FormControl, InputLabel, Select, MenuItem, Chip,
  FormControlLabel, Switch, Grid, Alert, Snackbar
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import SyncIcon from '@mui/icons-material/Sync';
import StorageIcon from '@mui/icons-material/Storage';
import { CircularProgress } from '@mui/material';
import api from '../../services/api';
import RuleConditions from './RuleConditions';
import RulePreview from './RulePreview';
import { debounce } from 'lodash';

const CreateRule = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // For editing existing rules
  const isEditing = Boolean(id);

  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentRule, setCurrentRule] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [newRule, setNewRule] = useState({
    name: 'New Rule',
    enabled: true,
    conditions: {
      minAge: 90,
      watchStatus: 'any',
      minRating: 0,
      minSize: 0,
      maxSize: 0,
      minQuality: '',
      maxQuality: '',
      resolution: 'any',
      qualityProfile: 'any',
      seriesStatus: 'any',
      network: 'any',
      monitoringStatus: 'any',
      downloadStatus: 'any',
      tags: '',
      watchCount: 'any',
      lastWatched: 'any',
      titleContains: '',
      titleExact: ''
    },
    filtersEnabled: {
      age: false,
      quality: false,
      enhancedQuality: false,
      size: false,
      status: false,
      title: false,
      plexData: false,
      mediaSpecific: false,
      arrIntegration: false
    },
    schedule: {
      enabled: false,
      frequency: 'manual',
      interval: 1,
      unit: 'days',
      time: '02:00'
    },
    deletionStrategy: {
      sonarr: 'file_only',
      radarr: 'file_only',
      deleteFiles: true,
      addImportExclusion: false
    },
    libraries: ['Movies', 'TV Shows']
  });

  // Preview states
  const [affectedMedia, setAffectedMedia] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewTab, setPreviewTab] = useState('affected');
  const [previewStats, setPreviewStats] = useState({
    totalSize: 0,
    byType: { movie: 0, show: 0, other: 0 },
    byWatchStatus: { watched: 0, unwatched: 0, 'in-progress': 0 }
  });

  // Pagination state
  const [page, setPage] = useState(1);
  const [itemsPerPage] = useState(50);
  
  // Request cancellation
  const abortControllerRef = useRef(null);

  // Load existing rule if editing
  useEffect(() => {
    if (isEditing && id) {
      loadRule(id);
    }
  }, [isEditing, id]);

  const loadRule = async (ruleId) => {
    try {
      setLoading(true);
      const response = await api.rules.getById(ruleId);
      if (response.data) {
        const rule = response.data;
        
        // Transform the backend data to match frontend expectations
        const transformedRule = {
          id: rule.id,
          name: rule.name || 'Untitled Rule',
          enabled: rule.enabled !== undefined ? rule.enabled : true,
          conditions: {
            minAge: rule.conditions?.minAge || rule.conditions?.olderThan || 90,
            watchStatus: rule.conditions?.watchStatus || rule.conditions?.watchedStatus || 'any',
            minRating: rule.conditions?.minRating || 0,
            minSize: rule.conditions?.minSize || 0,
            maxSize: rule.conditions?.maxSize || 0,
            minQuality: rule.conditions?.minQuality || '',
            maxQuality: rule.conditions?.maxQuality || '',
            resolution: rule.conditions?.resolution || 'any',
            qualityProfile: rule.conditions?.qualityProfile || 'any',
            seriesStatus: rule.conditions?.seriesStatus || 'any',
            network: rule.conditions?.network || 'any',
            monitoringStatus: rule.conditions?.monitoringStatus || 'any',
            downloadStatus: rule.conditions?.downloadStatus || 'any',
            tags: rule.conditions?.tags || '',
            watchCount: rule.conditions?.watchCount || 'any',
            lastWatched: rule.conditions?.lastWatched || 'any',
            titleContains: rule.conditions?.titleContains || '',
            titleExact: rule.conditions?.titleExact || ''
          },
          filtersEnabled: rule.filtersEnabled || {
            age: false,
            quality: false,
            enhancedQuality: false,
            size: false,
            status: false,
            title: false,
            plexData: false,
            mediaSpecific: false,
            arrIntegration: false
          },
          schedule: rule.schedule || {
            enabled: false,
            frequency: 'manual',
            interval: 1,
            unit: 'days',
            time: '02:00'
          },
          deletionStrategy: rule.deletionStrategy || {
            sonarr: 'file_only',
            radarr: 'file_only',
            deleteFiles: true,
            addImportExclusion: false
          },
          libraries: rule.mediaTypes ? 
            rule.mediaTypes.map(type => 
              type === 'movie' ? 'Movies' : 
              type === 'show' ? 'TV Shows' : 'Other'
            ) : ['Movies', 'TV Shows']
        };
        
        console.log('Loaded rule:', transformedRule);
        
        setCurrentRule(transformedRule);
        setNewRule(transformedRule);
        
        // Fetch preview with the correct data
        if (transformedRule.conditions && transformedRule.libraries) {
          fetchAffectedMedia(transformedRule.conditions, transformedRule.libraries);
        }
      }
    } catch (error) {
      console.error('Error loading rule:', error);
      // Set an error state or show a message to the user
    } finally {
      setLoading(false);
    }
  };

  // Fetch preview data with request cancellation
  const fetchAffectedMedia = useCallback(async (conditions, libraries) => {
    try {
      // Cancel previous request if it exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      setPreviewLoading(true);
      setPreviewError(null);
      
      const response = await api.rules.preview({
        conditions,
        libraries,
        filtersEnabled: newRule.filtersEnabled
      });
      
      // Check if request was cancelled
      if (abortControllerRef.current.signal.aborted) {
        return;
      }
      
      if (response.data && response.data.success) {
        setAffectedMedia(response.data.affectedMedia || []);
        setPreviewStats({
          totalSize: response.data.totalSize || 0,
          byType: response.data.stats?.byType || { movie: 0, show: 0, other: 0 },
          byWatchStatus: response.data.stats?.byWatchStatus || { watched: 0, unwatched: 0, 'in-progress': 0 }
        });
      } else {
        setAffectedMedia([]);
        setPreviewStats({
          totalSize: 0,
          byType: { movie: 0, show: 0, other: 0 },
          byWatchStatus: { watched: 0, unwatched: 0, 'in-progress': 0 }
        });
        setPreviewError(response.data?.error || 'Failed to fetch preview data');
      }
    } catch (error) {
      // Don't show errors for cancelled requests
      if (error.name === 'AbortError') {
        return;
      }
      
      console.error('Error fetching affected media:', error);
      setAffectedMedia([]);
      setPreviewStats({
        totalSize: 0,
        byType: { movie: 0, show: 0, other: 0 },
        byWatchStatus: { watched: 0, unwatched: 0, 'in-progress': 0 }
      });
      setPreviewError(error.message || 'Failed to fetch preview data');
    } finally {
      setPreviewLoading(false);
    }
  }, [newRule.filtersEnabled]);

  // Stable debounced function - only recreate if fetch function changes
  const debouncedFetchAffectedMedia = useMemo(
    () => debounce((conditions, libraries) => {
      fetchAffectedMedia(conditions, libraries);
    }, 300), // Reduced from 500ms for better responsiveness
    [fetchAffectedMedia]
  );

  // Cancel pending debounced calls on unmount
  useEffect(() => {
    return () => {
      debouncedFetchAffectedMedia.cancel();
    };
  }, [debouncedFetchAffectedMedia]);

  // Update preview when conditions change
  useEffect(() => {
    // Only trigger if any enabled filters have actual values
    const hasActiveFilters = Object.keys(newRule.filtersEnabled).some(key => 
      newRule.filtersEnabled[key] && newRule.conditions[key] !== undefined && newRule.conditions[key] !== ''
    );
    
    if (hasActiveFilters || newRule.libraries.length > 0) {
      debouncedFetchAffectedMedia(newRule.conditions, newRule.libraries);
    }
  }, [newRule.conditions, newRule.libraries, newRule.filtersEnabled, debouncedFetchAffectedMedia]);

  // Memoized handlers to prevent unnecessary re-renders
  const handleRuleChange = useCallback((field, value) => {
    setNewRule(prev => {
      if (prev[field] === value) return prev; // Prevent unnecessary updates
      return { ...prev, [field]: value };
    });
  }, []);

  const handleConditionChange = useCallback((field, value) => {
    setNewRule(prev => {
      if (prev.conditions[field] === value) return prev; // Prevent unnecessary updates
      return {
        ...prev,
        conditions: { ...prev.conditions, [field]: value }
      };
    });
  }, []);

  const handleFilterEnableChange = useCallback((filter, enabled) => {
    setNewRule(prev => {
      if (prev.filtersEnabled[filter] === enabled) return prev; // Prevent unnecessary updates
      return {
        ...prev,
        filtersEnabled: { ...prev.filtersEnabled, [filter]: enabled }
      };
    });
  }, []);

  // Sync data
  const handleSync = async () => {
    try {
      setSyncing(true);
      await api.sync.start();
      
      const checkSyncStatus = async () => {
        try {
          const response = await api.sync.getStatus();
          if (response.data.status === 'completed') {
            setSyncing(false);
            fetchAffectedMedia(newRule.conditions, newRule.libraries);
          } else if (response.data.status === 'error') {
            setSyncing(false);
            console.error('Sync error:', response.data.error);
          } else {
            setTimeout(checkSyncStatus, 2000);
          }
        } catch (statusError) {
          console.error('Error checking sync status:', statusError);
          setSyncing(false);
        }
      };
      
      checkSyncStatus();
    } catch (error) {
      console.error('Error syncing data:', error);
      setSyncing(false);
    }
  };

  // Save rule
  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Transform frontend data to backend format
      const ruleData = {
        name: newRule.name,
        enabled: newRule.enabled,
        conditions: {
          // Map frontend field names to backend expectations
          minAge: newRule.conditions.minAge,
          olderThan: newRule.conditions.minAge, // Backend might expect this field name
          watchStatus: newRule.conditions.watchStatus,
          watchedStatus: newRule.conditions.watchStatus, // Backend might expect this field name
          minRating: newRule.conditions.minRating,
          minSize: newRule.conditions.minSize,
          maxSize: newRule.conditions.maxSize,
          minQuality: newRule.conditions.minQuality,
          maxQuality: newRule.conditions.maxQuality,
          resolution: newRule.conditions.resolution,
          qualityProfile: newRule.conditions.qualityProfile,
          seriesStatus: newRule.conditions.seriesStatus,
          network: newRule.conditions.network,
          monitoringStatus: newRule.conditions.monitoringStatus,
          downloadStatus: newRule.conditions.downloadStatus,
          tags: newRule.conditions.tags,
          watchCount: newRule.conditions.watchCount,
          lastWatched: newRule.conditions.lastWatched,
          titleContains: newRule.conditions.titleContains,
          titleExact: newRule.conditions.titleExact
        },
        filtersEnabled: newRule.filtersEnabled,
        schedule: newRule.schedule,
        deletionStrategy: newRule.deletionStrategy,
        mediaTypes: newRule.libraries?.map(lib => 
          lib === 'Movies' ? 'movie' : 
          lib === 'TV Shows' ? 'show' : 
          lib.toLowerCase()
        ) || []
      };
      
      console.log('Saving rule data:', ruleData);
      
      let response;
      if (isEditing) {
        response = await api.rules.update(id, ruleData);
        console.log('Update response:', response.data);
        setSuccessMessage('Rule updated successfully!');
      } else {
        response = await api.rules.create(ruleData);
        console.log('Create response:', response.data);
        setSuccessMessage('Rule created successfully!');
      }
      
      // Show success message briefly before navigating
      setTimeout(() => {
        navigate('/rules', { replace: true, state: { refreshRules: true } });
      }, 1500);
    } catch (error) {
      console.error('Error saving rule:', error);
      console.error('Error details:', error.response?.data);
      setErrorMessage(
        error.response?.data?.message || 
        `Failed to ${isEditing ? 'update' : 'create'} rule. Please try again.`
      );
    } finally {
      setSaving(false);
    }
  };

  // Pagination
  const getCurrentPageItems = () => {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return affectedMedia.slice(startIndex, endIndex);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Top App Bar */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ minHeight: '56px' }}>
          <IconButton 
            edge="start" 
            onClick={() => navigate('/rules')}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
          
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {isEditing ? `Edit Rule: ${currentRule?.name || newRule.name}` : 'Create New Rule'}
          </Typography>

          <IconButton 
            onClick={handleSync} 
            disabled={syncing}
            color="primary"
            sx={{ mr: 2 }}
          >
            {syncing ? <CircularProgress size={24} /> : <SyncIcon />}
          </IconButton>

          <Button
            variant="contained"
            onClick={handleSave}
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            disabled={saving}
          >
            {isEditing ? 'Update Rule' : 'Create Rule'}
          </Button>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      {loading ? (
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          flexDirection: 'column',
          gap: 2
        }}>
          <CircularProgress size={60} />
          <Typography variant="h6" color="text.secondary">
            Loading rule...
          </Typography>
        </Box>
      ) : (
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          gap: 2, 
          p: 2,
          overflow: 'hidden',
          maxHeight: 'calc(100vh - 56px)' // Account for toolbar height
        }}>
        {/* Left Panel - Rule Configuration */}
        <Box sx={{ 
          flex: 1,
          minWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <Box sx={{ 
            flex: 1, 
            overflow: 'auto',
            pr: 1,
            '&::-webkit-scrollbar': {
              width: '8px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'rgba(0,0,0,0.1)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '4px',
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'rgba(0,0,0,0.5)',
            }
          }}>
            {/* Rule Name and Status */}
            <Paper sx={{ 
              mb: 2, 
              overflow: 'hidden'
            }}>
              <Box sx={{ 
                p: 2, 
                borderBottom: 1, 
                borderColor: 'divider'
              }}>
                <Typography variant="h6">Rule Configuration</Typography>
              </Box>
              <Box sx={{ p: 2 }}>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={8}>
                    <TextField
                      label="Rule Name"
                      fullWidth
                      value={newRule.name}
                      onChange={(e) => handleRuleChange('name', e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={newRule.enabled}
                          onChange={(e) => handleRuleChange('enabled', e.target.checked)}
                        />
                      }
                      label="Enable Rule"
                      sx={{ height: '100%', display: 'flex', alignItems: 'center' }}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Paper>

            {/* Target Libraries */}
            <Paper sx={{ 
              mb: 2, 
              overflow: 'hidden'
            }}>
              <Box sx={{ 
                p: 2, 
                borderBottom: 1, 
                borderColor: 'divider'
              }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                  <StorageIcon sx={{ mr: 1 }} />
                  Target Libraries
                </Typography>
              </Box>
              <Box sx={{ p: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Libraries</InputLabel>
                  <Select
                    multiple
                    value={newRule.libraries}
                    label="Libraries"
                    onChange={(e) => handleRuleChange('libraries', e.target.value)}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => (
                          <Chip key={value} label={value} />
                        ))}
                      </Box>
                    )}
                  >
                    <MenuItem value="Movies">Movies</MenuItem>
                    <MenuItem value="TV Shows">TV Shows</MenuItem>
                    <MenuItem value="Other">Other</MenuItem>
                  </Select>
                </FormControl>
                
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Select which libraries this rule will apply to. Rules can target multiple libraries.
                </Typography>
              </Box>
            </Paper>

            {/* Rule Conditions */}
            <RuleConditions 
              conditions={newRule.conditions}
              filtersEnabled={newRule.filtersEnabled}
              onChange={handleConditionChange}
              onFilterEnableChange={handleFilterEnableChange}
            />
          </Box>
        </Box>

        {/* Right Panel - Live Preview */}
        <Box sx={{ 
          flex: 1,
          minWidth: '400px',
          height: '100%'
        }}>
          <RulePreview 
            affectedMedia={affectedMedia}
            previewLoading={previewLoading}
            previewError={previewError}
            previewTab={previewTab}
            previewStats={previewStats}
            ruleConditions={newRule.conditions}
            filtersEnabled={newRule.filtersEnabled}
            page={page}
            itemsPerPage={itemsPerPage}
            onTabChange={(_, newTab) => setPreviewTab(newTab)}
            onPageChange={(_, newPage) => setPage(newPage)}
            getCurrentPageItems={getCurrentPageItems}
          />
        </Box>
      </Box>
      )}

      {/* Success/Error Messages */}
      <Snackbar 
        open={!!successMessage} 
        autoHideDuration={6000} 
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Snackbar 
        open={!!errorMessage} 
        autoHideDuration={6000} 
        onClose={() => setErrorMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setErrorMessage('')} severity="error" sx={{ width: '100%' }}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CreateRule;
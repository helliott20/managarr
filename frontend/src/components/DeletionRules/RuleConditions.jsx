// src/components/DeletionRules/RuleConditions.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Box, Typography, Paper, Grid, FormControl, InputLabel, 
  Select, MenuItem, Slider, Divider, TextField, Switch, FormControlLabel, Chip, InputAdornment,
  CircularProgress, Alert
} from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import VisibilityIcon from '@mui/icons-material/Visibility';
import StorageIcon from '@mui/icons-material/Storage';
import TvIcon from '@mui/icons-material/Tv';
import BusinessIcon from '@mui/icons-material/Business';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import HdIcon from '@mui/icons-material/Hd';
import TitleIcon from '@mui/icons-material/Title';
import api from '../../services/api';

const RuleConditions = ({ conditions, onChange, filtersEnabled, onFilterEnableChange }) => {
  const [qualityProfiles, setQualityProfiles] = useState([]);
  const [qualityDefinitions, setQualityDefinitions] = useState([]);
  const [loading, setLoading] = useState({
    qualityProfiles: false,
    qualityDefinitions: false
  });
  const [errors, setErrors] = useState({});

  // Fetch quality profiles and definitions on component mount
  useEffect(() => {
    const fetchQualityData = async () => {
      setLoading(prev => ({ ...prev, qualityProfiles: true, qualityDefinitions: true }));
      
      try {
        // Fetch from both Sonarr and Radarr and combine results
        const [sonarrProfiles, radarrProfiles, sonarrDefinitions, radarrDefinitions] = await Promise.allSettled([
          api.integrations.getSonarrQualityProfiles(),
          api.integrations.getRadarrQualityProfiles(),
          api.integrations.getSonarrQualityDefinitions(),
          api.integrations.getRadarrQualityDefinitions()
        ]);

        // Combine and deduplicate quality profiles
        const combinedProfiles = [];
        const profileNames = new Set();
        
        [sonarrProfiles, radarrProfiles].forEach(result => {
          if (result.status === 'fulfilled' && result.value?.data?.success) {
            result.value.data.qualityProfiles?.forEach(profile => {
              if (!profileNames.has(profile.name)) {
                profileNames.add(profile.name);
                combinedProfiles.push({
                  id: profile.id,
                  name: profile.name,
                  source: result === sonarrProfiles ? 'sonarr' : 'radarr'
                });
              }
            });
          }
        });

        // Combine and deduplicate quality definitions (resolutions)
        const combinedDefinitions = [];
        const definitionTitles = new Set();
        
        [sonarrDefinitions, radarrDefinitions].forEach(result => {
          if (result.status === 'fulfilled' && result.value?.data?.success) {
            result.value.data.qualityDefinitions?.forEach(definition => {
              if (!definitionTitles.has(definition.title)) {
                definitionTitles.add(definition.title);
                combinedDefinitions.push({
                  id: definition.id,
                  title: definition.title,
                  resolution: definition.resolution,
                  source: result === sonarrDefinitions ? 'sonarr' : 'radarr'
                });
              }
            });
          }
        });

        setQualityProfiles(combinedProfiles);
        setQualityDefinitions(combinedDefinitions);
        setErrors({});
        
      } catch (error) {
        console.error('Error fetching quality data:', error);
        setErrors({
          qualityData: 'Failed to load quality profiles and definitions. Using default values.'
        });
        // Fallback to default values if API calls fail
        setQualityProfiles([]);
        setQualityDefinitions([]);
      } finally {
        setLoading(prev => ({ ...prev, qualityProfiles: false, qualityDefinitions: false }));
      }
    };

    fetchQualityData();
  }, []);

  // Get available resolutions from quality definitions
  const getAvailableResolutions = () => {
    if (qualityDefinitions.length === 0) {
      // Fallback resolutions if API data not available
      return [
        { value: 'any', label: 'Any Resolution' },
        { value: '4K', label: '4K (3840×2160)' },
        { value: '1080p', label: '1080p (1920×1080)' },
        { value: '720p', label: '720p (1280×720)' },
        { value: '480p', label: '480p (854×480)' },
        { value: 'other', label: 'Other Resolution' }
      ];
    }

    const resolutions = [{ value: 'any', label: 'Any Resolution' }];
    qualityDefinitions.forEach(def => {
      if (def.resolution) {
        resolutions.push({
          value: def.title,
          label: `${def.title} (${def.resolution})`
        });
      } else {
        resolutions.push({
          value: def.title,
          label: def.title
        });
      }
    });
    
    return resolutions;
  };

  // Get available quality profiles
  const getAvailableQualityProfiles = () => {
    if (qualityProfiles.length === 0) {
      // Fallback quality profiles if API data not available
      return [
        { value: 'any', label: 'Any Profile' },
        { value: 'Ultra-HD', label: 'Ultra-HD (4K)' },
        { value: 'HD-1080p', label: 'HD-1080p' },
        { value: 'HD-720p', label: 'HD-720p' },
        { value: 'SD', label: 'Standard Definition' },
        { value: 'WEBDL-1080p', label: 'WEBDL-1080p' },
        { value: 'Bluray-1080p', label: 'Bluray-1080p' }
      ];
    }

    const profiles = [{ value: 'any', label: 'Any Profile' }];
    qualityProfiles.forEach(profile => {
      profiles.push({
        value: profile.name,
        label: `${profile.name} (${profile.source})` 
      });
    });
    
    return profiles;
  };

  // Handle condition changes
  const handleConditionChange = (field, value) => {
    onChange(field, value);
  };

  // Handle filter toggle
  const handleFilterToggle = (filter) => {
    const updatedFilters = { ...filtersEnabled, [filter]: !filtersEnabled[filter] };
    onFilterEnableChange(filter, updatedFilters[filter]);
  };

  return (
    <Paper sx={{ 
      overflow: 'hidden'
    }}>
      <Box sx={{ 
        p: 2, 
        borderBottom: 1, 
        borderColor: 'divider'
      }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
          <TuneIcon sx={{ mr: 1 }} />
          Conditions
        </Typography>
      </Box>
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
      
      {/* Media Status Filter */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3, elevation: 1, borderRadius: 2 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          gap: { xs: 1, sm: 0 },
          mb: 2 
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <VisibilityIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography 
              variant="subtitle2"
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.9rem', sm: '1rem' }
              }}
            >
              Media Status Filter
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={filtersEnabled.status}
                onChange={() => handleFilterToggle('status')}
                size="small"
              />
            }
            label="Enable"
            sx={{ 
              ml: { xs: 0, sm: 'auto' },
              '& .MuiFormControlLabel-label': {
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }
            }}
          />
        </Box>
        <Divider sx={{ mb: 3 }} />
        {filtersEnabled.status && (
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            <Grid item xs={12}>
              <FormControl 
                fullWidth
                size="small"
                sx={{
                  '& .MuiInputLabel-root': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  },
                  '& .MuiSelect-select': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  }
                }}
              >
                <InputLabel>Watch Status</InputLabel>
                <Select
                  value={conditions.watchStatus || 'any'}
                  label="Watch Status"
                  onChange={(e) => handleConditionChange('watchStatus', e.target.value)}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        maxHeight: 300,
                        '& .MuiMenuItem-root': {
                          fontSize: { xs: '0.875rem', sm: '1rem' },
                          minHeight: { xs: 40, sm: 48 }
                        }
                      }
                    }
                  }}
                >
                  <MenuItem value="any">Any Status</MenuItem>
                  <MenuItem value="unwatched">Unwatched</MenuItem>
                  <MenuItem value="watched">Watched</MenuItem>
                  <MenuItem value="in-progress">In Progress</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        )}
      </Paper>
      
      {/* Title Filter */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3, elevation: 1, borderRadius: 2 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          gap: { xs: 1, sm: 0 },
          mb: 2 
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <TitleIcon sx={{ mr: 1, color: 'secondary.main' }} />
            <Typography 
              variant="subtitle2"
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.9rem', sm: '1rem' }
              }}
            >
              Title Filter
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={filtersEnabled.title}
                onChange={() => handleFilterToggle('title')}
                size="small"
              />
            }
            label="Enable"
            sx={{ 
              ml: { xs: 0, sm: 'auto' },
              '& .MuiFormControlLabel-label': {
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }
            }}
          />
        </Box>
        <Divider sx={{ mb: 3 }} />
        {filtersEnabled.title && (
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Title Contains"
                value={conditions.titleContains || ''}
                onChange={(e) => handleConditionChange('titleContains', e.target.value)}
                size="small"
                placeholder="Search for titles containing..."
                helperText="Matches titles that contain this text (case-insensitive)"
                sx={{
                  '& .MuiInputBase-input': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  },
                  '& .MuiInputLabel-root': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  },
                  '& .MuiFormHelperText-root': {
                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                  }
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Exact Title Match"
                value={conditions.titleExact || ''}
                onChange={(e) => handleConditionChange('titleExact', e.target.value)}
                size="small"
                placeholder="Exact title match..."
                helperText="Matches titles exactly (case-insensitive)"
                sx={{
                  '& .MuiInputBase-input': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  },
                  '& .MuiInputLabel-root': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  },
                  '& .MuiFormHelperText-root': {
                    fontSize: { xs: '0.75rem', sm: '0.875rem' }
                  }
                }}
              />
            </Grid>
          </Grid>
        )}
      </Paper>
      
      {/* Age Criteria */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3, elevation: 1, borderRadius: 2 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          gap: { xs: 1, sm: 0 },
          mb: 2 
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <AccessTimeIcon sx={{ mr: 1, color: 'warning.main' }} />
            <Typography 
              variant="subtitle2"
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.9rem', sm: '1rem' }
              }}
            >
              Age Filter
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={filtersEnabled.age}
                onChange={() => handleFilterToggle('age')}
                size="small"
              />
            }
            label="Enable"
            sx={{ 
              ml: { xs: 0, sm: 'auto' },
              '& .MuiFormControlLabel-label': {
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }
            }}
          />
        </Box>
        <Divider sx={{ mb: 3 }} />
        {filtersEnabled.age && (
          <Grid container spacing={{ xs: 2, sm: 3 }} alignItems="center">
            <Grid item xs={12} sm={8}>
              <Box sx={{ px: 1 }}>
                <Slider
                  value={conditions.minAge || 0}
                  onChange={(_, value) => handleConditionChange('minAge', value)}
                  min={0}
                  max={3650}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(value) => `${value} days`}
                  sx={{
                    '& .MuiSlider-valueLabel': {
                      fontSize: { xs: '0.75rem', sm: '0.875rem' }
                    }
                  }}
                />
              </Box>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                type="number"
                label="Minimum Age (days)"
                value={conditions.minAge || 0}
                onChange={(e) => handleConditionChange('minAge', parseInt(e.target.value) || 0)}
                slotProps={{
                  input: {
                    endAdornment: <InputAdornment position="end">days</InputAdornment>,
                  },
                  inputLabel: {
                    sx: { fontSize: { xs: '0.875rem', sm: '1rem' } }
                  }
                }}
                size="small"
                sx={{
                  '& .MuiInputBase-input': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  }
                }}
              />
            </Grid>
          </Grid>
        )}
      </Paper>
      
      <Divider sx={{ my: 2 }} />
      
      {/* Quality Criteria */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3, elevation: 1, borderRadius: 2 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          gap: { xs: 1, sm: 0 },
          mb: 2 
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <HdIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography 
              variant="subtitle2"
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.9rem', sm: '1rem' }
              }}
            >
              Quality & Resolution Filters
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={filtersEnabled.quality || filtersEnabled.enhancedQuality}
                onChange={() => {
                  const isCurrentlyEnabled = filtersEnabled.quality || filtersEnabled.enhancedQuality;
                  handleFilterToggle('quality');
                  onFilterEnableChange('enhancedQuality', !isCurrentlyEnabled);
                }}
                size="small"
              />
            }
            label="Enable"
            sx={{ 
              ml: { xs: 0, sm: 'auto' },
              '& .MuiFormControlLabel-label': {
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }
            }}
          />
        </Box>
        <Divider sx={{ mb: 3 }} />
        {errors.qualityData && (
          <Alert 
            severity="warning" 
            sx={{ mb: 2, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
          >
            {errors.qualityData}
          </Alert>
        )}
        {(filtersEnabled.quality || filtersEnabled.enhancedQuality) && (
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            <Grid item xs={12} md={6}>
              <FormControl 
                fullWidth 
                size="small"
                sx={{
                  '& .MuiInputLabel-root': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  },
                  '& .MuiSelect-select': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  }
                }}
              >
                <InputLabel>Resolution</InputLabel>
                <Select
                  value={conditions.resolution || 'any'}
                  label="Resolution"
                  onChange={(e) => handleConditionChange('resolution', e.target.value)}
                  disabled={loading.qualityDefinitions || (!filtersEnabled.quality && !filtersEnabled.enhancedQuality)}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        maxHeight: 300,
                        '& .MuiMenuItem-root': {
                          fontSize: { xs: '0.875rem', sm: '1rem' },
                          minHeight: { xs: 40, sm: 48 }
                        }
                      }
                    }
                  }}
                  startAdornment={loading.qualityDefinitions && (
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                  )}
                >
                  {getAvailableResolutions().map((resolution) => (
                    <MenuItem key={resolution.value} value={resolution.value}>
                      {resolution.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl 
                fullWidth 
                size="small"
                sx={{
                  '& .MuiInputLabel-root': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  },
                  '& .MuiSelect-select': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  }
                }}
              >
                <InputLabel>Quality Profile</InputLabel>
                <Select
                  value={conditions.qualityProfile || 'any'}
                  label="Quality Profile"
                  onChange={(e) => handleConditionChange('qualityProfile', e.target.value)}
                  disabled={loading.qualityProfiles || (!filtersEnabled.quality && !filtersEnabled.enhancedQuality)}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        maxHeight: 300,
                        '& .MuiMenuItem-root': {
                          fontSize: { xs: '0.875rem', sm: '1rem' },
                          minHeight: { xs: 40, sm: 48 }
                        }
                      }
                    }
                  }}
                  startAdornment={loading.qualityProfiles && (
                    <CircularProgress size={20} sx={{ mr: 1 }} />
                  )}
                >
                  {getAvailableQualityProfiles().map((profile) => (
                    <MenuItem key={profile.value} value={profile.value}>
                      {profile.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        )}
      </Paper>
      
      {/* Size Criteria */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3, elevation: 1, borderRadius: 2 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          gap: { xs: 1, sm: 0 },
          mb: 2 
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <StorageIcon sx={{ mr: 1, color: 'info.main' }} />
            <Typography 
              variant="subtitle2"
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.9rem', sm: '1rem' }
              }}
            >
              File Size Filter
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={filtersEnabled.size}
                onChange={() => handleFilterToggle('size')}
                size="small"
              />
            }
            label="Enable"
            sx={{ 
              ml: { xs: 0, sm: 'auto' },
              '& .MuiFormControlLabel-label': {
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }
            }}
          />
        </Box>
        <Divider sx={{ mb: 3 }} />
        {filtersEnabled.size && (
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Minimum Size (GB)"
                value={conditions.minSize || ''}
                onChange={(e) => handleConditionChange('minSize', parseFloat(e.target.value) || 0)}
                slotProps={{
                  input: {
                    endAdornment: <InputAdornment position="end">GB</InputAdornment>,
                  },
                  inputLabel: {
                    sx: { fontSize: { xs: '0.875rem', sm: '1rem' } }
                  }
                }}
                size="small"
                sx={{
                  '& .MuiInputBase-input': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  }
                }}
                placeholder="0 = Any size"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Maximum Size (GB)"
                value={conditions.maxSize || ''}
                onChange={(e) => handleConditionChange('maxSize', parseFloat(e.target.value) || 0)}
                slotProps={{
                  input: {
                    endAdornment: <InputAdornment position="end">GB</InputAdornment>,
                  },
                  inputLabel: {
                    sx: { fontSize: { xs: '0.875rem', sm: '1rem' } }
                  }
                }}
                size="small"
                sx={{
                  '& .MuiInputBase-input': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  }
                }}
                placeholder="0 = No limit"
              />
            </Grid>
          </Grid>
        )}
      </Paper>
      
      {/* Plex Watch Data Filters */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3, elevation: 1, borderRadius: 2 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'flex-start', sm: 'center' }, 
          gap: { xs: 1, sm: 0 },
          mb: 2 
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
            <PlayCircleOutlineIcon sx={{ mr: 1, color: 'success.main' }} />
            <Typography 
              variant="subtitle2"
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.9rem', sm: '1rem' }
              }}
            >
              Plex Watch Data
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={filtersEnabled.plexData || false}
                onChange={(e) => onFilterEnableChange('plexData', e.target.checked)}
                size="small"
              />
            }
            label="Enable"
            sx={{ 
              ml: { xs: 0, sm: 'auto' },
              '& .MuiFormControlLabel-label': {
                fontSize: { xs: '0.875rem', sm: '1rem' }
              }
            }}
          />
        </Box>
        <Divider sx={{ mb: 3 }} />
        {filtersEnabled.plexData && (
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            <Grid item xs={12} md={6}>
              <FormControl 
                fullWidth 
                size="small"
                sx={{
                  '& .MuiInputLabel-root': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  },
                  '& .MuiSelect-select': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  }
                }}
              >
                <InputLabel>Watch Count</InputLabel>
                <Select
                  value={conditions.watchCount || 'any'}
                  label="Watch Count"
                  onChange={(e) => handleConditionChange('watchCount', e.target.value)}
                  disabled={!filtersEnabled.plexData}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        maxHeight: 300,
                        '& .MuiMenuItem-root': {
                          fontSize: { xs: '0.875rem', sm: '1rem' },
                          minHeight: { xs: 40, sm: 48 }
                        }
                      }
                    }
                  }}
                >
                  <MenuItem value="any">Any Count</MenuItem>
                  <MenuItem value="0">Never Watched</MenuItem>
                  <MenuItem value="1">Watched Once</MenuItem>
                  <MenuItem value="2+">Watched 2+ Times</MenuItem>
                  <MenuItem value="5+">Watched 5+ Times</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl 
                fullWidth 
                size="small"
                sx={{
                  '& .MuiInputLabel-root': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  },
                  '& .MuiSelect-select': {
                    fontSize: { xs: '0.875rem', sm: '1rem' }
                  }
                }}
              >
                <InputLabel>Last Watched</InputLabel>
                <Select
                  value={conditions.lastWatched || 'any'}
                  label="Last Watched"
                  onChange={(e) => handleConditionChange('lastWatched', e.target.value)}
                  disabled={!filtersEnabled.plexData}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        maxHeight: 300,
                        '& .MuiMenuItem-root': {
                          fontSize: { xs: '0.875rem', sm: '1rem' },
                          minHeight: { xs: 40, sm: 48 }
                        }
                      }
                    }
                  }}
                >
                  <MenuItem value="any">Any Time</MenuItem>
                  <MenuItem value="never">Never Watched</MenuItem>
                  <MenuItem value="30days">Over 30 Days Ago</MenuItem>
                  <MenuItem value="90days">Over 90 Days Ago</MenuItem>
                  <MenuItem value="1year">Over 1 Year Ago</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        )}
      </Paper>
      
      <Divider sx={{ my: 2 }} />
      
      {/* Series/Movie Specific Filters */}
      <Paper sx={{ p: 2, mb: 2, elevation: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <TvIcon sx={{ mr: 1 }} />
          <Typography variant="subtitle2">Series & Movie Filters</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={filtersEnabled.mediaSpecific || false}
                onChange={(e) => onFilterEnableChange('mediaSpecific', e.target.checked)}
                size="small"
              />
            }
            label="Enable"
            sx={{ ml: 'auto' }}
          />
        </Box>
        <Divider sx={{ mb: 2 }} />
        {filtersEnabled.mediaSpecific && (
          <Box sx={{ p: 2 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Series Status</InputLabel>
                  <Select
                    value={conditions.seriesStatus || 'any'}
                    label="Series Status"
                    onChange={(e) => handleConditionChange('seriesStatus', e.target.value)}
                    disabled={!filtersEnabled.mediaSpecific}
                  >
                    <MenuItem value="any">Any Status</MenuItem>
                    <MenuItem value="continuing">Continuing</MenuItem>
                    <MenuItem value="ended">Ended</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Network/Studio</InputLabel>
                  <Select
                    value={conditions.network || 'any'}
                    label="Network/Studio"
                    onChange={(e) => handleConditionChange('network', e.target.value)}
                    disabled={!filtersEnabled.mediaSpecific}
                  >
                    <MenuItem value="any">Any Network</MenuItem>
                    <MenuItem value="Netflix">Netflix</MenuItem>
                    <MenuItem value="HBO">HBO</MenuItem>
                    <MenuItem value="Disney">Disney</MenuItem>
                    <MenuItem value="Amazon">Amazon</MenuItem>
                    <MenuItem value="other">Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>
      
      <Divider sx={{ my: 2 }} />
      
      {/* Sonarr/Radarr Integration Filters */}
      <Paper sx={{ elevation: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: filtersEnabled.arrIntegration ? 2 : 0 }}>
          <Typography variant="subtitle2" sx={{ 
            fontWeight: 'bold', 
            color: 'primary.main',
            display: 'flex',
            alignItems: 'center'
          }}>
            <BusinessIcon sx={{ mr: 1, fontSize: '1.2rem' }} />
            Sonarr/Radarr Filters
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={filtersEnabled.arrIntegration || false}
                onChange={(e) => onFilterEnableChange('arrIntegration', e.target.checked)}
                size="small"
              />
            }
            label="Filter by *arr Data"
            sx={{ ml: 1 }}
          />
        </Box>
        {filtersEnabled.arrIntegration && (
          <Box sx={{ p: 2 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Monitoring Status</InputLabel>
                  <Select
                    value={conditions.monitoringStatus || 'any'}
                    label="Monitoring Status"
                    onChange={(e) => handleConditionChange('monitoringStatus', e.target.value)}
                    disabled={!filtersEnabled.arrIntegration}
                  >
                    <MenuItem value="any">Any Status</MenuItem>
                    <MenuItem value="monitored">Monitored</MenuItem>
                    <MenuItem value="unmonitored">Unmonitored</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Download Status</InputLabel>
                  <Select
                    value={conditions.downloadStatus || 'any'}
                    label="Download Status"
                    onChange={(e) => handleConditionChange('downloadStatus', e.target.value)}
                    disabled={!filtersEnabled.arrIntegration}
                  >
                    <MenuItem value="any">Any Status</MenuItem>
                    <MenuItem value="downloaded">Downloaded</MenuItem>
                    <MenuItem value="missing">Missing</MenuItem>
                    <MenuItem value="upgrading">Upgrading</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  size="small"
                  label="Tags (comma-separated)"
                  value={conditions.tags || ''}
                  onChange={(e) => handleConditionChange('tags', e.target.value)}
                  disabled={!filtersEnabled.arrIntegration}
                  placeholder="e.g., foreign, documentary, kids"
                  helperText="Filter by Sonarr/Radarr tags"
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </Paper>
      </Box>
    </Paper>
  );
};

// Memoize RuleConditions to prevent unnecessary re-renders
export default React.memo(RuleConditions, (prevProps, nextProps) => {
  // Compare conditions object
  if (JSON.stringify(prevProps.conditions) !== JSON.stringify(nextProps.conditions)) return false;
  
  // Compare filtersEnabled object
  if (JSON.stringify(prevProps.filtersEnabled) !== JSON.stringify(nextProps.filtersEnabled)) return false;
  
  // Functions are stable due to useCallback, so we can skip comparing them
  return true;
});

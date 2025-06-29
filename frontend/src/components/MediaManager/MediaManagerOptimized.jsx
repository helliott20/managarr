// src/components/MediaManager/MediaManagerOptimized.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Box, Typography, Card, CardContent, Chip, Alert, Switch, FormControlLabel,
  CircularProgress, TextField, Button, IconButton, Tooltip, Skeleton,
  Paper, Divider, Stack, InputAdornment, ButtonGroup, Fade, Collapse, Grid
} from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import MovieIcon from '@mui/icons-material/Movie';
import TvIcon from '@mui/icons-material/Tv';
import InfoIcon from '@mui/icons-material/Info';
import ShieldIcon from '@mui/icons-material/Shield';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import StorageIcon from '@mui/icons-material/Storage';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FilterListIcon from '@mui/icons-material/FilterList';
import ClearIcon from '@mui/icons-material/Clear';

import api from '../../services/api';
import { formatBytes, formatRelativeTime, useDebounce } from '../../utils/helpers';
import MediaDetailsDialog from './MediaDetailsDialog';

// Skeleton loader for tables
const TableSkeleton = () => (
  <Box sx={{ p: 2 }}>
    {[...Array(10)].map((_, index) => (
      <Skeleton key={index} variant="rectangular" height={52} sx={{ mb: 1 }} />
    ))}
  </Box>
);

// Stats cards component
const StatsCards = ({ sonarrStats, radarrStats }) => (
  <Grid container spacing={2} sx={{ mb: 3 }}>
    {sonarrStats && (
      <>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            bgcolor: 'primary.main', 
            color: 'primary.contrastText',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <CardContent sx={{ 
              pb: '16px !important',
              flexGrow: 1,
              display: 'flex',
              alignItems: 'center',
              minHeight: 80
            }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
                <TvIcon sx={{ fontSize: 32 }} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h4" sx={{ fontSize: '1.75rem', fontWeight: 'bold', lineHeight: 1.2 }}>
                    {sonarrStats.totalSeries.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    TV Series
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            bgcolor: 'success.main', 
            color: 'success.contrastText',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <CardContent sx={{ 
              pb: '16px !important',
              flexGrow: 1,
              display: 'flex',
              alignItems: 'center',
              minHeight: 80
            }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
                <StorageIcon sx={{ fontSize: 32 }} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h4" sx={{ fontSize: '1.75rem', fontWeight: 'bold', lineHeight: 1.2 }}>
                    {formatBytes(sonarrStats.totalSize)}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    TV Storage
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </>
    )}
    {radarrStats && (
      <>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            bgcolor: 'secondary.main', 
            color: 'secondary.contrastText',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <CardContent sx={{ 
              pb: '16px !important',
              flexGrow: 1,
              display: 'flex',
              alignItems: 'center',
              minHeight: 80
            }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
                <MovieIcon sx={{ fontSize: 32 }} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h4" sx={{ fontSize: '1.75rem', fontWeight: 'bold', lineHeight: 1.2 }}>
                    {radarrStats.totalMovies.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Movies
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            bgcolor: 'warning.main', 
            color: 'warning.contrastText',
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <CardContent sx={{ 
              pb: '16px !important',
              flexGrow: 1,
              display: 'flex',
              alignItems: 'center',
              minHeight: 80
            }}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
                <StorageIcon sx={{ fontSize: 32 }} />
                <Box sx={{ flexGrow: 1 }}>
                  <Typography variant="h4" sx={{ fontSize: '1.75rem', fontWeight: 'bold', lineHeight: 1.2 }}>
                    {formatBytes(radarrStats.totalSize)}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Movie Storage
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </>
    )}
  </Grid>
);

const MediaManagerOptimized = () => {
  // State management
  const [activeView, setActiveView] = useState('tv'); // 'tv' or 'movies'
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  
  // Integration states
  const [integrations, setIntegrations] = useState({
    sonarr: { enabled: false, data: [], loading: false, stats: null },
    radarr: { enabled: false, data: [], loading: false, stats: null }
  });
  
  // Dialog states
  const [detailsDialog, setDetailsDialog] = useState({
    open: false,
    type: null,
    item: null
  });

  // Loading states
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Debounced search
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      setInitialLoading(true);
      
      // Get settings to check enabled integrations
      const settingsResponse = await api.settings.get();
      const settings = settingsResponse.data || {};
      
      const promises = [];
      
      // Load Sonarr data if enabled
      if (settings.sonarr?.enabled) {
        promises.push(loadSonarrData());
      }
      
      // Load Radarr data if enabled
      if (settings.radarr?.enabled) {
        promises.push(loadRadarrData());
      }
      
      await Promise.allSettled(promises);
      
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const loadSonarrData = useCallback(async () => {
    try {
      setIntegrations(prev => ({
        ...prev,
        sonarr: { ...prev.sonarr, loading: true, enabled: true }
      }));
      
      const [seriesResponse, statsResponse] = await Promise.all([
        api.integrations.getSonarrSeries(),
        // Add stats API call if available
        Promise.resolve({ data: { success: true, stats: null } })
      ]);
      
      if (seriesResponse.data?.success) {
        const seriesData = seriesResponse.data.series || [];
        const stats = calculateSonarrStats(seriesData);
        
        setIntegrations(prev => ({
          ...prev,
          sonarr: {
            enabled: true,
            data: seriesData,
            loading: false,
            stats
          }
        }));
      }
    } catch (error) {
      console.error('Error loading Sonarr data:', error);
      setIntegrations(prev => ({
        ...prev,
        sonarr: { ...prev.sonarr, loading: false, data: [], stats: null }
      }));
    }
  }, []);

  const loadRadarrData = useCallback(async () => {
    try {
      setIntegrations(prev => ({
        ...prev,
        radarr: { ...prev.radarr, loading: true, enabled: true }
      }));
      
      const [moviesResponse] = await Promise.all([
        api.integrations.getRadarrMovies()
      ]);
      
      if (moviesResponse.data?.success) {
        const moviesData = moviesResponse.data.movies || [];
        const stats = calculateRadarrStats(moviesData);
        
        setIntegrations(prev => ({
          ...prev,
          radarr: {
            enabled: true,
            data: moviesData,
            loading: false,
            stats
          }
        }));
      }
    } catch (error) {
      console.error('Error loading Radarr data:', error);
      setIntegrations(prev => ({
        ...prev,
        radarr: { ...prev.radarr, loading: false, data: [], stats: null }
      }));
    }
  }, []);

  // Calculate stats
  const calculateSonarrStats = (series) => ({
    totalSeries: series.length,
    totalEpisodes: series.reduce((sum, s) => sum + (s.statistics?.episodeCount || 0), 0),
    totalSize: series.reduce((sum, s) => sum + (s.statistics?.sizeOnDisk || 0), 0),
    continuingSeries: series.filter(s => s.status === 'continuing').length
  });

  const calculateRadarrStats = (movies) => ({
    totalMovies: movies.length,
    moviesWithFiles: movies.filter(m => m.hasFile).length,
    totalSize: movies.reduce((sum, m) => sum + (m.sizeOnDisk || 0), 0),
    missingMovies: movies.filter(m => !m.hasFile).length
  });

  // Filtered data with memoization
  const filteredTvData = useMemo(() => {
    if (!integrations.sonarr.data.length) return [];
    
    return integrations.sonarr.data.filter(series =>
      series.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );
  }, [integrations.sonarr.data, debouncedSearchTerm]);

  const filteredMovieData = useMemo(() => {
    if (!integrations.radarr.data.length) return [];
    
    return integrations.radarr.data.filter(movie =>
      movie.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );
  }, [integrations.radarr.data, debouncedSearchTerm]);

  // Column definitions for DataGrid
  const tvColumns = useMemo(() => [
    {
      field: 'title',
      headerName: 'Title',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
          <TvIcon fontSize="small" color="primary" />
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            {params.value}
          </Typography>
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'year',
      headerName: 'Year',
      width: 100,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2">
            {params.value}
          </Typography>
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Chip
            label={params.value}
            size="small"
            color={params.value === 'continuing' ? 'success' : 'default'}
            variant="outlined"
          />
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'sizeOnDisk',
      headerName: 'Size',
      width: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2">
            {params.row.statistics?.sizeOnDisk ? formatBytes(params.row.statistics.sizeOnDisk) : 'Unknown'}
          </Typography>
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'episodeProgress',
      headerName: 'Episodes',
      width: 120,
      renderCell: (params) => {
        const stats = params.row.statistics;
        if (!stats) return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2">Unknown</Typography>
          </Box>
        );
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2">
              {`${stats.episodeFileCount || 0}/${stats.episodeCount || 0}`}
            </Typography>
          </Box>
        );
      },
      cellClassName: 'center-align'
    },
    {
      field: 'added',
      headerName: 'Added',
      width: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: '100%' }}>
          <AccessTimeIcon fontSize="small" color="action" />
          <Typography variant="body2">
            {params.value ? formatRelativeTime(new Date(params.value)) : 'Unknown'}
          </Typography>
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 200,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Stack direction="row" spacing={1}>
            <Tooltip title="View Details">
              <IconButton
                size="small"
                onClick={() => handleViewDetails('tv', params.row)}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={params.row.protected ? 'Protected' : 'Protect'}>
              <IconButton
                size="small"
                color={params.row.protected ? 'success' : 'default'}
                onClick={() => handleToggleProtection('tv', params.row)}
              >
                <ShieldIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      ),
      cellClassName: 'center-align'
    }
  ], []);

  const movieColumns = useMemo(() => [
    {
      field: 'title',
      headerName: 'Title',
      flex: 1,
      minWidth: 200,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: '100%' }}>
          <MovieIcon fontSize="small" color="secondary" />
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            {params.value}
          </Typography>
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'year',
      headerName: 'Year',
      width: 100,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2">
            {params.value}
          </Typography>
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Chip
            label={params.row.hasFile ? 'Available' : 'Missing'}
            size="small"
            color={params.row.hasFile ? 'success' : 'warning'}
            variant="outlined"
          />
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'sizeOnDisk',
      headerName: 'Size',
      width: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2">
            {params.value ? formatBytes(params.value) : 'Unknown'}
          </Typography>
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'quality',
      headerName: 'Quality',
      width: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Typography variant="body2">
            {params.row.movieFile?.quality?.quality?.name || 'Unknown'}
          </Typography>
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'added',
      headerName: 'Added',
      width: 120,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: '100%' }}>
          <AccessTimeIcon fontSize="small" color="action" />
          <Typography variant="body2">
            {params.value ? formatRelativeTime(new Date(params.value)) : 'Unknown'}
          </Typography>
        </Box>
      ),
      cellClassName: 'center-align'
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 200,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <Stack direction="row" spacing={1}>
            <Tooltip title="View Details">
              <IconButton
                size="small"
                onClick={() => handleViewDetails('movie', params.row)}
              >
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={params.row.protected ? 'Protected' : 'Protect'}>
              <IconButton
                size="small"
                color={params.row.protected ? 'success' : 'default'}
                onClick={() => handleToggleProtection('movie', params.row)}
              >
                <ShieldIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
      ),
      cellClassName: 'center-align'
    }
  ], []);

  // Event handlers
  const handleViewDetails = useCallback((type, item) => {
    setDetailsDialog({
      open: true,
      type,
      item
    });
  }, []);

  const handleToggleProtection = useCallback(async (type, item) => {
    try {
      const newProtectedStatus = !item.protected;
      await api.media.protect(item.id, newProtectedStatus);
      
      // Update local state
      const updateData = (data) =>
        data.map(i => i.id === item.id ? { ...i, protected: newProtectedStatus } : i);
      
      if (type === 'tv') {
        setIntegrations(prev => ({
          ...prev,
          sonarr: { ...prev.sonarr, data: updateData(prev.sonarr.data) }
        }));
      } else {
        setIntegrations(prev => ({
          ...prev,
          radarr: { ...prev.radarr, data: updateData(prev.radarr.data) }
        }));
      }
    } catch (error) {
      console.error('Error toggling protection:', error);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (activeView === 'tv') {
      loadSonarrData();
    } else {
      loadRadarrData();
    }
  }, [activeView, loadSonarrData, loadRadarrData]);

  const handleCloseDialog = useCallback(() => {
    setDetailsDialog({ open: false, type: null, item: null });
  }, []);

  // Loading state
  if (initialLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="text" width={200} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" width="100%" height={200} sx={{ mb: 2 }} />
        <TableSkeleton />
      </Box>
    );
  }

  // No integrations enabled
  if (!integrations.sonarr.enabled && !integrations.radarr.enabled) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>Media Manager</Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          No media server integrations are enabled. Please enable Sonarr and/or Radarr in Settings.
        </Alert>
        <Button 
          variant="contained" 
          onClick={() => window.location.href = '/settings/integrations'}
        >
          Go to Integration Settings
        </Button>
      </Box>
    );
  }

  const currentData = activeView === 'tv' ? filteredTvData : filteredMovieData;
  const currentColumns = activeView === 'tv' ? tvColumns : movieColumns;
  const currentLoading = activeView === 'tv' ? integrations.sonarr.loading : integrations.radarr.loading;

  return (
    <Box sx={{ 
      p: 3, 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <Typography variant="h4" gutterBottom>
        Media Manager
      </Typography>

      {/* Stats Cards */}
      <StatsCards 
        sonarrStats={integrations.sonarr.stats}
        radarrStats={integrations.radarr.stats}
      />

      {/* Controls */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack spacing={2}>
          {/* View Toggle & Refresh */}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <ButtonGroup variant="outlined">
              {integrations.sonarr.enabled && (
                <Button
                  startIcon={<TvIcon />}
                  variant={activeView === 'tv' ? 'contained' : 'outlined'}
                  onClick={() => setActiveView('tv')}
                >
                  TV Shows ({integrations.sonarr.data.length})
                </Button>
              )}
              {integrations.radarr.enabled && (
                <Button
                  startIcon={<MovieIcon />}
                  variant={activeView === 'movies' ? 'contained' : 'outlined'}
                  onClick={() => setActiveView('movies')}
                >
                  Movies ({integrations.radarr.data.length})
                </Button>
              )}
            </ButtonGroup>

            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<FilterListIcon />}
                onClick={() => setShowFilters(!showFilters)}
                variant={showFilters ? 'contained' : 'outlined'}
              >
                Filters
              </Button>
              <Button
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
                disabled={currentLoading}
              >
                Refresh
              </Button>
            </Stack>
          </Stack>

          {/* Search */}
          <TextField
            placeholder={`Search ${activeView === 'tv' ? 'TV shows' : 'movies'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchTerm && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setSearchTerm('')}
                  >
                    <ClearIcon />
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          {/* Filters */}
          <Collapse in={showFilters}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Filters (Coming Soon)
              </Typography>
              <Stack direction="row" spacing={2}>
                <FormControlLabel
                  control={<Switch />}
                  label="Show Protected Only"
                />
                <FormControlLabel
                  control={<Switch />}
                  label="Show Missing Only"
                />
              </Stack>
            </Paper>
          </Collapse>
        </Stack>
      </Paper>

      {/* Data Grid */}
      <Paper sx={{ 
        flexGrow: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden'
      }}>
        <DataGrid
          sx={{ flexGrow: 1, border: 0 }}
          rows={currentData}
          columns={currentColumns}
          loading={currentLoading}
          pagination
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } }
          }}
          disableRowSelectionOnClick
          checkboxSelection
          onRowSelectionModelChange={setSelectedItems}
          slots={{
            toolbar: GridToolbar,
            loadingOverlay: () => <TableSkeleton />
          }}
          slotProps={{
            toolbar: {
              showQuickFilter: true,
              quickFilterProps: { debounceMs: 500 }
            }
          }}
          sx={{
            border: 0,
            '& .MuiDataGrid-cell:focus': {
              outline: 'none'
            },
            '& .MuiDataGrid-row:hover': {
              backgroundColor: 'action.hover'
            },
            '& .center-align .MuiDataGrid-cellContent': {
              display: 'flex',
              alignItems: 'center',
              height: '100%'
            }
          }}
        />
      </Paper>

      {/* Bulk Actions */}
      {selectedItems.length > 0 && (
        <Fade in>
          <Paper
            sx={{
              position: 'fixed',
              bottom: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              p: 2,
              zIndex: 1000,
              boxShadow: 3
            }}
          >
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography variant="body2">
                {selectedItems.length} items selected
              </Typography>
              <Button size="small" variant="outlined">
                Bulk Protect
              </Button>
              <Button size="small" variant="outlined">
                Bulk Actions
              </Button>
            </Stack>
          </Paper>
        </Fade>
      )}

      {/* Details Dialog */}
      <MediaDetailsDialog
        open={detailsDialog.open}
        type={detailsDialog.type}
        item={detailsDialog.item}
        onClose={handleCloseDialog}
      />
    </Box>
  );
};

export default MediaManagerOptimized;
// src/components/MediaManager/MediaManager.jsx
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
  Box, Typography, Button, Card, CardContent, CardHeader, 
  Divider, TextField, Grid, Alert, Switch, FormControlLabel,
  CircularProgress, Chip, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  LinearProgress, Tooltip, Select, MenuItem, FormControl,
  InputLabel, Tabs, Tab
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import DeleteIcon from '@mui/icons-material/Delete';
import MovieIcon from '@mui/icons-material/Movie';
import TvIcon from '@mui/icons-material/Tv';
import InfoIcon from '@mui/icons-material/Info';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import RefreshIcon from '@mui/icons-material/Refresh';
import ShieldIcon from '@mui/icons-material/Shield';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SortIcon from '@mui/icons-material/Sort';

// Format bytes to human-readable size
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Format date to relative time
const formatRelativeTime = (date) => {
  if (!date) return 'Unknown';
  
  const now = new Date();
  const diff = now - new Date(date);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

const MediaManager = () => {
  // Main states
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  
  // Sonarr states
  const [sonarrEnabled, setSonarrEnabled] = useState(false);
  const [sonarrSeries, setSonarrSeries] = useState([]);
  const [filteredSeries, setFilteredSeries] = useState([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  
  // Radarr states
  const [radarrEnabled, setRadarrEnabled] = useState(false);
  const [radarrMovies, setRadarrMovies] = useState([]);
  const [filteredMovies, setFilteredMovies] = useState([]);
  const [loadingMovies, setLoadingMovies] = useState(false);
  
  // Deletion rules
  const [deletionRules, setDeletionRules] = useState([]);
  
  // Dialog states
  const [seriesDetailsDialogOpen, setSeriesDetailsDialogOpen] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState([]);
  
  const [movieDetailsDialogOpen, setMovieDetailsDialogOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [movieFiles, setMovieFiles] = useState([]);
  
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteType, setDeleteType] = useState(''); // 'movie' or 'series'
  
  // Load settings, deletion rules, and check if Sonarr and Radarr are enabled
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Get settings
        const settingsResponse = await api.settings.get();
        
        // Get deletion rules
        try {
          const rulesResponse = await api.rules.getAll();
          if (rulesResponse.data) {
            setDeletionRules(rulesResponse.data);
          }
        } catch (rulesError) {
          console.error('Error loading deletion rules:', rulesError);
          setDeletionRules([]);
        }
        
        if (settingsResponse.data) {
          // Check if Sonarr is enabled
          if (settingsResponse.data.sonarr && settingsResponse.data.sonarr.enabled) {
            setSonarrEnabled(true);
            
            // Load Sonarr series
            await loadSonarrSeries();
          }
          
          // Check if Radarr is enabled
          if (settingsResponse.data.radarr && settingsResponse.data.radarr.enabled) {
            setRadarrEnabled(true);
            
            // Load Radarr movies
            await loadRadarrMovies();
          }
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading settings:', error);
        setLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // Filter series based on search term
  useEffect(() => {
    if (sonarrSeries.length > 0) {
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const filtered = sonarrSeries.filter(series => 
          series.title.toLowerCase().includes(searchLower)
        );
        setFilteredSeries(filtered);
      } else {
        setFilteredSeries(sonarrSeries);
      }
    }
  }, [sonarrSeries, searchTerm]);
  
  // Filter movies based on search term
  useEffect(() => {
    if (radarrMovies.length > 0) {
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const filtered = radarrMovies.filter(movie => 
          movie.title.toLowerCase().includes(searchLower)
        );
        setFilteredMovies(filtered);
      } else {
        setFilteredMovies(radarrMovies);
      }
    }
  }, [radarrMovies, searchTerm]);
  
  // Load Sonarr series
  const loadSonarrSeries = async () => {
    try {
      setLoadingSeries(true);
      
      const response = await api.integrations.getSonarrSeries();
      
      if (response.data && response.data.success && response.data.series) {
        setSonarrSeries(response.data.series);
        setFilteredSeries(response.data.series);
      } else {
        setSonarrSeries([]);
        setFilteredSeries([]);
      }
      
      setLoadingSeries(false);
    } catch (error) {
      console.error('Error loading Sonarr series:', error);
      setSonarrSeries([]);
      setFilteredSeries([]);
      setLoadingSeries(false);
    }
  };
  
  // Load Radarr movies
  const loadRadarrMovies = async () => {
    try {
      setLoadingMovies(true);
      
      const response = await api.integrations.getRadarrMovies();
      
      if (response.data && response.data.success && response.data.movies) {
        setRadarrMovies(response.data.movies);
        setFilteredMovies(response.data.movies);
      } else {
        setRadarrMovies([]);
        setFilteredMovies([]);
      }
      
      setLoadingMovies(false);
    } catch (error) {
      console.error('Error loading Radarr movies:', error);
      setRadarrMovies([]);
      setFilteredMovies([]);
      setLoadingMovies(false);
    }
  };
  
  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setSearchTerm('');
  };
  
  // View series details
  const viewSeriesDetails = async (series) => {
    try {
      setSelectedSeries(series);
      setSeriesDetailsDialogOpen(true);
      
      console.log("Loading episodes for series:", series.title, "ID:", series.id);
      
      // Load episodes
      const response = await api.integrations.getSonarrSeriesById(series.id);
      
      console.log("Series details API response received");
      
      if (response.data && response.data.success && response.data.episodes) {
        const totalEpisodes = response.data.episodes.length;
        const episodesWithFiles = response.data.episodes.filter(ep => ep.hasFile).length;
        const episodesWithFileObjects = response.data.episodes.filter(ep => ep.hasFile && ep.episodeFile).length;
        
        console.log(`Found ${totalEpisodes} episodes, ${episodesWithFiles} have files`);
        console.log(`Episodes with files: ${episodesWithFiles}/${totalEpisodes} (${Math.round(episodesWithFiles/totalEpisodes*100)}%)`);
        console.log(`Episodes with episodeFile objects: ${episodesWithFileObjects}/${episodesWithFiles}`);
        
        // Log a sample episode with hasFile=true to see its structure
        const sampleEpisodeWithFile = response.data.episodes.find(ep => ep.hasFile);
        if (sampleEpisodeWithFile) {
          console.log("Sample episode with hasFile=true:", sampleEpisodeWithFile);
          console.log("Episode file details:", sampleEpisodeWithFile.episodeFile);
          
          // Check if size information is available
          if (sampleEpisodeWithFile.episodeFile) {
            console.log("Episode file size:", sampleEpisodeWithFile.episodeFile.size);
            console.log("Episode file size type:", typeof sampleEpisodeWithFile.episodeFile.size);
          }
        }
        
        setSeriesEpisodes(response.data.episodes);
      } else {
        console.log("No episodes found in response");
        setSeriesEpisodes([]);
      }
    } catch (error) {
      console.error('Error loading series details:', error);
      setSeriesEpisodes([]);
    }
  };
  
  // View movie details
  const viewMovieDetails = async (movie) => {
    try {
      setSelectedMovie(movie);
      setMovieDetailsDialogOpen(true);
      
      // Load movie files
      const response = await api.integrations.getRadarrMovieById(movie.id);
      
      if (response.data && response.data.success && response.data.files) {
        setMovieFiles(response.data.files);
      } else {
        setMovieFiles([]);
      }
    } catch (error) {
      console.error('Error loading movie details:', error);
      setMovieFiles([]);
    }
  };
  
  // Delete file
  const deleteFile = async () => {
    if (!itemToDelete) return;
    
    try {
      if (deleteType === 'movie') {
        // Delete movie file
        await api.integrations.deleteRadarrFile(itemToDelete.movieId, itemToDelete.id);
        
        // Refresh movie files
        const response = await api.integrations.getRadarrMovieById(itemToDelete.movieId);
        
        if (response.data && response.data.success && response.data.files) {
          setMovieFiles(response.data.files);
        }
      } else if (deleteType === 'series') {
        // Delete series file
        await api.integrations.deleteSonarrFile(itemToDelete.seriesId, itemToDelete.id);
        
        // Refresh episodes
        const response = await api.integrations.getSonarrSeriesById(itemToDelete.seriesId);
        
        if (response.data && response.data.success && response.data.episodes) {
          setSeriesEpisodes(response.data.episodes);
        }
      }
      
      // Close dialog
      setConfirmDeleteDialogOpen(false);
      setItemToDelete(null);
      
      // Show success message
      alert('File deleted successfully');
    } catch (error) {
      console.error('Error deleting file:', error);
      alert(`Error deleting file: ${error.message || 'Unknown error'}`);
      
      // Close dialog
      setConfirmDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };
  
  // Loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  // No integrations enabled
  if (!sonarrEnabled && !radarrEnabled) {
    return (
      <Box>
        <Typography variant="h2" sx={{ mb: 3 }}>Media Manager</Typography>
        
        <Alert severity="info" sx={{ mb: 3 }}>
          No media server integrations are enabled. Please enable Sonarr and/or Radarr in the Settings &gt; Integrations page.
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
  
  return (
    <Box>
      <Typography variant="h2" sx={{ mb: 3 }}>Media Manager</Typography>
      
      <Paper sx={{ mb: 4 }}>
        {/* Only show tabs if at least one integration is enabled */}
        {(sonarrEnabled || radarrEnabled) && (
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            {sonarrEnabled && (
              <Tab icon={<TvIcon />} label="TV Shows" />
            )}
            {radarrEnabled && (
              <Tab icon={<MovieIcon />} label="Movies" />
            )}
          </Tabs>
        )}
        
        {/* Search and Filter */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                label="Search"
                fullWidth
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title"
                size="small"
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                }}
              />
            </Grid>
            <Grid item xs={12} md={6} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button 
                startIcon={<RefreshIcon />}
                onClick={() => activeTab === 0 ? loadSonarrSeries() : loadRadarrMovies()}
                disabled={activeTab === 0 ? loadingSeries : loadingMovies}
              >
                Refresh
              </Button>
            </Grid>
          </Grid>
        </Box>
        
        {/* TV Shows Tab */}
        {activeTab === 0 && sonarrEnabled && (
          <Box sx={{ p: 0 }}>
            {loadingSeries ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                <CircularProgress />
              </Box>
            ) : filteredSeries.length === 0 ? (
              <Alert severity="info" sx={{ m: 2 }}>
                No TV shows found. {searchTerm ? 'Try a different search term.' : ''}
              </Alert>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Year</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Path</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell>Added</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredSeries.map((series) => (
                      <TableRow key={series.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontWeight: 'medium',
                                cursor: 'pointer',
                                '&:hover': {
                                  color: 'primary.main',
                                  textDecoration: 'underline'
                                }
                              }}
                              onClick={() => viewSeriesDetails(series)}
                            >
                              {series.title}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>{series.year}</TableCell>
                        <TableCell>
                          <Chip 
                            label={series.status}
                            size="small"
                            color={series.status === 'continuing' ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              maxWidth: 200,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {series.path}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {series.statistics && series.statistics.sizeOnDisk ? 
                            formatBytes(series.statistics.sizeOnDisk) : 
                            'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              display: 'flex', 
                              alignItems: 'center'
                            }}
                          >
                            <AccessTimeIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
                            {series.added ? formatRelativeTime(new Date(series.added)) : 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            <Chip 
                              label="Details"
                              size="small"
                              color="primary"
                              onClick={() => viewSeriesDetails(series)}
                              icon={<InfoIcon />}
                            />
                            
                            <Chip 
                              label={series.protected ? "Protected" : "Protect"}
                              size="small"
                              color={series.protected ? "success" : "default"}
                              icon={<ShieldIcon sx={{
                                animation: series.protected ? 'pulse 1.5s infinite' : 'none',
                                '@keyframes pulse': {
                                  '0%': { opacity: 1 },
                                  '50%': { opacity: 0.6 },
                                  '100%': { opacity: 1 }
                                }
                              }} />}
                              onClick={() => {
                                // Toggle protection status
                                const newProtectedStatus = !series.protected;
                                
                                // Update in the database
                                api.media.protect(series.id, newProtectedStatus)
                                  .then((response) => {
                                    if (response.data && response.data.success) {
                                      // Update local state for both arrays
                                      const updatedSonarrSeries = sonarrSeries.map(s => 
                                        s.id === series.id ? { ...s, protected: newProtectedStatus } : s
                                      );
                                      setSonarrSeries(updatedSonarrSeries);
                                      
                                      const updatedFilteredSeries = filteredSeries.map(s => 
                                        s.id === series.id ? { ...s, protected: newProtectedStatus } : s
                                      );
                                      setFilteredSeries(updatedFilteredSeries);
                                      
                                      console.log(`Protection status updated for ${series.title}`);
                                    } else {
                                      console.error('Failed to update protection status:', response.data);
                                    }
                                  })
                                  .catch(error => {
                                    console.error('Error updating protection status:', error);
                                  });
                              }}
                            />
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
        
        {/* Movies Tab */}
        {activeTab === 1 && radarrEnabled && (
          <Box sx={{ p: 0 }}>
            {loadingMovies ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                <CircularProgress />
              </Box>
            ) : filteredMovies.length === 0 ? (
              <Alert severity="info" sx={{ m: 2 }}>
                No movies found. {searchTerm ? 'Try a different search term.' : ''}
              </Alert>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Year</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Path</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell>Added</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredMovies.map((movie) => (
                      <TableRow key={movie.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontWeight: 'medium',
                                cursor: 'pointer',
                                '&:hover': {
                                  color: 'primary.main',
                                  textDecoration: 'underline'
                                }
                              }}
                              onClick={() => viewMovieDetails(movie)}
                            >
                              {movie.title}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>{movie.year}</TableCell>
                        <TableCell>
                          <Chip 
                            label={movie.status}
                            size="small"
                            color={movie.hasFile ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              maxWidth: 200,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {movie.path}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {movie.sizeOnDisk ? 
                            formatBytes(movie.sizeOnDisk) : 
                            'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              display: 'flex', 
                              alignItems: 'center'
                            }}
                          >
                            <AccessTimeIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
                            {movie.added ? formatRelativeTime(new Date(movie.added)) : 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            <Chip 
                              label="Details"
                              size="small"
                              color="primary"
                              onClick={() => viewMovieDetails(movie)}
                              icon={<InfoIcon />}
                            />
                            
                            <Chip 
                              label={movie.protected ? "Protected" : "Protect"}
                              size="small"
                              color={movie.protected ? "success" : "default"}
                              icon={<ShieldIcon sx={{
                                animation: movie.protected ? 'pulse 1.5s infinite' : 'none',
                                '@keyframes pulse': {
                                  '0%': { opacity: 1 },
                                  '50%': { opacity: 0.6 },
                                  '100%': { opacity: 1 }
                                }
                              }} />}
                              onClick={() => {
                                // Toggle protection status
                                const newProtectedStatus = !movie.protected;
                                
                                // Update in the database
                                api.media.protect(movie.id, newProtectedStatus)
                                  .then((response) => {
                                    if (response.data && response.data.success) {
                                      // Update local state for both arrays
                                      const updatedRadarrMovies = radarrMovies.map(m => 
                                        m.id === movie.id ? { ...m, protected: newProtectedStatus } : m
                                      );
                                      setRadarrMovies(updatedRadarrMovies);
                                      
                                      const updatedFilteredMovies = filteredMovies.map(m => 
                                        m.id === movie.id ? { ...m, protected: newProtectedStatus } : m
                                      );
                                      setFilteredMovies(updatedFilteredMovies);
                                      
                                      console.log(`Protection status updated for ${movie.title}`);
                                    } else {
                                      console.error('Failed to update protection status:', response.data);
                                    }
                                  })
                                  .catch(error => {
                                    console.error('Error updating protection status:', error);
                                  });
                              }}
                            />
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Paper>
      
      {/* Series Details Dialog */}
      <Dialog 
        open={seriesDetailsDialogOpen} 
        onClose={() => setSeriesDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Series Details
          {selectedSeries && (
            <Typography variant="subtitle2" color="text.secondary">
              {selectedSeries.title} ({selectedSeries.year})
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedSeries && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Series Info</Typography>
                    <Divider sx={{ mb: 2 }} />
                    
                    <Typography variant="body2" gutterBottom>
                      <strong>Status:</strong> {selectedSeries.status}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Network:</strong> {selectedSeries.network || 'Unknown'}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Path:</strong> {selectedSeries.path}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Size:</strong> {selectedSeries.statistics && selectedSeries.statistics.sizeOnDisk ? 
                        formatBytes(selectedSeries.statistics.sizeOnDisk) : 
                        'Unknown'}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Episodes:</strong> {selectedSeries.statistics ? 
                        `${selectedSeries.statistics.episodeFileCount} / ${selectedSeries.statistics.episodeCount}` : 
                        'Unknown'}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Added:</strong> {selectedSeries.added ? 
                        formatRelativeTime(new Date(selectedSeries.added)) : 
                        'Unknown'}
                    </Typography>
                    
                    <Box sx={{ mt: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch 
                            checked={selectedSeries.protected || false}
                            onChange={(e) => {
                              // Toggle protection status
                              const updatedSeries = {
                                ...selectedSeries,
                                protected: e.target.checked
                              };
                              setSelectedSeries(updatedSeries);
                              
                              // Update in the database
                              api.media.protect(selectedSeries.id, e.target.checked)
                                .then(() => {
                                  console.log(`Protection status updated for ${selectedSeries.title}`);
                                })
                                .catch(error => {
                                  console.error('Error updating protection status:', error);
                                });
                            }}
                          />
                        }
                        label="Protected from deletion"
                      />
                    </Box>
                  </CardContent>
                </Card>
                
                <Card sx={{ mt: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Deletion Rules</Typography>
                    <Divider sx={{ mb: 2 }} />
                    
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Rules that could affect this series:
                    </Typography>
                    
                    <Box sx={{ mt: 1 }}>
                      {deletionRules.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No deletion rules found.
                        </Typography>
                      ) : (
                        deletionRules
                          .filter(rule => 
                            rule.enabled && 
                            rule.mediaTypes.includes('show')
                          )
                          .map(rule => {
                            // Check if the rule applies to this series
                            const ageInDays = selectedSeries.added ? 
                              Math.floor((new Date() - new Date(selectedSeries.added)) / (1000 * 60 * 60 * 24)) : 
                              0;
                            
                            const isWatched = selectedSeries.statistics && 
                              selectedSeries.statistics.episodeFileCount > 0 && 
                              selectedSeries.statistics.episodeFileCount === selectedSeries.statistics.episodeCount;
                            
                            // Check if rule conditions match
                            const matchesAge = !rule.conditions.olderThan || ageInDays >= rule.conditions.olderThan;
                            const matchesWatched = rule.conditions.watchedStatus === 'any' || 
                              (rule.conditions.watchedStatus === 'watched' && isWatched) ||
                              (rule.conditions.watchedStatus === 'unwatched' && !isWatched);
                            
                            const applies = matchesAge && matchesWatched;
                            
                            return (
                              <Chip 
                                key={rule.id}
                                label={rule.name}
                                size="small"
                                color={applies ? "error" : "default"}
                                sx={{ mr: 1, mb: 1 }}
                              />
                            );
                          })
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={8}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Episodes</Typography>
                    <Divider sx={{ mb: 2 }} />
                    
                    {seriesEpisodes.length === 0 ? (
                      <Alert severity="info">No episodes found.</Alert>
                    ) : (
                      <TableContainer sx={{ maxHeight: 400 }}>
                        <Table stickyHeader size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Episode</TableCell>
                              <TableCell>Title</TableCell>
                              <TableCell>Size</TableCell>
                              <TableCell>Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {seriesEpisodes
                              .sort((a, b) => {
                                if (a.seasonNumber !== b.seasonNumber) {
                                  return a.seasonNumber - b.seasonNumber;
                                }
                                return a.episodeNumber - b.episodeNumber;
                              })
                              .map((episode) => (
                                <TableRow key={episode.id} hover>
                                  <TableCell>
                                    S{episode.seasonNumber.toString().padStart(2, '0')}
                                    E{episode.episodeNumber.toString().padStart(2, '0')}
                                  </TableCell>
                                  <TableCell>{episode.title}</TableCell>
                                  <TableCell>
                                    {episode.hasFile ? (
                                      <Typography variant="body2">
                                        {episode.episodeFile && typeof episode.episodeFile.size === 'number' ? 
                                          formatBytes(episode.episodeFile.size) : 
                                          episode.size ? formatBytes(episode.size) : 
                                          formatBytes(episode.runtime ? episode.runtime * 10 * 1024 * 1024 : 500 * 1024 * 1024)}
                                      </Typography>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        N/A
                                      </Typography>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {episode.hasFile ? (
                                      <Chip
                                        icon={<DeleteIcon />}
                                        label="Delete"
                                        size="small"
                                        color="error"
                                        variant="outlined"
                                        onClick={() => {
                                          console.log("Delete clicked for episode:", episode);
                                          if (episode.episodeFile && episode.episodeFile.id) {
                                            setItemToDelete({
                                              id: episode.episodeFile.id,
                                              seriesId: selectedSeries.id,
                                              name: `${selectedSeries.title} - S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')} - ${episode.title}`
                                            });
                                            setDeleteType('series');
                                            setConfirmDeleteDialogOpen(true);
                                          } else {
                                            console.error("Episode has hasFile=true but no episodeFile object or id:", episode);
                                            alert("Error: Cannot delete file. Episode file information is missing.");
                                          }
                                        }}
                                      />
                                    ) : (
                                      <Chip
                                        label="Missing"
                                        size="small"
                                        color="default"
                                        variant="outlined"
                                        sx={{ opacity: 0.6 }}
                                      />
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeriesDetailsDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Movie Details Dialog */}
      <Dialog 
        open={movieDetailsDialogOpen} 
        onClose={() => setMovieDetailsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Movie Details
          {selectedMovie && (
            <Typography variant="subtitle2" color="text.secondary">
              {selectedMovie.title} ({selectedMovie.year})
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedMovie && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Movie Info</Typography>
                    <Divider sx={{ mb: 2 }} />
                    
                    <Typography variant="body2" gutterBottom>
                      <strong>Status:</strong> {selectedMovie.status}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Quality:</strong> {selectedMovie.movieFile?.quality?.quality?.name || 'Unknown'}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Path:</strong> {selectedMovie.path}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Size:</strong> {selectedMovie.sizeOnDisk ? 
                        formatBytes(selectedMovie.sizeOnDisk) : 
                        'Unknown'}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Has File:</strong> {selectedMovie.hasFile ? 'Yes' : 'No'}
                    </Typography>
                    <Typography variant="body2" gutterBottom>
                      <strong>Added:</strong> {selectedMovie.added ? 
                        formatRelativeTime(new Date(selectedMovie.added)) : 
                        'Unknown'}
                    </Typography>
                    
                    <Box sx={{ mt: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch 
                            checked={selectedMovie.protected || false}
                            onChange={(e) => {
                              // Toggle protection status
                              const updatedMovie = {
                                ...selectedMovie,
                                protected: e.target.checked
                              };
                              setSelectedMovie(updatedMovie);
                              
                              // Update in the database
                              api.media.protect(selectedMovie.id, e.target.checked)
                                .then(() => {
                                  console.log(`Protection status updated for ${selectedMovie.title}`);
                                })
                                .catch(error => {
                                  console.error('Error updating protection status:', error);
                                });
                            }}
                          />
                        }
                        label="Protected from deletion"
                      />
                    </Box>
                  </CardContent>
                </Card>
                
                <Card sx={{ mt: 2 }}>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Deletion Rules</Typography>
                    <Divider sx={{ mb: 2 }} />
                    
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Rules that could affect this movie:
                    </Typography>
                    
                    <Box sx={{ mt: 1 }}>
                      {deletionRules.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No deletion rules found.
                        </Typography>
                      ) : (
                        deletionRules
                          .filter(rule => 
                            rule.enabled && 
                            rule.mediaTypes.includes('movie')
                          )
                          .map(rule => {
                            // Check if the rule applies to this movie
                            const ageInDays = selectedMovie.added ? 
                              Math.floor((new Date() - new Date(selectedMovie.added)) / (1000 * 60 * 60 * 24)) : 
                              0;
                            
                            const isWatched = selectedMovie.hasFile;
                            
                            // Check if rule conditions match
                            const matchesAge = !rule.conditions.olderThan || ageInDays >= rule.conditions.olderThan;
                            const matchesWatched = rule.conditions.watchedStatus === 'any' || 
                              (rule.conditions.watchedStatus === 'watched' && isWatched) ||
                              (rule.conditions.watchedStatus === 'unwatched' && !isWatched);
                            
                            const applies = matchesAge && matchesWatched;
                            
                            return (
                              <Chip 
                                key={rule.id}
                                label={rule.name}
                                size="small"
                                color={applies ? "error" : "default"}
                                sx={{ mr: 1, mb: 1 }}
                              />
                            );
                          })
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={8}>
                <Card>
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>Files</Typography>
                    <Divider sx={{ mb: 2 }} />
                    
                    {movieFiles.length === 0 ? (
                      <Alert severity="info">No files found.</Alert>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Filename</TableCell>
                              <TableCell>Quality</TableCell>
                              <TableCell>Size</TableCell>
                              <TableCell>Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {movieFiles.map((file) => (
                              <TableRow key={file.id} hover>
                                <TableCell>
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      maxWidth: 200,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {file.relativePath}
                                  </Typography>
                                </TableCell>
                                <TableCell>{file.quality?.quality?.name || 'Unknown'}</TableCell>
                                <TableCell>{file.size ? formatBytes(file.size) : 'Unknown'}</TableCell>
                                <TableCell>
                                  <Chip
                                    icon={<DeleteIcon />}
                                    label="Delete"
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    onClick={() => {
                                      console.log("Delete clicked for movie file:", file);
                                      setItemToDelete({
                                        id: file.id,
                                        movieId: selectedMovie.id,
                                        name: `${selectedMovie.title} (${selectedMovie.year}) - ${file.relativePath}`
                                      });
                                      setDeleteType('movie');
                                      setConfirmDeleteDialogOpen(true);
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMovieDetailsDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Confirm Delete Dialog */}
      <Dialog
        open={confirmDeleteDialogOpen}
        onClose={() => setConfirmDeleteDialogOpen(false)}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the file for:
          </Typography>
          <Typography variant="subtitle1" sx={{ mt: 1, fontWeight: 'bold' }}>
            {itemToDelete?.name}
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 2 }}>
            This action cannot be undone and will permanently delete the file from your system.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="error"
            onClick={deleteFile}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MediaManager;

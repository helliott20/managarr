// src/components/MediaManager/MediaDetailsDialog.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Grid, Card, CardContent, Typography, Divider, Box, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Alert, Switch, FormControlLabel, IconButton, Tooltip, Stack,
  LinearProgress, Paper, Skeleton
} from '@mui/material';
import {
  Movie as MovieIcon,
  Tv as TvIcon,
  Delete as DeleteIcon,
  Shield as ShieldIcon,
  AccessTime as AccessTimeIcon,
  Storage as StorageIcon,
  Star as StarIcon,
  Close as CloseIcon
} from '@mui/icons-material';

import api from '../../services/api';
import { formatBytes, formatRelativeTime, getStatusColor } from '../../utils/helpers';

const MediaDetailsDialog = ({ open, type, item, onClose }) => {
  const [episodes, setEpisodes] = useState([]);
  const [movieFiles, setMovieFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletionRules, setDeletionRules] = useState([]);
  const [selectedForDeletion, setSelectedForDeletion] = useState(null);

  // Load detailed data when dialog opens
  useEffect(() => {
    if (open && item) {
      loadDetailedData();
      loadDeletionRules();
    }
  }, [open, item, type]);

  const loadDetailedData = async () => {
    if (!item) return;
    
    try {
      setLoading(true);
      
      if (type === 'tv') {
        const response = await api.integrations.getSonarrSeriesById(item.id);
        if (response.data?.success && response.data.episodes) {
          setEpisodes(response.data.episodes);
        }
      } else if (type === 'movie') {
        const response = await api.integrations.getRadarrMovieById(item.id);
        if (response.data?.success && response.data.files) {
          setMovieFiles(response.data.files);
        }
      }
    } catch (error) {
      console.error('Error loading detailed data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDeletionRules = async () => {
    try {
      const response = await api.rules.getAll();
      if (response.data) {
        setDeletionRules(response.data);
      }
    } catch (error) {
      console.error('Error loading deletion rules:', error);
    }
  };

  const handleProtectionToggle = async (checked) => {
    try {
      await api.media.protect(item.id, checked);
      // Update would be handled by parent component
    } catch (error) {
      console.error('Error updating protection status:', error);
    }
  };

  const handleDeleteFile = async (fileId, mediaId) => {
    try {
      if (type === 'tv') {
        await api.integrations.deleteSonarrFile(mediaId, fileId);
        // Reload episodes
        loadDetailedData();
      } else {
        await api.integrations.deleteRadarrFile(mediaId, fileId);
        // Reload movie files
        loadDetailedData();
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  // Calculate applicable deletion rules
  const applicableRules = useMemo(() => {
    if (!item || !deletionRules.length) return [];
    
    return deletionRules
      .filter(rule => 
        rule.enabled && 
        rule.mediaTypes.includes(type === 'tv' ? 'show' : 'movie')
      )
      .map(rule => {
        const ageInDays = item.added ? 
          Math.floor((new Date() - new Date(item.added)) / (1000 * 60 * 60 * 24)) : 0;
        
        const matchesAge = !rule.conditions.olderThan || ageInDays >= rule.conditions.olderThan;
        const applies = matchesAge; // Simplified logic
        
        return { ...rule, applies };
      });
  }, [item, deletionRules, type]);

  const renderTvDetails = () => (
    <Grid container spacing={3}>
      {/* Series Info */}
      <Grid item xs={12} md={4}>
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TvIcon color="primary" />
                <Typography variant="h6">Series Information</Typography>
              </Box>
              
              <Divider />
              
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Status:</Typography>
                  <Chip 
                    label={item.status} 
                    size="small" 
                    color={getStatusColor(item.status)}
                  />
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Network:</Typography>
                  <Typography variant="body2">{item.network || 'Unknown'}</Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Size:</Typography>
                  <Typography variant="body2">
                    {item.statistics?.sizeOnDisk ? formatBytes(item.statistics.sizeOnDisk) : 'Unknown'}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Episodes:</Typography>
                  <Typography variant="body2">
                    {item.statistics ? 
                      `${item.statistics.episodeFileCount}/${item.statistics.episodeCount}` : 
                      'Unknown'}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Added:</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AccessTimeIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      {item.added ? formatRelativeTime(new Date(item.added)) : 'Unknown'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
              
              <Divider />
              
              <FormControlLabel
                control={
                  <Switch 
                    checked={item.protected || false}
                    onChange={(e) => handleProtectionToggle(e.target.checked)}
                  />
                }
                label="Protected from deletion"
              />
            </Stack>
          </CardContent>
        </Card>

        {/* Deletion Rules */}
        <Card variant="outlined" sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              Applicable Deletion Rules
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {applicableRules.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No applicable deletion rules found.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {applicableRules.map(rule => (
                  <Chip 
                    key={rule.id}
                    label={rule.name}
                    size="small"
                    color={rule.applies ? "error" : "default"}
                    variant={rule.applies ? "filled" : "outlined"}
                  />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Episodes */}
      <Grid item xs={12} md={8}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Episodes {item.statistics && `(${item.statistics.episodeFileCount}/${item.statistics.episodeCount})`}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {loading ? (
              <Stack spacing={1}>
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} variant="rectangular" height={52} />
                ))}
              </Stack>
            ) : episodes.length === 0 ? (
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
                    {episodes
                      .sort((a, b) => {
                        if (a.seasonNumber !== b.seasonNumber) {
                          return a.seasonNumber - b.seasonNumber;
                        }
                        return a.episodeNumber - b.episodeNumber;
                      })
                      .map((episode) => (
                        <TableRow key={episode.id} hover>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              S{episode.seasonNumber.toString().padStart(2, '0')}
                              E{episode.episodeNumber.toString().padStart(2, '0')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap>
                              {episode.title}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {episode.hasFile ? (
                              <Typography variant="body2">
                                {episode.episodeFile?.size ? 
                                  formatBytes(episode.episodeFile.size) : 
                                  'Unknown'}
                              </Typography>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                Missing
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {episode.hasFile ? (
                              <Tooltip title="Delete Episode">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleDeleteFile(
                                    episode.episodeFile.id, 
                                    item.id
                                  )}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              <Chip
                                label="Missing"
                                size="small"
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
  );

  const renderMovieDetails = () => (
    <Grid container spacing={3}>
      {/* Movie Info */}
      <Grid item xs={12} md={4}>
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MovieIcon color="secondary" />
                <Typography variant="h6">Movie Information</Typography>
              </Box>
              
              <Divider />
              
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Status:</Typography>
                  <Chip 
                    label={item.hasFile ? 'Available' : 'Missing'} 
                    size="small" 
                    color={item.hasFile ? 'success' : 'warning'}
                  />
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Quality:</Typography>
                  <Typography variant="body2">
                    {item.movieFile?.quality?.quality?.name || 'Unknown'}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Size:</Typography>
                  <Typography variant="body2">
                    {item.sizeOnDisk ? formatBytes(item.sizeOnDisk) : 'Unknown'}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Rating:</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <StarIcon fontSize="small" color="warning" />
                    <Typography variant="body2">
                      {item.ratings?.imdb?.value?.toFixed(1) || 'Unknown'}
                    </Typography>
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Added:</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <AccessTimeIcon fontSize="small" color="action" />
                    <Typography variant="body2">
                      {item.added ? formatRelativeTime(new Date(item.added)) : 'Unknown'}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
              
              <Divider />
              
              <FormControlLabel
                control={
                  <Switch 
                    checked={item.protected || false}
                    onChange={(e) => handleProtectionToggle(e.target.checked)}
                  />
                }
                label="Protected from deletion"
              />
            </Stack>
          </CardContent>
        </Card>

        {/* Deletion Rules */}
        <Card variant="outlined" sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              Applicable Deletion Rules
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {applicableRules.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No applicable deletion rules found.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {applicableRules.map(rule => (
                  <Chip 
                    key={rule.id}
                    label={rule.name}
                    size="small"
                    color={rule.applies ? "error" : "default"}
                    variant={rule.applies ? "filled" : "outlined"}
                  />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Movie Files */}
      <Grid item xs={12} md={8}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Files
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {loading ? (
              <Stack spacing={1}>
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} variant="rectangular" height={52} />
                ))}
              </Stack>
            ) : movieFiles.length === 0 ? (
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
                          <Typography variant="body2" noWrap>
                            {file.relativePath}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {file.quality?.quality?.name || 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {file.size ? formatBytes(file.size) : 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Delete File">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteFile(file.id, item.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
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
  );

  if (!item) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { minHeight: '80vh' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6">
              {type === 'tv' ? 'TV Series Details' : 'Movie Details'}
            </Typography>
            <Typography variant="subtitle2" color="text.secondary">
              {item.title} ({item.year})
            </Typography>
          </Box>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ p: 3 }}>
        {type === 'tv' ? renderTvDetails() : renderMovieDetails()}
      </DialogContent>
      
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default MediaDetailsDialog;
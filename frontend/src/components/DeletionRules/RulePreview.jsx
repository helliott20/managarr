// src/components/DeletionRules/RulePreview.jsx
import React from 'react';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, CircularProgress, 
  Alert, Tabs, Tab, Badge, Pagination, Tooltip, Chip, Grid
} from '@mui/material';
import MovieIcon from '@mui/icons-material/Movie';
import TvIcon from '@mui/icons-material/Tv';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WarningIcon from '@mui/icons-material/Warning';
import StorageIcon from '@mui/icons-material/Storage';
import PieChartIcon from '@mui/icons-material/PieChart';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import PendingIcon from '@mui/icons-material/Pending';

// Format bytes to human-readable size
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const RulePreview = ({ 
  affectedMedia, 
  previewLoading, 
  previewError, 
  previewTab, 
  previewStats, 
  page, 
  itemsPerPage,
  onTabChange,
  onPageChange,
  getCurrentPageItems,
  ruleConditions,
  filtersEnabled
}) => {
  console.log('RulePreview - affectedMedia:', affectedMedia);
  console.log('RulePreview - getCurrentPageItems:', getCurrentPageItems());

  const generateConditionSummary = () => {
    if (!ruleConditions || !filtersEnabled) return null;

    const summaryParts = [];
    if (filtersEnabled.status && ruleConditions.watchStatus !== 'any') {
      summaryParts.push(`Status: ${ruleConditions.watchStatus.charAt(0).toUpperCase() + ruleConditions.watchStatus.slice(1)}`);
    }
    if (filtersEnabled.age && ruleConditions.minAge > 0) {
      // For age, we might want to use the same unit conversion logic as in RuleConditions for display
      // For simplicity here, just show days or a placeholder for more complex display
      summaryParts.push(`Older than ${ruleConditions.minAge} days`);
    }
    if (filtersEnabled.quality && ruleConditions.minRating > 0) {
      summaryParts.push(`Rating below ${ruleConditions.minRating}/10`);
    }
    if (filtersEnabled.size && ruleConditions.size > 0) {
      summaryParts.push(`Larger than ${ruleConditions.size} GB`);
    }

    if (summaryParts.length === 0) {
      return "No specific filters applied. Showing all matching library items.";
    }
    return `Filters: ${summaryParts.join(', ')}.`;
  };

  const conditionSummary = generateConditionSummary();

  return (
    <Paper sx={{ 
      p: 2, 
      height: 'calc(100vh - 72px)', // Account for toolbar + padding
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden',
      minHeight: 0 // Critical for flex shrinking
    }}>
        <Box sx={{ mb: 2, flexShrink: 0 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
            <VisibilityIcon sx={{ mr: 1 }} />
            Live Preview
            {previewLoading && (
              <CircularProgress size={20} sx={{ ml: 2 }} />
            )}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Adjust conditions to see what media will be affected in real-time
          </Typography>
          {conditionSummary && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {conditionSummary}
            </Typography>
          )}
        </Box>
        
        {previewError && (
          <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }}>
            {previewError}
          </Alert>
        )}
      
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={previewTab} 
            onChange={onTabChange}
            aria-label="preview tabs"
            variant="fullWidth"
          >
          <Tab 
            label={
              <Badge 
                badgeContent={affectedMedia.length} 
                color="error"
                max={999}
                sx={{ '& .MuiBadge-badge': { fontSize: '0.75rem', height: '20px', minWidth: '20px' } }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <MovieIcon sx={{ mr: 0.5, fontSize: '1rem' }} />
                  Affected Media
                </Box>
              </Badge>
            } 
            value="affected" 
          />
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <PieChartIcon sx={{ mr: 0.5, fontSize: '1rem' }} />
                Summary
              </Box>
            }
            value="summary" 
          />
          </Tabs>
        </Box>
        
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {previewTab === 'affected' ? (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {affectedMedia.length > 0 ? (
                <>
                  <TableContainer component={Paper} sx={{ 
                    flex: 1,
                    overflow: 'auto',
                    maxWidth: '100%',
                    maxHeight: '800px', // Constrain height to fit on 1920px screen
                    minHeight: 0, // Allow shrinking
                    '& .MuiTable-root': {
                      minWidth: '600px' // Ensures table doesn't get too compressed
                    }
                  }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ minWidth: '200px' }}>Title</TableCell>
                        <TableCell sx={{ width: '80px' }}>Type</TableCell>
                        <TableCell sx={{ width: '90px' }}>Quality</TableCell>
                        <TableCell sx={{ width: '70px' }}>Rating</TableCell>
                        <TableCell sx={{ width: '70px' }}>Age</TableCell>
                        <TableCell sx={{ width: '80px' }}>Size</TableCell>
                        <TableCell sx={{ width: '90px' }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getCurrentPageItems().map((item) => {
                        const daysSinceAdded = Math.floor((new Date() - new Date(item.added)) / (1000 * 60 * 60 * 24));
                        
                        return (
                          <TableRow key={item.id} hover>
                            <TableCell sx={{ 
                              maxWidth: '200px', 
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              padding: '8px 12px'
                            }}>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                {item.type === 'movie' ? 
                                  <MovieIcon fontSize="small" sx={{ mr: 0.5, color: 'rgba(46, 204, 113, 0.8)' }} /> : 
                                  <TvIcon fontSize="small" sx={{ mr: 0.5, color: 'rgba(52, 152, 219, 0.8)' }} />
                                }
                                <Tooltip title={item.title} placement="top-start">
                                  <Typography variant="body2" sx={{ 
                                    fontWeight: 'medium', 
                                    overflow: 'hidden', 
                                    textOverflow: 'ellipsis', 
                                    whiteSpace: 'nowrap',
                                    fontSize: '0.8rem'
                                  }}>
                                    {item.title}
                                  </Typography>
                                </Tooltip>
                              </Box>
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', padding: '8px 12px' }}>
                              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                {item.type === 'movie' ? 'Movie' : item.type === 'show' ? 'TV' : 'Other'}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: '8px 6px' }}>
                              <Chip 
                                size="small" 
                                label={item.quality?.quality?.name || 'Unknown'} 
                                color={item.quality?.quality?.name?.toLowerCase().includes('4k') ? 'error' : 'default'}
                                sx={{ fontSize: '0.7rem', height: '20px' }}
                              />
                            </TableCell>
                            <TableCell sx={{ padding: '8px 6px', textAlign: 'center' }}>
                              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                {item.ratings?.[0]?.value?.toFixed(1) || 'N/A'}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', padding: '8px 6px', textAlign: 'center' }}>
                              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                {daysSinceAdded}d
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: '8px 6px', textAlign: 'center' }}>
                              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                {formatBytes(item.size || 0)}
                              </Typography>
                            </TableCell>
                            <TableCell sx={{ padding: '8px 6px' }}>
                              <Chip 
                                size="small" 
                                label={item.status || 'Unknown'} 
                                color={
                                  item.status === 'downloaded' ? 'success' :
                                  item.status === 'monitored' ? 'info' :
                                  item.status === 'unmonitored' ? 'warning' : 'default'
                                }
                                sx={{ fontSize: '0.7rem', height: '20px' }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </TableContainer>
                  
                  {/* Pagination - Always visible at bottom */}
                  {affectedMedia.length > itemsPerPage && (
                    <Box sx={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      minHeight: '50px', // Minimum height for pagination
                      alignItems: 'center',
                      borderTop: 1,
                      borderColor: 'divider',
                      backgroundColor: 'background.paper',
                      flexShrink: 0, // Prevents pagination from shrinking
                      py: 1
                    }}>
                      <Pagination 
                        count={Math.ceil(affectedMedia.length / itemsPerPage)} 
                        page={page} 
                        onChange={onPageChange}
                        size="small"
                      />
                    </Box>
                  )}
                </>
              ) : (
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  height: '100%',
                  p: 4
                }}>
                  <Typography variant="body1" color="text.secondary" gutterBottom>
                    No media matches the current rule conditions
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Try adjusting the conditions to see matching media
                  </Typography>
                </Box>
              )}
            </Box>
          ) : (
            <Box sx={{ 
              height: '100%',
              overflow: 'auto',
              p: 2, 
              backgroundColor: 'rgba(0, 0, 0, 0.03)', 
              borderRadius: 1
            }}>
            {/* Storage Impact Section */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                <StorageIcon sx={{ mr: 1 }} />
                Storage Impact
              </Typography>
              <Typography variant="h4" color="primary" sx={{ mb: 1 }}>
                {formatBytes(previewStats.totalSize)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total space that would be freed by this rule
              </Typography>
            </Box>
            
            {/* Media Type Distribution */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Media Type Distribution
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <MovieIcon sx={{ fontSize: 40, color: 'rgba(46, 204, 113, 0.8)', mb: 1 }} />
                    <Typography variant="h6">{previewStats.byType.movie}</Typography>
                    <Typography variant="body2" color="text.secondary">Movies</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <TvIcon sx={{ fontSize: 40, color: 'rgba(52, 152, 219, 0.8)', mb: 1 }} />
                    <Typography variant="h6">{previewStats.byType.show}</Typography>
                    <Typography variant="body2" color="text.secondary">TV Shows</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <WarningIcon sx={{ fontSize: 40, color: 'rgba(231, 76, 60, 0.8)', mb: 1 }} />
                    <Typography variant="h6">{previewStats.byType.other}</Typography>
                    <Typography variant="body2" color="text.secondary">Other</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
            
            {/* Watch Status Distribution */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Watch Status Distribution
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <VisibilityIcon sx={{ fontSize: 40, color: 'rgba(46, 204, 113, 0.8)', mb: 1 }} />
                    <Typography variant="h6">{previewStats.byWatchStatus.watched}</Typography>
                    <Typography variant="body2" color="text.secondary">Watched</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <VisibilityOffIcon sx={{ fontSize: 40, color: 'rgba(52, 152, 219, 0.8)', mb: 1 }} />
                    <Typography variant="h6">{previewStats.byWatchStatus.unwatched}</Typography>
                    <Typography variant="body2" color="text.secondary">Unwatched</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <PendingIcon sx={{ fontSize: 40, color: 'rgba(241, 196, 15, 0.8)', mb: 1 }} />
                    <Typography variant="h6">{previewStats.byWatchStatus['in-progress']}</Typography>
                    <Typography variant="body2" color="text.secondary">In Progress</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
            </Box>
          )}
        </Box>
    </Paper>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default React.memo(RulePreview, (prevProps, nextProps) => {
  // Custom comparison to avoid deep equality checks on large arrays
  const prevMedia = prevProps.affectedMedia;
  const nextMedia = nextProps.affectedMedia;
  
  // Quick checks first
  if (prevMedia.length !== nextMedia.length) return false;
  if (prevProps.loading !== nextProps.loading) return false;
  if (prevProps.error !== nextProps.error) return false;
  if (prevProps.tab !== nextProps.tab) return false;
  if (prevProps.page !== nextProps.page) return false;
  if (prevProps.itemsPerPage !== nextProps.itemsPerPage) return false;
  
  // Check stats object
  const prevStats = prevProps.previewStats;
  const nextStats = nextProps.previewStats;
  if (prevStats.totalSize !== nextStats.totalSize) return false;
  if (JSON.stringify(prevStats.byType) !== JSON.stringify(nextStats.byType)) return false;
  if (JSON.stringify(prevStats.byWatchStatus) !== JSON.stringify(nextStats.byWatchStatus)) return false;
  
  // Only do expensive array comparison if lengths match and other props are same
  if (prevMedia.length > 0) {
    // Compare just the first and last items as a quick heuristic
    const firstMatch = JSON.stringify(prevMedia[0]) === JSON.stringify(nextMedia[0]);
    const lastMatch = prevMedia.length === 1 ? true : 
      JSON.stringify(prevMedia[prevMedia.length - 1]) === JSON.stringify(nextMedia[nextMedia.length - 1]);
    return firstMatch && lastMatch;
  }
  
  return true;
});

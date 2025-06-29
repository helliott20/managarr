// src/components/DeletionRules/PendingDeletions.jsx
import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Button, Chip, 
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem,
  Checkbox, Alert, CircularProgress, Pagination,
  Card, CardContent, Divider, Grid,
  IconButton, Tooltip, Badge
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import ScheduleIcon from '@mui/icons-material/Schedule';
import InfoIcon from '@mui/icons-material/Info';
import MovieIcon from '@mui/icons-material/Movie';
import TvIcon from '@mui/icons-material/Tv';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import SettingsIcon from '@mui/icons-material/Settings';
import LinearProgress from '@mui/material/LinearProgress';
import api from '../../services/api';

// Format bytes to human-readable size
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getStatusColor = (status) => {
  switch (status) {
    case 'pending': return 'warning';
    case 'approved': return 'success';
    case 'cancelled': return 'error';
    case 'completed': return 'info';
    case 'failed': return 'error';
    default: return 'default';
  }
};

const PendingDeletions = () => {
  const [pendingDeletions, setPendingDeletions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  
  // Execution state
  const [executionStatus, setExecutionStatus] = useState({ 
    isRunning: false, 
    isScheduled: false 
  });
  const [executionProgress, setExecutionProgress] = useState({
    show: false,
    current: 0,
    total: 0,
    percentage: 0,
    currentFile: '',
    results: []
  });
  const [scheduleDialog, setScheduleDialog] = useState({ 
    open: false, 
    intervalMinutes: 60 
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({});
  
  // Dialog states
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [reason, setReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchPendingDeletions = async () => {
    try {
      setLoading(true);
      const response = await api.pendingDeletions.getAll({
        page,
        limit: 20,
        status: statusFilter,
        sortBy: 'createdAt',
        sortOrder: 'DESC'
      });

      if (response.data.success) {
        setPendingDeletions(response.data.data.pendingDeletions);
        setTotalPages(response.data.data.pagination.totalPages);
      }
    } catch (err) {
      setError('Failed to fetch pending deletions');
      console.error('Error fetching pending deletions:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const response = await api.pendingDeletions.getSummary();
      if (response.data.success) {
        setSummary(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  };

  // Fetch execution status
  const fetchExecutionStatus = async () => {
    try {
      const response = await api.pendingDeletions.getExecutionStatus();
      if (response.data.success) {
        setExecutionStatus(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching execution status:', err);
    }
  };

  // Execute approved deletions now
  const handleExecuteNow = async () => {
    try {
      setExecutionProgress({ 
        show: true, 
        current: 0, 
        total: 0, 
        percentage: 0, 
        currentFile: 'Starting execution...', 
        results: [] 
      });
      
      const response = await api.pendingDeletions.execute();
      
      if (response.data.success) {
        const result = response.data.data;
        setExecutionProgress(prev => ({
          ...prev,
          current: result.totalItems,
          total: result.totalItems,
          percentage: 100,
          currentFile: `Completed: ${result.successful} successful, ${result.failed} failed`,
          results: result.results || []
        }));
        
        // Refresh data
        await fetchPendingDeletions();
        await fetchSummary();
        
        // Hide progress after delay
        setTimeout(() => {
          setExecutionProgress(prev => ({ ...prev, show: false }));
        }, 3000);
      }
    } catch (error) {
      console.error('Error executing deletions:', error);
      setExecutionProgress(prev => ({
        ...prev,
        currentFile: `Error: ${error.response?.data?.error || error.message}`,
        percentage: 0
      }));
    }
  };

  // Start scheduled execution
  const handleStartSchedule = async () => {
    try {
      const response = await api.pendingDeletions.startScheduledExecution(scheduleDialog.intervalMinutes);
      if (response.data.success) {
        setExecutionStatus(prev => ({ ...prev, isScheduled: true }));
        setScheduleDialog({ open: false, intervalMinutes: 60 });
        await fetchExecutionStatus();
      }
    } catch (error) {
      console.error('Error starting scheduled execution:', error);
    }
  };

  // Stop scheduled execution
  const handleStopSchedule = async () => {
    try {
      const response = await api.pendingDeletions.stopScheduledExecution();
      if (response.data.success) {
        setExecutionStatus(prev => ({ ...prev, isScheduled: false }));
        await fetchExecutionStatus();
      }
    } catch (error) {
      console.error('Error stopping scheduled execution:', error);
    }
  };

  useEffect(() => {
    fetchPendingDeletions();
    fetchSummary();
    fetchExecutionStatus();
  }, [page, statusFilter]);

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelectedItems(pendingDeletions.map(item => item.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (id) => {
    setSelectedItems(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };

  const handleBulkApprove = async () => {
    try {
      setActionLoading(true);
      const response = await api.pendingDeletions.bulkApprove({
        ids: selectedItems,
        approvedBy: 'user',
        reason,
        scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : undefined
      });

      if (response.data.success) {
        setApproveDialogOpen(false);
        setSelectedItems([]);
        setReason('');
        setScheduledDate('');
        fetchPendingDeletions();
        fetchSummary();
      }
    } catch (err) {
      setError('Failed to approve deletions');
      console.error('Error approving deletions:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkCancel = async () => {
    try {
      setActionLoading(true);
      const response = await api.pendingDeletions.bulkCancel({
        ids: selectedItems,
        cancelledBy: 'user',
        reason
      });

      if (response.data.success) {
        setCancelDialogOpen(false);
        setSelectedItems([]);
        setReason('');
        fetchPendingDeletions();
        fetchSummary();
      }
    } catch (err) {
      setError('Failed to cancel deletions');
      console.error('Error cancelling deletions:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleIndividualApprove = async (id) => {
    try {
      const response = await api.pendingDeletions.approve(id, {
        approvedBy: 'user'
      });

      if (response.data.success) {
        fetchPendingDeletions();
        fetchSummary();
      }
    } catch (err) {
      setError('Failed to approve deletion');
      console.error('Error approving deletion:', err);
    }
  };

  const handleIndividualCancel = async (id) => {
    try {
      const response = await api.pendingDeletions.cancel(id, {
        cancelledBy: 'user'
      });

      if (response.data.success) {
        fetchPendingDeletions();
        fetchSummary();
      }
    } catch (err) {
      setError('Failed to cancel deletion');
      console.error('Error cancelling deletion:', err);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Pending Deletions</Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={() => {
            fetchPendingDeletions();
            fetchSummary();
          }}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {Object.entries(summary).map(([status, data]) => (
          <Grid item xs={12} sm={6} md={3} key={status}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h6" sx={{ textTransform: 'capitalize' }}>
                      {status}
                    </Typography>
                    <Typography variant="h4" color="primary">
                      {data.count || 0}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatBytes(data.totalSize || 0)}
                    </Typography>
                  </Box>
                  <Chip 
                    label={status} 
                    color={getStatusColor(status)} 
                    variant="outlined"
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Execution Controls */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
            <DeleteIcon sx={{ mr: 1 }} />
            Deletion Execution
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip 
              label={executionStatus.isRunning ? 'Running' : 'Idle'}
              color={executionStatus.isRunning ? 'primary' : 'default'}
              size="small"
            />
            <Chip 
              label={executionStatus.isScheduled ? 'Scheduled' : 'Manual'}
              color={executionStatus.isScheduled ? 'success' : 'default'}
              size="small"
            />
          </Box>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={handleExecuteNow}
            disabled={executionStatus.isRunning || (summary.approved?.count || 0) === 0}
            color="error"
          >
            Execute Now ({summary.approved?.count || 0} approved)
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<ScheduleIcon />}
            onClick={() => setScheduleDialog({ ...scheduleDialog, open: true })}
            disabled={executionStatus.isRunning}
          >
            {executionStatus.isScheduled ? 'Modify Schedule' : 'Setup Schedule'}
          </Button>
          
          {executionStatus.isScheduled && (
            <Button
              variant="outlined"
              startIcon={<StopIcon />}
              onClick={handleStopSchedule}
              disabled={executionStatus.isRunning}
              color="warning"
            >
              Stop Schedule
            </Button>
          )}
        </Box>

        {/* Execution Progress */}
        {executionProgress.show && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {executionProgress.currentFile}
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={executionProgress.percentage} 
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {executionProgress.current} / {executionProgress.total} items processed
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Filters and Actions */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
              </Select>
            </FormControl>
            
            {selectedItems.length > 0 && (
              <Typography variant="body2" color="text.secondary">
                {selectedItems.length} selected
              </Typography>
            )}
          </Box>

          {selectedItems.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckIcon />}
                onClick={() => setApproveDialogOpen(true)}
                disabled={statusFilter !== 'pending'}
              >
                Approve Selected
              </Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<CloseIcon />}
                onClick={() => setCancelDialogOpen(true)}
                disabled={statusFilter === 'completed'}
              >
                Cancel Selected
              </Button>
            </Box>
          )}
        </Box>
      </Paper>

      {/* Pending Deletions Table */}
      <Paper>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={selectedItems.length > 0 && selectedItems.length < pendingDeletions.length}
                        checked={pendingDeletions.length > 0 && selectedItems.length === pendingDeletions.length}
                        onChange={handleSelectAll}
                      />
                    </TableCell>
                    <TableCell>Media</TableCell>
                    <TableCell>Rule</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pendingDeletions.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedItems.includes(item.id)}
                          onChange={() => handleSelectItem(item.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {item.Media?.type === 'movie' ? 
                            <MovieIcon fontSize="small" sx={{ mr: 1, color: 'rgba(46, 204, 113, 0.8)' }} /> : 
                            <TvIcon fontSize="small" sx={{ mr: 1, color: 'rgba(52, 152, 219, 0.8)' }} />
                          }
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                              {item.Media?.title || item.Media?.filename || 'Unknown'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {item.Media?.path}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {item.DeletionRule?.name || 'Unknown Rule'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatBytes(item.Media?.size || 0)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={item.status} 
                          color={getStatusColor(item.status)} 
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          {item.status === 'pending' && (
                            <>
                              <Tooltip title="Approve">
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={() => handleIndividualApprove(item.id)}
                                >
                                  <CheckIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Cancel">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleIndividualCancel(item.id)}
                                >
                                  <CloseIcon />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                          {item.status === 'approved' && (
                            <Tooltip title="Cancel">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleIndividualCancel(item.id)}
                              >
                                <CloseIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {pendingDeletions.length === 0 && (
              <Box sx={{ textAlign: 'center', p: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  No pending deletions found
                </Typography>
              </Box>
            )}

            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(e, value) => setPage(value)}
                  color="primary"
                />
              </Box>
            )}
          </>
        )}
      </Paper>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Approve Deletions</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            You are about to approve {selectedItems.length} deletion(s). This action cannot be undone.
          </Typography>
          
          <TextField
            fullWidth
            label="Reason (optional)"
            multiline
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ mb: 2 }}
          />
          
          <TextField
            fullWidth
            label="Scheduled Date (optional)"
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            InputLabelProps={{
              shrink: true,
            }}
            helperText="Leave empty to execute immediately"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleBulkApprove} 
            variant="contained" 
            color="success"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : 'Approve'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onClose={() => setCancelDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cancel Deletions</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            You are about to cancel {selectedItems.length} deletion(s).
          </Typography>
          
          <TextField
            fullWidth
            label="Reason (optional)"
            multiline
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)}>Close</Button>
          <Button 
            onClick={handleBulkCancel} 
            variant="contained" 
            color="error"
            disabled={actionLoading}
          >
            {actionLoading ? <CircularProgress size={20} /> : 'Cancel Deletions'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleDialog.open} onClose={() => setScheduleDialog({ ...scheduleDialog, open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ScheduleIcon sx={{ mr: 1 }} />
            Setup Scheduled Execution
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 3 }}>
            Schedule automatic execution of approved pending deletions. The system will check for approved deletions and execute them at the specified interval.
          </Alert>
          
          <TextField
            label="Interval (minutes)"
            type="number"
            fullWidth
            value={scheduleDialog.intervalMinutes}
            onChange={(e) => setScheduleDialog({ 
              ...scheduleDialog, 
              intervalMinutes: parseInt(e.target.value) || 60 
            })}
            helperText="How often to check and execute approved deletions (minimum 5 minutes)"
            sx={{ mt: 2 }}
            inputProps={{ min: 5 }}
          />
          
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            <strong>Note:</strong> Only deletions with status "approved" and scheduled date in the past will be executed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleDialog({ ...scheduleDialog, open: false })}>
            Cancel
          </Button>
          <Button 
            onClick={handleStartSchedule} 
            variant="contained"
            disabled={scheduleDialog.intervalMinutes < 5}
          >
            Start Schedule
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PendingDeletions;

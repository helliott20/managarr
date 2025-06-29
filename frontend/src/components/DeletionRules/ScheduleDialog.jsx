// src/components/DeletionRules/ScheduleDialog.jsx
import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, FormControl, InputLabel, Select, MenuItem,
  TextField, Box, Typography, Switch, FormControlLabel,
  Grid, Divider, Chip
} from '@mui/material';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const ScheduleDialog = ({ open, onClose, rule, onSave }) => {
  const [schedule, setSchedule] = useState({
    enabled: rule?.schedule?.enabled || false,
    frequency: rule?.schedule?.frequency || 'manual',
    interval: rule?.schedule?.interval || 1,
    unit: rule?.schedule?.unit || 'days',
    time: rule?.schedule?.time || '02:00'
  });

  const [deletionStrategy, setDeletionStrategy] = useState({
    sonarr: rule?.deletionStrategy?.sonarr || 'file_only',
    radarr: rule?.deletionStrategy?.radarr || 'file_only',
    deleteFiles: rule?.deletionStrategy?.deleteFiles !== false,
    addImportExclusion: rule?.deletionStrategy?.addImportExclusion || false
  });

  const handleScheduleChange = (field, value) => {
    setSchedule(prev => ({ ...prev, [field]: value }));
  };

  const handleStrategyChange = (field, value) => {
    setDeletionStrategy(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave({ schedule, deletionStrategy });
    onClose();
  };

  const getNextRunTime = () => {
    if (!schedule.enabled || schedule.frequency === 'manual') {
      return 'Manual execution only';
    }

    const now = new Date();
    let nextRun = new Date();
    
    // Set time of day
    const [hours, minutes] = schedule.time.split(':');
    nextRun.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // If time has passed today, start from tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    switch (schedule.frequency) {
      case 'daily':
        // Already set for tomorrow if needed
        break;
      case 'weekly':
        // Find next week
        const daysUntilNextWeek = 7 - ((nextRun.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilNextWeek > 0) {
          nextRun.setDate(nextRun.getDate() + Math.ceil(daysUntilNextWeek));
        }
        break;
      case 'monthly':
        // Next month
        nextRun.setMonth(nextRun.getMonth() + 1);
        nextRun.setDate(1); // First day of month
        break;
      case 'custom':
        // Add interval
        if (schedule.unit === 'days') {
          nextRun.setDate(nextRun.getDate() + schedule.interval);
        } else if (schedule.unit === 'weeks') {
          nextRun.setDate(nextRun.getDate() + (schedule.interval * 7));
        } else if (schedule.unit === 'months') {
          nextRun.setMonth(nextRun.getMonth() + schedule.interval);
        }
        break;
    }

    return nextRun.toLocaleString();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        <ScheduleIcon sx={{ mr: 1 }} />
        Rule Configuration: {rule?.name}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          {/* Schedule Configuration */}
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
            <AccessTimeIcon sx={{ mr: 1 }} />
            Schedule Configuration
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={schedule.enabled}
                    onChange={(e) => handleScheduleChange('enabled', e.target.checked)}
                  />
                }
                label="Enable Automatic Scheduling"
              />
            </Grid>
            
            {schedule.enabled && (
              <>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Frequency</InputLabel>
                    <Select
                      value={schedule.frequency}
                      label="Frequency"
                      onChange={(e) => handleScheduleChange('frequency', e.target.value)}
                    >
                      <MenuItem value="daily">Daily</MenuItem>
                      <MenuItem value="weekly">Weekly</MenuItem>
                      <MenuItem value="monthly">Monthly</MenuItem>
                      <MenuItem value="custom">Custom Interval</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    type="time"
                    label="Time of Day"
                    value={schedule.time}
                    onChange={(e) => handleScheduleChange('time', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                
                {schedule.frequency === 'custom' && (
                  <>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Interval"
                        value={schedule.interval}
                        onChange={(e) => handleScheduleChange('interval', parseInt(e.target.value) || 1)}
                        inputProps={{ min: 1 }}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth>
                        <InputLabel>Unit</InputLabel>
                        <Select
                          value={schedule.unit}
                          label="Unit"
                          onChange={(e) => handleScheduleChange('unit', e.target.value)}
                        >
                          <MenuItem value="days">Days</MenuItem>
                          <MenuItem value="weeks">Weeks</MenuItem>
                          <MenuItem value="months">Months</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </>
                )}
                
                <Grid item xs={12}>
                  <Chip 
                    label={`Next Run: ${getNextRunTime()}`}
                    color="primary"
                    variant="outlined"
                    sx={{ mt: 1 }}
                  />
                </Grid>
              </>
            )}
          </Grid>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Deletion Strategy Configuration */}
          <Typography variant="h6" sx={{ mb: 2 }}>
            Deletion Strategy
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Sonarr Strategy</InputLabel>
                <Select
                  value={deletionStrategy.sonarr}
                  label="Sonarr Strategy"
                  onChange={(e) => handleStrategyChange('sonarr', e.target.value)}
                >
                  <MenuItem value="file_only">Delete Files Only</MenuItem>
                  <MenuItem value="unmonitor">Unmonitor Series</MenuItem>
                  <MenuItem value="remove_series">Remove Series Completely</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Radarr Strategy</InputLabel>
                <Select
                  value={deletionStrategy.radarr}
                  label="Radarr Strategy"
                  onChange={(e) => handleStrategyChange('radarr', e.target.value)}
                >
                  <MenuItem value="file_only">Delete Files Only</MenuItem>
                  <MenuItem value="remove_movie">Remove Movie Completely</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={deletionStrategy.deleteFiles}
                    onChange={(e) => handleStrategyChange('deleteFiles', e.target.checked)}
                  />
                }
                label="Delete actual files when removing from *arr"
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={deletionStrategy.addImportExclusion}
                    onChange={(e) => handleStrategyChange('addImportExclusion', e.target.checked)}
                  />
                }
                label="Add to import exclusion list (prevents re-download)"
              />
            </Grid>
          </Grid>
          
          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              <strong>Strategy Explanation:</strong><br/>
              • <strong>File Only:</strong> Removes media files but keeps entries in Sonarr/Radarr for potential re-download<br/>
              • <strong>Unmonitor:</strong> (Sonarr only) Stops monitoring but keeps series and files<br/>
              • <strong>Remove Completely:</strong> Removes the entire entry from Sonarr/Radarr
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">
          Save Configuration
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScheduleDialog;
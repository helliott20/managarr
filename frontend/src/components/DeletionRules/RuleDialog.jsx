// src/components/DeletionRules/RuleDialog.jsx
import React, { useState } from 'react';
import { 
  Box, Typography, Paper, Grid, FormControl, InputLabel, 
  Select, MenuItem, Chip, Dialog, DialogTitle, DialogContent, 
  DialogActions, Button, TextField, FormControlLabel, Switch,
  IconButton, Tooltip, CircularProgress
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import StorageIcon from '@mui/icons-material/Storage';
import SyncIcon from '@mui/icons-material/Sync';
import api from '../../../../frontend/src/services/api';
import RuleConditions from './RuleConditions';
import RulePreview from './RulePreview';

const RuleDialog = ({ 
  open, 
  onClose, 
  currentRule, 
  newRule, 
  onRuleChange, 
  onConditionChange,
  onFilterEnableChange, // Added new prop
  onSave,
  affectedMedia,
  previewLoading,
  previewError,
  previewTab,
  previewStats,
  page,
  itemsPerPage,
  onPreviewTabChange,
  onPageChange,
  getCurrentPageItems
}) => {
  const [syncing, setSyncing] = useState(false);
  
  // Function to sync data from Sonarr and Radarr
  const handleSync = async () => {
    try {
      setSyncing(true);
      
      // Call the sync API
      await api.sync.start();
      
      // Poll for sync status
      const checkSyncStatus = async () => {
        try {
          const response = await api.sync.getStatus();
          
          if (response.data.status === 'completed') {
            setSyncing(false);
            // Refresh the preview
            if (newRule.libraries.length > 0) {
              onConditionChange('minAge', newRule.conditions.minAge);
            }
          } else if (response.data.status === 'error') {
            setSyncing(false);
            console.error('Sync error:', response.data.error);
          } else {
            // Continue polling
            setTimeout(checkSyncStatus, 2000);
          }
        } catch (statusError) {
          console.error('Error checking sync status:', statusError);
          setSyncing(false);
        }
      };
      
      // Start polling
      checkSyncStatus();
    } catch (error) {
      console.error('Error syncing data:', error);
      setSyncing(false);
    }
  };

  // Handle condition changes
  const handleConditionChange = (field, value) => {
    const updatedConditions = { ...newRule.conditions, [field]: value };
    onConditionChange(field, value);
  };

  // Handle filter toggle
  const handleFilterToggle = (filter) => {
    const updatedFilters = { ...newRule.filtersEnabled, [filter]: !newRule.filtersEnabled[filter] };
    onFilterEnableChange(filter, updatedFilters[filter]);
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="xl" 
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: 'background.default',
          maxHeight: 'calc(100vh - 80px)',
          height: 'calc(100vh - 80px)',
          width: 'calc(100vw - 80px)',
          maxWidth: '1400px',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 2
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <span>{currentRule ? `Edit Rule: ${currentRule.name}` : 'Create New Rule'}</span>
        <Tooltip title="Sync media data from Sonarr and Radarr">
          <IconButton 
            onClick={handleSync} 
            disabled={syncing}
            color="primary"
            size="small"
          >
            {syncing ? <CircularProgress size={24} /> : <SyncIcon />}
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent sx={{ flex: 1, overflow: 'hidden', p: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, p: 2, display: 'flex', gap: 3 }}>
            {/* Left side - Rule Configuration and Conditions */}
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
                <Paper sx={{ borderRadius: 2, mb: 3, overflow: 'hidden' }}>
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider'}}>
                    <Typography variant="h6">Rule Configuration</Typography>
                  </Box>
                  <Box sx={{ p: 3 }}>
                    <Grid container spacing={3}>
                      <Grid item xs={12} sm={8}>
                        <TextField
                          label="Rule Name"
                          fullWidth
                          value={newRule.name}
                          onChange={(e) => onRuleChange('name', e.target.value)}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={newRule.enabled}
                              onChange={(e) => onRuleChange('enabled', e.target.checked)}
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
                <Paper sx={{ borderRadius: 2, mb: 3, overflow: 'hidden' }}>
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider'}}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                      <StorageIcon sx={{ mr: 1 }} />
                      Target Libraries
                    </Typography>
                  </Box>
                  <Box sx={{ p: 3 }}>
                    <FormControl fullWidth>
                      <InputLabel>Libraries</InputLabel>
                      <Select
                        multiple
                        value={newRule.libraries}
                        label="Libraries"
                        onChange={(e) => onRuleChange('libraries', e.target.value)}
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
                
                {/* Conditions */}
                <Box sx={{ mb: 2 }}>
                  <RuleConditions 
                    conditions={newRule.conditions}
                    filtersEnabled={newRule.filtersEnabled}
                    onChange={handleConditionChange}
                    onFilterEnableChange={handleFilterToggle}
                  />
                </Box>
              </Box>
            </Box>
            
            {/* Right side - Live Preview */}
            <Box sx={{ 
              flex: 1,
              minWidth: '400px',
              height: '80%'
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
                onTabChange={onPreviewTabChange}
                onPageChange={onPageChange}
                getCurrentPageItems={getCurrentPageItems}
              />
            </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ flexShrink: 0 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          variant="contained" 
          onClick={onSave}
          startIcon={<SaveIcon />}
        >
          {currentRule ? 'Update Rule' : 'Create Rule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RuleDialog;

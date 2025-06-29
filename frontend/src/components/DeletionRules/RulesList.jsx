// src/components/DeletionRules/RulesList.jsx
import React, { useState } from 'react';
import { 
  Card, CardContent, CardHeader, Divider, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Typography, 
  Chip, IconButton, Box, Collapse, Button, Tooltip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RuleIcon from '@mui/icons-material/Rule';
import ToggleOnIcon from '@mui/icons-material/ToggleOn';
import ToggleOffIcon from '@mui/icons-material/ToggleOff';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ScheduleDialog from './ScheduleDialog';

// Component to display rule conditions with expandable view
const RuleConditionsDisplay = ({ rule }) => {
  const [expanded, setExpanded] = useState(false);
  
  // Collect all active conditions
  const activeConditions = [];
  
  // Media type (always show)
  activeConditions.push({
    label: `Media: ${rule.conditions.mediaType === 'any' ? 'Any' : 
           rule.conditions.mediaType === 'movies' ? 'Movies' : 'TV Shows'}`,
    color: 'rgba(124, 92, 255, 0.1)',
    priority: 1
  });
  
  // Age filter
  if (rule.filtersEnabled?.age && rule.conditions.minAge > 0) {
    activeConditions.push({
      label: `Age: > ${rule.conditions.minAge} days`,
      color: 'rgba(241, 196, 15, 0.1)',
      priority: 2
    });
  }
  
  // Watch status
  if (rule.filtersEnabled?.status && rule.conditions.watchStatus !== 'any') {
    activeConditions.push({
      label: `Status: ${rule.conditions.watchStatus}`,
      color: 'rgba(46, 204, 113, 0.1)',
      priority: 3
    });
  }
  
  // Rating
  if (rule.filtersEnabled?.quality && rule.conditions.minRating > 0) {
    activeConditions.push({
      label: `Rating: < ${rule.conditions.minRating}/10`,
      color: 'rgba(52, 152, 219, 0.1)',
      priority: 4
    });
  }
  
  // Size
  if (rule.filtersEnabled?.size && (rule.conditions.minSize > 0 || rule.conditions.maxSize > 0)) {
    const sizeLabel = [
      rule.conditions.minSize > 0 ? `> ${rule.conditions.minSize}GB` : '',
      rule.conditions.maxSize > 0 ? `< ${rule.conditions.maxSize}GB` : ''
    ].filter(Boolean).join(', ');
    
    activeConditions.push({
      label: `Size: ${sizeLabel}`,
      color: 'rgba(231, 76, 60, 0.1)',
      priority: 5
    });
  }
  
  // Title filters
  if (rule.filtersEnabled?.title && (rule.conditions.titleContains || rule.conditions.titleExact)) {
    const titleParts = [
      rule.conditions.titleContains ? `contains "${rule.conditions.titleContains}"` : '',
      rule.conditions.titleExact ? `exact "${rule.conditions.titleExact}"` : ''
    ].filter(Boolean);
    
    activeConditions.push({
      label: `Title: ${titleParts.join(', ')}`,
      color: 'rgba(156, 39, 176, 0.1)',
      priority: 6
    });
  }
  
  // Quality filters
  if (rule.filtersEnabled?.enhancedQuality && (rule.conditions.resolution !== 'any' || rule.conditions.qualityProfile !== 'any')) {
    const qualityParts = [
      rule.conditions.resolution !== 'any' ? rule.conditions.resolution : '',
      rule.conditions.qualityProfile !== 'any' ? rule.conditions.qualityProfile : ''
    ].filter(Boolean);
    
    activeConditions.push({
      label: `Quality: ${qualityParts.join(', ')}`,
      color: 'rgba(255, 152, 0, 0.1)',
      priority: 7
    });
  }
  
  // Plex data filters
  if (rule.filtersEnabled?.plexData && (rule.conditions.watchCount !== 'any' || rule.conditions.lastWatched !== 'any')) {
    const plexParts = [
      rule.conditions.watchCount !== 'any' ? `Watch count: ${rule.conditions.watchCount}` : '',
      rule.conditions.lastWatched !== 'any' ? `Last watched: ${rule.conditions.lastWatched}` : ''
    ].filter(Boolean);
    
    activeConditions.push({
      label: `Plex: ${plexParts.join(', ')}`,
      color: 'rgba(96, 125, 139, 0.1)',
      priority: 8
    });
  }
  
  // Media specific filters
  if (rule.filtersEnabled?.mediaSpecific && (rule.conditions.seriesStatus !== 'any' || rule.conditions.network !== 'any')) {
    const mediaParts = [
      rule.conditions.seriesStatus !== 'any' ? `Series: ${rule.conditions.seriesStatus}` : '',
      rule.conditions.network !== 'any' ? `Network: ${rule.conditions.network}` : ''
    ].filter(Boolean);
    
    activeConditions.push({
      label: `Media: ${mediaParts.join(', ')}`,
      color: 'rgba(121, 85, 72, 0.1)',
      priority: 9
    });
  }
  
  // Arr integration filters
  if (rule.filtersEnabled?.arrIntegration) {
    const arrParts = [];
    if (rule.conditions.monitoringStatus !== 'any') arrParts.push(`Monitoring: ${rule.conditions.monitoringStatus}`);
    if (rule.conditions.downloadStatus !== 'any') arrParts.push(`Download: ${rule.conditions.downloadStatus}`);
    if (rule.conditions.tags) arrParts.push(`Tags: ${rule.conditions.tags}`);
    
    if (arrParts.length > 0) {
      activeConditions.push({
        label: `*arr: ${arrParts.join(', ')}`,
        color: 'rgba(63, 81, 181, 0.1)',
        priority: 10
      });
    }
  }
  
  // Sort by priority and determine which to show initially
  activeConditions.sort((a, b) => a.priority - b.priority);
  const maxInitialConditions = 3;
  const visibleConditions = expanded ? activeConditions : activeConditions.slice(0, maxInitialConditions);
  const hasMore = activeConditions.length > maxInitialConditions;
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
        {visibleConditions.map((condition, index) => (
          <Chip 
            key={index}
            label={condition.label}
            size="small"
            sx={{ 
              backgroundColor: condition.color,
              maxWidth: '200px',
              '& .MuiChip-label': {
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }
            }}
          />
        ))}
        {hasMore && (
          <Tooltip title={expanded ? 'Show less' : `Show ${activeConditions.length - maxInitialConditions} more`}>
            <Button
              size="small"
              onClick={() => setExpanded(!expanded)}
              sx={{ 
                minWidth: 'auto', 
                p: 0.5,
                fontSize: '0.75rem',
                color: 'text.secondary'
              }}
              endIcon={expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            >
              {expanded ? 'Less' : `+${activeConditions.length - maxInitialConditions}`}
            </Button>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};

const RulesList = ({ rules, onEdit, onDelete, onRun, onToggle, onUpdateRule }) => {
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState(null);

  const handleOpenScheduleDialog = (rule) => {
    setSelectedRule(rule);
    setScheduleDialogOpen(true);
  };

  const handleSaveSchedule = async (scheduleData) => {
    if (selectedRule && onUpdateRule) {
      await onUpdateRule(selectedRule.id, {
        ...selectedRule,
        ...scheduleData
      });
    }
  };

  return (
    <Card>
      <CardHeader 
        title="Active Rules" 
        avatar={<RuleIcon />}
      />
      <Divider />
      <CardContent>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Conditions</TableCell>
                <TableCell>Libraries</TableCell>
                <TableCell>Last Run</TableCell>
                <TableCell>Next Run</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>
                    <Typography variant="subtitle2">{rule.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {rule.deletionCount} files deleted
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <RuleConditionsDisplay rule={rule} />
                  </TableCell>
                  <TableCell>
                    {rule.libraries.map((lib) => (
                      <Chip 
                        key={lib}
                        label={lib}
                        size="small"
                        sx={{ mr: 0.5, mb: 0.5 }}
                      />
                    ))}
                  </TableCell>
                  <TableCell>
                    {rule.lastRun ? rule.lastRun.toLocaleDateString() : 'Never'}
                  </TableCell>
                  <TableCell>
                    {rule.nextRun ? rule.nextRun.toLocaleDateString() : 'Not scheduled'}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      icon={rule.enabled ? <ToggleOnIcon /> : <ToggleOffIcon />}
                      label={rule.enabled ? 'Enabled' : 'Disabled'}
                      size="small"
                      color={rule.enabled ? 'primary' : 'default'}
                      onClick={() => onToggle(rule.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Edit Rule">
                      <IconButton 
                        size="small" 
                        onClick={() => onEdit(rule)} 
                        color="primary"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Configure Schedule">
                      <IconButton 
                        size="small" 
                        onClick={() => handleOpenScheduleDialog(rule)} 
                        color="info"
                      >
                        <ScheduleIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Run Now">
                      <IconButton 
                        size="small" 
                        onClick={() => onRun(rule)} 
                        color="secondary"
                      >
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete Rule">
                      <IconButton 
                        size="small" 
                        onClick={() => onDelete(rule)} 
                        color="error"
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
      </CardContent>
      
      {/* Schedule Configuration Dialog */}
      <ScheduleDialog
        open={scheduleDialogOpen}
        onClose={() => setScheduleDialogOpen(false)}
        rule={selectedRule}
        onSave={handleSaveSchedule}
      />
    </Card>
  );
};

export default RulesList;

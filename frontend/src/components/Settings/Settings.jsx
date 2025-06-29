// src/components/Settings/Settings.jsx
import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { 
  Box, Typography, Grid, Card, Paper, Divider,
  List, ListItem, ListItemIcon, ListItemText,
  Tabs, Tab, styled
} from '@mui/material';

// Icons
import StorageIcon from '@mui/icons-material/Storage';
import NotificationsIcon from '@mui/icons-material/Notifications';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
import DeleteIcon from '@mui/icons-material/Delete';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';

// Settings sub-components
import GeneralSettings from './Tabs/GeneralSettings';
import PlexConfig from '../PlexConfig/PlexConfig'; // Fixed import path
import NotificationSettings from './Tabs/NotificationSettings';
import BackupSettings from './Tabs/BackupSettings';
import IntegrationSettings from './Tabs/IntegrationSettings';

// Tab styling for horizontal tabs
const StyledTab = styled(Tab)(({ theme }) => ({
  textTransform: 'none',
  minWidth: 0,
  padding: theme.spacing(1, 2),
  '&.Mui-selected': {
    backgroundColor: 'rgba(124, 92, 255, 0.1)',
    color: theme.palette.primary.main,
  },
}));

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(0);
  
  // Parse the current tab from URL or use the activeTab state
  const currentPath = location.pathname.split('/settings/')[1] || '';
  const tabMapping = ['general', 'plex', 'notifications', 'backup', 'integrations'];
  
  // Synchronize tab selection with URL
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    const path = newValue === 0 ? '/settings' : `/settings/${tabMapping[newValue]}`;
    navigate(path);
  };
  
  // Set active tab based on URL when component mounts or URL changes
  useEffect(() => {
    const pathIndex = tabMapping.indexOf(currentPath);
    if (pathIndex >= 0) {
      setActiveTab(pathIndex);
    } else {
      setActiveTab(0); // Default to first tab
    }
  }, [currentPath]);

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      <Typography variant="h2" sx={{ mb: 4 }}>Settings</Typography>
      
      {/* Horizontal Navigation Tabs */}
      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            '& .MuiTabs-indicator': {
              backgroundColor: 'primary.main'
            }
          }}
        >
          <StyledTab 
            icon={<DeleteIcon />} 
            iconPosition="start" 
            label="General" 
          />
          <StyledTab 
            icon={<StorageIcon />} 
            iconPosition="start" 
            label="Plex Configuration" 
          />
          <StyledTab 
            icon={<NotificationsIcon />} 
            iconPosition="start" 
            label="Notifications" 
          />
          <StyledTab 
            icon={<SettingsBackupRestoreIcon />} 
            iconPosition="start" 
            label="Backup & Restore" 
          />
          <StyledTab 
            icon={<IntegrationInstructionsIcon />} 
            iconPosition="start" 
            label="Integrations" 
          />
        </Tabs>
      </Paper>
      
      {/* Tab content */}
      <Box>
        <Routes>
          <Route path="/" element={<GeneralSettings />} />
          <Route path="/general" element={<GeneralSettings />} />
          <Route path="/plex" element={<PlexConfig inSettingsPage={true} />} />
          <Route path="/notifications" element={<NotificationSettings />} />
          <Route path="/backup" element={<BackupSettings />} />
          <Route path="/integrations" element={<IntegrationSettings />} />
        </Routes>
      </Box>
    </Box>
  );
};

export default Settings;

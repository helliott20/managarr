// src/components/Settings/Tabs/SyncNotifications.jsx
import React from 'react';
import {
  Box, Typography, Paper, List, ListItem, ListItemIcon, ListItemText,
  Chip, Alert, Button
} from '@mui/material';
import {
  Sync as SyncIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useNotifications, NOTIFICATION_CATEGORIES } from '../../../contexts/NotificationContext';

const getTypeIcon = (type) => {
  switch (type) {
    case 'success':
      return <SuccessIcon sx={{ color: 'success.main' }} />;
    case 'error':
      return <ErrorIcon sx={{ color: 'error.main' }} />;
    case 'info':
    default:
      return <InfoIcon sx={{ color: 'info.main' }} />;
  }
};

const formatTimestamp = (timestamp) => {
  const now = new Date();
  const diff = now - new Date(timestamp);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours < 24) return `${hours} hours ago`;
  
  return new Date(timestamp).toLocaleString();
};

const SyncNotifications = () => {
  const { notifications, addNotification } = useNotifications();

  // Filter sync notifications
  const syncNotifications = notifications
    .filter(n => n.category === NOTIFICATION_CATEGORIES.SYNC)
    .slice(0, 10); // Show only last 10 sync notifications

  // Add test notification for demo
  const addTestSyncNotification = () => {
    addNotification({
      type: 'success',
      category: 'sync',
      title: 'Test Sync Complete',
      message: 'Manual test sync completed successfully',
      service: 'test'
    });
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SyncIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Recent Sync Activity
          </Typography>
        </Box>
        <Button
          size="small"
          startIcon={<RefreshIcon />}
          onClick={addTestSyncNotification}
          variant="outlined"
        >
          Test Notification
        </Button>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        View the status and history of your Sonarr and Radarr sync operations.
      </Typography>

      {syncNotifications.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            No sync notifications yet. Sync notifications will appear here when your scheduled syncs run.
          </Typography>
        </Alert>
      ) : (
        <List sx={{ bgcolor: 'background.default', borderRadius: 1 }}>
          {syncNotifications.map((notification, index) => (
            <ListItem
              key={notification.id}
              sx={{
                borderBottom: index < syncNotifications.length - 1 ? 1 : 0,
                borderColor: 'divider',
                py: 2
              }}
            >
              <ListItemIcon>
                {getTypeIcon(notification.type)}
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {notification.title}
                    </Typography>
                    {notification.service && (
                      <Chip
                        label={notification.service.toUpperCase()}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ fontSize: '0.75rem', height: 20 }}
                      />
                    )}
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {notification.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatTimestamp(notification.timestamp)}
                    </Typography>
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      )}

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>How it works:</strong> When your scheduled syncs run (based on the sync intervals you configured above), 
          notifications will be automatically generated and stored here. You can also view all notifications by clicking 
          the notification bell in the sidebar.
        </Typography>
      </Alert>
    </Paper>
  );
};

export default SyncNotifications;
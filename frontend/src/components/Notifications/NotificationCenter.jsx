// src/components/Notifications/NotificationCenter.jsx
import React, { useState } from 'react';
import {
  Drawer, Box, Typography, List, ListItem, ListItemIcon, ListItemText,
  IconButton, Chip, Button, Divider, Tooltip, Paper, Badge
} from '@mui/material';
import {
  Close as CloseIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Sync as SyncIcon,
  Delete as DeleteIcon,
  Computer as SystemIcon,
  MarkEmailRead as MarkReadIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { useNotifications, NOTIFICATION_TYPES, NOTIFICATION_CATEGORIES } from '../../contexts/NotificationContext';

// Get icon for notification type
const getTypeIcon = (type) => {
  switch (type) {
    case NOTIFICATION_TYPES.SUCCESS:
      return <SuccessIcon sx={{ color: 'success.main' }} />;
    case NOTIFICATION_TYPES.ERROR:
      return <ErrorIcon sx={{ color: 'error.main' }} />;
    case NOTIFICATION_TYPES.WARNING:
      return <WarningIcon sx={{ color: 'warning.main' }} />;
    case NOTIFICATION_TYPES.INFO:
    default:
      return <InfoIcon sx={{ color: 'info.main' }} />;
  }
};

// Get icon for notification category
const getCategoryIcon = (category) => {
  switch (category) {
    case NOTIFICATION_CATEGORIES.SYNC:
      return <SyncIcon />;
    case NOTIFICATION_CATEGORIES.DELETION:
      return <DeleteIcon />;
    case NOTIFICATION_CATEGORIES.SYSTEM:
      return <SystemIcon />;
    case NOTIFICATION_CATEGORIES.ERROR:
      return <ErrorIcon />;
    default:
      return <InfoIcon />;
  }
};

// Format timestamp
const formatTimestamp = (timestamp) => {
  const now = new Date();
  const diff = now - new Date(timestamp);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
};

const NotificationCenter = ({ open, onClose }) => {
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    removeNotification, 
    clearAll 
  } = useNotifications();
  
  const [filter, setFilter] = useState('all');

  // Filter notifications
  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !notification.read;
    return notification.category === filter;
  });

  // Handle notification click
  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  // Get filter options
  const filterOptions = [
    { value: 'all', label: 'All', count: notifications.length },
    { value: 'unread', label: 'Unread', count: unreadCount },
    { value: NOTIFICATION_CATEGORIES.SYNC, label: 'Sync', count: notifications.filter(n => n.category === NOTIFICATION_CATEGORIES.SYNC).length },
    { value: NOTIFICATION_CATEGORIES.DELETION, label: 'Deletions', count: notifications.filter(n => n.category === NOTIFICATION_CATEGORIES.DELETION).length },
    { value: NOTIFICATION_CATEGORIES.SYSTEM, label: 'System', count: notifications.filter(n => n.category === NOTIFICATION_CATEGORIES.SYSTEM).length }
  ];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { 
          width: { xs: '100%', sm: 400 },
          bgcolor: 'background.paper'
        }
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ 
          p: 2, 
          borderBottom: 1, 
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Notifications
            {unreadCount > 0 && (
              <Badge 
                badgeContent={unreadCount} 
                color="primary" 
                sx={{ ml: 1 }}
              />
            )}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Filter Chips */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {filterOptions.map(option => (
              <Chip
                key={option.value}
                label={`${option.label} (${option.count})`}
                variant={filter === option.value ? 'filled' : 'outlined'}
                color={filter === option.value ? 'primary' : 'default'}
                size="small"
                onClick={() => setFilter(option.value)}
                clickable
              />
            ))}
          </Box>
        </Box>

        {/* Action Buttons */}
        {notifications.length > 0 && (
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {unreadCount > 0 && (
                <Button
                  size="small"
                  startIcon={<MarkReadIcon />}
                  onClick={markAllAsRead}
                  variant="outlined"
                >
                  Mark All Read
                </Button>
              )}
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={clearAll}
                variant="outlined"
                color="error"
              >
                Clear All
              </Button>
            </Box>
          </Box>
        )}

        {/* Notifications List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {filteredNotifications.length === 0 ? (
            <Box sx={{ 
              p: 4, 
              textAlign: 'center',
              color: 'text.secondary'
            }}>
              <InfoIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
              <Typography variant="body1">
                {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {filteredNotifications.map((notification, index) => (
                <React.Fragment key={notification.id}>
                  <ListItem
                    sx={{ 
                      py: 2,
                      px: 2,
                      bgcolor: notification.read ? 'transparent' : 'action.hover',
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'action.selected'
                      }
                    }}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {getTypeIcon(notification.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography 
                            variant="subtitle2" 
                            sx={{ 
                              fontWeight: notification.read ? 400 : 600,
                              flex: 1
                            }}
                          >
                            {notification.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatTimestamp(notification.timestamp)}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography 
                            variant="body2" 
                            color="text.secondary"
                            sx={{ mb: 1 }}
                          >
                            {notification.message}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              icon={getCategoryIcon(notification.category)}
                              label={notification.category}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.75rem' }}
                            />
                            {notification.service && (
                              <Chip
                                label={notification.service}
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ fontSize: '0.75rem' }}
                              />
                            )}
                          </Box>
                        </Box>
                      }
                    />
                    <Box sx={{ ml: 1 }}>
                      <Tooltip title="Remove notification">
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeNotification(notification.id);
                          }}
                          sx={{ opacity: 0.7 }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </ListItem>
                  {index < filteredNotifications.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
};

export default NotificationCenter;
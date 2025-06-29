// src/components/Notifications/NotificationBell.jsx
import React from 'react';
import { IconButton, Badge, Tooltip } from '@mui/material';
import { Notifications as NotificationsIcon } from '@mui/icons-material';
import { useNotifications } from '../../contexts/NotificationContext';

const NotificationBell = ({ onOpen }) => {
  const { unreadCount } = useNotifications();

  return (
    <Tooltip title={`${unreadCount} unread notifications`}>
      <IconButton 
        onClick={onOpen}
        sx={{ 
          color: unreadCount > 0 ? 'primary.main' : 'text.secondary',
          '&:hover': {
            bgcolor: 'action.hover'
          }
        }}
      >
        <Badge badgeContent={unreadCount} color="primary">
          <NotificationsIcon />
        </Badge>
      </IconButton>
    </Tooltip>
  );
};

export default NotificationBell;
// src/contexts/NotificationContext.jsx
import React, { createContext, useContext, useReducer, useCallback } from 'react';
import api from '../services/api';

// Notification types
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// Notification categories
export const NOTIFICATION_CATEGORIES = {
  SYNC: 'sync',
  DELETION: 'deletion',
  SYSTEM: 'system',
  ERROR: 'error'
};

// Initial state
const initialState = {
  notifications: [],
  unreadCount: 0
};

// Action types
const ACTIONS = {
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  MARK_AS_READ: 'MARK_AS_READ',
  MARK_ALL_AS_READ: 'MARK_ALL_AS_READ',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',
  CLEAR_ALL: 'CLEAR_ALL'
};

// Reducer
const notificationReducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.ADD_NOTIFICATION: {
      const newNotification = {
        id: Date.now() + Math.random(),
        timestamp: new Date(),
        read: false,
        ...action.payload
      };
      
      const newNotifications = [newNotification, ...state.notifications];
      // Keep only last 100 notifications
      const trimmedNotifications = newNotifications.slice(0, 100);
      
      return {
        ...state,
        notifications: trimmedNotifications,
        unreadCount: state.unreadCount + 1
      };
    }
    
    case ACTIONS.MARK_AS_READ: {
      const updatedNotifications = state.notifications.map(notification =>
        notification.id === action.payload.id
          ? { ...notification, read: true }
          : notification
      );
      
      const wasUnread = state.notifications.find(n => n.id === action.payload.id)?.read === false;
      
      return {
        ...state,
        notifications: updatedNotifications,
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount
      };
    }
    
    case ACTIONS.MARK_ALL_AS_READ: {
      const updatedNotifications = state.notifications.map(notification => ({
        ...notification,
        read: true
      }));
      
      return {
        ...state,
        notifications: updatedNotifications,
        unreadCount: 0
      };
    }
    
    case ACTIONS.REMOVE_NOTIFICATION: {
      const notificationToRemove = state.notifications.find(n => n.id === action.payload.id);
      const filteredNotifications = state.notifications.filter(n => n.id !== action.payload.id);
      
      return {
        ...state,
        notifications: filteredNotifications,
        unreadCount: notificationToRemove?.read === false 
          ? Math.max(0, state.unreadCount - 1) 
          : state.unreadCount
      };
    }
    
    case ACTIONS.CLEAR_ALL: {
      return {
        ...state,
        notifications: [],
        unreadCount: 0
      };
    }
    
    default:
      return state;
  }
};

// Context
const NotificationContext = createContext();

// Provider component
export const NotificationProvider = ({ children }) => {
  const [state, dispatch] = useReducer(notificationReducer, initialState);

  // Add notification
  const addNotification = useCallback((notification) => {
    dispatch({
      type: ACTIONS.ADD_NOTIFICATION,
      payload: notification
    });
  }, []);

  // Add sync notification helpers
  const addSyncStartNotification = useCallback((service) => {
    addNotification({
      type: NOTIFICATION_TYPES.INFO,
      category: NOTIFICATION_CATEGORIES.SYNC,
      title: `${service} Sync Started`,
      message: `Syncing ${service} library...`,
      service
    });
  }, [addNotification]);

  const addSyncCompleteNotification = useCallback((service, stats = {}) => {
    const { addedCount = 0, updatedCount = 0, deletedCount = 0 } = stats;
    addNotification({
      type: NOTIFICATION_TYPES.SUCCESS,
      category: NOTIFICATION_CATEGORIES.SYNC,
      title: `${service} Sync Complete`,
      message: `Added: ${addedCount}, Updated: ${updatedCount}, Cleaned: ${deletedCount}`,
      service,
      stats
    });
  }, [addNotification]);

  const addSyncErrorNotification = useCallback((service, error) => {
    addNotification({
      type: NOTIFICATION_TYPES.ERROR,
      category: NOTIFICATION_CATEGORIES.SYNC,
      title: `${service} Sync Failed`,
      message: error || 'Unknown error occurred during sync',
      service
    });
  }, [addNotification]);

  // Mark as read (with backend sync)
  const markAsRead = useCallback(async (id) => {
    dispatch({
      type: ACTIONS.MARK_AS_READ,
      payload: { id }
    });
    
    // Sync with backend
    try {
      await api.notifications.markAsRead(id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  // Mark all as read (with backend sync)
  const markAllAsRead = useCallback(async () => {
    dispatch({
      type: ACTIONS.MARK_ALL_AS_READ
    });
    
    // Sync with backend
    try {
      await api.notifications.markAllAsRead();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, []);

  // Remove notification (with backend sync)
  const removeNotification = useCallback(async (id) => {
    dispatch({
      type: ACTIONS.REMOVE_NOTIFICATION,
      payload: { id }
    });
    
    // Sync with backend
    try {
      await api.notifications.remove(id);
    } catch (error) {
      console.error('Error removing notification:', error);
    }
  }, []);

  // Clear all notifications (with backend sync)
  const clearAll = useCallback(async () => {
    dispatch({
      type: ACTIONS.CLEAR_ALL
    });
    
    // Sync with backend
    try {
      await api.notifications.clearAll();
    } catch (error) {
      console.error('Error clearing all notifications:', error);
    }
  }, []);

  const value = {
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    addNotification,
    addSyncStartNotification,
    addSyncCompleteNotification,
    addSyncErrorNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// Hook to use notification context
export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
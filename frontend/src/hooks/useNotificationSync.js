// src/hooks/useNotificationSync.js
import { useEffect, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import api from '../services/api';

// Hook to sync notifications from backend
export const useNotificationSync = (pollInterval = 5000) => { // Changed from 30s to 5s for faster updates
  const { addNotification, notifications } = useNotifications();
  const lastSyncRef = useRef(0);
  const intervalRef = useRef(null);

  const syncNotifications = async () => {
    try {
      const response = await api.notifications.getAll();
      
      if (response.data?.success && response.data.notifications) {
        const backendNotifications = response.data.notifications;
        
        // Find new notifications since last sync
        const newNotifications = backendNotifications.filter(notification => {
          const notificationTime = new Date(notification.timestamp).getTime();
          return notificationTime > lastSyncRef.current && 
                 !notifications.find(n => n.id === notification.id);
        });

        // Add new notifications to context
        newNotifications.forEach(notification => {
          addNotification({
            id: notification.id,
            type: notification.type,
            category: notification.category,
            title: notification.title,
            message: notification.message,
            timestamp: notification.timestamp,
            read: notification.read,
            service: notification.service,
            stats: notification.stats
          });
        });

        // Update last sync time
        if (backendNotifications.length > 0) {
          const latestTime = Math.max(
            ...backendNotifications.map(n => new Date(n.timestamp).getTime())
          );
          lastSyncRef.current = latestTime;
        }
      }
    } catch (error) {
      console.error('Error syncing notifications:', error);
    }
  };

  useEffect(() => {
    // Initial sync
    syncNotifications();

    // Set up polling interval
    if (pollInterval > 0) {
      intervalRef.current = setInterval(syncNotifications, pollInterval);
    }

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [pollInterval]);

  return { syncNotifications };
};

export default useNotificationSync;
// backend/services/notificationService.js
const EventEmitter = require('events');

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this.notifications = [];
    this.maxNotifications = 100;
  }

  // Add a notification
  addNotification(notification) {
    const newNotification = {
      id: Date.now() + Math.random(),
      timestamp: new Date(),
      read: false,
      ...notification
    };

    this.notifications.unshift(newNotification);
    
    // Keep only the last 100 notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }

    // Emit the notification for real-time updates
    this.emit('notification', newNotification);
    
    console.log(`📢 Notification: [${notification.category?.toUpperCase()}] ${notification.title}`);
    return newNotification;
  }

  // Add sync-specific notifications
  addSyncStartNotification(service) {
    return this.addNotification({
      type: 'info',
      category: 'sync',
      title: `${service} Sync Started`,
      message: `Syncing ${service} library...`,
      service: service.toLowerCase()
    });
  }

  addSyncCompleteNotification(service, stats = {}) {
    const { addedCount = 0, updatedCount = 0, deletedCount = 0, totalProcessed = 0 } = stats;
    
    return this.addNotification({
      type: 'success',
      category: 'sync',
      title: `${service} Sync Complete`,
      message: `Processed ${totalProcessed} items. Added: ${addedCount}, Updated: ${updatedCount}, Cleaned: ${deletedCount}`,
      service: service.toLowerCase(),
      stats
    });
  }

  addSyncErrorNotification(service, error) {
    return this.addNotification({
      type: 'error',
      category: 'sync',
      title: `${service} Sync Failed`,
      message: error || 'Unknown error occurred during sync',
      service: service.toLowerCase()
    });
  }

  // Add deletion notifications
  addDeletionNotification(type, count, size = 0) {
    const sizeStr = size > 0 ? ` (${(size / (1024 * 1024 * 1024)).toFixed(2)} GB)` : '';
    
    return this.addNotification({
      type: type === 'approved' ? 'success' : 'info',
      category: 'deletion',
      title: `${count} Deletions ${type === 'approved' ? 'Executed' : 'Pending'}`,
      message: `${count} media files ${type === 'approved' ? 'have been deleted' : 'are pending deletion'}${sizeStr}`,
      stats: { count, size }
    });
  }

  // Add system notifications
  addSystemNotification(title, message, type = 'info') {
    return this.addNotification({
      type,
      category: 'system',
      title,
      message
    });
  }

  // Get all notifications
  getNotifications() {
    return this.notifications;
  }

  // Get unread count
  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  // Mark notification as read
  markAsRead(id) {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      this.emit('notificationUpdate', notification);
      return true;
    }
    return false;
  }

  // Mark all as read
  markAllAsRead() {
    let updatedCount = 0;
    this.notifications.forEach(notification => {
      if (!notification.read) {
        notification.read = true;
        updatedCount++;
      }
    });
    
    if (updatedCount > 0) {
      this.emit('notificationsUpdate', this.notifications);
    }
    
    return updatedCount;
  }

  // Remove notification
  removeNotification(id) {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      const removed = this.notifications.splice(index, 1)[0];
      this.emit('notificationRemoved', removed);
      return true;
    }
    return false;
  }

  // Clear all notifications
  clearAll() {
    const count = this.notifications.length;
    this.notifications = [];
    this.emit('notificationsCleared');
    return count;
  }

  // Get notifications summary
  getSummary() {
    const total = this.notifications.length;
    const unread = this.getUnreadCount();
    const byCategory = this.notifications.reduce((acc, notification) => {
      acc[notification.category] = (acc[notification.category] || 0) + 1;
      return acc;
    }, {});
    
    return {
      total,
      unread,
      byCategory
    };
  }
}

// Create singleton instance
const notificationService = new NotificationService();

// Add some initial system notifications
notificationService.addSystemNotification(
  'System Started',
  'Managarr backend service has started successfully',
  'success'
);

module.exports = notificationService;
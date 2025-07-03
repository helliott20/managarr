// backend/routes/notifications.js
const { createLogger } = require('../logger');
const express = require('express');
const router = express.Router();
const notificationService = require('../services/notificationService');

const log = createLogger('notifications');

// Get all notifications
router.get('/', (req, res) => {
  try {
    const notifications = notificationService.getNotifications();
    const summary = notificationService.getSummary();
    
    res.json({
      success: true,
      notifications,
      summary
    });
  } catch (error) {
    log.error({ error }, 'Error getting notifications');
    res.status(500).json({
      success: false,
      error: 'Failed to get notifications'
    });
  }
});

// Get notification summary
router.get('/summary', (req, res) => {
  try {
    const summary = notificationService.getSummary();
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    log.error({ error }, 'Error getting notification summary');
    res.status(500).json({
      success: false,
      error: 'Failed to get notification summary'
    });
  }
});

// Mark notification as read
router.post('/:id/read', (req, res) => {
  try {
    const { id } = req.params;
    const success = notificationService.markAsRead(parseFloat(id));
    
    if (success) {
      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
  } catch (error) {
    log.error({ error, notificationId: id }, 'Error marking notification as read');
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

// Mark all notifications as read
router.post('/read-all', (req, res) => {
  try {
    const updatedCount = notificationService.markAllAsRead();
    res.json({
      success: true,
      message: `${updatedCount} notifications marked as read`
    });
  } catch (error) {
    log.error({ error }, 'Error marking all notifications as read');
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read'
    });
  }
});

// Remove notification
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = notificationService.removeNotification(parseFloat(id));
    
    if (success) {
      res.json({
        success: true,
        message: 'Notification removed'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Notification not found'
      });
    }
  } catch (error) {
    log.error({ error, notificationId: id }, 'Error removing notification');
    res.status(500).json({
      success: false,
      error: 'Failed to remove notification'
    });
  }
});

// Clear all notifications
router.delete('/', (req, res) => {
  try {
    const removedCount = notificationService.clearAll();
    res.json({
      success: true,
      message: `${removedCount} notifications cleared`
    });
  } catch (error) {
    log.error({ error }, 'Error clearing notifications');
    res.status(500).json({
      success: false,
      error: 'Failed to clear notifications'
    });
  }
});

// Add a test notification (for debugging)
router.post('/test', (req, res) => {
  try {
    const { type = 'info', category = 'system', title, message } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required'
      });
    }
    
    const notification = notificationService.addNotification({
      type,
      category,
      title,
      message
    });
    
    res.json({
      success: true,
      notification,
      message: 'Test notification added'
    });
  } catch (error) {
    log.error({ error }, 'Error adding test notification');
    res.status(500).json({
      success: false,
      error: 'Failed to add test notification'
    });
  }
});

module.exports = router;
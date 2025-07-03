// backend/routes/pendingDeletions.js
const { createLogger } = require('../logger');
const express = require('express');
const { PendingDeletion, Media, DeletionRule } = require('../database');
const { Op } = require('sequelize');
const deletionExecutor = require('../services/deletionExecutor');

const log = createLogger('pendingDeletions');

const router = express.Router();

// Get all pending deletions with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = 'pending',
      ruleId,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    
    // Build where clause
    const whereClause = {};
    if (status && status !== 'all') {
      whereClause.status = status;
    }
    if (ruleId) {
      whereClause.ruleId = ruleId;
    }

    const { count, rows } = await PendingDeletion.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Media,
          as: 'Media',
          attributes: ['id', 'title', 'type', 'size', 'path', 'filename']
        },
        {
          model: DeletionRule,
          as: 'DeletionRule',
          attributes: ['id', 'name', 'description']
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder.toUpperCase()]]
    });

    // Calculate total size of pending deletions
    const totalSize = rows.reduce((sum, item) => {
      return sum + (item.Media?.size || 0);
    }, 0);

    res.json({
      success: true,
      data: {
        pendingDeletions: rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: parseInt(limit)
        },
        summary: {
          totalSize,
          totalItems: count
        }
      }
    });
  } catch (error) {
    log.error({ error }, 'Error fetching pending deletions');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending deletions'
    });
  }
});

// Get pending deletion by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const pendingDeletion = await PendingDeletion.findByPk(id, {
      include: [
        {
          model: Media,
          as: 'Media'
        },
        {
          model: DeletionRule,
          as: 'DeletionRule'
        }
      ]
    });

    if (!pendingDeletion) {
      return res.status(404).json({
        success: false,
        error: 'Pending deletion not found'
      });
    }

    res.json({
      success: true,
      data: pendingDeletion
    });
  } catch (error) {
    log.error({ error, pendingDeletionId: id }, 'Error fetching pending deletion');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending deletion'
    });
  }
});

// Approve a pending deletion
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedBy, reason, scheduledDate } = req.body;

    const pendingDeletion = await PendingDeletion.findByPk(id);
    
    if (!pendingDeletion) {
      return res.status(404).json({
        success: false,
        error: 'Pending deletion not found'
      });
    }

    if (pendingDeletion.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Can only approve pending deletions'
      });
    }

    await pendingDeletion.update({
      status: 'approved',
      approvedBy: approvedBy || 'system',
      approvedAt: new Date(),
      reason: reason || null,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : new Date()
    });

    res.json({
      success: true,
      message: 'Pending deletion approved successfully',
      data: pendingDeletion
    });
  } catch (error) {
    log.error({ error, pendingDeletionId: id }, 'Error approving pending deletion');
    res.status(500).json({
      success: false,
      error: 'Failed to approve pending deletion'
    });
  }
});

// Cancel a pending deletion
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { cancelledBy, reason } = req.body;

    const pendingDeletion = await PendingDeletion.findByPk(id);
    
    if (!pendingDeletion) {
      return res.status(404).json({
        success: false,
        error: 'Pending deletion not found'
      });
    }

    if (pendingDeletion.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel completed deletions'
      });
    }

    await pendingDeletion.update({
      status: 'cancelled',
      cancelledBy: cancelledBy || 'system',
      cancelledAt: new Date(),
      reason: reason || null
    });

    res.json({
      success: true,
      message: 'Pending deletion cancelled successfully',
      data: pendingDeletion
    });
  } catch (error) {
    log.error({ error, pendingDeletionId: id }, 'Error cancelling pending deletion');
    res.status(500).json({
      success: false,
      error: 'Failed to cancel pending deletion'
    });
  }
});

// Bulk approve pending deletions
router.post('/bulk-approve', async (req, res) => {
  try {
    const { ids, approvedBy, reason, scheduledDate } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or empty IDs array'
      });
    }

    const updateData = {
      status: 'approved',
      approvedBy: approvedBy || 'system',
      approvedAt: new Date(),
      reason: reason || null
    };

    if (scheduledDate) {
      updateData.scheduledDate = new Date(scheduledDate);
    }

    const [updatedCount] = await PendingDeletion.update(updateData, {
      where: {
        id: {
          [Op.in]: ids
        },
        status: 'pending' // Only update pending deletions
      }
    });

    res.json({
      success: true,
      message: `${updatedCount} pending deletions approved successfully`,
      data: {
        updatedCount,
        requestedCount: ids.length
      }
    });
  } catch (error) {
    log.error({ error, idsCount: ids?.length }, 'Error bulk approving pending deletions');
    res.status(500).json({
      success: false,
      error: 'Failed to bulk approve pending deletions'
    });
  }
});

// Bulk cancel pending deletions
router.post('/bulk-cancel', async (req, res) => {
  try {
    const { ids, cancelledBy, reason } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or empty IDs array'
      });
    }

    const [updatedCount] = await PendingDeletion.update({
      status: 'cancelled',
      cancelledBy: cancelledBy || 'system',
      cancelledAt: new Date(),
      reason: reason || null
    }, {
      where: {
        id: {
          [Op.in]: ids
        },
        status: {
          [Op.in]: ['pending', 'approved'] // Can cancel pending or approved
        }
      }
    });

    res.json({
      success: true,
      message: `${updatedCount} pending deletions cancelled successfully`,
      data: {
        updatedCount,
        requestedCount: ids.length
      }
    });
  } catch (error) {
    log.error({ error, idsCount: ids?.length }, 'Error bulk cancelling pending deletions');
    res.status(500).json({
      success: false,
      error: 'Failed to bulk cancel pending deletions'
    });
  }
});

// Get pending deletions summary/statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const stats = await PendingDeletion.findAll({
      attributes: [
        'status',
        [PendingDeletion.sequelize.fn('COUNT', PendingDeletion.sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Get total size by status
    const sizeStats = await PendingDeletion.findAll({
      attributes: [
        'status',
        [PendingDeletion.sequelize.fn('SUM', PendingDeletion.sequelize.col('Media.size')), 'totalSize']
      ],
      include: [
        {
          model: Media,
          as: 'Media',
          attributes: []
        }
      ],
      group: ['status'],
      raw: true
    });

    // Combine stats
    const summary = {
      pending: { count: 0, totalSize: 0 },
      approved: { count: 0, totalSize: 0 },
      cancelled: { count: 0, totalSize: 0 },
      completed: { count: 0, totalSize: 0 }
    };

    stats.forEach(stat => {
      if (summary[stat.status]) {
        summary[stat.status].count = parseInt(stat.count);
      }
    });

    sizeStats.forEach(stat => {
      if (summary[stat.status]) {
        summary[stat.status].totalSize = parseInt(stat.totalSize) || 0;
      }
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    log.error({ error }, 'Error fetching pending deletions summary');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch summary'
    });
  }
});

// Execute approved pending deletions immediately
router.post('/execute', async (req, res) => {
  try {
    const result = await deletionExecutor.executeApprovedDeletions();
    
    res.json({
      success: true,
      message: 'Deletion execution completed',
      data: result
    });
  } catch (error) {
    log.error({ error }, 'Error executing pending deletions');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get execution status
router.get('/execution/status', async (req, res) => {
  try {
    const status = deletionExecutor.getStatus();
    
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    log.error({ error }, 'Error getting execution status');
    res.status(500).json({
      success: false,
      error: 'Failed to get execution status'
    });
  }
});

// Start scheduled execution
router.post('/execution/schedule/start', async (req, res) => {
  try {
    const { intervalMinutes = 60 } = req.body;
    
    await deletionExecutor.startScheduledExecution(intervalMinutes);
    
    res.json({
      success: true,
      message: `Scheduled execution started (every ${intervalMinutes} minutes)`,
      data: {
        intervalMinutes,
        isScheduled: true
      }
    });
  } catch (error) {
    log.error({ error }, 'Error starting scheduled execution');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Stop scheduled execution
router.post('/execution/schedule/stop', async (req, res) => {
  try {
    deletionExecutor.stopScheduledExecution();
    
    res.json({
      success: true,
      message: 'Scheduled execution stopped',
      data: {
        isScheduled: false
      }
    });
  } catch (error) {
    log.error({ error }, 'Error stopping scheduled execution');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

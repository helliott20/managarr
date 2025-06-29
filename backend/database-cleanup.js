// Database cleanup script for clearing test deletion data
const { 
  sequelize, 
  DeletionHistory,
  PendingDeletion,
  initializeDatabase 
} = require('./database');

async function clearDeletionData() {
  try {
    await initializeDatabase();
    console.log('Database initialized');

    // Clear all deletion history
    const deletionHistoryCount = await DeletionHistory.count();
    console.log(`Found ${deletionHistoryCount} deletion history records`);
    
    if (deletionHistoryCount > 0) {
      await DeletionHistory.destroy({ where: {} });
      console.log('✅ Cleared all deletion history records');
    }

    // Clear all pending deletions 
    const pendingDeletionsCount = await PendingDeletion.count();
    console.log(`Found ${pendingDeletionsCount} pending deletion records`);
    
    if (pendingDeletionsCount > 0) {
      await PendingDeletion.destroy({ where: {} });
      console.log('✅ Cleared all pending deletion records');
    }

    console.log('🎉 Database cleanup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during database cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
clearDeletionData();
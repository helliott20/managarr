// Debug and fix constraint issues
const { sequelize, DeletionRule, PendingDeletion, DeletionHistory } = require('./database');

async function debugConstraints() {
  try {
    console.log('Starting constraint debugging...');
    
    // Check current state of tables
    console.log('\n=== Current Table States ===');
    
    const rules = await DeletionRule.findAll();
    console.log(`DeletionRules count: ${rules.length}`);
    rules.forEach(rule => {
      console.log(`  Rule ${rule.id}: ${rule.name}`);
    });
    
    const pendingDeletions = await PendingDeletion.findAll();
    console.log(`\nPendingDeletions count: ${pendingDeletions.length}`);
    pendingDeletions.forEach(pd => {
      console.log(`  PendingDeletion ${pd.id}: ruleId=${pd.ruleId}, mediaId=${pd.mediaId}`);
    });
    
    const deletionHistory = await DeletionHistory.findAll();
    console.log(`\nDeletionHistory count: ${deletionHistory.length}`);
    deletionHistory.forEach(dh => {
      console.log(`  DeletionHistory ${dh.id}: ruleId=${dh.ruleId}, ruleName=${dh.ruleName}`);
    });
    
    // Check for orphaned records
    console.log('\n=== Checking for Orphaned Records ===');
    
    // Find pending deletions with invalid rule IDs
    const orphanedPending = await sequelize.query(`
      SELECT pd.id, pd.ruleId 
      FROM PendingDeletions pd 
      LEFT JOIN DeletionRules dr ON pd.ruleId = dr.id 
      WHERE dr.id IS NULL
    `, { type: sequelize.QueryTypes.SELECT });
    
    console.log(`Orphaned PendingDeletions: ${orphanedPending.length}`);
    orphanedPending.forEach(op => {
      console.log(`  PendingDeletion ${op.id} references non-existent rule ${op.ruleId}`);
    });
    
    // Find deletion history with invalid rule IDs
    const orphanedHistory = await sequelize.query(`
      SELECT dh.id, dh.ruleId 
      FROM DeletionHistories dh 
      LEFT JOIN DeletionRules dr ON dh.ruleId = dr.id 
      WHERE dr.id IS NULL
    `, { type: sequelize.QueryTypes.SELECT });
    
    console.log(`Orphaned DeletionHistories: ${orphanedHistory.length}`);
    orphanedHistory.forEach(oh => {
      console.log(`  DeletionHistory ${oh.id} references non-existent rule ${oh.ruleId}`);
    });
    
    // Clean up orphaned records
    if (orphanedPending.length > 0) {
      console.log('\n=== Cleaning up orphaned PendingDeletions ===');
      const orphanedIds = orphanedPending.map(op => op.id);
      await PendingDeletion.destroy({
        where: { id: orphanedIds }
      });
      console.log(`Deleted ${orphanedPending.length} orphaned PendingDeletions`);
    }
    
    if (orphanedHistory.length > 0) {
      console.log('\n=== Cleaning up orphaned DeletionHistories ===');
      const orphanedIds = orphanedHistory.map(oh => oh.id);
      await DeletionHistory.destroy({
        where: { id: orphanedIds }
      });
      console.log(`Deleted ${orphanedHistory.length} orphaned DeletionHistories`);
    }
    
    // Test deletion of rule with ID 1 if it exists
    const ruleToTest = await DeletionRule.findByPk(1);
    if (ruleToTest) {
      console.log('\n=== Testing deletion of rule with ID 1 ===');
      
      // Check what's referencing this rule
      const referencingPending = await PendingDeletion.findAll({
        where: { ruleId: 1 }
      });
      console.log(`PendingDeletions referencing rule 1: ${referencingPending.length}`);
      
      const referencingHistory = await DeletionHistory.findAll({
        where: { ruleId: 1 }
      });
      console.log(`DeletionHistories referencing rule 1: ${referencingHistory.length}`);
      
      // Clean up references first
      if (referencingPending.length > 0) {
        await PendingDeletion.destroy({
          where: { ruleId: 1 }
        });
        console.log(`Deleted ${referencingPending.length} PendingDeletions for rule 1`);
      }
      
      if (referencingHistory.length > 0) {
        await DeletionHistory.destroy({
          where: { ruleId: 1 }
        });
        console.log(`Deleted ${referencingHistory.length} DeletionHistories for rule 1`);
      }
      
      // Now try to delete the rule
      try {
        await ruleToTest.destroy();
        console.log('Successfully deleted rule 1');
      } catch (error) {
        console.error('Failed to delete rule 1:', error.message);
      }
    } else {
      console.log('\nRule with ID 1 does not exist');
    }
    
    console.log('\n=== Constraint debugging completed ===');
    process.exit(0);
  } catch (error) {
    console.error('Error during constraint debugging:', error);
    process.exit(1);
  }
}

// Run the debug if this script is executed directly
if (require.main === module) {
  debugConstraints();
}

module.exports = { debugConstraints };

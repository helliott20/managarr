const { Sequelize } = require('sequelize');

module.exports = {
  up: async (queryInterface, DataTypes) => {
    console.log('Starting cleanup of duplicate media entries...');
    
    // First, backup the Media table
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS Media_backup AS SELECT * FROM Media;
    `);
    console.log('Created backup of Media table');
    
    // Find and keep only the newest record for each duplicate path
    // This query identifies all duplicate paths and keeps only the one with the highest ID (most recent)
    const [duplicates] = await queryInterface.sequelize.query(`
      SELECT path, COUNT(*) as count, GROUP_CONCAT(id) as ids
      FROM Media
      GROUP BY path
      HAVING COUNT(*) > 1
    `);
    
    console.log(`Found ${duplicates.length} paths with duplicates`);
    
    // Delete older duplicates, keeping the newest one (highest ID)
    for (const dup of duplicates) {
      const ids = dup.ids.split(',').map(id => parseInt(id));
      const maxId = Math.max(...ids);
      const idsToDelete = ids.filter(id => id !== maxId);
      
      if (idsToDelete.length > 0) {
        await queryInterface.sequelize.query(
          `DELETE FROM Media WHERE id IN (${idsToDelete.join(',')})`,
          { type: Sequelize.QueryTypes.DELETE }
        );
      }
    }
    
    console.log('Deleted duplicate entries, keeping newest records');
    
    // Now add the unique index
    try {
      await queryInterface.addIndex('Media', ['path'], {
        unique: true,
        name: 'media_path_unique'
      });
      console.log('Added unique index on Media.path');
    } catch (error) {
      console.error('Error adding unique index:', error);
      // If index already exists, continue
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
    
    // Log statistics
    const [stats] = await queryInterface.sequelize.query(`
      SELECT 
        (SELECT COUNT(*) FROM Media) as current_count,
        (SELECT COUNT(*) FROM Media_backup) as original_count
    `);
    
    console.log(`Migration complete. Reduced from ${stats[0].original_count} to ${stats[0].current_count} records`);
  },
  
  down: async (queryInterface, DataTypes) => {
    // Remove the unique index
    await queryInterface.removeIndex('Media', 'media_path_unique');
    
    // Restore from backup if needed
    // Note: This is a simplified rollback - in production you'd want more sophisticated rollback
    console.log('Removed unique index from Media.path');
  }
};
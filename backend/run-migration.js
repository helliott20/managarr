const { sequelize } = require('./database');
const migration = require('./migrations/cleanup-media-duplicates');

async function runMigration() {
  try {
    console.log('Running migration to cleanup duplicate media entries...');
    
    // Run the migration
    await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize.DataTypes);
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
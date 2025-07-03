const { sequelize } = require('./database');
const migration = require('./migrations/add-tautulli-settings');

async function runTautulliMigration() {
  try {
    console.log('Running Tautulli migration to add missing database columns...');
    
    // Run the migration
    await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize.DataTypes);
    
    console.log('Tautulli migration completed successfully!');
    console.log('You can now restart your server to use the Tautulli integration.');
    process.exit(0);
  } catch (error) {
    console.error('Tautulli migration failed:', error);
    process.exit(1);
  }
}

runTautulliMigration();
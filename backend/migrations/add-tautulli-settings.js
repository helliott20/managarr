const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('Adding Tautulli column to Settings table...');
    
    try {
      // Add the tautulli column to the Settings table
      await queryInterface.addColumn('Settings', 'tautulli', {
        type: DataTypes.JSON,
        defaultValue: JSON.stringify({
          enabled: false,
          url: '',
          apiKey: '',
          connectionStatus: 'disconnected',
          version: null,
          syncIntervalValue: 6,
          syncIntervalUnit: 'hours',
          lastConnectionTest: null,
          historyDaysToSync: 30,
          syncWatchHistory: true,
          syncActiveStreams: true,
          syncLibraryStats: true
        })
      });
      
      console.log('Successfully added Tautulli column to Settings table');
    } catch (error) {
      console.error('Error adding Tautulli column:', error);
      throw error;
    }
    
    // Also add the new Tautulli fields to Media table
    console.log('Adding Tautulli fields to Media table...');
    
    try {
      await queryInterface.addColumn('Media', 'tautulliViewCount', {
        type: DataTypes.INTEGER,
        defaultValue: 0
      });
      
      await queryInterface.addColumn('Media', 'tautulliLastPlayed', {
        type: DataTypes.DATE,
        allowNull: true
      });
      
      await queryInterface.addColumn('Media', 'tautulliDuration', {
        type: DataTypes.INTEGER,
        allowNull: true
      });
      
      await queryInterface.addColumn('Media', 'tautulliWatchTime', {
        type: DataTypes.INTEGER,
        defaultValue: 0
      });
      
      await queryInterface.addColumn('Media', 'tautulliUsers', {
        type: DataTypes.JSON,
        defaultValue: JSON.stringify([])
      });
      
      console.log('Successfully added Tautulli fields to Media table');
    } catch (error) {
      console.error('Error adding Tautulli fields to Media table:', error);
      // Don't throw here as the Settings column is more critical
    }
  },
  
  down: async (queryInterface, Sequelize) => {
    // Remove the columns
    await queryInterface.removeColumn('Settings', 'tautulli');
    await queryInterface.removeColumn('Media', 'tautulliViewCount');
    await queryInterface.removeColumn('Media', 'tautulliLastPlayed');
    await queryInterface.removeColumn('Media', 'tautulliDuration');
    await queryInterface.removeColumn('Media', 'tautulliWatchTime');
    await queryInterface.removeColumn('Media', 'tautulliUsers');
  }
};
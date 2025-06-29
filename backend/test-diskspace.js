const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function testDiskSpaceEndpoints() {
  console.log('Testing disk space endpoints...\n');

  try {
    // Test settings first
    console.log('1. Testing settings endpoint:');
    const settingsResponse = await axios.get(`${API_URL}/settings`);
    const settings = settingsResponse.data || {};
    console.log('Sonarr enabled:', settings.sonarr?.enabled);
    console.log('Radarr enabled:', settings.radarr?.enabled);
    console.log('Sonarr connection status:', settings.sonarr?.connectionStatus);
    console.log('Radarr connection status:', settings.radarr?.connectionStatus);
    console.log('');

    // Test Sonarr disk space
    if (settings.sonarr?.enabled) {
      console.log('2. Testing Sonarr disk space endpoint:');
      try {
        const sonarrDiskSpaceResponse = await axios.get(`${API_URL}/integrations/sonarr/diskspace`);
        console.log('Sonarr disk space response:', JSON.stringify(sonarrDiskSpaceResponse.data, null, 2));
        console.log('');
      } catch (error) {
        console.error('Sonarr disk space error:', error.message);
        console.log('');
      }
    }

    // Test Radarr disk space
    if (settings.radarr?.enabled) {
      console.log('3. Testing Radarr disk space endpoint:');
      try {
        const radarrDiskSpaceResponse = await axios.get(`${API_URL}/integrations/radarr/diskspace`);
        console.log('Radarr disk space response:', JSON.stringify(radarrDiskSpaceResponse.data, null, 2));
        console.log('');
      } catch (error) {
        console.error('Radarr disk space error:', error.message);
        console.log('');
      }
    }

    // Simulate dashboard data processing
    console.log('4. Simulating Dashboard data processing:');
    
    let sonarrDiskSpace = null;
    let radarrDiskSpace = null;

    if (settings.sonarr?.enabled) {
      try {
        const sonarrDiskSpaceResponse = await axios.get(`${API_URL}/integrations/sonarr/diskspace`);
        if (sonarrDiskSpaceResponse.data && sonarrDiskSpaceResponse.data.success) {
          sonarrDiskSpace = sonarrDiskSpaceResponse.data.diskspace || [];
        }
      } catch (error) {
        console.error('Error fetching Sonarr disk space:', error.message);
      }
    }

    if (settings.radarr?.enabled) {
      try {
        const radarrDiskSpaceResponse = await axios.get(`${API_URL}/integrations/radarr/diskspace`);
        if (radarrDiskSpaceResponse.data && radarrDiskSpaceResponse.data.success) {
          radarrDiskSpace = radarrDiskSpaceResponse.data.diskspace || [];
        }
      } catch (error) {
        console.error('Error fetching Radarr disk space:', error.message);
      }
    }

    // Process and consolidate disk space data (as done in Dashboard)
    const combinedDiskSpace = [];

    // Add Sonarr disk space data
    if (sonarrDiskSpace && Array.isArray(sonarrDiskSpace)) {
      sonarrDiskSpace.forEach(disk => {
        combinedDiskSpace.push({
          ...disk,
          source: 'Sonarr'
        });
      });
    }

    // Add Radarr disk space data, avoid duplicates
    if (radarrDiskSpace && Array.isArray(radarrDiskSpace)) {
      radarrDiskSpace.forEach(disk => {
        // Check if this path is already in combinedDiskSpace
        const existingDisk = combinedDiskSpace.find(d => d.path === disk.path);
        if (!existingDisk) {
          combinedDiskSpace.push({
            ...disk,
            source: 'Radarr'
          });
        }
      });
    }

    console.log('Combined disk space data:');
    console.log(JSON.stringify(combinedDiskSpace, null, 2));

    // Calculate totals
    const storageCapacity = combinedDiskSpace.reduce((total, disk) => total + disk.totalSpace, 0);
    const storageUsed = combinedDiskSpace.reduce((total, disk) => total + (disk.totalSpace - disk.freeSpace), 0);
    const storagePercentage = storageCapacity > 0 ? Math.round((storageUsed / storageCapacity) * 100) : 0;

    // Format bytes function
    const formatBytes = (bytes, decimals = 2) => {
      if (bytes === 0 || bytes === undefined || bytes === null) return '0 Bytes';
      
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
      
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    console.log('\nCalculated storage stats:');
    console.log('Total capacity:', formatBytes(storageCapacity));
    console.log('Used storage:', formatBytes(storageUsed));
    console.log('Free storage:', formatBytes(storageCapacity - storageUsed));
    console.log('Usage percentage:', storagePercentage + '%');

  } catch (error) {
    console.error('Error testing endpoints:', error.message);
  }
}

testDiskSpaceEndpoints();
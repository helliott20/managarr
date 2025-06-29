// src/components/PlexConfig/PlexConfig.jsx
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
  Box, Typography, Button, Card, CardContent, CardHeader, CardActions,
  Divider, TextField, Grid, Alert, Switch, FormControlLabel,
  CircularProgress, Chip, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, IconButton, 
  Dialog, DialogTitle, DialogContent, DialogActions,
  Slider
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkIcon from '@mui/icons-material/Link';
import StorageIcon from '@mui/icons-material/Storage';
import ImportExportIcon from '@mui/icons-material/ImportExport';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import FolderIcon from '@mui/icons-material/Folder';
import DeleteIcon from '@mui/icons-material/Delete';

const PlexConfig = ({ inSettingsPage = false }) => {
  const [loading, setLoading] = useState(false);
  
  // Plex Server Configuration
  const [plexConfig, setPlexConfig] = useState({
    serverUrl: '',
    authToken: '',
    connectionStatus: 'disconnected', // 'connected', 'error', 'disconnected'
    lastSynced: null,
    autoSync: true,
    syncInterval: 60 // minutes
  });
  
  // Loading state for initial data fetch
  const [initialLoading, setInitialLoading] = useState(true);

  // Plex Libraries
  const [libraries, setLibraries] = useState([]);
  const [librariesLoading, setLibrariesLoading] = useState(true);

  // Path mappings
  const [mappings, setMappings] = useState([]);


  // Dialog states
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [newMapping, setNewMapping] = useState({ plexPath: '', localPath: '', enabled: true });
  const [libraryMappingDialogOpen, setLibraryMappingDialogOpen] = useState(false);
  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [libraryMapping, setLibraryMapping] = useState({ localPath: '', mapped: false });

  // Load settings and libraries from backend
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setInitialLoading(true);
        setLibrariesLoading(true);
        console.log('Loading settings from backend...');
        const response = await api.settings.get();
        console.log('Settings response:', response);
        
        if (response.data && response.data.plex) {
          const plexSettings = response.data.plex;
          console.log('Plex settings:', plexSettings);
          
          // Convert lastSynced string to Date object if it exists
          const lastSynced = plexSettings.lastSynced 
            ? new Date(plexSettings.lastSynced) 
            : null;
          
          setPlexConfig({
            serverUrl: plexSettings.serverUrl || '',
            authToken: plexSettings.authToken || '',
            connectionStatus: plexSettings.authToken ? 'connected' : 'disconnected',
            lastSynced: lastSynced,
            autoSync: plexSettings.autoSync !== undefined ? plexSettings.autoSync : true,
            syncInterval: plexSettings.syncInterval || 60
          });
          
          // Load libraries from the database
          await loadLibraries();
        }
        
        
        setLibrariesLoading(false);
        setInitialLoading(false);
      } catch (error) {
        console.error('Error loading settings:', error);
        setLibrariesLoading(false);
        setInitialLoading(false);
      }
    };
    
    loadSettings();
    
  }, []);
  
  // Load libraries from the database
  const loadLibraries = async () => {
    try {
      const librariesResponse = await api.plex.getLibraries();
      
      if (librariesResponse.data) {
        // Ensure dates are properly formatted
        const formattedLibraries = librariesResponse.data.map(lib => ({
          ...lib,
          // Convert date strings to Date objects
          lastScanned: lib.lastScanned ? new Date(lib.lastScanned) : new Date(),
          // Ensure these properties exist
          items: lib.items || 0,
          size: lib.size || 0,
          enabled: lib.enabled !== undefined ? lib.enabled : true,
          mapped: lib.mapped !== undefined ? lib.mapped : false,
          localPath: lib.localPath || '',
          plexPath: lib.plexPath || lib.path || ''
        }));
        
        setLibraries(formattedLibraries);
      } else {
        // Set empty array if no data
        setLibraries([]);
      }
    } catch (error) {
      console.error('Error loading libraries:', error);
      // Set empty array on error
      setLibraries([]);
    }
  };
  
  
  
  

  // Test connection to Plex server
  const testConnection = async () => {
    setLoading(true);
    
    try {
      // Create a test request to the Plex server
      const plexUrl = plexConfig.serverUrl.trim();
      const token = plexConfig.authToken.trim();
      
      if (!plexUrl || !token) {
        throw new Error('Server URL and Authentication Token are required');
      }
      
      // Make a request to the backend to test the connection
      try {
        console.log('Testing Plex connection to:', plexUrl);
        
        // Use the API service with a longer timeout
        const response = await api.plex.testConnection(plexUrl, token);
        
        // Process the response
        const data = response.data || response;
        
        if (data.success) {
          console.log('Connection successful:', data);
          setPlexConfig({
            ...plexConfig,
            connectionStatus: 'connected',
            lastSynced: new Date()
          });
        } else {
          console.error('Connection failed:', data.error || 'Unknown error');
          setPlexConfig({
            ...plexConfig,
            connectionStatus: 'error'
          });
          
          // Show error message
          alert(`Connection failed: ${data.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Connection test error:', error);
        
        // Check if it's a timeout error
        if (error.message && error.message.includes('timeout')) {
          alert('Connection timed out. Please check if your Plex server is running and accessible.');
        } else {
          alert(`Connection error: ${error.message || 'Unknown error'}`);
        }
        
        setPlexConfig({
          ...plexConfig,
          connectionStatus: 'error'
        });
      }
      
      // Save the configuration
      await saveConfiguration();
    } catch (error) {
      console.error('Connection test failed:', error);
      setPlexConfig({
        ...plexConfig,
        connectionStatus: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  
  // Save configuration to backend
  const saveConfiguration = async () => {
    try {
      // Get current settings
      const settingsResponse = await api.settings.get();
      const currentSettings = settingsResponse.data || {};
      
      // Update plex settings
      const updatedSettings = {
        ...currentSettings,
        plex: {
          serverUrl: plexConfig.serverUrl,
          authToken: plexConfig.authToken,
          autoSync: plexConfig.autoSync,
          syncInterval: plexConfig.syncInterval,
          connectionStatus: plexConfig.connectionStatus,
          lastSynced: plexConfig.lastSynced
        }
      };
      
      // Save updated settings
      const response = await api.settings.update(updatedSettings);
      
      // Also save library settings
      if (libraries.length > 0) {
        // In a real implementation, we would save the library settings to the backend
        console.log('Saving library settings:', libraries);
        
        // For now, we'll just log them
        // In a real implementation, we would make an API call like:
        // await api.plex.saveLibraries(libraries);
      }
      
      // Also save path mappings
      if (mappings.length > 0) {
        // In a real implementation, we would save the path mappings to the backend
        console.log('Saving path mappings:', mappings);
        
        // For now, we'll just log them
        // In a real implementation, we would make an API call like:
        // await api.plex.saveMappings(mappings);
      }
      
      return true;
    } catch (error) {
      console.error('Error saving configuration:', error);
      return false;
    }
  };

  // Handle form changes
  const handleConfigChange = (field, value) => {
    setPlexConfig({
      ...plexConfig,
      [field]: value
    });
  };

  // Toggle library enabled status
  const toggleLibrary = async (id) => {
    // Update local state
    const updatedLibraries = libraries.map(lib => 
      lib.id === id ? {...lib, enabled: !lib.enabled} : lib
    );
    
    setLibraries(updatedLibraries);
    
    try {
      // In a real implementation, we would save this to the backend
      console.log('Toggling library:', id);
      
      // For now, we'll just log it
      // In a real implementation, we would make an API call like:
      // await api.plex.updateLibrary(id, { enabled: updatedLibraries.find(lib => lib.id === id).enabled });
    } catch (error) {
      console.error('Error toggling library:', error);
      
      // Revert on error
      setLibraries(libraries);
    }
  };

  // Add new path mapping
  const addNewMapping = () => {
    if (newMapping.plexPath && newMapping.localPath) {
      const newId = Math.max(0, ...mappings.map(m => m.id)) + 1;
      setMappings([...mappings, { ...newMapping, id: newId }]);
      setNewMapping({ plexPath: '', localPath: '', enabled: true });
      setMappingDialogOpen(false);
    }
  };

  // Delete path mapping
  const deleteMapping = (id) => {
    setMappings(mappings.filter(m => m.id !== id));
  };

  // Format bytes to human-readable size
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Loading state
  if (initialLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <CircularProgress size={60} sx={{ mb: 3 }} />
        <Typography variant="h6">Loading Plex Configuration...</Typography>
      </Box>
    );
  }
  
  return (
    <Box>
      {!inSettingsPage && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h2">Plex Configuration</Typography>
        </Box>
      )}


      {/* Plex Server Configuration */}
      <Card sx={{ mb: 4 }}>
        <CardHeader 
          title="Plex Server Connection" 
          avatar={<StorageIcon />}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Plex Server URL"
                fullWidth
                value={plexConfig.serverUrl}
                onChange={(e) => handleConfigChange('serverUrl', e.target.value)}
                placeholder="http://localhost:32400"
                helperText="Include http:// and port number"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Authentication Token"
                fullWidth
                type="password"
                value={plexConfig.authToken}
                onChange={(e) => handleConfigChange('authToken', e.target.value)}
                helperText={
                  <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}>
                    <LinkIcon fontSize="small" sx={{ mr: 0.5 }} />
                    <Typography variant="caption" component="a" href="#" sx={{ textDecoration: 'none' }}>
                      How to find your Plex token
                    </Typography>
                  </Box>
                }
              />
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', alignItems: 'center', mt: 3 }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="body2">
                Status: {' '}
                <Chip 
                  icon={plexConfig.connectionStatus === 'connected' ? <CheckCircleIcon /> : <ErrorIcon />}
                  label={plexConfig.connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
                  color={plexConfig.connectionStatus === 'connected' ? 'success' : 'error'}
                  size="small"
                />
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Last synced: {plexConfig.lastSynced ? plexConfig.lastSynced.toLocaleString() : 'Never'}
              </Typography>
            </Box>
            <Button 
              variant="outlined" 
              onClick={testConnection}
              startIcon={loading ? <CircularProgress size={20} /> : <RefreshIcon />}
              disabled={loading}
            >
              Test Connection
            </Button>
          </Box>

          <Box sx={{ mt: 3 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={plexConfig.autoSync}
                  onChange={(e) => handleConfigChange('autoSync', e.target.checked)}
                />
              }
              label="Auto-sync libraries"
            />
            {plexConfig.autoSync && (
              <Box sx={{ ml: 3, mt: 1 }}>
                <Typography variant="body2" gutterBottom>
                  Sync interval: {plexConfig.syncInterval} minutes
                </Typography>
                <Box sx={{ width: 300 }}>
                  <Slider
                    value={plexConfig.syncInterval}
                    onChange={(e, value) => handleConfigChange('syncInterval', value)}
                    min={15}
                    max={240}
                    step={15}
                    marks={[
                      { value: 15, label: '15m' },
                      { value: 60, label: '1h' },
                      { value: 120, label: '2h' },
                      { value: 240, label: '4h' }
                    ]}
                    valueLabelDisplay="auto"
                  />
                </Box>
              </Box>
            )}
          </Box>
        </CardContent>
        <CardActions sx={{ justifyContent: 'flex-end', px: 2, pb: 2 }}>
          <Button 
            variant="contained"
            onClick={saveConfiguration}
          >
            Save Configuration
          </Button>
        </CardActions>
      </Card>

      {/* Libraries */}
      <Card sx={{ mb: 4 }}>
        <CardHeader 
          title="Plex Libraries" 
          avatar={<FolderIcon />}
        />
        <Divider />
        <CardContent>
          {librariesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : libraries.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              No libraries found.
            </Alert>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Library</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Path</TableCell>
                    <TableCell>Items</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Last Scanned</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {libraries.map((library) => (
                    <TableRow key={library.id}>
                      <TableCell>
                        <Typography variant="subtitle2">{library.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={library.type}
                          size="small"
                          sx={{ 
                            backgroundColor: 
                              library.type === 'movie' ? 'rgba(46, 204, 113, 0.1)' :
                              library.type === 'show' ? 'rgba(52, 152, 219, 0.1)' :
                              library.type === 'music' ? 'rgba(155, 89, 182, 0.1)' :
                              'rgba(241, 196, 15, 0.1)'
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              maxWidth: 150,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {library.plexPath || library.path}
                          </Typography>
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => {
                              setSelectedLibrary(library);
                              setLibraryMapping({
                                localPath: library.localPath || '',
                                mapped: library.mapped || false
                              });
                              setLibraryMappingDialogOpen(true);
                            }}
                            sx={{ ml: 1 }}
                          >
                            <LinkIcon fontSize="small" />
                          </IconButton>
                          {library.mapped && (
                            <Chip 
                              label="Mapped" 
                              size="small" 
                              color="success" 
                              sx={{ ml: 1 }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{library.items.toLocaleString()}</TableCell>
                      <TableCell>{formatBytes(library.size)}</TableCell>
                      <TableCell>{library.lastScanned.toLocaleString()}</TableCell>
                      <TableCell>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={library.enabled}
                              onChange={() => toggleLibrary(library.id)}
                              size="small"
                            />
                          }
                          label={
                            <Typography variant="body2">
                              {library.enabled ? 'Monitored' : 'Ignored'}
                            </Typography>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Path Mappings */}
      <Card>
        <CardHeader 
          title="Path Mappings" 
          avatar={<ImportExportIcon />}
          action={
            <Button 
              size="small" 
              startIcon={<LinkIcon />}
              onClick={() => setMappingDialogOpen(true)}
            >
              Add Mapping
            </Button>
          }
        />
        <Divider />
        <CardContent>
          <Alert severity="info" sx={{ mb: 3 }}>
            Path mappings are used to translate Plex paths to local file system paths for file management operations.
          </Alert>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Plex Path</TableCell>
                  <TableCell>Local Path</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappings.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell>
                      <Typography variant="body2">{mapping.plexPath}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{mapping.localPath}</Typography>
                    </TableCell>
                    <TableCell>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={mapping.enabled}
                            onChange={() => {
                              setMappings(mappings.map(m => 
                                m.id === mapping.id ? {...m, enabled: !m.enabled} : m
                              ));
                            }}
                            size="small"
                          />
                        }
                        label={
                          <Typography variant="body2">
                            {mapping.enabled ? 'Active' : 'Disabled'}
                          </Typography>
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        size="small" 
                        color="error"
                        onClick={() => deleteMapping(mapping.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add Mapping Dialog */}
      <Dialog open={mappingDialogOpen} onClose={() => setMappingDialogOpen(false)}>
        <DialogTitle>Add Path Mapping</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Plex Path"
                fullWidth
                value={newMapping.plexPath}
                onChange={(e) => setNewMapping({...newMapping, plexPath: e.target.value})}
                placeholder="/data/movies"
                helperText="Path used by Plex server"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Local Path"
                fullWidth
                value={newMapping.localPath}
                onChange={(e) => setNewMapping({...newMapping, localPath: e.target.value})}
                placeholder="/media/movies"
                helperText="Corresponding path on this system"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={newMapping.enabled}
                    onChange={(e) => setNewMapping({...newMapping, enabled: e.target.checked})}
                  />
                }
                label="Enable mapping"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMappingDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={addNewMapping}
            disabled={!newMapping.plexPath || !newMapping.localPath}
          >
            Add Mapping
          </Button>
        </DialogActions>
      </Dialog>

      {/* Library Mapping Dialog */}
      <Dialog 
        open={libraryMappingDialogOpen} 
        onClose={() => setLibraryMappingDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Map Library Path
          {selectedLibrary && (
            <Typography variant="subtitle2" color="text.secondary">
              {selectedLibrary.name} ({selectedLibrary.type})
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedLibrary && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Typography variant="body2" gutterBottom>
                  Plex Path:
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    p: 1.5, 
                    backgroundColor: 'rgba(0,0,0,0.04)', 
                    borderRadius: 1,
                    wordBreak: 'break-all'
                  }}
                >
                  {selectedLibrary.plexPath || selectedLibrary.path}
                </Typography>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Local Path"
                  fullWidth
                  value={libraryMapping.localPath}
                  onChange={(e) => setLibraryMapping({
                    ...libraryMapping, 
                    localPath: e.target.value,
                    mapped: e.target.value.trim() !== ''
                  })}
                  placeholder="/media/movies"
                  helperText="Corresponding path on this system"
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={libraryMapping.mapped}
                      onChange={(e) => setLibraryMapping({
                        ...libraryMapping, 
                        mapped: e.target.checked
                      })}
                    />
                  }
                  label="Enable mapping"
                />
              </Grid>
              <Grid item xs={12}>
                <Alert severity="info">
                  Mapping this library will allow the application to manage files in this library.
                </Alert>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLibraryMappingDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={() => {
              if (selectedLibrary) {
                // Update the library with the new mapping
                const updatedLibraries = libraries.map(lib => 
                  lib.id === selectedLibrary.id 
                    ? {
                        ...lib, 
                        localPath: libraryMapping.localPath,
                        mapped: libraryMapping.mapped
                      } 
                    : lib
                );
                
                setLibraries(updatedLibraries);
                
                // Save the mapping to the backend
                api.plex.updateLibrary(selectedLibrary.id, {
                  localPath: libraryMapping.localPath,
                  mapped: libraryMapping.mapped
                }).then(() => {
                  console.log('Library mapping updated successfully');
                }).catch(error => {
                  console.error('Error updating library mapping:', error);
                });
                
                // Close the dialog
                setLibraryMappingDialogOpen(false);
              }
            }}
          >
            Save Mapping
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PlexConfig;

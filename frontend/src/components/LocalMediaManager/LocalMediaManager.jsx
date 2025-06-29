// src/components/LocalMediaManager/LocalMediaManager.jsx
import { useState, useEffect } from 'react';
import api from '../../services/api';
import path from 'path-browserify';
import { 
  Box, Typography, Button, Card, CardContent, CardHeader, 
  Divider, TextField, Grid, Alert, Switch, FormControlLabel,
  CircularProgress, Chip, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions,
  LinearProgress, Tooltip
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import StorageIcon from '@mui/icons-material/Storage';
import InfoIcon from '@mui/icons-material/Info';

// Format bytes to human-readable size
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const LocalMediaManager = () => {
  const [loading, setLoading] = useState(true);
  const [libraries, setLibraries] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [localFiles, setLocalFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [selectedDirectory, setSelectedDirectory] = useState('');
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('movie'); // Default to only show movies
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(false);
  
  // Dialog states
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [newMapping, setNewMapping] = useState({ plexPath: '', localPath: '', enabled: true });
  const [fileDetailsDialogOpen, setFileDetailsDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [confirmDeleteDialogOpen, setConfirmDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  
  // Load libraries and mappings from backend
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load Plex libraries
        const librariesResponse = await api.plex.getLibraries();
        if (librariesResponse.data) {
          setLibraries(librariesResponse.data);
        }
        
        // Load path mappings
        try {
          const mappingsResponse = await api.localMedia.getMappings();
          if (mappingsResponse.data) {
            setMappings(mappingsResponse.data);
          }
        } catch (mappingsError) {
          console.error('Error loading mappings:', mappingsError);
          // Set empty array if no mappings found
          setMappings([]);
        }
        
        // Load local files
        await loadLocalFiles();
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };
    
    loadData();
  }, []);
  
  // Filter files based on search term and filters
  useEffect(() => {
    // Apply filters to localFiles
    let filtered = [...localFiles];
    
    // Apply type filter
    if (selectedType) {
      filtered = filtered.filter(file => file.type === selectedType);
    }
    
    // Apply unmatched filter
    if (showOnlyUnmatched) {
      filtered = filtered.filter(file => !file.plexId);
    }
    
    // Apply search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(file => 
        (file.name && file.name.toLowerCase().includes(searchLower)) ||
        (file.path && file.path.toLowerCase().includes(searchLower)) ||
        (file.metadata?.title && file.metadata.title.toLowerCase().includes(searchLower))
      );
    }
    
    setFilteredFiles(filtered);
  }, [localFiles, searchTerm, selectedType, showOnlyUnmatched]);
  
  // Load local files from backend
  const loadLocalFiles = async () => {
    try {
      // Try to load files from the API
      try {
        console.log('Loading local files from API...');
        const response = await api.localMedia.getFiles();
        
        console.log('API response:', response);
        
        if (response.data && response.data.media) {
          // Ensure dates are properly formatted
          const formattedFiles = response.data.media.map(file => ({
            ...file,
            // Convert date strings to Date objects
            created: file.created ? new Date(file.created) : new Date(),
            lastAccessed: file.lastAccessed ? new Date(file.lastAccessed) : new Date(),
            // Make sure name is set for display
            name: file.filename || path.basename(file.path || '')
          }));
          
          console.log('Formatted files:', formattedFiles);
          setLocalFiles(formattedFiles);
          return;
        } else {
          console.log('No media data in response');
        }
      } catch (apiError) {
        console.error('Error loading files from API:', apiError);
      }
      
      // If API fails, try to load from media endpoint as fallback
      try {
        console.log('Trying to load from media endpoint as fallback...');
        const mediaResponse = await api.media.getAll();
        
        if (mediaResponse.data && mediaResponse.data.media) {
          const formattedFiles = mediaResponse.data.media.map(file => ({
            ...file,
            // Convert date strings to Date objects
            created: file.created ? new Date(file.created) : new Date(),
            lastAccessed: file.lastAccessed ? new Date(file.lastAccessed) : new Date(),
            // Make sure name is set for display
            name: file.filename || path.basename(file.path || '')
          }));
          
          console.log('Loaded files from media endpoint:', formattedFiles);
          setLocalFiles(formattedFiles);
          return;
        }
      } catch (mediaError) {
        console.error('Error loading from media endpoint:', mediaError);
      }
      
      // If all fails, set empty array
      console.error('Could not load files from any API, showing empty list');
      setLocalFiles([]);
    } catch (error) {
      console.error('Error loading local files:', error);
      setLocalFiles([]);
    }
  };
  
  // State for scan status
  const [scanStatus, setScanStatus] = useState({
    status: 'idle', // 'idle', 'scanning', 'completed', 'error'
    progress: 0,
    currentFile: null,
    filesProcessed: 0,
    totalFiles: 0,
    startTime: null,
    endTime: null,
    error: null
  });
  
  // Polling interval for scan status
  const [scanStatusPollingInterval, setScanStatusPollingInterval] = useState(null);
  
  // Start polling for scan status
  const startScanStatusPolling = () => {
    // Clear any existing interval
    if (scanStatusPollingInterval) {
      clearInterval(scanStatusPollingInterval);
    }
    
    // Set up new polling interval
    const interval = setInterval(async () => {
      try {
        const statusResponse = await api.localMedia.getScanProgress();
        
        if (statusResponse.data) {
          const status = statusResponse.data;
          setScanStatus(status);
          setScanProgress(status.progress || 0);
          
          // If scan is complete or errored, stop polling
          if (status.status === 'completed' || status.status === 'error') {
            clearInterval(interval);
            
            if (status.status === 'completed') {
              // Load local files after scan is complete
              await loadLocalFiles();
              
              // Show success message
              alert('Scan completed successfully');
            } else if (status.status === 'error') {
              // Show error message
              alert(`Scan error: ${status.error || 'Unknown error'}`);
            }
            
            // Reset after a delay
            setTimeout(() => {
              setScanning(false);
              setScanProgress(0);
            }, 2000);
          }
        }
      } catch (error) {
        console.error('Error polling scan status:', error);
        
        // If we can't get the status, stop polling and show an error
        clearInterval(interval);
        setScanning(false);
        setScanProgress(0);
        alert('Error tracking scan progress. Please check the console for details.');
      }
    }, 1000); // Poll every second
    
    setScanStatusPollingInterval(interval);
  };
  
  // Cleanup polling interval when component unmounts
  useEffect(() => {
    return () => {
      if (scanStatusPollingInterval) {
        clearInterval(scanStatusPollingInterval);
      }
    };
  }, [scanStatusPollingInterval]);
  
  // Scan local directory for media files
  const scanDirectory = async () => {
    if (!selectedDirectory) {
      alert('Please enter a directory to scan');
      return;
    }
    
    setScanning(true);
    setScanProgress(0);
    
    try {
      // Start the scan
      await api.localMedia.scanDirectory(selectedDirectory);
      
      // Start polling for progress
      startScanStatusPolling();
    } catch (error) {
      console.error('Error starting directory scan:', error);
      
      // Show error message to user
      let errorMessage = 'Failed to start directory scan';
      
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Reset scanning state
      setScanning(false);
      setScanProgress(0);
      
      // Show error message
      alert(`Error: ${errorMessage}`);
    }
  };
  
  // Add new path mapping
  const addNewMapping = async () => {
    if (newMapping.plexPath && newMapping.localPath) {
      try {
        // Try to add the mapping via the API
        const response = await api.localMedia.addMapping(newMapping);
        
        if (response.data) {
          // Add the new mapping to the state
          setMappings([...mappings, response.data]);
        } else {
          // Fallback if API doesn't return the new mapping
          const newId = Math.max(0, ...mappings.map(m => m.id)) + 1;
          setMappings([...mappings, { ...newMapping, id: newId }]);
        }
        
        // Reset the form
        setNewMapping({ plexPath: '', localPath: '', enabled: true });
        setMappingDialogOpen(false);
      } catch (error) {
        console.error('Error adding mapping:', error);
        
        // Fallback to local state update
        const newId = Math.max(0, ...mappings.map(m => m.id)) + 1;
        setMappings([...mappings, { ...newMapping, id: newId }]);
        setNewMapping({ plexPath: '', localPath: '', enabled: true });
        setMappingDialogOpen(false);
        
        alert(`Error adding mapping: ${error.message}`);
      }
    }
  };
  
  // Delete path mapping
  const deleteMapping = async (id) => {
    try {
      // Try to delete the mapping via the API
      await api.localMedia.deleteMapping(id);
      
      // Update the local state
      setMappings(mappings.filter(m => m.id !== id));
    } catch (error) {
      console.error('Error deleting mapping:', error);
      
      // Fallback to local state update
      setMappings(mappings.filter(m => m.id !== id));
      
      alert(`Error deleting mapping: ${error.message}`);
    }
  };
  
  // Toggle file protection
  const toggleProtection = async (file) => {
    try {
      // Update local state first for immediate feedback
      setLocalFiles(localFiles.map(f => 
        f.id === file.id ? { ...f, protected: !f.protected } : f
      ));
      
      // Make API call to update the file
      try {
        await api.localMedia.toggleProtection(file.id, !file.protected);
      } catch (apiError) {
        console.error('API error toggling protection:', apiError);
        // If API call fails, we'll keep the local state update
      }
    } catch (error) {
      console.error('Error toggling protection:', error);
      
      // Revert on error
      setLocalFiles(localFiles);
      alert(`Error toggling protection: ${error.message}`);
    }
  };
  
  // Delete file
  const deleteFile = async () => {
    if (!fileToDelete) return;
    
    try {
      // Update local state first for immediate feedback
      setLocalFiles(localFiles.filter(f => f.id !== fileToDelete.id));
      
      // Make API call to delete the file
      try {
        await api.localMedia.deleteFile(fileToDelete.id);
      } catch (apiError) {
        console.error('API error deleting file:', apiError);
        // If API call fails, we'll keep the local state update
      }
      
      setConfirmDeleteDialogOpen(false);
      setFileToDelete(null);
    } catch (error) {
      console.error('Error deleting file:', error);
      
      // Revert on error
      setConfirmDeleteDialogOpen(false);
      setFileToDelete(null);
      alert(`Error deleting file: ${error.message}`);
    }
  };
  
  // View file details
  const viewFileDetails = (file) => {
    setSelectedFile(file);
    setFileDetailsDialogOpen(true);
  };
  
  // Loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h2">Local Media Manager</Typography>
      </Box>
      
      {/* Path Mappings */}
      <Card sx={{ mb: 4 }}>
        <CardHeader 
          title="Path Mappings" 
          avatar={<LinkIcon />}
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
                            onChange={async () => {
                              // Update local state first for immediate feedback
                              setMappings(mappings.map(m => 
                                m.id === mapping.id ? {...m, enabled: !m.enabled} : m
                              ));
                              
                              // Update in the database
                              try {
                                await api.localMedia.updateMapping(mapping.id, {
                                  enabled: !mapping.enabled
                                });
                              } catch (error) {
                                console.error('Error updating mapping:', error);
                                // Keep the local state update even if API call fails
                              }
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
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Scan this directory">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={async () => {
                              // Set the selected directory to the local path of this mapping
                              setSelectedDirectory(mapping.localPath);
                              
                              // Check if directory exists before scanning
                              try {
                                // Start the scan
                                setScanning(true);
                                setScanProgress(0);
                                
                                // Start the scan
                                await api.localMedia.scanDirectory(mapping.localPath);
                                
                                // Start polling for progress
                                startScanStatusPolling();
                              } catch (error) {
                                console.error('Error starting directory scan:', error);
                                setScanning(false);
                                setScanProgress(0);
                                
                                // Show error message
                                alert(`Error scanning directory: ${error.message || 'Directory may not exist or is not accessible'}`);
                              }
                            }}
                            disabled={scanning || !mapping.enabled}
                          >
                            <SyncIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => deleteMapping(mapping.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
      
      {/* Scan Directory */}
      <Card sx={{ mb: 4 }}>
        <CardHeader 
          title="Scan Local Directory" 
          avatar={<FolderIcon />}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                label="Directory Path"
                fullWidth
                value={selectedDirectory}
                onChange={(e) => setSelectedDirectory(e.target.value)}
                placeholder="/media/movies"
                helperText="Enter the path to scan for media files"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button 
                  variant="contained" 
                  startIcon={<SyncIcon />}
                  onClick={scanDirectory}
                  disabled={scanning || !selectedDirectory}
                >
                  {scanning ? 'Scanning...' : 'Scan Directory'}
                </Button>
                
                <Button 
                  variant="outlined" 
                  color="warning"
                  onClick={async () => {
                    try {
                      await api.localMedia.resetScanStatus();
                      alert('Scan status reset successfully');
                      setScanning(false);
                      setScanProgress(0);
                    } catch (error) {
                      console.error('Error resetting scan status:', error);
                      alert('Error resetting scan status');
                    }
                  }}
                >
                  Reset Scan Status
                </Button>
              </Box>
            </Grid>
            
            {scanning && (
              <Grid item xs={12}>
                <Box sx={{ width: '100%', mt: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="body2" sx={{ flexGrow: 1 }}>
                      {scanStatus.status === 'counting' ? 'Counting files...' :
                       scanStatus.status === 'scanning' ? 'Scanning directory...' : 
                       scanStatus.status === 'completed' ? 'Scan completed' : 
                       scanStatus.status === 'error' ? 'Scan error' : 'Preparing scan...'}
                    </Typography>
                    <Typography variant="body2">{scanProgress}%</Typography>
                  </Box>
                  <LinearProgress 
                    variant={scanStatus.status === 'counting' ? "indeterminate" : "determinate"} 
                    value={scanProgress} 
                    sx={{ 
                      height: 8, 
                      borderRadius: 4,
                      mb: 2,
                      backgroundColor: theme => 
                        scanStatus.status === 'error' ? 
                        theme.palette.error.light : 
                        'rgba(0,0,0,0.1)'
                    }} 
                  />
                  
                  {scanStatus.currentFile && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Current file: {scanStatus.currentFile}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Processed {scanStatus.filesProcessed} of {scanStatus.totalFiles} files
                      </Typography>
                    </Box>
                  )}
                  
                  {scanStatus.startTime && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                      Started at {new Date(scanStatus.startTime).toLocaleTimeString()}
                      {scanStatus.endTime && ` • Completed at ${new Date(scanStatus.endTime).toLocaleTimeString()}`}
                      {scanStatus.endTime && scanStatus.startTime && ` • Duration: ${
                        Math.round((new Date(scanStatus.endTime) - new Date(scanStatus.startTime)) / 1000)
                      } seconds`}
                    </Typography>
                  )}
                  
                  {scanStatus.error && (
                    <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                      Error: {scanStatus.error}
                    </Typography>
                  )}
                </Box>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>
      
      {/* Local Files */}
      <Card>
        <CardHeader 
          title="Local Media Files" 
          avatar={<StorageIcon />}
        />
        <Divider />
        <CardContent>
          {localFiles.length === 0 ? (
            <Alert severity="info">
              No local media files found. Please scan a directory to find media files.
            </Alert>
          ) : (
            <>
              {/* Search and Filter Controls */}
              <Box sx={{ mb: 3 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="Search Files"
                      fullWidth
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name or path"
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={selectedType === 'movie'}
                          onChange={(e) => setSelectedType(e.target.checked ? 'movie' : '')}
                        />
                      }
                      label="Show only movies"
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={showOnlyUnmatched}
                          onChange={(e) => setShowOnlyUnmatched(e.target.checked)}
                        />
                      }
                      label="Show only unmatched files"
                    />
                  </Grid>
                </Grid>
              </Box>
              
              {/* Show filter results count */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Showing {filteredFiles.length} of {localFiles.length} files
                  {selectedType && ` (filtered to type: ${selectedType})`}
                  {showOnlyUnmatched && ' (unmatched files only)'}
                  {searchTerm && ` (search: "${searchTerm}")`}
                </Typography>
              </Box>
              
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>File Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell>Path</TableCell>
                      <TableCell>Plex Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredFiles.map((file) => (
                      <TableRow key={file.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                              {file.metadata?.title || file.name}
                            </Typography>
                          </Box>
                          {file.metadata?.year && (
                            <Typography variant="caption" color="text.secondary">
                              ({file.metadata.year})
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={file.type.charAt(0).toUpperCase() + file.type.slice(1)}
                            size="small"
                            sx={{ 
                              backgroundColor: 
                                file.type === 'movie' ? 'rgba(46, 204, 113, 0.1)' :
                                file.type === 'show' ? 'rgba(52, 152, 219, 0.1)' :
                                'rgba(241, 196, 15, 0.1)'
                            }}
                          />
                        </TableCell>
                        <TableCell>{formatBytes(file.size)}</TableCell>
                        <TableCell>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              maxWidth: 200,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {file.path}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {file.plexId ? (
                            <Chip 
                              icon={<CheckCircleIcon fontSize="small" />}
                              label="In Plex"
                              size="small"
                              color="success"
                            />
                          ) : (
                            <Chip 
                              icon={<ErrorIcon fontSize="small" />}
                              label="Not in Plex"
                              size="small"
                              color="error"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="View Details">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => viewFileDetails(file)}
                            >
                              <InfoIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={file.protected ? "Unprotect" : "Protect"}>
                            <IconButton 
                              size="small" 
                              color={file.protected ? "warning" : "default"}
                              onClick={() => toggleProtection(file)}
                            >
                              {file.protected ? 
                                <LockIcon fontSize="small" /> : 
                                <LockOpenIcon fontSize="small" />
                              }
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <span>
                              <IconButton 
                                size="small" 
                                color="error"
                                onClick={() => {
                                  setFileToDelete(file);
                                  setConfirmDeleteDialogOpen(true);
                                }}
                                disabled={file.protected}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
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
      
      {/* File Details Dialog */}
      <Dialog 
        open={fileDetailsDialogOpen} 
        onClose={() => setFileDetailsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          File Details
          {selectedFile && (
            <Typography variant="subtitle2" color="text.secondary">
              {selectedFile.name}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedFile && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Typography variant="subtitle1" gutterBottom>
                  Basic Information
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell component="th" scope="row">File Name</TableCell>
                        <TableCell>{selectedFile.name}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Path</TableCell>
                        <TableCell>{selectedFile.path}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Size</TableCell>
                        <TableCell>{formatBytes(selectedFile.size)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Type</TableCell>
                        <TableCell>{selectedFile.type.charAt(0).toUpperCase() + selectedFile.type.slice(1)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Created</TableCell>
                        <TableCell>{selectedFile.created.toLocaleString()}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Last Accessed</TableCell>
                        <TableCell>{selectedFile.lastAccessed.toLocaleString()}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Protected</TableCell>
                        <TableCell>{selectedFile.protected ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" scope="row">Plex ID</TableCell>
                        <TableCell>{selectedFile.plexId || 'Not in Plex'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
              
              {selectedFile.metadata && (
                <Grid item xs={12}>
                  <Typography variant="subtitle1" gutterBottom>
                    Metadata
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableBody>
                        <TableRow>
                          <TableCell component="th" scope="row">Title</TableCell>
                          <TableCell>{selectedFile.metadata.title}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell component="th" scope="row">Year</TableCell>
                          <TableCell>{selectedFile.metadata.year}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell component="th" scope="row">Genre</TableCell>
                          <TableCell>
                            {selectedFile.metadata.genre && selectedFile.metadata.genre.join(', ')}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell component="th" scope="row">Rating</TableCell>
                          <TableCell>{selectedFile.metadata.rating}/10</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell component="th" scope="row">Runtime</TableCell>
                          <TableCell>{Math.floor(selectedFile.metadata.runtime / 60)}h {selectedFile.metadata.runtime % 60}m</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell component="th" scope="row">Director</TableCell>
                          <TableCell>{selectedFile.metadata.director}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell component="th" scope="row">Cast</TableCell>
                          <TableCell>
                            {selectedFile.metadata.cast && selectedFile.metadata.cast.join(', ')}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFileDetailsDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Confirm Delete Dialog */}
      <Dialog
        open={confirmDeleteDialogOpen}
        onClose={() => setConfirmDeleteDialogOpen(false)}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the file "{fileToDelete?.name}"?
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 2 }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="error"
            onClick={deleteFile}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LocalMediaManager;

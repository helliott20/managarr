// src/components/Settings/Tabs/IntegrationSettings.jsx
import { useState, useEffect } from 'react';
import api from '../../../services/api';
import SyncNotifications from './SyncNotifications';
import { 
  Box, Typography, Button, Card, CardContent, CardHeader, 
  TextField, Grid, Alert, Switch, FormControlLabel,
  CircularProgress, Chip, Select, MenuItem, FormControl, InputLabel,
  Paper, Stack, Avatar, Collapse
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import MovieIcon from '@mui/icons-material/Movie';
import TvIcon from '@mui/icons-material/Tv';

const IntegrationSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [testingConnections, setTestingConnections] = useState(false);
  const [testingSonarr, setTestingSonarr] = useState(false);
  const [testingRadarr, setTestingRadarr] = useState(false);
  
  
  
  // Sonarr settings
  const [sonarrSettings, setSonarrSettings] = useState({
    enabled: false,
    url: '',
    apiKey: '',
    connectionStatus: 'disconnected',
    version: null,
    syncIntervalValue: 24,
    syncIntervalUnit: 'hours',
    lastConnectionTest: null
  });
  
  // Radarr settings
  const [radarrSettings, setRadarrSettings] = useState({
    enabled: false,
    url: '',
    apiKey: '',
    connectionStatus: 'disconnected',
    version: null,
    syncIntervalValue: 24,
    syncIntervalUnit: 'hours',
    lastConnectionTest: null
  });


  
  // Test all connections
  const testAllConnections = async () => {
    try {
      setTestingConnections(true);
      
      const response = await api.integrations.testAll();
      
      if (response.data && response.data.success) {
        const { results } = response.data;
        
        if (results.sonarr) {
          setSonarrSettings(prev => ({
            ...prev,
            connectionStatus: results.sonarr.connectionStatus,
            version: results.sonarr.version || prev.version,
            lastConnectionTest: results.sonarr.lastConnectionTest
          }));
        }
        
        if (results.radarr) {
          setRadarrSettings(prev => ({
            ...prev,
            connectionStatus: results.radarr.connectionStatus,
            version: results.radarr.version || prev.version,
            lastConnectionTest: results.radarr.lastConnectionTest
          }));
        }
        
        await loadSettings();
      }
    } catch (error) {
      console.error('Error testing all connections:', error);
    } finally {
      setTestingConnections(false);
    }
  };

  // Load settings from backend
  const loadSettings = async () => {
    try {
      setLoading(true);
      
      const response = await api.settings.get();
      
      if (response.data) {
        if (response.data.sonarr) {
          setSonarrSettings({
            enabled: response.data.sonarr.enabled !== undefined ? response.data.sonarr.enabled : false,
            url: response.data.sonarr.url || '',
            apiKey: response.data.sonarr.apiKey || '',
            connectionStatus: response.data.sonarr.connectionStatus || 'disconnected',
            version: response.data.sonarr.version || null,
            syncIntervalValue: response.data.sonarr.syncIntervalValue || 24,
            syncIntervalUnit: response.data.sonarr.syncIntervalUnit || 'hours',
            lastConnectionTest: response.data.sonarr.lastConnectionTest || null
          });
        }
        
        if (response.data.radarr) {
          setRadarrSettings({
            enabled: response.data.radarr.enabled !== undefined ? response.data.radarr.enabled : false,
            url: response.data.radarr.url || '',
            apiKey: response.data.radarr.apiKey || '',
            connectionStatus: response.data.radarr.connectionStatus || 'disconnected',
            version: response.data.radarr.version || null,
            syncIntervalValue: response.data.radarr.syncIntervalValue || 24,
            syncIntervalUnit: response.data.radarr.syncIntervalUnit || 'hours',
            lastConnectionTest: response.data.radarr.lastConnectionTest || null
          });
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading integration settings:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Periodic connection testing
  useEffect(() => {
    const interval = setInterval(async () => {
      const shouldTest = (
        (sonarrSettings.enabled && sonarrSettings.url && sonarrSettings.apiKey) ||
        (radarrSettings.enabled && radarrSettings.url && radarrSettings.apiKey)
      );
      
      if (shouldTest) {
        await testAllConnections();
      }
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [sonarrSettings.enabled, sonarrSettings.url, sonarrSettings.apiKey, radarrSettings.enabled, radarrSettings.url, radarrSettings.apiKey]);
  
  const handleSonarrChange = (field, value) => {
    setSonarrSettings({
      ...sonarrSettings,
      [field]: value
    });
  };
  
  const handleRadarrChange = (field, value) => {
    setRadarrSettings({
      ...radarrSettings,
      [field]: value
    });
  };
  
  const handleManualSync = async () => {
    try {
      setSyncing(true);
      
      const response = await api.sync.start();
      
      if (response.data && response.data.success) {
        
        const pollSyncStatus = async () => {
          try {
            const statusResponse = await api.sync.getStatus();
            
            if (statusResponse.data.status === 'completed') {
              setSyncing(false);
            } else if (statusResponse.data.status === 'error') {
              setSyncing(false);
            } else {
              setTimeout(pollSyncStatus, 2000);
            }
          } catch (statusError) {
            console.error('Error checking sync status:', statusError);
            setSyncing(false);
          }
        };
        
        pollSyncStatus();
      } else {
        setSyncing(false);
      }
    } catch (error) {
      console.error('Error starting sync:', error);
      setSyncing(false);
    }
  };
  
  const testSonarrConnection = async (saveStatus = true) => {
    if (!sonarrSettings.url || !sonarrSettings.apiKey) {
      return;
    }
    
    try {
      setTestingSonarr(true);
      
      const response = await api.integrations.testSonarr({
        url: sonarrSettings.url,
        apiKey: sonarrSettings.apiKey,
        saveStatus
      });
      
      const newStatus = response.data.success ? 'connected' : 'error';
      setSonarrSettings(prev => ({
        ...prev,
        connectionStatus: newStatus,
        version: response.data.version || prev.version,
        lastConnectionTest: response.data.lastConnectionTest
      }));
      
    } catch (error) {
      console.error('Error testing Sonarr connection:', error);
      
      setSonarrSettings(prev => ({
        ...prev,
        connectionStatus: 'error',
        lastConnectionTest: new Date().toISOString()
      }));
    } finally {
      setTestingSonarr(false);
    }
  };
  
  const testRadarrConnection = async (saveStatus = true) => {
    if (!radarrSettings.url || !radarrSettings.apiKey) {
      return;
    }
    
    try {
      setTestingRadarr(true);
      
      const response = await api.integrations.testRadarr({
        url: radarrSettings.url,
        apiKey: radarrSettings.apiKey,
        saveStatus
      });
      
      const newStatus = response.data.success ? 'connected' : 'error';
      setRadarrSettings(prev => ({
        ...prev,
        connectionStatus: newStatus,
        version: response.data.version || prev.version,
        lastConnectionTest: response.data.lastConnectionTest
      }));
      
    } catch (error) {
      console.error('Error testing Radarr connection:', error);
      
      setRadarrSettings(prev => ({
        ...prev,
        connectionStatus: 'error',
        lastConnectionTest: new Date().toISOString()
      }));
    } finally {
      setTestingRadarr(false);
    }
  };
  
  const saveSettings = async () => {
    try {
      setSaving(true);
      setSaveStatus('saving');
      
      const settingsResponse = await api.settings.get();
      const currentSettings = settingsResponse.data || {};
      
      const updatedSettings = {
        ...currentSettings,
        sonarr: sonarrSettings,
        radarr: radarrSettings
      };
      
      await api.settings.update(updatedSettings);
      
      setSaveStatus('success');
      
      setTimeout(() => {
        setSaveStatus('');
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
      
      setTimeout(() => {
        setSaveStatus('');
      }, 3000);
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
          Media Server Integrations
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Configure connections to Sonarr and Radarr for automated media management
        </Typography>
        
        {/* Action Buttons */}
        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Button
            variant="outlined"
            startIcon={testingConnections ? <CircularProgress size={18} /> : <RefreshIcon />}
            onClick={testAllConnections}
            disabled={testingConnections || (!sonarrSettings.enabled && !radarrSettings.enabled)}
          >
            {testingConnections ? 'Testing...' : 'Test All'}
          </Button>
          <Button
            variant="contained"
            startIcon={syncing ? <CircularProgress size={18} /> : <SyncIcon />}
            onClick={handleManualSync}
            disabled={syncing || (!sonarrSettings.enabled && !radarrSettings.enabled)}
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </Stack>
      </Box>
      
      <Alert severity="info" sx={{ mb: 4, borderRadius: 2 }}>
        <Typography variant="body2">
          Connection status is monitored automatically every 5 minutes. 
          Use <strong>Test All</strong> to force an immediate connection test, or <strong>Sync Now</strong> to manually sync your media library.
        </Typography>
      </Alert>
      
      {/* Sonarr Settings Card */}
      <Card sx={{ mb: 3 }}>
        <CardHeader 
          avatar={
            <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
              <TvIcon />
            </Avatar>
          }
          title={
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Sonarr
            </Typography>
          }
          subheader="TV Shows Management"
          action={
            <FormControlLabel
              control={
                <Switch
                  checked={sonarrSettings.enabled}
                  onChange={(e) => handleSonarrChange('enabled', e.target.checked)}
                  color="primary"
                />
              }
              label="Enabled"
              labelPlacement="start"
            />
          }
          sx={{ pb: 1 }}
        />
        <Collapse in={sonarrSettings.enabled}>
          <CardContent sx={{ pt: 0 }}>
            <Grid container spacing={3}>
              {/* Connection Settings */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3, backgroundColor: 'background.default', borderRadius: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Connection Settings
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Server URL"
                        fullWidth
                        value={sonarrSettings.url}
                        onChange={(e) => handleSonarrChange('url', e.target.value)}
                        placeholder="http://localhost:8989"
                        helperText="Include protocol and port"
                        variant="outlined"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="API Key"
                        fullWidth
                        type="password"
                        value={sonarrSettings.apiKey}
                        onChange={(e) => handleSonarrChange('apiKey', e.target.value)}
                        helperText="From Settings > General in Sonarr"
                        variant="outlined"
                      />
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>

              {/* Sync Configuration */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3, backgroundColor: 'background.default', borderRadius: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Sync Configuration
                  </Typography>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Sync Every"
                        type="number"
                        fullWidth
                        value={sonarrSettings.syncIntervalValue}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10) || 1;
                          const minValue = sonarrSettings.syncIntervalUnit === 'minutes' ? 15 : 1;
                          handleSonarrChange('syncIntervalValue', Math.max(value, minValue));
                        }}
                        slotProps={{ 
                          htmlInput: { 
                            min: sonarrSettings.syncIntervalUnit === 'minutes' ? 15 : 1,
                            max: sonarrSettings.syncIntervalUnit === 'minutes' ? 1440 : sonarrSettings.syncIntervalUnit === 'hours' ? 168 : 30
                          } 
                        }}
                        helperText={
                          sonarrSettings.syncIntervalUnit === 'minutes' ? 'Minimum 15 minutes' :
                          sonarrSettings.syncIntervalUnit === 'hours' ? 'Maximum 168 hours (1 week)' :
                          'Maximum 30 days'
                        }
                        variant="outlined"
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth>
                        <InputLabel>Time Unit</InputLabel>
                        <Select
                          value={sonarrSettings.syncIntervalUnit}
                          label="Time Unit"
                          onChange={(e) => handleSonarrChange('syncIntervalUnit', e.target.value)}
                        >
                          <MenuItem value="minutes">Minutes</MenuItem>
                          <MenuItem value="hours">Hours</MenuItem>
                          <MenuItem value="days">Days</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>

              {/* Connection Status */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Connection Status
                        </Typography>
                        <Chip 
                          icon={sonarrSettings.connectionStatus === 'connected' ? <CheckCircleIcon /> : <ErrorIcon />}
                          label={sonarrSettings.connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
                          color={sonarrSettings.connectionStatus === 'connected' ? 'success' : 'error'}
                          variant="outlined"
                        />
                      </Stack>
                      <Stack spacing={0.5}>
                        {sonarrSettings.version && (
                          <Typography variant="body2" color="text.secondary">
                            Version: {sonarrSettings.version}
                          </Typography>
                        )}
                        {sonarrSettings.lastConnectionTest && (
                          <Typography variant="body2" color="text.secondary">
                            Last tested: {new Date(sonarrSettings.lastConnectionTest).toLocaleString()}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                      <span>
                        <Button
                          variant="outlined"
                          onClick={() => testSonarrConnection()}
                          startIcon={testingSonarr ? <CircularProgress size={18} /> : <RefreshIcon />}
                          disabled={testingSonarr || !sonarrSettings.url || !sonarrSettings.apiKey}
                          sx={{ minWidth: '160px' }}
                        >
                          {testingSonarr ? 'Testing...' : 'Test Connection'}
                        </Button>
                      </span>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </CardContent>
        </Collapse>
      </Card>
      
      {/* Radarr Settings Card */}
      <Card sx={{ mb: 3 }}>
        <CardHeader 
          avatar={
            <Avatar sx={{ bgcolor: 'secondary.main', width: 48, height: 48 }}>
              <MovieIcon />
            </Avatar>
          }
          title={
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Radarr
            </Typography>
          }
          subheader="Movie Management"
          action={
            <FormControlLabel
              control={
                <Switch
                  checked={radarrSettings.enabled}
                  onChange={(e) => handleRadarrChange('enabled', e.target.checked)}
                  color="primary"
                />
              }
              label="Enabled"
              labelPlacement="start"
            />
          }
          sx={{ pb: 2 }}
        />
        <Collapse in={radarrSettings.enabled}>
          <CardContent sx={{ pt: 0 }}>
            <Grid container spacing={3}>
              {/* Connection Settings */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3, backgroundColor: 'background.default', borderRadius: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Connection Settings
                  </Typography>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Server URL"
                        fullWidth
                        value={radarrSettings.url}
                        onChange={(e) => handleRadarrChange('url', e.target.value)}
                        placeholder="http://localhost:7878"
                        helperText="Include protocol and port"
                        variant="outlined"
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="API Key"
                        fullWidth
                        type="password"
                        value={radarrSettings.apiKey}
                        onChange={(e) => handleRadarrChange('apiKey', e.target.value)}
                        helperText="From Settings > General in Radarr"
                        variant="outlined"
                      />
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>

              {/* Sync Configuration */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3, backgroundColor: 'background.default', borderRadius: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Sync Configuration
                  </Typography>
                  <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Sync Every"
                        type="number"
                        fullWidth
                        value={radarrSettings.syncIntervalValue}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10) || 1;
                          const minValue = radarrSettings.syncIntervalUnit === 'minutes' ? 15 : 1;
                          handleRadarrChange('syncIntervalValue', Math.max(value, minValue));
                        }}
                        slotProps={{ 
                          htmlInput: { 
                            min: radarrSettings.syncIntervalUnit === 'minutes' ? 15 : 1,
                            max: radarrSettings.syncIntervalUnit === 'minutes' ? 1440 : radarrSettings.syncIntervalUnit === 'hours' ? 168 : 30
                          } 
                        }}
                        helperText={
                          radarrSettings.syncIntervalUnit === 'minutes' ? 'Minimum 15 minutes' :
                          radarrSettings.syncIntervalUnit === 'hours' ? 'Maximum 168 hours (1 week)' :
                          'Maximum 30 days'
                        }
                        variant="outlined"
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <FormControl fullWidth>
                        <InputLabel>Time Unit</InputLabel>
                        <Select
                          value={radarrSettings.syncIntervalUnit}
                          label="Time Unit"
                          onChange={(e) => handleRadarrChange('syncIntervalUnit', e.target.value)}
                        >
                          <MenuItem value="minutes">Minutes</MenuItem>
                          <MenuItem value="hours">Hours</MenuItem>
                          <MenuItem value="days">Days</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>

              {/* Connection Status */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                          Connection Status
                        </Typography>
                        <Chip 
                          icon={radarrSettings.connectionStatus === 'connected' ? <CheckCircleIcon /> : <ErrorIcon />}
                          label={radarrSettings.connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
                          color={radarrSettings.connectionStatus === 'connected' ? 'success' : 'error'}
                          variant="outlined"
                        />
                      </Stack>
                      <Stack spacing={0.5}>
                        {radarrSettings.version && (
                          <Typography variant="body2" color="text.secondary">
                            Version: {radarrSettings.version}
                          </Typography>
                        )}
                        {radarrSettings.lastConnectionTest && (
                          <Typography variant="body2" color="text.secondary">
                            Last tested: {new Date(radarrSettings.lastConnectionTest).toLocaleString()}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                      <span>
                        <Button
                          variant="outlined"
                          onClick={() => testRadarrConnection()}
                          startIcon={testingRadarr ? <CircularProgress size={18} /> : <RefreshIcon />}
                          disabled={testingRadarr || !radarrSettings.url || !radarrSettings.apiKey}
                          sx={{ minWidth: '160px' }}
                        >
                          {testingRadarr ? 'Testing...' : 'Test Connection'}
                        </Button>
                      </span>

                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </CardContent>
        </Collapse>
      </Card>
      
      {/* Save Button */}
      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={3}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                Save Configuration
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Save your integration settings to apply changes
              </Typography>
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              {saveStatus === 'success' && (
                <Typography variant="body2" color="success.main" sx={{ fontWeight: 500 }}>
                  Settings saved successfully!
                </Typography>
              )}
              {saveStatus === 'error' && (
                <Typography variant="body2" color="error.main" sx={{ fontWeight: 500 }}>
                  Error saving settings
                </Typography>
              )}
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={18} /> : <SaveIcon />}
                onClick={saveSettings}
                disabled={saving}
                size="large"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      
      {/* Sync Notifications Section */}
      <Box sx={{ mt: 3 }}>
        <SyncNotifications />
      </Box>
    </Box>
  );
};

export default IntegrationSettings;
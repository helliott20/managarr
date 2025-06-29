// src/components/Settings/Tabs/GeneralSettings.jsx
import { useState, useEffect } from 'react';
import api from '../../../services/api';
import { 
  Box, Typography, Card, CardContent, CardHeader, 
  Divider, Switch, FormControlLabel, Button, 
  TextField, Slider, Grid, Alert
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';

const GeneralSettings = () => {
  const [settings, setSettings] = useState({
    darkMode: true,
    autoCleanup: true,
    cleanupThreshold: 90, // days
    notifyBeforeDelete: true,
    storageWarningThreshold: 90, // percentage
    language: 'en',
    dateFormat: 'MM/DD/YYYY'
  });
  
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  
  // Load settings from backend
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true);
        const response = await api.settings.get();
        
        if (response.data && response.data.general) {
          setSettings(response.data.general);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadSettings();
  }, []);

  const handleChange = (field, value) => {
    setSettings({
      ...settings,
      [field]: value
    });
  };

  const handleSave = async () => {
    try {
      setSaveStatus('saving');
      
      // Get current settings
      const settingsResponse = await api.settings.get();
      const currentSettings = settingsResponse.data || {};
      
      // Update general settings
      const updatedSettings = {
        ...currentSettings,
        general: settings
      };
      
      // Save updated settings
      await api.settings.update(updatedSettings);
      
      setSaveStatus('success');
      
      // Reset status after 3 seconds
      setTimeout(() => {
        setSaveStatus('');
      }, 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
      
      // Reset status after 3 seconds
      setTimeout(() => {
        setSaveStatus('');
      }, 3000);
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>General Settings</Typography>
      
      <Card sx={{ mb: 4 }}>
        <CardHeader title="Appearance" />
        <Divider />
        <CardContent>
          <FormControlLabel
            control={
              <Switch
                checked={settings.darkMode}
                onChange={(e) => handleChange('darkMode', e.target.checked)}
              />
            }
            label="Dark Mode"
          />
          
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Language
            </Typography>
            <TextField
              select
              value={settings.language}
              onChange={(e) => handleChange('language', e.target.value)}
              fullWidth
              SelectProps={{
                native: true,
              }}
            >
              <option value="en">English</option>
              <option value="fr">French</option>
              <option value="de">German</option>
              <option value="es">Spanish</option>
            </TextField>
          </Box>
          
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Date Format
            </Typography>
            <TextField
              select
              value={settings.dateFormat}
              onChange={(e) => handleChange('dateFormat', e.target.value)}
              fullWidth
              SelectProps={{
                native: true,
              }}
            >
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </TextField>
          </Box>
        </CardContent>
      </Card>
      
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        {saveStatus === 'saving' && (
          <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
            Saving...
          </Typography>
        )}
        {saveStatus === 'success' && (
          <Typography variant="body2" color="success.main" sx={{ mr: 2 }}>
            Settings saved successfully!
          </Typography>
        )}
        {saveStatus === 'error' && (
          <Typography variant="body2" color="error" sx={{ mr: 2 }}>
            Error saving settings
          </Typography>
        )}
        <Button 
          variant="contained" 
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
        >
          Save Settings
        </Button>
      </Box>
    </Box>
  );
};

export default GeneralSettings;

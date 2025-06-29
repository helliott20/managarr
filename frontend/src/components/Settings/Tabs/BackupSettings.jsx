// src/components/Settings/Tabs/BackupSettings.jsx
import { useState } from 'react';
import { 
  Box, Typography, Card, CardContent, CardHeader, 
  Divider, Switch, FormControlLabel, Button, 
  TextField, Grid, List, ListItem, ListItemText,
  ListItemSecondaryAction, IconButton, Alert
} from '@mui/material';
import BackupIcon from '@mui/icons-material/Backup';
import RestoreIcon from '@mui/icons-material/Restore';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import ScheduleIcon from '@mui/icons-material/Schedule';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const BackupSettings = () => {
  const [settings, setSettings] = useState({
    autoBackup: true,
    backupInterval: 7, // days
    keepBackups: 5, // number of backups to keep
    backupLocation: '/config/backups'
  });

  const [backups, setBackups] = useState([
    { 
      id: 1, 
      name: 'backup_20250417_220135.zip', 
      date: new Date(2025, 3, 17, 22, 1, 35), 
      size: 2.4 * 1024 * 1024 // 2.4 MB
    },
    { 
      id: 2, 
      name: 'backup_20250410_220012.zip', 
      date: new Date(2025, 3, 10, 22, 0, 12), 
      size: 2.3 * 1024 * 1024 // 2.3 MB
    },
    { 
      id: 3, 
      name: 'backup_20250403_215945.zip', 
      date: new Date(2025, 3, 3, 21, 59, 45), 
      size: 2.2 * 1024 * 1024 // 2.2 MB
    }
  ]);

  const handleSettingChange = (setting, value) => {
    setSettings({
      ...settings,
      [setting]: value
    });
  };

  const createBackup = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const newBackupName = `backup_${year}${month}${day}_${hours}${minutes}${seconds}.zip`;
    
    const newBackup = {
      id: Math.max(0, ...backups.map(b => b.id)) + 1,
      name: newBackupName,
      date: now,
      size: 2.5 * 1024 * 1024 // 2.5 MB (simulated)
    };
    
    setBackups([newBackup, ...backups]);
    
    alert('Backup created successfully!');
  };

  const deleteBackup = (id) => {
    setBackups(backups.filter(backup => backup.id !== id));
  };

  const downloadBackup = (name) => {
    alert(`This would download the backup: ${name}`);
  };

  const restoreBackup = (id) => {
    const backup = backups.find(b => b.id === id);
    if (backup) {
      if (window.confirm(`Are you sure you want to restore from backup: ${backup.name}?\n\nThis will replace your current configuration.`)) {
        alert('Backup restoration started! The application will restart when complete.');
      }
    }
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

  return (
    <Box>
      {/* Backup Settings */}
      <Card sx={{ mb: 4 }}>
        <CardHeader title="Backup Settings" avatar={<BackupIcon />} />
        <Divider />
        <CardContent>
          <Alert severity="info" sx={{ mb: 3 }}>
            Backups contain your application settings, deletion rules, schedules, and path mappings. Media files are not included in backups.
          </Alert>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoBackup}
                    onChange={(e) => handleSettingChange('autoBackup', e.target.checked)}
                  />
                }
                label="Enable automatic backups"
              />
              
              {settings.autoBackup && (
                <Box sx={{ mt: 2, ml: 4 }}>
                  <TextField
                    label="Backup every (days)"
                    type="number"
                    size="small"
                    value={settings.backupInterval}
                    onChange={(e) => handleSettingChange('backupInterval', parseInt(e.target.value))}
                    InputProps={{ inputProps: { min: 1, max: 30 } }}
                    sx={{ width: 150, mr: 2 }}
                  />
                  
                  <TextField
                    label="Backups to keep"
                    type="number"
                    size="small"
                    value={settings.keepBackups}
                    onChange={(e) => handleSettingChange('keepBackups', parseInt(e.target.value))}
                    InputProps={{ inputProps: { min: 1, max: 20 } }}
                    sx={{ width: 150 }}
                  />
                </Box>
              )}
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                label="Backup Location"
                fullWidth
                value={settings.backupLocation}
                onChange={(e) => handleSettingChange('backupLocation', e.target.value)}
                helperText="Directory on the server where backups are stored"
              />
            </Grid>
          </Grid>
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              variant="outlined"
              startIcon={<CloudUploadIcon />}
              onClick={() => alert('This would open a file upload dialog')}
            >
              Upload Backup
            </Button>
            
            <Button
              variant="contained"
              startIcon={<BackupIcon />}
              onClick={createBackup}
            >
              Create Backup Now
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Existing Backups */}
      <Card>
        <CardHeader title="Available Backups" avatar={<RestoreIcon />} />
        <Divider />
        <CardContent>
          {backups.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No backups available
            </Typography>
          ) : (
            <List>
              {backups.map((backup) => (
                <ListItem key={backup.id} divider>
                  <ListItemText
                    primary={backup.name}
                    secondary={`Created: ${backup.date.toLocaleString()} • Size: ${formatBytes(backup.size)}`}
                  />
                  <ListItemSecondaryAction>
                    <IconButton 
                      edge="end" 
                      aria-label="download"
                      onClick={() => downloadBackup(backup.name)}
                      sx={{ mr: 1 }}
                    >
                      <DownloadIcon />
                    </IconButton>
                    <IconButton 
                      edge="end" 
                      aria-label="restore"
                      onClick={() => restoreBackup(backup.id)}
                      color="primary"
                      sx={{ mr: 1 }}
                    >
                      <RestoreIcon />
                    </IconButton>
                    <IconButton 
                      edge="end" 
                      aria-label="delete"
                      onClick={() => deleteBackup(backup.id)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default BackupSettings;
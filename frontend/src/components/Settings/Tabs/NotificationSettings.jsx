// src/components/Settings/Tabs/NotificationSettings.jsx
import { useState } from 'react';
import { 
  Box, Typography, Card, CardContent, CardHeader, 
  Divider, Switch, FormControlLabel, Button, 
  TextField, Select, MenuItem, InputLabel,
  FormControl, Grid, Chip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import NotificationsIcon from '@mui/icons-material/Notifications';
import EmailIcon from '@mui/icons-material/Email';
import WebhookIcon from '@mui/icons-material/Http';
import TelegramIcon from '@mui/icons-material/Telegram';
import DiscordIcon from '@mui/icons-material/Forum';

const NotificationSettings = () => {
  const [settings, setSettings] = useState({
    notifyOnDeletion: true,
    notifyOnErrors: true,
    notifyOnStorageWarning: true,
    emailEnabled: false,
    webhookEnabled: true,
    telegramEnabled: false,
    discordEnabled: false,
    emailConfig: {
      server: '',
      port: 587,
      username: '',
      password: '',
      recipients: []
    },
    webhookConfig: {
      url: 'https://hooks.example.com/services/ABC123',
      authToken: '',
      customHeaders: {}
    }
  });

  const [webhookDialog, setWebhookDialog] = useState(false);
  const [emailDialog, setEmailDialog] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');

  const handleSettingChange = (setting, value) => {
    setSettings({
      ...settings,
      [setting]: value
    });
  };

  const handleEmailConfigChange = (field, value) => {
    setSettings({
      ...settings,
      emailConfig: {
        ...settings.emailConfig,
        [field]: value
      }
    });
  };

  const handleWebhookConfigChange = (field, value) => {
    setSettings({
      ...settings,
      webhookConfig: {
        ...settings.webhookConfig,
        [field]: value
      }
    });
  };

  const addEmailRecipient = () => {
    if (newRecipient && !settings.emailConfig.recipients.includes(newRecipient)) {
      handleEmailConfigChange('recipients', [...settings.emailConfig.recipients, newRecipient]);
      setNewRecipient('');
    }
  };

  const removeEmailRecipient = (recipient) => {
    handleEmailConfigChange(
      'recipients', 
      settings.emailConfig.recipients.filter(r => r !== recipient)
    );
  };

  const handleSaveSettings = () => {
    alert('Notification settings saved');
    // In a real app, this would save to backend
  };

  return (
    <Box>
      {/* Notification Triggers */}
      <Card sx={{ mb: 4 }}>
        <CardHeader title="Notification Triggers" avatar={<NotificationsIcon />} />
        <Divider />
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifyOnDeletion}
                    onChange={(e) => handleSettingChange('notifyOnDeletion', e.target.checked)}
                  />
                }
                label="Notify on media deletion"
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifyOnErrors}
                    onChange={(e) => handleSettingChange('notifyOnErrors', e.target.checked)}
                  />
                }
                label="Notify on errors"
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.notifyOnStorageWarning}
                    onChange={(e) => handleSettingChange('notifyOnStorageWarning', e.target.checked)}
                  />
                }
                label="Notify on storage warnings"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Notification Methods */}
      <Card sx={{ mb: 4 }}>
        <CardHeader title="Notification Methods" />
        <Divider />
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <EmailIcon sx={{ mr: 1 }} />
                      <Typography variant="h6">Email Notifications</Typography>
                    </Box>
                    <Switch
                      checked={settings.emailEnabled}
                      onChange={(e) => handleSettingChange('emailEnabled', e.target.checked)}
                    />
                  </Box>
                  
                  {settings.emailEnabled && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {settings.emailConfig.server ? 
                          `Server: ${settings.emailConfig.server}:${settings.emailConfig.port}` : 
                          'Email server not configured'}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', mt: 1 }}>
                        {settings.emailConfig.recipients.map((recipient) => (
                          <Chip
                            key={recipient}
                            label={recipient}
                            onDelete={() => removeEmailRecipient(recipient)}
                            size="small"
                            sx={{ mr: 1, mb: 1 }}
                          />
                        ))}
                      </Box>
                      
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={() => setEmailDialog(true)}
                        sx={{ mt: 1 }}
                      >
                        Configure
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <WebhookIcon sx={{ mr: 1 }} />
                      <Typography variant="h6">Webhook</Typography>
                    </Box>
                    <Switch
                      checked={settings.webhookEnabled}
                      onChange={(e) => handleSettingChange('webhookEnabled', e.target.checked)}
                    />
                  </Box>
                  
                  {settings.webhookEnabled && (
                    <Box>
                      <Typography 
                        variant="body2" 
                        color="text.secondary" 
                        gutterBottom
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        URL: {settings.webhookConfig.url}
                      </Typography>
                      
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={() => setWebhookDialog(true)}
                        sx={{ mt: 1 }}
                      >
                        Configure
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <TelegramIcon sx={{ mr: 1 }} />
                      <Typography variant="h6">Telegram</Typography>
                    </Box>
                    <Switch
                      checked={settings.telegramEnabled}
                      onChange={(e) => handleSettingChange('telegramEnabled', e.target.checked)}
                    />
                  </Box>
                  
                  {settings.telegramEnabled && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Bot not configured
                      </Typography>
                      
                      <Button size="small" variant="outlined" sx={{ mt: 1 }}>
                        Configure
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <DiscordIcon sx={{ mr: 1 }} />
                      <Typography variant="h6">Discord</Typography>
                    </Box>
                    <Switch
                      checked={settings.discordEnabled}
                      onChange={(e) => handleSettingChange('discordEnabled', e.target.checked)}
                    />
                  </Box>
                  
                  {settings.discordEnabled && (
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Webhook not configured
                      </Typography>
                      
                      <Button size="small" variant="outlined" sx={{ mt: 1 }}>
                        Configure
                      </Button>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Save Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button 
          variant="contained" 
          startIcon={<SaveIcon />}
          onClick={handleSaveSettings}
        >
          Save Notification Settings
        </Button>
      </Box>
      
      {/* Email Configuration Dialog */}
      <Dialog open={emailDialog} onClose={() => setEmailDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Email Configuration</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={8}>
              <TextField
                label="SMTP Server"
                fullWidth
                value={settings.emailConfig.server}
                onChange={(e) => handleEmailConfigChange('server', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Port"
                fullWidth
                type="number"
                value={settings.emailConfig.port}
                onChange={(e) => handleEmailConfigChange('port', parseInt(e.target.value))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Username"
                fullWidth
                value={settings.emailConfig.username}
                onChange={(e) => handleEmailConfigChange('username', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Password"
                fullWidth
                type="password"
                value={settings.emailConfig.password}
                onChange={(e) => handleEmailConfigChange('password', e.target.value)}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>Recipients</Typography>
              <Box sx={{ display: 'flex' }}>
                <TextField
                  label="Add Recipient"
                  fullWidth
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                />
                <Button 
                  variant="contained" 
                  onClick={addEmailRecipient}
                  sx={{ ml: 1 }}
                >
                  Add
                </Button>
              </Box>
              
              <Box sx={{ display: 'flex', flexWrap: 'wrap', mt: 2 }}>
                {settings.emailConfig.recipients.map((recipient) => (
                  <Chip
                    key={recipient}
                    label={recipient}
                    onDelete={() => removeEmailRecipient(recipient)}
                    sx={{ mr: 1, mb: 1 }}
                  />
                ))}
              </Box>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={() => setEmailDialog(false)}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Webhook Configuration Dialog */}
      <Dialog open={webhookDialog} onClose={() => setWebhookDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Webhook Configuration</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Webhook URL"
                fullWidth
                value={settings.webhookConfig.url}
                onChange={(e) => handleWebhookConfigChange('url', e.target.value)}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Authentication Token (optional)"
                fullWidth
                value={settings.webhookConfig.authToken}
                onChange={(e) => handleWebhookConfigChange('authToken', e.target.value)}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWebhookDialog(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={() => setWebhookDialog(false)}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NotificationSettings;
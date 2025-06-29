// src/components/DeletionRules/DeletionRules.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography, Button, Tabs, Tab, Paper, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Snackbar } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RuleIcon from '@mui/icons-material/Rule';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import api from '../../services/api';
import RulesList from './RulesList';
import PendingDeletions from './PendingDeletions';

const DeletionRules = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  
  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState({ open: false, rule: null });
  const [successSnackbar, setSuccessSnackbar] = useState({ open: false, message: '' });
  const [errorSnackbar, setErrorSnackbar] = useState({ open: false, message: '' });
  
  // Fetch rules from API
  useEffect(() => {
    const fetchRules = async () => {
      try {
        setLoading(true);
        const [rulesResponse, statsResponse] = await Promise.all([
          api.rules.getAll(),
          api.rules.getAllStats()
        ]);
        
        // Create a map of rule stats by ID for easy lookup
        const statsMap = {};
        if (statsResponse.data && Array.isArray(statsResponse.data)) {
          statsResponse.data.forEach(stat => {
            statsMap[stat.ruleId] = stat;
          });
        }
        
        if (rulesResponse.data && Array.isArray(rulesResponse.data)) {
          // Transform API data to match our component's expected format
          const formattedRules = rulesResponse.data.map(rule => ({
            id: rule._id || rule.id,
            name: rule.name,
            enabled: rule.enabled,
            conditions: rule.conditions || {
              mediaType: rule.mediaTypes && rule.mediaTypes.length === 1 ? 
                (rule.mediaTypes[0] === 'movie' ? 'movies' : 
                 rule.mediaTypes[0] === 'show' ? 'tv' : 'any') : 'any',
              minAge: rule.conditions?.olderThan || rule.conditions?.minAge || 90,
              watchStatus: rule.conditions?.watchedStatus || rule.conditions?.watchStatus || 'any',
              minRating: rule.conditions?.minRating || 0,
              minSize: rule.conditions?.minSize || 0,
              maxSize: rule.conditions?.maxSize || 0,
              titleContains: rule.conditions?.titleContains || '',
              titleExact: rule.conditions?.titleExact || '',
              resolution: rule.conditions?.resolution || 'any',
              qualityProfile: rule.conditions?.qualityProfile || 'any'
            },
            filtersEnabled: rule.filtersEnabled || {
              age: false,
              quality: false,
              enhancedQuality: false,
              size: false,
              status: false,
              title: false,
              plexData: false,
              mediaSpecific: false,
              arrIntegration: false
            },
            libraries: rule.mediaTypes ? 
              rule.mediaTypes.map(type => 
                type === 'movie' ? 'Movies' : 
                type === 'show' ? 'TV Shows' : 'Other'
              ) : ['Movies', 'TV Shows'],
            lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
            nextRun: new Date(Date.now() + 86400000), // Not in API yet
            deletionCount: statsMap[rule._id || rule.id]?.totalMediaDeleted || 0
          }));
          
          setRules(formattedRules);
        } else {
          // Fallback to mock data
          setRules([
            {
              id: 1,
              name: 'Old Movies Cleanup',
              enabled: true,
              conditions: {
                mediaType: 'movies',
                minAge: 180, // days
                watchStatus: 'any',
                minRating: 0,
                size: 0
              },
              libraries: ['Movies'],
              lastRun: new Date(Date.now() - 86400000),
              nextRun: new Date(Date.now() + 86400000),
              deletionCount: 45
            },
            {
              id: 2,
              name: 'Low-Rated TV Shows',
              enabled: false,
              conditions: {
                mediaType: 'tv',
                minAge: 30,
                watchStatus: 'watched',
                minRating: 6.0,
                size: 0
              },
              libraries: ['TV Shows'],
              lastRun: null,
              nextRun: new Date(Date.now() + 172800000),
              deletionCount: 0
            }
          ]);
        }
      } catch (error) {
        console.error('Error fetching rules:', error);
        setRules([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, []);

  // Refetch rules when returning from edit with refresh flag
  useEffect(() => {
    if (location.state?.refreshRules) {
      console.log('Refreshing rules after edit');
      const fetchRules = async () => {
        try {
          setLoading(true);
          const response = await api.rules.getAll();
          
          if (response.data && Array.isArray(response.data)) {
            // Transform API data to match our component's expected format
            const formattedRules = response.data.map(rule => ({
              id: rule._id || rule.id,
              name: rule.name,
              enabled: rule.enabled,
              conditions: rule.conditions || {
                mediaType: rule.mediaTypes && rule.mediaTypes.length === 1 ? 
                  (rule.mediaTypes[0] === 'movie' ? 'movies' : 
                   rule.mediaTypes[0] === 'show' ? 'tv' : 'any') : 'any',
                minAge: rule.conditions?.olderThan || rule.conditions?.minAge || 90,
                watchStatus: rule.conditions?.watchedStatus || rule.conditions?.watchStatus || 'any',
                minRating: rule.conditions?.minRating || 0,
                minSize: rule.conditions?.minSize || 0,
                maxSize: rule.conditions?.maxSize || 0,
                titleContains: rule.conditions?.titleContains || '',
                titleExact: rule.conditions?.titleExact || '',
                resolution: rule.conditions?.resolution || 'any',
                qualityProfile: rule.conditions?.qualityProfile || 'any'
              },
              filtersEnabled: rule.filtersEnabled || {
                age: false,
                quality: false,
                enhancedQuality: false,
                size: false,
                status: false,
                title: false,
                plexData: false,
                mediaSpecific: false,
                arrIntegration: false
              },
              libraries: rule.mediaTypes ? 
                rule.mediaTypes.map(type => 
                  type === 'movie' ? 'Movies' : 
                  type === 'show' ? 'TV Shows' : 'Other'
                ) : ['Movies', 'TV Shows'],
              lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
              nextRun: new Date(Date.now() + 86400000), // Not in API yet
              deletionCount: 0 // Not in API yet
            }));
            
            setRules(formattedRules);
          }
        } catch (error) {
          console.error('Error refreshing rules:', error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchRules();
      
      // Clear the refresh flag from location state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  // Handle creating new rule
  const handleCreateRule = () => {
    navigate('/rules/create');
  };

  // Handle editing rule
  const handleEditRule = (rule) => {
    navigate(`/rules/edit/${rule.id}`);
  };

  // Handle running a rule
  const handleRunRule = (rule) => {
    // Open confirmation dialog instead of browser alert
    setConfirmDialog({ open: true, rule });
  };

  // Execute rule after confirmation
  const executeRule = async (rule) => {
    
    try {
      const response = await api.rules.run(rule.id);
      
      if (response.data?.success) {
        const { pendingCount, totalSize, message } = response.data;
        
        // Show success message with snackbar
        setSuccessSnackbar({
          open: true,
          message: `✅ Rule executed safely! ${pendingCount} items added to pending deletions (${(totalSize / (1024 * 1024 * 1024)).toFixed(2)} GB). Review in "Pending Deletions" tab.`
        });
        
        // Update the rule's lastRun in local state
        setRules(prevRules => 
          prevRules.map(r => 
            r.id === rule.id 
              ? { ...r, lastRun: new Date() }
              : r
          )
        );
        
        console.log(`Rule "${rule.name}" executed successfully:`, response.data);
      } else {
        throw new Error(response.data?.message || 'Unknown error');
      }
    } catch (error) {
      console.error(`Error running rule "${rule.name}":`, error);
      setErrorSnackbar({
        open: true,
        message: `❌ Failed to run rule "${rule.name}": ${error.response?.data?.message || error.message}`
      });
    }
    
    // Close confirmation dialog
    setConfirmDialog({ open: false, rule: null });
  };

  // Handle toggling rule enabled state
  const handleToggleRule = async (rule) => {
    try {
      const updatedRule = { ...rule, enabled: !rule.enabled };
      await api.rules.update(rule.id, updatedRule);
      
      // Update local state
      setRules(prevRules => 
        prevRules.map(r => r.id === rule.id ? updatedRule : r)
      );
    } catch (error) {
      console.error(`Error toggling rule "${rule.name}":`, error);
    }
  };

  // Handle deleting a rule
  const handleDeleteRule = async (rule) => {
    try {
      await api.rules.delete(rule.id);
      
      // Update local state
      setRules(prevRules => prevRules.filter(r => r.id !== rule.id));
      
      // Show success message
      setSuccessSnackbar({
        open: true,
        message: `✅ Rule "${rule.name}" has been deleted successfully.`
      });
    } catch (error) {
      console.error(`Error deleting rule "${rule.name}":`, error);
      setErrorSnackbar({
        open: true,
        message: `❌ Failed to delete rule "${rule.name}": ${error.response?.data?.message || error.message}`
      });
    }
  };

  // Handle updating a rule (for schedule/strategy changes)
  const handleUpdateRule = async (ruleId, updatedRule) => {
    try {
      const response = await api.rules.update(ruleId, updatedRule);
      
      if (response.data) {
        // Update local state
        setRules(prevRules => 
          prevRules.map(r => 
            r.id === ruleId 
              ? { ...r, ...updatedRule }
              : r
          )
        );
        console.log(`Rule updated successfully`);
      }
    } catch (error) {
      console.error(`Error updating rule:`, error);
      alert(`❌ Failed to update rule: ${error.response?.data?.message || error.message}`);
    }
  };

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom sx={{ mb: 0 }}>
          Deletion Rules
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateRule}
          sx={{ 
            bgcolor: 'primary.main',
            '&:hover': { bgcolor: 'primary.dark' }
          }}
        >
          Create Rule
        </Button>
      </Box>

      {/* Tabs */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={activeTab} 
            onChange={(_, newValue) => setActiveTab(newValue)}
            aria-label="deletion rules tabs"
          >
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <RuleIcon sx={{ mr: 1 }} />
                  Rules Management
                </Box>
              } 
            />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <PendingActionsIcon sx={{ mr: 1 }} />
                  Pending Deletions
                </Box>
              } 
            />
          </Tabs>
        </Box>

        {/* Tab Panels */}
        <Box sx={{ p: 3 }}>
          {activeTab === 0 && (
            <RulesList 
              rules={rules}
              loading={loading}
              onEdit={handleEditRule}
              onRun={handleRunRule}
              onToggle={handleToggleRule}
              onDelete={handleDeleteRule}
              onUpdateRule={handleUpdateRule}
            />
          )}
          {activeTab === 1 && <PendingDeletions />}
        </Box>
      </Paper>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, rule: null })}>
        <DialogTitle>⚠️ Safety Confirmation</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            You are about to run the rule <strong>"{confirmDialog.rule?.name}"</strong>
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            This will create pending deletions for review - <strong>NO FILES WILL BE DELETED IMMEDIATELY</strong>
          </Alert>
          <Typography variant="body2" color="text.secondary">
            The affected files will be added to "Pending Deletions" where you can review and approve them before any actual deletion occurs.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, rule: null })}>
            Cancel
          </Button>
          <Button 
            onClick={() => executeRule(confirmDialog.rule)} 
            variant="contained"
            color="primary"
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar 
        open={successSnackbar.open} 
        autoHideDuration={6000} 
        onClose={() => setSuccessSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessSnackbar({ open: false, message: '' })} severity="success">
          {successSnackbar.message}
        </Alert>
      </Snackbar>

      {/* Error Snackbar */}
      <Snackbar 
        open={errorSnackbar.open} 
        autoHideDuration={6000} 
        onClose={() => setErrorSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setErrorSnackbar({ open: false, message: '' })} severity="error">
          {errorSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DeletionRules;
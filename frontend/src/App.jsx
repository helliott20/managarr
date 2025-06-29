// src/App.jsx
import { useState } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { 
  Box, Typography, IconButton,
  Drawer, List, ListItem, ListItemIcon, ListItemText,
  alpha, styled, Tooltip, Container
} from '@mui/material'
import { NotificationProvider } from './contexts/NotificationContext'

// Icons
import DashboardIcon from '@mui/icons-material/Dashboard'
import FolderIcon from '@mui/icons-material/Folder'
import DeleteIcon from '@mui/icons-material/Delete'
import ScheduleIcon from '@mui/icons-material/Schedule'
import StorageIcon from '@mui/icons-material/Storage'
import SettingsIcon from '@mui/icons-material/Settings'
import InfoIcon from '@mui/icons-material/Info'
import NotificationsIcon from '@mui/icons-material/Notifications'
import RuleIcon from '@mui/icons-material/Rule'

// Pages
import Dashboard from './components/Dashboard/Dashboard'
import MediaList from './components/MediaList/MediaList'
import Schedule from './components/Schedule/Schedule'
import DeletionRules from './components/DeletionRules/DeletionRules'
import CreateRule from './components/DeletionRules/CreateRule'
import Settings from './components/Settings/Settings'
import LocalMediaManager from './components/LocalMediaManager/LocalMediaManager'
import MediaManager from './components/MediaManager/MediaManagerOptimized'
import NotificationCenter from './components/Notifications/NotificationCenter'
import NotificationBell from './components/Notifications/NotificationBell'
import useNotificationSync from './hooks/useNotificationSync'

// Logo component
const Logo = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', p: 2, mb: 2 }}>
    <Box
      component="div"
      sx={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'linear-gradient(45deg, #7c5cff 30%, #5c3aff 90%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        mr: 1,
      }}
    >
      <Typography variant="h6" component="div" sx={{ color: 'white', fontWeight: 'bold' }}>
        M
      </Typography>
    </Box>
    <Typography variant="h6" component="div" sx={{ color: 'white', fontWeight: 'bold' }}>
      managarr
    </Typography>
  </Box>
);


// NavLink styled component
const StyledNavLink = styled(NavLink)(({ theme }) => ({
  textDecoration: 'none',
  color: 'inherit',
  display: 'block',
  width: '100%',
  '&.active .MuiListItem-root': {
    backgroundColor: alpha(theme.palette.primary.main, 0.2),
    color: theme.palette.primary.main,
    '& .MuiListItemIcon-root': {
      color: theme.palette.primary.main,
    },
  },
  '& .MuiListItem-root:hover': {
    backgroundColor: alpha(theme.palette.common.white, 0.1),
  },
}));

// Drawer width
const drawerWidth = 240;

function App() {
  const location = useLocation();
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);

  const sidebarItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'Media Manager', icon: <StorageIcon />, path: '/media-manager' },
    { text: 'Deletion Rules', icon: <RuleIcon />, path: '/rules' },
    { text: 'Schedule', icon: <ScheduleIcon />, path: '/schedule' },
    { text: 'Settings', icon: <SettingsIcon />, path: '/settings' },
  ];

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
      >
        <Logo />
        <List>
          {sidebarItems.map((item) => (
            <StyledNavLink 
              to={item.path} 
              key={item.text}
              className={({isActive}) => isActive ? 'active' : ''}
            >
              <ListItem>
                <ListItemIcon>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItem>
            </StyledNavLink>
          ))}
        </List>
        
        <Box sx={{ mt: 'auto', p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Managarr v1.0
              </Typography>
              <Tooltip title="Version Info">
                <IconButton size="small" sx={{ ml: 1 }}>
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <NotificationBell onOpen={() => setNotificationCenterOpen(true)} />
          </Box>
        </Box>
      </Drawer>

      {/* Main content */}
      <Box 
        component="main" 
        sx={{ 
          flexGrow: 1, 
          bgcolor: 'background.default',
          overflow: 'auto',
        }}
      >
        <Container maxWidth="xl" sx={{ mt: 0, mb: 0, height: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/media-manager" element={<MediaManager />} />
            <Route path="/rules" element={<DeletionRules />} />
            <Route path="/rules/create" element={<CreateRule />} />
            <Route path="/rules/edit/:id" element={<CreateRule />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/settings/*" element={<Settings />} />
          </Routes>
        </Container>
      </Box>
      
      {/* Notification Center */}
      <NotificationCenter 
        open={notificationCenterOpen} 
        onClose={() => setNotificationCenterOpen(false)} 
      />
    </Box>
  );
}

// Component to handle notification sync
const AppWithSync = () => {
  useNotificationSync(5000); // Sync every 5 seconds for faster updates
  return <App />;
};

// Wrap App with NotificationProvider
const AppWithNotifications = () => (
  <NotificationProvider>
    <AppWithSync />
  </NotificationProvider>
);

export default AppWithNotifications;

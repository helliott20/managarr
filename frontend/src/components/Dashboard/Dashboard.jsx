// src/components/Dashboard/Dashboard.jsx
import { useState, useEffect } from 'react'
import api from '../../services/api'
import { 
  Box, Typography, Grid, Card, CardContent, CardHeader, 
  Divider, CircularProgress, Button, Stack, Chip,
  LinearProgress, Paper, Tooltip, IconButton, Menu, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Switch, TextField, Select, InputLabel,
  FormControl, Snackbar, Alert, List, ListItem, ListItemIcon,
  ListItemText, Collapse, Drawer, Tab, Tabs, Accordion,
  AccordionSummary, AccordionDetails
} from '@mui/material'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js'
import { Pie, Bar } from 'react-chartjs-2'
import StorageIcon from '@mui/icons-material/Storage'
import DeleteIcon from '@mui/icons-material/Delete'
import MovieIcon from '@mui/icons-material/Movie'
import TvIcon from '@mui/icons-material/Tv'
import RefreshIcon from '@mui/icons-material/Refresh'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import SettingsIcon from '@mui/icons-material/Settings'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'

// Register ChartJS components
ChartJS.register(ArcElement, ChartTooltip, Legend, CategoryScale, LinearScale, BarElement, Title)

// Storage capacity thresholds
const STORAGE_THRESHOLD = {
  NORMAL: 70, // Up to 70% is normal
  WARNING: 85, // Between 70% and 85% is warning
  CRITICAL: 100, // Above 85% is critical
};

// Utility function to format bytes into readable sizes
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0 || bytes === undefined || bytes === null) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Available dashboard widgets
const AVAILABLE_WIDGETS = {
  STORAGE_OVERVIEW: {
    id: 'storage-overview',
    title: 'Storage Overview',
    icon: <StorageIcon />,
    defaultWidth: 12
  },
  MEDIA_SERVER_INTEGRATIONS: {
    id: 'media-server-integrations',
    title: 'Media Server Integrations',
    icon: <StorageIcon />,
    defaultWidth: 12
  },
  RECENT_DELETIONS: {
    id: 'recent-deletions',
    title: 'Recent Deletions',
    icon: <DeleteIcon />,
    defaultWidth: 12
  },
  MEDIA_TYPE_DISTRIBUTION: {
    id: 'media-type-distribution',
    title: 'Media Type Distribution',
    icon: <PieChart />,
    defaultWidth: 6
  },
  MEDIA_AGE_DISTRIBUTION: {
    id: 'media-age-distribution',
    title: 'Media Age Distribution',
    icon: <BarChart />,
    defaultWidth: 6
  }
};

// Default layout
const DEFAULT_LAYOUT = [
  {
    id: AVAILABLE_WIDGETS.STORAGE_OVERVIEW.id,
    width: 12,
    visible: true
  },
  {
    id: AVAILABLE_WIDGETS.MEDIA_SERVER_INTEGRATIONS.id,
    width: 12,
    visible: true
  },
  {
    id: AVAILABLE_WIDGETS.RECENT_DELETIONS.id,
    width: 12,
    visible: true
  }
];

// Define component for pie chart icon
function PieChart() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <path d="M11,2V22C5.9,21.5 2,17.2 2,12C2,6.8 5.9,2.5 11,2M13,2V11H22C21.5,6.2 17.8,2.5 13,2M13,13V22C17.7,21.5 21.5,17.8 22,13H13Z" fill="currentColor" />
    </svg>
  );
}

// Define component for bar chart icon
function BarChart() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" fill="currentColor" />
    </svg>
  );
}

// Get color based on storage usage
const getStorageColor = (percentage) => {
  if (percentage >= STORAGE_THRESHOLD.WARNING) 
    return percentage >= STORAGE_THRESHOLD.CRITICAL ? '#e74c3c' : '#f39c12';
  return '#2ecc71';
};

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [layout, setLayout] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [, setDiskSpaceData] = useState([]);
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalSize: 0,
    oldestFile: null,
    newestFile: null,
    storageCapacity: 0,
    storageUsed: 0,
    filesByType: {},
    filesByAge: {},
    libraries: [],
    recentDeletions: []
  });

  // Load saved layout from localStorage
  useEffect(() => {
    const savedLayout = localStorage.getItem('dashboardLayout');
    if (savedLayout) {
      try {
        setLayout(JSON.parse(savedLayout));
      } catch (e) {
        console.error('Error parsing saved layout:', e);
        setLayout(DEFAULT_LAYOUT);
      }
    } else {
      setLayout(DEFAULT_LAYOUT);
    }
  }, []);

  // Fetch data from the API
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch media stats
        const statsResponse = await api.media.getStats();
        const statsData = statsResponse.data;
        
        
        // Fetch all media for additional processing
        const mediaResponse = await api.media.getAll();
        const mediaData = mediaResponse.data;
        
        // Fetch settings to check if Sonarr and Radarr are enabled
        const settingsResponse = await api.settings.get();
        const settings = settingsResponse.data || {};
        
        // Initialize Sonarr and Radarr data
        let sonarrData = null;
        let radarrData = null;
        let sonarrDiskSpace = null;
        let radarrDiskSpace = null;
        
        // Fetch Sonarr data if enabled
        if (settings.sonarr && settings.sonarr.enabled) {
          try {
            const sonarrResponse = await api.integrations.getSonarrSeries();
            if (sonarrResponse.data && sonarrResponse.data.success) {
              sonarrData = sonarrResponse.data.series || [];
            }
            
            // Fetch Sonarr disk space
            const sonarrDiskSpaceResponse = await api.integrations.getSonarrDiskSpace();
            if (sonarrDiskSpaceResponse.data && sonarrDiskSpaceResponse.data.success) {
              sonarrDiskSpace = sonarrDiskSpaceResponse.data.diskspace || [];
            }
          } catch (sonarrError) {
            console.error('Error fetching Sonarr data:', sonarrError);
          }
        }
        
        // Fetch Radarr data if enabled
        if (settings.radarr && settings.radarr.enabled) {
          try {
            const radarrResponse = await api.integrations.getRadarrMovies();
            if (radarrResponse.data && radarrResponse.data.success) {
              radarrData = radarrResponse.data.movies || [];
            }
            
            // Fetch Radarr disk space
            const radarrDiskSpaceResponse = await api.integrations.getRadarrDiskSpace();
            if (radarrDiskSpaceResponse.data && radarrDiskSpaceResponse.data.success) {
              radarrDiskSpace = radarrDiskSpaceResponse.data.diskspace || [];
            }
          } catch (radarrError) {
            console.error('Error fetching Radarr data:', radarrError);
          }
        }
        
        // Process and consolidate disk space data
        const combinedDiskSpace = [];
        const seenDisks = new Set();
        
        // Helper function to create unique disk identifier
        const getDiskId = (disk) => `${disk.totalSpace}-${disk.freeSpace}`;
        
        // Add Radarr disk space data first (use Radarr as primary source)
        if (radarrDiskSpace && Array.isArray(radarrDiskSpace)) {
          radarrDiskSpace.forEach(disk => {
            const diskId = getDiskId(disk);
            if (!seenDisks.has(diskId)) {
              seenDisks.add(diskId);
              combinedDiskSpace.push({
                ...disk,
                usedSpace: disk.totalSpace - disk.freeSpace,
                source: 'Radarr',
                displayName: disk.path === '/' ? 'System Root' : 
                           disk.path === '/config' ? 'Configuration' :
                           disk.path === '/data' ? 'Media Storage (Data)' :
                           disk.path === '/media' ? 'Media Storage (Media)' : disk.path
              });
            }
          });
        }
        
        // Add Sonarr disk space data, only if not already seen
        if (sonarrDiskSpace && Array.isArray(sonarrDiskSpace)) {
          sonarrDiskSpace.forEach(disk => {
            const diskId = getDiskId(disk);
            if (!seenDisks.has(diskId)) {
              seenDisks.add(diskId);
              combinedDiskSpace.push({
                ...disk,
                usedSpace: disk.totalSpace - disk.freeSpace,
                source: 'Sonarr',
                displayName: disk.path === '/' ? 'System Root' : 
                           disk.path === '/config' ? 'Configuration' :
                           disk.path === '/data' ? 'Media Storage (Data)' :
                           disk.path === '/media' ? 'Media Storage (Media)' : disk.path
              });
            }
          });
        }
        
        // Update disk space state
        setDiskSpaceData(combinedDiskSpace);
        
        // Process the data
        const mediaFiles = mediaData.media || [];
        const totalFiles = mediaFiles.length;
        
        // Calculate file age distribution
        const now = new Date();
        const filesByAge = {
          '< 30 days': 0,
          '30-90 days': 0,
          '90-180 days': 0,
          '> 180 days': 0
        };
        
        mediaFiles.forEach(file => {
          const fileDate = new Date(file.created);
          const ageInDays = Math.floor((now - fileDate) / (1000 * 60 * 60 * 24));
          
          if (ageInDays < 30) {
            filesByAge['< 30 days']++;
          } else if (ageInDays < 90) {
            filesByAge['30-90 days']++;
          } else if (ageInDays < 180) {
            filesByAge['90-180 days']++;
          } else {
            filesByAge['> 180 days']++;
          }
        });
        
        // Process type distribution
        const filesByType = {};
        statsData.typeDistribution.forEach(item => {
          filesByType[item._id] = item.count;
        });
        
        // Create libraries from type distribution
        const libraries = statsData.typeDistribution.map(item => ({
          id: item._id, // Add ID for library operations
          name: item._id.charAt(0).toUpperCase() + item._id.slice(1),
          path: `/media/${item._id}`,
          totalSize: item.size,
          totalFiles: item.count,
          lastScan: new Date(Date.now() - Math.random() * 86400000) // Random time in last 24h
        }));
        
        // Process recent deletions - data is already flattened from backend
        const recentDeletions = (statsData.recentDeletions || []).map((deletion, index) => {
          // Check if we have actual deletion data (new flattened structure)
          if (deletion.name && deletion.path) {
            return {
              id: deletion.id || `deletion-${index}`,
              name: deletion.name,
              path: deletion.path,
              size: deletion.size || 0,
              deletedAt: new Date(deletion.deletedAt || Date.now()),
              reason: deletion.reason || 'Manual deletion'
            };
          }
          
          // Fallback for old data structure or missing data
          return {
            id: index + 1,
            name: `File_${index + 1}.mp4`,
            path: `/media/file_${index + 1}.mp4`,
            size: (2 + Math.random() * 5) * 1024 * 1024 * 1024, // 2-7 GB
            deletedAt: new Date(Date.now() - (index + 1) * 3600000), // 1-5 hours ago
            reason: index % 2 === 0 ? 'Age > 180 days, unwatched' : 'Manual deletion'
          };
        }).slice(0, 5);
        
        
        // Process Sonarr data
        let sonarrStats = null;
        if (sonarrData && sonarrData.length > 0) {
          const totalSonarrSize = sonarrData.reduce((total, series) => {
            return total + (series.statistics?.sizeOnDisk || 0);
          }, 0);
          
          const totalEpisodes = sonarrData.reduce((total, series) => {
            return total + (series.statistics?.episodeFileCount || 0);
          }, 0);
          
          const totalSeries = sonarrData.length;
          
          const continuingSeries = sonarrData.filter(series => 
            series.status === 'continuing'
          ).length;
          
          sonarrStats = {
            totalSeries,
            continuingSeries,
            endedSeries: totalSeries - continuingSeries,
            totalEpisodes,
            totalSize: totalSonarrSize
          };
        }
        
        // Process Radarr data
        let radarrStats = null;
        if (radarrData && radarrData.length > 0) {
          const totalRadarrSize = radarrData.reduce((total, movie) => {
            return total + (movie.sizeOnDisk || 0);
          }, 0);
          
          const totalMovies = radarrData.length;
          
          const moviesWithFile = radarrData.filter(movie => movie.hasFile).length;
          
          radarrStats = {
            totalMovies,
            moviesWithFile,
            missingMovies: totalMovies - moviesWithFile,
            totalSize: totalRadarrSize
          };
        }
        
        // Set the stats
        setStats({
          totalFiles,
          totalSize: statsData.totalSize || 0,
          oldestFile: mediaFiles.length > 0 ? new Date(Math.min(...mediaFiles.map(f => new Date(f.created)))) : null,
          newestFile: mediaFiles.length > 0 ? new Date(Math.max(...mediaFiles.map(f => new Date(f.created)))) : null,
          storageCapacity: combinedDiskSpace.reduce((total, disk) => total + disk.totalSpace, 0),
          storageUsed: combinedDiskSpace.reduce((total, disk) => total + disk.usedSpace, 0),
          filesByType,
          filesByAge,
          libraries,
          recentDeletions,
          sonarr: sonarrStats,
          radarr: radarrStats,
          diskSpace: combinedDiskSpace
        });
        
        setLoading(false);
        setRefreshing(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setRefreshing(false);
        // Fallback to mock data if API fails
        setStats({
          totalFiles: 2547,
          totalSize: 1.75 * 1024 * 1024 * 1024 * 1024, // 1.75 TB in bytes
          oldestFile: new Date('2019-05-15'),
          newestFile: new Date(),
          storageCapacity: 2 * 1024 * 1024 * 1024 * 1024, // 2 TB in bytes
          storageUsed: 1.75 * 1024 * 1024 * 1024 * 1024, // 1.75 TB in bytes
          filesByType: {
            'movie': 423,
            'show': 1853,
            'other': 271
          },
          filesByAge: {
            '< 30 days': 224,
            '30-90 days': 487,
            '90-180 days': 745,
            '> 180 days': 1091
          },
          libraries: [
            { 
              id: 'movie',
              name: 'Movies', 
              path: '/media/movies', 
              totalSize: 750 * 1024 * 1024 * 1024, // 750 GB
              totalFiles: 423,
              lastScan: new Date(Date.now() - 3600000), // 1 hour ago
            },
            { 
              id: 'show',
              name: 'TV Shows', 
              path: '/media/tv', 
              totalSize: 950 * 1024 * 1024 * 1024, // 950 GB
              totalFiles: 1853,
              lastScan: new Date(Date.now() - 7200000), // 2 hours ago
            },
            { 
              id: 'other',
              name: 'Other', 
              path: '/media/other', 
              totalSize: 50 * 1024 * 1024 * 1024, // 50 GB
              totalFiles: 271,
              lastScan: new Date(Date.now() - 86400000), // 1 day ago
            }
          ],
          recentDeletions: [
            { 
              id: 1, 
              name: 'Movie_2022.mp4',
              path: '/media/movies/Movie_2022.mp4',
              size: 4.5 * 1024 * 1024 * 1024, // 4.5 GB
              deletedAt: new Date(Date.now() - 3600000), // 1 hour ago
              reason: 'Age > 180 days, unwatched'
            },
            { 
              id: 2, 
              name: 'Series_S01E01.mkv',
              path: '/media/tv/Series/Season 1/Series_S01E01.mkv',
              size: 2.3 * 1024 * 1024 * 1024, // 2.3 GB
              deletedAt: new Date(Date.now() - 5400000), // 1.5 hours ago
              reason: 'Age > 90 days, watched'
            },
            { 
              id: 3, 
              name: 'Documentary_2021.mp4',
              path: '/media/movies/Documentary_2021.mp4',
              size: 3.7 * 1024 * 1024 * 1024, // 3.7 GB
              deletedAt: new Date(Date.now() - 7200000), // 2 hours ago
              reason: 'Manual deletion'
            },
            { 
              id: 4, 
              name: 'OldShow_S02E05.mkv',
              path: '/media/tv/OldShow/Season 2/OldShow_S02E05.mkv',
              size: 1.8 * 1024 * 1024 * 1024, // 1.8 GB
              deletedAt: new Date(Date.now() - 10800000), // 3 hours ago
              reason: 'Age > 180 days, unwatched'
            },
            { 
              id: 5, 
              name: 'ScienceFiction_2020.mp4',
              path: '/media/movies/ScienceFiction_2020.mp4',
              size: 5.2 * 1024 * 1024 * 1024, // 5.2 GB
              deletedAt: new Date(Date.now() - 14400000), // 4 hours ago
              reason: 'Low rating, age > 90 days'
            }
          ]
        });
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  // Handle refresh button click
  const handleRefresh = () => {
    setRefreshing(true);
    const fetchData = async () => {
      try {
        // Fetch settings to check if Sonarr and Radarr are enabled
        const settingsResponse = await api.settings.get();
        const settings = settingsResponse.data || {};
        
        // Fetch disk space data from Sonarr and/or Radarr
        let sonarrDiskSpace = null;
        let radarrDiskSpace = null;
        
        if (settings.sonarr && settings.sonarr.enabled) {
          try {
            const sonarrDiskSpaceResponse = await api.integrations.getSonarrDiskSpace();
            if (sonarrDiskSpaceResponse.data && sonarrDiskSpaceResponse.data.success) {
              sonarrDiskSpace = sonarrDiskSpaceResponse.data.diskspace || [];
            }
          } catch (error) {
            console.error('Error fetching Sonarr disk space:', error);
          }
        }
        
        if (settings.radarr && settings.radarr.enabled) {
          try {
            const radarrDiskSpaceResponse = await api.integrations.getRadarrDiskSpace();
            if (radarrDiskSpaceResponse.data && radarrDiskSpaceResponse.data.success) {
              radarrDiskSpace = radarrDiskSpaceResponse.data.diskspace || [];
            }
          } catch (error) {
            console.error('Error fetching Radarr disk space:', error);
          }
        }
        
        // Process and consolidate disk space data
        const combinedDiskSpace = [];
        const seenDisks = new Set();
        
        // Helper function to create unique disk identifier
        const getDiskId = (disk) => `${disk.totalSpace}-${disk.freeSpace}`;
        
        // Add Radarr disk space data first (use Radarr as primary source)
        if (radarrDiskSpace && Array.isArray(radarrDiskSpace)) {
          radarrDiskSpace.forEach(disk => {
            const diskId = getDiskId(disk);
            if (!seenDisks.has(diskId)) {
              seenDisks.add(diskId);
              combinedDiskSpace.push({
                ...disk,
                usedSpace: disk.totalSpace - disk.freeSpace,
                source: 'Radarr',
                displayName: disk.path === '/' ? 'System Root' : 
                           disk.path === '/config' ? 'Configuration' :
                           disk.path === '/data' ? 'Media Storage (Data)' :
                           disk.path === '/media' ? 'Media Storage (Media)' : disk.path
              });
            }
          });
        }
        
        // Add Sonarr disk space data, only if not already seen
        if (sonarrDiskSpace && Array.isArray(sonarrDiskSpace)) {
          sonarrDiskSpace.forEach(disk => {
            const diskId = getDiskId(disk);
            if (!seenDisks.has(diskId)) {
              seenDisks.add(diskId);
              combinedDiskSpace.push({
                ...disk,
                usedSpace: disk.totalSpace - disk.freeSpace,
                source: 'Sonarr',
                displayName: disk.path === '/' ? 'System Root' : 
                           disk.path === '/config' ? 'Configuration' :
                           disk.path === '/data' ? 'Media Storage (Data)' :
                           disk.path === '/media' ? 'Media Storage (Media)' : disk.path
              });
            }
          });
        }
        
        // Update disk space state
        setDiskSpaceData(combinedDiskSpace);
        
        // Update storage stats
        setStats(prevStats => ({
          ...prevStats,
          storageCapacity: combinedDiskSpace.reduce((total, disk) => total + disk.totalSpace, 0),
          storageUsed: combinedDiskSpace.reduce((total, disk) => total + disk.usedSpace, 0),
          diskSpace: combinedDiskSpace
        }));
        
        setRefreshing(false);
        setSnackbar({
          open: true,
          message: 'Dashboard data refreshed',
          severity: 'success'
        });
      } catch (error) {
        console.error('Error refreshing data:', error);
        setRefreshing(false);
        setSnackbar({
          open: true,
          message: 'Error refreshing data: ' + error.message,
          severity: 'error'
        });
      }
    };
    
    fetchData();
  };
  
  // Handle drag end for widget reordering
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    
    const items = Array.from(layout);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    
    setLayout(items);
    localStorage.setItem('dashboardLayout', JSON.stringify(items));
    
    setSnackbar({
      open: true,
      message: 'Dashboard layout updated',
      severity: 'success'
    });
  };
  
  // Toggle widget visibility
  const toggleWidgetVisibility = (widgetId) => {
    const updatedLayout = layout.map(widget => 
      widget.id === widgetId ? { ...widget, visible: !widget.visible } : widget
    );
    
    setLayout(updatedLayout);
    localStorage.setItem('dashboardLayout', JSON.stringify(updatedLayout));
  };
  
  // Update widget width
  const updateWidgetWidth = (widgetId, newWidth) => {
    const updatedLayout = layout.map(widget => 
      widget.id === widgetId ? { ...widget, width: newWidth } : widget
    );
    
    setLayout(updatedLayout);
    localStorage.setItem('dashboardLayout', JSON.stringify(updatedLayout));
  };
  
  // Close snackbar
  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };
  
  // Toggle customization mode
  const toggleCustomizationMode = () => {
    setCustomizing(!customizing);
  };
  
  // Reset to default layout
  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT);
    localStorage.setItem('dashboardLayout', JSON.stringify(DEFAULT_LAYOUT));
    setCustomizing(false);
    setSnackbar({
      open: true,
      message: 'Dashboard reset to default layout',
      severity: 'info'
    });
  };
  
  // Add a widget to the layout
  const addWidget = (widgetInfo) => {
    const newWidget = {
      id: widgetInfo.id,
      width: widgetInfo.defaultWidth,
      visible: true
    };
    
    const updatedLayout = [...layout, newWidget];
    setLayout(updatedLayout);
    localStorage.setItem('dashboardLayout', JSON.stringify(updatedLayout));
    
    setSnackbar({
      open: true,
      message: `Added ${widgetInfo.title} widget`,
      severity: 'success'
    });
  };

  // Check if a widget is in the layout
  const isWidgetInLayout = (widgetId) => {
    return layout.some(widget => widget.id === widgetId);
  };
  
  // Get all available widgets that aren't already in the layout
  const getAvailableWidgetsToAdd = () => {
    return Object.values(AVAILABLE_WIDGETS).filter(
      widget => !isWidgetInLayout(widget.id)
    );
  };
  
  // Calculate storage usage percentage
  const storagePercentage = stats.storageCapacity > 0 
    ? Math.round((stats.storageUsed / stats.storageCapacity) * 100) 
    : 0;

  // Data for type distribution pie chart
  const typeData = {
    labels: Object.keys(stats.filesByType).map(type => 
      type.charAt(0).toUpperCase() + type.slice(1)
    ),
    datasets: [
      {
        data: Object.values(stats.filesByType),
        backgroundColor: ['rgba(46, 204, 113, 0.7)', 'rgba(52, 152, 219, 0.7)', 'rgba(155, 89, 182, 0.7)'],
        borderColor: ['rgba(46, 204, 113, 1)', 'rgba(52, 152, 219, 1)', 'rgba(155, 89, 182, 1)'],
        borderWidth: 1,
      },
    ],
  };

  // Data for age distribution bar chart
  const ageData = {
    labels: Object.keys(stats.filesByAge),
    datasets: [
      {
        label: 'Files by Age',
        data: Object.values(stats.filesByAge),
        backgroundColor: [
          'rgba(46, 204, 113, 0.7)', 
          'rgba(52, 152, 219, 0.7)', 
          'rgba(241, 196, 15, 0.7)', 
          'rgba(231, 76, 60, 0.7)'
        ],
      },
    ],
  };

  // Loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Render a widget based on its ID
  const renderWidget = (widgetId, width) => {
    switch (widgetId) {
      case AVAILABLE_WIDGETS.STORAGE_OVERVIEW.id:
        return renderStorageOverview(width);
      case AVAILABLE_WIDGETS.MEDIA_SERVER_INTEGRATIONS.id:
        return renderMediaServerIntegrations(width);
      case AVAILABLE_WIDGETS.RECENT_DELETIONS.id:
        return renderRecentDeletions(width);
      case AVAILABLE_WIDGETS.MEDIA_TYPE_DISTRIBUTION.id:
        return renderMediaTypeDistribution(width);
      case AVAILABLE_WIDGETS.MEDIA_AGE_DISTRIBUTION.id:
        return renderMediaAgeDistribution(width);
      default:
        return null;
    }
  };
  
  // Storage Overview Widget
  const renderStorageOverview = (width) => (
    <Grid item xs={12} sm={width === 6 ? 12 : 12} md={width} lg={width}>
      <Card sx={{ 
        height: 'fit-content',
        borderRadius: 2,
        elevation: 1,
        '&:hover': {
          elevation: 3,
          transition: 'elevation 0.3s ease-in-out'
        }
      }}>
        <CardHeader 
          title="Storage Overview" 
          slotProps={{
            title: {
              variant: 'h6',
              sx: { fontSize: { xs: '1rem', sm: '1.25rem' } }
            }
          }}
          avatar={
            <Box sx={{
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              borderRadius: '50%',
              width: { xs: 32, sm: 40 },
              height: { xs: 32, sm: 40 },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <StorageIcon sx={{ fontSize: { xs: 16, sm: 20 } }} />
            </Box>
          }
          action={
            <IconButton 
              onClick={handleRefresh} 
              disabled={refreshing}
              size="small"
            >
              {refreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
            </IconButton>
          }
        />
        <Divider />
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          {stats.diskSpace && stats.diskSpace.length > 0 ? (
            <Stack spacing={3}>
              {/* Overall storage usage */}
              <Paper sx={{ 
                p: { xs: 2, sm: 3 }, 
                mb: 3,
                bgcolor: 'background.paper',
                borderRadius: 2
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: { xs: 'column', sm: 'row' },
                  justifyContent: 'space-between', 
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  gap: { xs: 1, sm: 0 },
                  mb: 2 
                }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Total Storage Usage
                  </Typography>
                  <Typography 
                    variant="body2" 
                    fontWeight="bold"
                    sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}
                  >
                    {formatBytes(stats.storageUsed)} / {formatBytes(stats.storageCapacity)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ width: '100%', mr: 2 }}>
                    <LinearProgress
                      variant="determinate"
                      value={storagePercentage}
                      sx={{
                        height: { xs: 8, sm: 12 },
                        borderRadius: 6,
                        bgcolor: 'rgba(0, 0, 0, 0.1)',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: getStorageColor(storagePercentage),
                          borderRadius: 6
                        }
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography 
                      variant="body2" 
                      color="text.secondary"
                      sx={{ 
                        fontWeight: 600,
                        minWidth: '3ch',
                        textAlign: 'right'
                      }}
                    >
                      {storagePercentage}%
                    </Typography>
                  </Box>
                </Box>
              </Paper>
              
              {/* Individual disk spaces */}
              <Typography 
                variant="h6" 
                gutterBottom
                sx={{ 
                  fontSize: { xs: '1rem', sm: '1.25rem' },
                  fontWeight: 600,
                  mb: 2
                }}
              >
                Disk Volumes
              </Typography>
              <Grid container spacing={{ xs: 2, sm: 3 }}>
                {stats.diskSpace.map((disk, index) => {
                  const usedPercentage = disk.totalSpace > 0 
                    ? Math.round((disk.usedSpace / disk.totalSpace) * 100) 
                    : 0;
                  return (
                    <Grid item xs={12} sm={6} lg={4} key={`${disk.path}-${index}`}>
                      <Paper sx={{ 
                        p: { xs: 2, sm: 3 },
                        height: '100%',
                        borderRadius: 2,
                        transition: 'all 0.2s ease-in-out',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: 3
                        }
                      }}>
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'flex-start',
                          mb: 2
                        }}>
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            borderRadius: '50%',
                            width: { xs: 32, sm: 40 },
                            height: { xs: 32, sm: 40 },
                            mr: 2,
                            flexShrink: 0
                          }}>
                            <StorageIcon sx={{ fontSize: { xs: 16, sm: 20 } }} />
                          </Box>
                          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography 
                              variant="subtitle1"
                              sx={{ 
                                fontWeight: 600,
                                fontSize: { xs: '0.875rem', sm: '1rem' },
                                wordBreak: 'break-all'
                              }}
                            >
                              {disk.displayName || disk.path}
                              {disk.label ? ` (${disk.label})` : ''}
                            </Typography>
                            <Typography 
                              variant="caption" 
                              color="text.secondary"
                              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                            >
                              Source: {disk.source} • Path: {disk.path}
                            </Typography>
                          </Box>
                        </Box>
                        
                        <Box sx={{ mb: 2 }}>
                          <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            mb: 1
                          }}>
                            <Typography 
                              variant="body2"
                              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                            >
                              {formatBytes(disk.usedSpace)} / {formatBytes(disk.totalSpace)}
                            </Typography>
                            <Typography 
                              variant="body2" 
                              color="text.secondary"
                              sx={{ fontWeight: 600 }}
                            >
                              {usedPercentage}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={usedPercentage}
                            sx={{
                              height: { xs: 6, sm: 8 },
                              borderRadius: 4,
                              bgcolor: 'rgba(0, 0, 0, 0.1)',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: getStorageColor(usedPercentage),
                                borderRadius: 4
                              }
                            }}
                          />
                        </Box>
                        
                        <Typography 
                          variant="caption" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                        >
                          {formatBytes(disk.freeSpace)} free
                        </Typography>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Stack>
          ) : (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography color="text.secondary">No storage data available</Typography>
              <Button 
                variant="contained" 
                startIcon={<RefreshIcon />} 
                sx={{ mt: 2 }}
                onClick={handleRefresh}
                disabled={refreshing}
              >
                Refresh Data
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Grid>
  );
  
  // Media Server Integrations Widget
  const renderMediaServerIntegrations = (width) => (
    (stats.sonarr || stats.radarr) ? (
      <Grid item xs={12} sm={width === 6 ? 12 : 12} md={width} lg={width}>
        <Card sx={{ 
          height: 'fit-content',
          borderRadius: 2,
          elevation: 1,
          '&:hover': {
            elevation: 3,
            transition: 'elevation 0.3s ease-in-out'
          }
        }}>
          <CardHeader 
            title="Media Server Integrations" 
            slotProps={{
              title: {
                variant: 'h6',
                sx: { fontSize: { xs: '1rem', sm: '1.25rem' } }
              }
            }}
            avatar={
              <Box sx={{
                bgcolor: 'secondary.main',
                color: 'secondary.contrastText',
                borderRadius: '50%',
                width: { xs: 32, sm: 40 },
                height: { xs: 32, sm: 40 },
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <StorageIcon sx={{ fontSize: { xs: 16, sm: 20 } }} />
              </Box>
            }
            action={
              <IconButton 
                onClick={handleRefresh} 
                disabled={refreshing}
                size="small"
              >
                {refreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
              </IconButton>
            }
          />
          <Divider />
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              {/* Sonarr Stats */}
              {stats.sonarr && (
                <Grid item xs={12} lg={6}>
                  <Paper sx={{ 
                    p: { xs: 2, sm: 3 },
                    height: '100%',
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: 3
                    }
                  }}>
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      mb: { xs: 2, sm: 3 }
                    }}>
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        bgcolor: 'info.main',
                        color: 'info.contrastText',
                        borderRadius: '50%',
                        width: { xs: 40, sm: 48 },
                        height: { xs: 40, sm: 48 },
                        mr: 2
                      }}>
                        <TvIcon sx={{ fontSize: { xs: 20, sm: 24 } }} />
                      </Box>
                      <Box>
                        <Typography 
                          variant="h6"
                          sx={{ fontSize: { xs: '1rem', sm: '1.25rem' }, fontWeight: 600 }}
                        >
                          Sonarr
                        </Typography>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                          TV Show Management
                        </Typography>
                      </Box>
                    </Box>
                    
                    <Divider sx={{ my: { xs: 2, sm: 3 } }} />
                    
                    <Grid container spacing={{ xs: 2, sm: 3 }}>
                      <Grid item xs={6} sm={6}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, mb: 0.5 }}
                        >
                          Total Series
                        </Typography>
                        <Typography 
                          variant="h5"
                          sx={{ 
                            fontSize: { xs: '1.25rem', sm: '1.5rem' },
                            fontWeight: 700
                          }}
                        >
                          {stats.sonarr.totalSeries.toLocaleString()}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={6}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, mb: 0.5 }}
                        >
                          Total Episodes
                        </Typography>
                        <Typography 
                          variant="h5"
                          sx={{ 
                            fontSize: { xs: '1.25rem', sm: '1.5rem' },
                            fontWeight: 700
                          }}
                        >
                          {stats.sonarr.totalEpisodes.toLocaleString()}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={6}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, mb: 0.5 }}
                        >
                          Continuing
                        </Typography>
                        <Typography 
                          variant="h5"
                          sx={{ 
                            fontSize: { xs: '1.25rem', sm: '1.5rem' },
                            fontWeight: 700,
                            color: 'success.main'
                          }}
                        >
                          {stats.sonarr.continuingSeries.toLocaleString()}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={6}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, mb: 0.5 }}
                        >
                          Ended
                        </Typography>
                        <Typography 
                          variant="h5"
                          sx={{ 
                            fontSize: { xs: '1.25rem', sm: '1.5rem' },
                            fontWeight: 700,
                            color: 'text.secondary'
                          }}
                        >
                          {stats.sonarr.endedSeries.toLocaleString()}
                        </Typography>
                      </Grid>
                      <Grid item xs={12}>
                        <Paper sx={{ 
                          p: { xs: 1.5, sm: 2 },
                          bgcolor: 'info.main',
                          color: 'info.contrastText',
                          borderRadius: 1
                        }}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: { xs: '0.75rem', sm: '0.875rem' },
                              opacity: 0.9,
                              mb: 0.5
                            }}
                          >
                            Total Storage Used
                          </Typography>
                          <Typography 
                            variant="h5"
                            sx={{ 
                              fontSize: { xs: '1.25rem', sm: '1.5rem' },
                              fontWeight: 700
                            }}
                          >
                            {formatBytes(stats.sonarr.totalSize)}
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>
                    
                    <Box sx={{ 
                      mt: { xs: 2, sm: 3 }, 
                      display: 'flex', 
                      justifyContent: 'flex-end' 
                    }}>
                      <Button 
                        variant="outlined" 
                        size="small" 
                        endIcon={<ArrowForwardIcon />}
                        fullWidth={{ xs: true, sm: false }}
                        onClick={() => window.location.href = '/media-manager'}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        Manage TV Shows
                      </Button>
                    </Box>
                  </Paper>
                </Grid>
              )}
              
              {/* Radarr Stats */}
              {stats.radarr && (
                <Grid item xs={12} lg={6}>
                  <Paper sx={{ 
                    p: { xs: 2, sm: 3 },
                    height: '100%',
                    borderRadius: 2,
                    bgcolor: 'background.paper',
                    transition: 'all 0.2s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: 3
                    }
                  }}>
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      mb: { xs: 2, sm: 3 }
                    }}>
                      <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        bgcolor: 'error.main',
                        color: 'error.contrastText',
                        borderRadius: '50%',
                        width: { xs: 40, sm: 48 },
                        height: { xs: 40, sm: 48 },
                        mr: 2
                      }}>
                        <MovieIcon sx={{ fontSize: { xs: 20, sm: 24 } }} />
                      </Box>
                      <Box>
                        <Typography 
                          variant="h6"
                          sx={{ fontSize: { xs: '1rem', sm: '1.25rem' }, fontWeight: 600 }}
                        >
                          Radarr
                        </Typography>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                        >
                          Movie Management
                        </Typography>
                      </Box>
                    </Box>
                    
                    <Divider sx={{ my: { xs: 2, sm: 3 } }} />
                    
                    <Grid container spacing={{ xs: 2, sm: 3 }}>
                      <Grid item xs={6} sm={6}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, mb: 0.5 }}
                        >
                          Total Movies
                        </Typography>
                        <Typography 
                          variant="h5"
                          sx={{ 
                            fontSize: { xs: '1.25rem', sm: '1.5rem' },
                            fontWeight: 700
                          }}
                        >
                          {stats.radarr.totalMovies.toLocaleString()}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={6}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, mb: 0.5 }}
                        >
                          Available
                        </Typography>
                        <Typography 
                          variant="h5"
                          sx={{ 
                            fontSize: { xs: '1.25rem', sm: '1.5rem' },
                            fontWeight: 700,
                            color: 'success.main'
                          }}
                        >
                          {stats.radarr.moviesWithFile.toLocaleString()}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={6}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, mb: 0.5 }}
                        >
                          Missing
                        </Typography>
                        <Typography 
                          variant="h5"
                          sx={{ 
                            fontSize: { xs: '1.25rem', sm: '1.5rem' },
                            fontWeight: 700,
                            color: 'warning.main'
                          }}
                        >
                          {stats.radarr.missingMovies.toLocaleString()}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={6}>
                        <Typography 
                          variant="body2" 
                          color="text.secondary"
                          sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, mb: 0.5 }}
                        >
                          Completion
                        </Typography>
                        <Typography 
                          variant="h5"
                          sx={{ 
                            fontSize: { xs: '1.25rem', sm: '1.5rem' },
                            fontWeight: 700,
                            color: 'info.main'
                          }}
                        >
                          {Math.round((stats.radarr.moviesWithFile / stats.radarr.totalMovies) * 100)}%
                        </Typography>
                      </Grid>
                      <Grid item xs={12}>
                        <Paper sx={{ 
                          p: { xs: 1.5, sm: 2 },
                          bgcolor: 'error.main',
                          color: 'error.contrastText',
                          borderRadius: 1
                        }}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: { xs: '0.75rem', sm: '0.875rem' },
                              opacity: 0.9,
                              mb: 0.5
                            }}
                          >
                            Total Storage Used
                          </Typography>
                          <Typography 
                            variant="h5"
                            sx={{ 
                              fontSize: { xs: '1.25rem', sm: '1.5rem' },
                              fontWeight: 700
                            }}
                          >
                            {formatBytes(stats.radarr.totalSize)}
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>
                    
                    <Box sx={{ 
                      mt: { xs: 2, sm: 3 }, 
                      display: 'flex', 
                      justifyContent: 'flex-end' 
                    }}>
                      <Button 
                        variant="outlined" 
                        size="small" 
                        endIcon={<ArrowForwardIcon />}
                        fullWidth={{ xs: true, sm: false }}
                        onClick={() => window.location.href = '/media-manager'}
                        sx={{ fontSize: '0.75rem' }}
                      >
                        Manage Movies
                      </Button>
                    </Box>
                  </Paper>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    ) : null
  );
  
  // Recent Deletions Widget
  const renderRecentDeletions = (width) => (
    <Grid item xs={12} sm={width === 6 ? 12 : 12} md={width} lg={width}>
      <Card sx={{ 
        height: 'fit-content',
        borderRadius: 2,
        elevation: 1,
        '&:hover': {
          elevation: 3,
          transition: 'elevation 0.3s ease-in-out'
        }
      }}>
        <CardHeader 
          title="Recent Deletions" 
          slotProps={{
            title: {
              variant: 'h6',
              sx: { fontSize: { xs: '1rem', sm: '1.25rem' } }
            }
          }}
          avatar={
            <Box sx={{
              bgcolor: 'error.main',
              color: 'error.contrastText',
              borderRadius: '50%',
              width: { xs: 32, sm: 40 },
              height: { xs: 32, sm: 40 },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <DeleteIcon sx={{ fontSize: { xs: 16, sm: 20 } }} />
            </Box>
          }
          action={
            <Button 
              endIcon={<ArrowForwardIcon />}
              size="small"
              sx={{ fontSize: '0.75rem' }}
            >
              View All
            </Button>
          }
        />
        <Divider />
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={{ xs: 2, sm: 3 }}>
            {stats.recentDeletions.map((deletion) => (
              <Paper key={deletion.id} sx={{ 
                p: { xs: 2, sm: 3 },
                borderRadius: 2,
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-1px)',
                  boxShadow: 2
                }
              }}>
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'flex-start',
                  gap: 2
                }}>
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    bgcolor: 'error.main',
                    color: 'error.contrastText',
                    borderRadius: '50%',
                    width: { xs: 32, sm: 36 },
                    height: { xs: 32, sm: 36 },
                    flexShrink: 0
                  }}>
                    <DeleteIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />
                  </Box>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography 
                      variant="subtitle1"
                      sx={{ 
                        fontWeight: 600,
                        fontSize: { xs: '0.875rem', sm: '1rem' },
                        mb: 0.5
                      }}
                    >
                      {deletion.name}
                    </Typography>
                    <Typography 
                      variant="body2" 
                      color="text.secondary" 
                      sx={{ 
                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        mb: 1
                      }}
                    >
                      {deletion.path}
                    </Typography>
                    <Chip 
                      label={deletion.reason}
                      size="small"
                      sx={{ 
                        bgcolor: 'error.light',
                        color: 'error.contrastText',
                        fontSize: '0.7rem',
                        height: { xs: 20, sm: 24 }
                      }}
                    />
                  </Box>
                  <Box sx={{ 
                    textAlign: 'right',
                    flexShrink: 0
                  }}>
                    <Typography 
                      variant="subtitle2"
                      sx={{ 
                        fontWeight: 600,
                        fontSize: { xs: '0.75rem', sm: '0.875rem' }
                      }}
                    >
                      {formatBytes(deletion.size)}
                    </Typography>
                    <Typography 
                      variant="caption" 
                      color="text.secondary"
                      sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                    >
                      {deletion.deletedAt.toLocaleTimeString()}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Grid>
  );
  
  // Media Type Distribution Widget
  const renderMediaTypeDistribution = (width) => (
    <Grid item xs={12} sm={6} md={width} lg={width}>
      <Card sx={{ 
        height: { xs: 'auto', sm: '400px' },
        borderRadius: 2,
        elevation: 1,
        '&:hover': {
          elevation: 3,
          transition: 'elevation 0.3s ease-in-out'
        }
      }}>
        <CardHeader 
          title="Media Type Distribution" 
          slotProps={{
            title: {
              variant: 'h6',
              sx: { fontSize: { xs: '1rem', sm: '1.25rem' } }
            }
          }}
          avatar={
            <Box sx={{
              bgcolor: 'success.main',
              color: 'success.contrastText',
              borderRadius: '50%',
              width: { xs: 32, sm: 40 },
              height: { xs: 32, sm: 40 },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PieChart />
            </Box>
          }
        />
        <Divider />
        <CardContent sx={{ 
          p: { xs: 2, sm: 3 },
          height: 'calc(100% - 80px)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <Box sx={{ 
            height: { xs: 250, sm: 300 },
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Pie 
              data={typeData} 
              options={{ 
                maintainAspectRatio: false,
                responsive: true,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      boxWidth: 12,
                      padding: 15,
                      font: {
                        size: 12
                      }
                    }
                  }
                }
              }} 
            />
          </Box>
        </CardContent>
      </Card>
    </Grid>
  );
  
  // Media Age Distribution Widget
  const renderMediaAgeDistribution = (width) => (
    <Grid item xs={12} sm={6} md={width} lg={width}>
      <Card sx={{ 
        height: { xs: 'auto', sm: '400px' },
        borderRadius: 2,
        elevation: 1,
        '&:hover': {
          elevation: 3,
          transition: 'elevation 0.3s ease-in-out'
        }
      }}>
        <CardHeader 
          title="Media Age Distribution" 
          slotProps={{
            title: {
              variant: 'h6',
              sx: { fontSize: { xs: '1rem', sm: '1.25rem' } }
            }
          }}
          avatar={
            <Box sx={{
              bgcolor: 'warning.main',
              color: 'warning.contrastText',
              borderRadius: '50%',
              width: { xs: 32, sm: 40 },
              height: { xs: 32, sm: 40 },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <BarChart />
            </Box>
          }
        />
        <Divider />
        <CardContent sx={{ 
          p: { xs: 2, sm: 3 },
          height: 'calc(100% - 80px)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <Box sx={{ 
            height: { xs: 250, sm: 300 },
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Bar
              data={ageData}
              options={{
                maintainAspectRatio: false,
                responsive: true,
                scales: {
                  y: {
                    beginAtZero: true,
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                      font: {
                        size: 11
                      }
                    }
                  },
                  x: {
                    grid: {
                      display: false
                    },
                    ticks: {
                      font: {
                        size: 11
                      }
                    }
                  }
                },
                plugins: {
                  legend: {
                    display: false
                  }
                }
              }}
            />
          </Box>
        </CardContent>
      </Card>
    </Grid>
  );

  return (
    <Box sx={{ 
      height: '100%',
      p: { xs: 1, sm: 2, md: 3 },
      bgcolor: 'background.default',
      overflow: 'auto'
    }}>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' },
        gap: { xs: 2, sm: 0 },
        mb: { xs: 2, sm: 3, md: 4 } 
      }}>
        <Typography 
          variant="h2" 
          sx={{ 
            fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' },
            fontWeight: 600 
          }}
        >
          Dashboard
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 1, sm: 2 },
          width: { xs: '100%', sm: 'auto' }
        }}>
          <Button 
            variant={customizing ? "contained" : "outlined"}
            startIcon={<SettingsIcon />}
            onClick={toggleCustomizationMode}
            size="small"
            fullWidth={{ xs: true, sm: false }}
          >
            {customizing ? "Done" : "Customize"}
          </Button>
          
          <Button 
            variant="contained" 
            startIcon={<DeleteIcon />}
            color="primary"
            size="small"
            fullWidth={{ xs: true, sm: false }}
            onClick={() => {
              if (window.confirm('Are you sure you want to run cleanup with all enabled rules?')) {
                api.cleanup.run()
                  .then(() => setSnackbar({
                    open: true,
                    message: 'Cleanup initiated successfully',
                    severity: 'success'
                  }))
                  .catch(err => setSnackbar({
                    open: true,
                    message: `Error: ${err.message}`,
                    severity: 'error'
                  }));
              }
            }}
          >
            Run Cleanup
          </Button>
        </Box>
      </Box>
      
      {/* Customization Panel */}
      {customizing && (
        <Paper sx={{ 
          p: { xs: 2, sm: 3 }, 
          mb: { xs: 2, sm: 3 },
          borderRadius: 2,
          elevation: 1
        }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between', 
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: { xs: 2, sm: 0 },
            mb: 3 
          }}>
            <Typography variant="h6" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
              Dashboard Customization
            </Typography>
            <Button 
              variant="outlined" 
              color="warning" 
              size="small"
              startIcon={<RefreshIcon />}
              onClick={resetLayout}
              fullWidth={{ xs: true, sm: false }}
            >
              Reset to Default
            </Button>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Drag and drop widgets to reorder them. Click the visibility icon to show/hide a widget.
            Adjust the width of each widget using the width controls.
          </Typography>
          
          {/* Available Widgets to Add */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Add Widgets</Typography>
            <Box sx={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: 1,
              '& .MuiChip-root': {
                mb: 1
              }
            }}>
              {getAvailableWidgetsToAdd().map(widget => (
                <Chip
                  key={widget.id}
                  icon={widget.icon}
                  label={widget.title}
                  onClick={() => addWidget(widget)}
                  clickable
                  color="primary"
                  variant="outlined"
                  size="small"
                />
              ))}
            </Box>
          </Box>
        </Paper>
      )}
      
      {/* Snackbar for notifications */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Dashboard Widgets */}
      <DragDropContext onDragEnd={handleDragEnd}>
        {customizing ? (
          <Droppable droppableId="dashboard-widgets">
            {(provided) => (
              <Box
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {layout.map((widget, index) => (
                  <Draggable key={widget.id} draggableId={widget.id} index={index}>
                    {(provided) => (
                      <Paper
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        sx={{ mb: 2, p: 2 }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <Box {...provided.dragHandleProps} sx={{ mr: 2 }}>
                            <DragIndicatorIcon />
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {Object.values(AVAILABLE_WIDGETS).find(w => w.id === widget.id)?.icon}
                            <Typography variant="subtitle1" sx={{ ml: 1 }}>
                              {Object.values(AVAILABLE_WIDGETS).find(w => w.id === widget.id)?.title}
                            </Typography>
                          </Box>
                          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FormControl size="small" sx={{ minWidth: 80 }}>
                              <Select
                                value={widget.width}
                                onChange={(e) => updateWidgetWidth(widget.id, e.target.value)}
                                displayEmpty
                                size="small"
                              >
                                <MenuItem value={12}>Full Width</MenuItem>
                                <MenuItem value={6}>Half Width</MenuItem>
                                <MenuItem value={4}>1/3 Width</MenuItem>
                              </Select>
                            </FormControl>
                            <IconButton onClick={() => toggleWidgetVisibility(widget.id)}>
                              {widget.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
                            </IconButton>
                          </Box>
                        </Box>
                      </Paper>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </Box>
            )}
          </Droppable>
        ) : (
          <Grid container spacing={{ xs: 2, sm: 3, md: 4 }}>
            {layout
              .filter(widget => widget.visible)
              .map((widget) => renderWidget(widget.id, widget.width))}
          </Grid>
        )}
      </DragDropContext>
    </Box>
  );
};

export default Dashboard;

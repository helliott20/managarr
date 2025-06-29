// src/components/MediaList/MediaList.jsx
import { useState, useEffect } from 'react'
import api from '../../services/api'
import { 
  Box, Typography, Grid, Card, CardMedia, 
  Chip, TextField, InputAdornment, Tab, Tabs,
  FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Button, styled,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import MovieIcon from '@mui/icons-material/Movie'
import TvIcon from '@mui/icons-material/Tv'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import FilterListIcon from '@mui/icons-material/FilterList'
import SyncIcon from '@mui/icons-material/Sync'
import InfoIcon from '@mui/icons-material/Info'
import DeleteIcon from '@mui/icons-material/Delete'

// Styled components for media cards
const MediaCardWrapper = styled(Card)(({ theme }) => ({
  width: 180,
  height: 270,
  position: 'relative',
  overflow: 'visible',
  transition: 'transform 0.2s ease-in-out',
  '&:hover': {
    transform: 'scale(1.05)',
    zIndex: 1,
  },
}));

const MediaCardOverlay = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  padding: theme.spacing(1.5),
  borderBottomLeftRadius: theme.shape.borderRadius,
  borderBottomRightRadius: theme.shape.borderRadius,
  transition: 'opacity 0.2s',
  opacity: 0,
  '&:hover': {
    opacity: 1,
  },
}));

// Format bytes to human-readable size
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Media card component
const MediaCard = ({ item }) => {
  // Get rating stars (if available)
  const getRatingStars = (rating) => {
    if (!rating) return null;
    
    // Convert to 5-star scale if it's a 10-point scale
    const normalizedRating = rating > 5 ? rating / 2 : rating;
    const fullStars = Math.floor(normalizedRating);
    const hasHalfStar = normalizedRating % 1 >= 0.5;
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
        {[...Array(5)].map((_, i) => (
          <Box 
            key={i}
            component="span" 
            sx={{ 
              color: i < fullStars ? 'gold' : 
                    (i === fullStars && hasHalfStar) ? 'gold' : 
                    'rgba(255,255,255,0.3)',
              fontSize: '0.7rem',
              mr: 0.2
            }}
          >
            {i < fullStars ? '★' : 
             (i === fullStars && hasHalfStar) ? '★' : 
             '☆'}
          </Box>
        ))}
      </Box>
    );
  };
  
  return (
    <MediaCardWrapper>
      {/* Media Type Badge */}
      <Chip
        label={item.type === 'movie' ? 'MOVIE' : 
               item.type === 'series' || item.type === 'show' ? 'SERIES' : 
               item.type.toUpperCase()}
        size="small"
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
        }}
      />
      
      {/* Watched Badge */}
      {item.watched && (
        <Chip
          icon={<CheckCircleIcon fontSize="small" />}
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 1,
            backgroundColor: 'rgba(26, 217, 145, 0.7)',
            color: 'white',
          }}
        />
      )}
      
      {/* Protected Badge */}
      {item.protected && (
        <Chip
          size="small"
          sx={{
            position: 'absolute',
            top: item.watched ? 40 : 8,
            right: 8,
            zIndex: 1,
            backgroundColor: 'rgba(241, 196, 15, 0.7)',
            color: 'white',
          }}
          label="PROTECTED"
        />
      )}
      
      {/* Size Badge */}
      <Chip
        size="small"
        sx={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          zIndex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
        }}
        label={formatBytes(item.size)}
      />
      
      {/* Poster Image */}
      <CardMedia
        component="img"
        height="270"
        image={item.poster || '/default-poster.jpg'}
        alt={item.title}
        sx={{ borderRadius: 2 }}
      />
      
      {/* Hover Overlay */}
      <MediaCardOverlay>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 0.5 }}>
          {item.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {item.year}
        </Typography>
        
        {/* Additional metadata */}
        {item.metadata && (
          <>
            {/* Rating stars */}
            {item.metadata.rating && getRatingStars(item.metadata.rating)}
            
            {/* Genres */}
            {item.metadata.genre && item.metadata.genre.length > 0 && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {item.metadata.genre.slice(0, 3).join(', ')}
              </Typography>
            )}
            
            {/* Runtime */}
            {item.metadata.runtime && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {Math.floor(item.metadata.runtime / 60)}m
              </Typography>
            )}
            
            {/* Director or creator */}
            {item.metadata.director && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Dir: {Array.isArray(item.metadata.director) ? item.metadata.director[0] : item.metadata.director}
              </Typography>
            )}
            
            {/* Cast */}
            {item.metadata.cast && item.metadata.cast.length > 0 && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Cast: {item.metadata.cast.slice(0, 2).join(', ')}
              </Typography>
            )}
          </>
        )}
        
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Added: {new Date(item.added).toLocaleDateString()}
        </Typography>
      </MediaCardOverlay>
    </MediaCardWrapper>
  );
};

const MediaList = ({ type = 'all' }) => {
  const [loading, setLoading] = useState(true);
  const [mediaItems, setMediaItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState(type);
  const [sortBy, setSortBy] = useState('newest');
  const [syncingMedia, setSyncingMedia] = useState(false);
  
  // Fetch media from API
  useEffect(() => {
    const fetchMedia = async () => {
      try {
        setLoading(true);
        
        // Determine API filter based on active tab
        const apiType = activeTab === 'all' ? '' : activeTab;
        
        // Fetch media from API
        const response = await api.media.getAll({
          type: apiType,
          sort: sortBy,
          search: searchTerm
        });
        
        if (response.data && response.data.media) {
          // Transform API data to match component format
          const formattedMedia = response.data.media.map(item => ({
            id: item._id || item.id,
            title: item.metadata?.title || item.filename,
            year: item.metadata?.year || new Date(item.created).getFullYear(),
            type: item.type === 'movie' ? 'movie' : 
                  item.type === 'show' ? 'series' : item.type,
            poster: item.metadata?.poster || `https://picsum.photos/180/270?random=${item.id}`,
            available: true,
            added: new Date(item.created),
            size: item.size,
            path: item.path,
            watched: item.watched,
            protected: item.protected,
            metadata: item.metadata || {
              // Default metadata if not provided
              title: item.filename,
              year: new Date(item.created).getFullYear(),
              genre: [],
              rating: null,
              runtime: 0,
              director: null,
              cast: []
            }
          }));
          
          setMediaItems(formattedMedia);
        } else {
          // Fallback to mock data
          const mockData = [];
          
          for (let i = 1; i <= 50; i++) {
            const mediaType = i % 2 === 0 ? 'movie' : 'series';
            if (type !== 'all' && mediaType !== type) continue;
            
            mockData.push({
              id: i,
              title: `${mediaType === 'movie' ? 'Movie' : 'Series'} ${i}`,
              year: 2020 + Math.floor(i / 10),
              type: mediaType,
              poster: `https://picsum.photos/180/270?random=${i}`,
              available: i % 3 === 0,
              added: new Date(Date.now() - i * 86400000), // days ago
              size: Math.floor(Math.random() * 5000) * 1024 * 1024, // Random size in bytes
              protected: i % 7 === 0 // Some are protected
            });
          }
          
          setMediaItems(mockData);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching media:', error);
        
        // Fallback to mock data on error
        const mockData = [];
        
        for (let i = 1; i <= 50; i++) {
          const mediaType = i % 2 === 0 ? 'movie' : 'series';
          if (type !== 'all' && mediaType !== type) continue;
          
          mockData.push({
            id: i,
            title: `${mediaType === 'movie' ? 'Movie' : 'Series'} ${i}`,
            year: 2020 + Math.floor(i / 10),
            type: mediaType,
            poster: `https://picsum.photos/180/270?random=${i}`,
            available: i % 3 === 0,
            added: new Date(Date.now() - i * 86400000), // days ago
            size: Math.floor(Math.random() * 5000) * 1024 * 1024, // Random size in bytes
            protected: i % 7 === 0 // Some are protected
          });
        }
        
        setMediaItems(mockData);
        setLoading(false);
      }
    };
    
    fetchMedia();
  }, [type, activeTab, sortBy, searchTerm]);

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleSortByChange = (event) => {
    setSortBy(event.target.value);
  };

  // Filter and sort media items
  const filteredMedia = mediaItems
    .filter(item => {
      // Filter by search term
      const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
      // Filter by type (tab)
      const matchesType = activeTab === 'all' || item.type === activeTab;
      return matchesSearch && matchesType;
    })
    .sort((a, b) => {
      // Sort by selection
      switch(sortBy) {
        case 'newest':
          return new Date(b.added) - new Date(a.added);
        case 'oldest':
          return new Date(a.added) - new Date(b.added);
        case 'largest':
          return b.size - a.size;
        case 'smallest':
          return a.size - b.size;
        case 'name':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

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
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 3 
        }}
      >
        <Typography variant="h2">
          {activeTab === 'movie' ? 'Movies' : 
           activeTab === 'series' ? 'TV Series' : 'All Media'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button 
            variant="outlined" 
            startIcon={<SyncIcon />}
            onClick={() => {
              setSyncingMedia(true);
              
              // Get Plex settings
              api.settings.get()
                .then(response => {
                  if (response.data && response.data.plex) {
                    const { serverUrl, authToken } = response.data.plex;
                    
                    if (serverUrl && authToken) {
                      // Sync libraries first
                      return api.plex.syncLibraries(serverUrl, authToken)
                        .then(() => {
                          // Then refresh the media list
                          return api.media.getAll({
                            type: activeTab === 'all' ? '' : activeTab,
                            sort: sortBy,
                            search: searchTerm
                          });
                        })
                        .then(mediaResponse => {
                          if (mediaResponse.data && mediaResponse.data.media) {
                            setMediaItems(mediaResponse.data.media.map(item => ({
                              id: item._id || item.id,
                              title: item.metadata?.title || item.filename,
                              year: item.metadata?.year || new Date(item.created).getFullYear(),
                              type: item.type === 'movie' ? 'movie' : 
                                    item.type === 'show' ? 'series' : item.type,
                              poster: item.metadata?.poster || `https://picsum.photos/180/270?random=${item.id}`,
                              watched: item.watched,
                              protected: item.protected,
                              added: new Date(item.created),
                              size: item.size,
                              metadata: item.metadata || {
                                // Default metadata if not provided
                                title: item.filename,
                                year: new Date(item.created).getFullYear(),
                                genre: [],
                                rating: null,
                                runtime: 0,
                                director: null,
                                cast: []
                              }
                            })));
                          }
                          
                          alert('Media sync completed');
                          setSyncingMedia(false);
                        });
                    } else {
                      alert('Plex server URL and authentication token are required');
                      setSyncingMedia(false);
                    }
                  } else {
                    alert('Plex settings not found');
                    setSyncingMedia(false);
                  }
                })
                .catch(err => {
                  console.error('Error syncing media:', err);
                  alert(`Error: ${err.message}`);
                  setSyncingMedia(false);
                });
            }}
            disabled={syncingMedia}
          >
            {syncingMedia ? 'Syncing...' : 'Sync Media'}
          </Button>
          
          <Button 
            variant="contained" 
            startIcon={<SyncIcon />}
            onClick={() => {
              // Trigger a media scan
              api.scan.start()
                .then(() => alert('Media scan initiated'))
                .catch(err => alert(`Error: ${err.message}`));
            }}
          >
            Scan Media
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab icon={<FilterListIcon />} iconPosition="start" label="All" value="all" />
          <Tab icon={<MovieIcon />} iconPosition="start" label="Movies" value="movie" />
          <Tab icon={<TvIcon />} iconPosition="start" label="TV Series" value="series" />
        </Tabs>
      </Box>

      {/* Search and filter controls */}
      <Box 
        sx={{ 
          display: 'flex', 
          gap: 2, 
          mb: 4, 
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
        }}
      >
        <TextField
          placeholder="Search media..."
          value={searchTerm}
          onChange={handleSearchChange}
          sx={{ flexGrow: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
        
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Sort By</InputLabel>
          <Select
            value={sortBy}
            label="Sort By"
            onChange={handleSortByChange}
          >
            <MenuItem value="newest">Newest First</MenuItem>
            <MenuItem value="oldest">Oldest First</MenuItem>
            <MenuItem value="largest">Largest First</MenuItem>
            <MenuItem value="smallest">Smallest First</MenuItem>
            <MenuItem value="name">Name</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Results info */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Showing {filteredMedia.length} {activeTab === 'all' ? 'media items' : 
          activeTab === 'movie' ? 'movies' : 'TV series'}
      </Typography>

      {/* Media table */}
      {filteredMedia.length > 0 ? (
        <TableContainer component={Paper} sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Year</TableCell>
                <TableCell>Size</TableCell>
                  <TableCell>Path</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredMedia.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {item.type === 'movie' ? 
                        <MovieIcon fontSize="small" sx={{ mr: 1, color: 'rgba(46, 204, 113, 0.8)' }} /> : 
                        <TvIcon fontSize="small" sx={{ mr: 1, color: 'rgba(52, 152, 219, 0.8)' }} />
                      }
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {item.title}
                      </Typography>
                    </Box>
                    {item.metadata?.genre && item.metadata.genre.length > 0 && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {item.metadata.genre.slice(0, 3).join(', ')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={item.type === 'movie' ? 'Movie' : 
                             item.type === 'series' || item.type === 'show' ? 'Series' : 
                             item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                      size="small"
                      sx={{ 
                        backgroundColor: 
                          item.type === 'movie' ? 'rgba(46, 204, 113, 0.1)' :
                          item.type === 'series' || item.type === 'show' ? 'rgba(52, 152, 219, 0.1)' :
                          'rgba(241, 196, 15, 0.1)'
                      }}
                    />
                  </TableCell>
                  <TableCell>{item.year}</TableCell>
                  <TableCell>{formatBytes(item.size)}</TableCell>
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
                      {item.path || 'Unknown path'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {item.watched && (
                        <Chip 
                          icon={<CheckCircleIcon fontSize="small" />}
                          label="Watched"
                          size="small"
                          color="success"
                        />
                      )}
                      {item.protected && (
                        <Chip 
                          label="Protected"
                          size="small"
                          color="warning"
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <IconButton 
                      size="small" 
                      color="primary"
                      onClick={() => {
                        // View details
                        console.log('View details for', item.id);
                      }}
                    >
                      <InfoIcon fontSize="small" />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      color="error"
                      onClick={() => {
                        // Delete file
                        console.log('Delete file', item.id);
                      }}
                      disabled={item.protected}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <Typography variant="h6" color="text.secondary">No media matches your search criteria</Typography>
        </Box>
      )}
    </Box>
  );
};

export default MediaList;

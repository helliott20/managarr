// src/components/Schedule/Schedule.jsx
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
  Box, Typography, IconButton, 
  Grid, Paper, Button
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import AddIcon from '@mui/icons-material/Add';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

// Task types with their colors
const TASK_TYPES = {
  CLEANUP: { color: '#3498db' },
  SCAN: { color: '#f39c12' }
};

const Schedule = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // State for events
  const [events, setEvents] = useState({});
  const [loading, setLoading] = useState(true);
  
  // Fetch scheduled tasks from API
  useEffect(() => {
    const fetchSchedule = async () => {
      try {
        setLoading(true);
        
        // Get the year and month for the current view
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth() + 1; // JavaScript months are 0-indexed
        
        // Fetch scheduled tasks from API
        const response = await api.schedule.getMonthEvents(year, month);
        
        if (response.data && response.data.events) {
          setEvents(response.data.events);
        } else {
          // Fallback to mock data
          setEvents({
            // Format: 'YYYY-MM-DD': [{ type: 'CLEANUP' }, { type: 'SCAN' }]
            '2025-04-01': [{ type: 'SCAN' }],
            '2025-04-03': [{ type: 'CLEANUP', title: 'New Season' }],
            '2025-04-05': [{ type: 'CLEANUP' }],
            '2025-04-08': [{ type: 'CLEANUP' }, { type: 'SCAN' }],
            '2025-04-10': [{ type: 'CLEANUP', title: 'New Season' }],
            '2025-04-14': [{ type: 'CLEANUP' }, { type: 'SCAN' }],
            '2025-04-17': [{ type: 'CLEANUP', title: 'New Season' }],
            '2025-04-21': [{ type: 'SCAN' }, { type: 'SCAN' }],
            '2025-04-25': [{ type: 'SCAN' }]
          });
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching schedule:', error);
        
        // Fallback to mock data on error
        setEvents({
          '2025-04-01': [{ type: 'SCAN' }],
          '2025-04-03': [{ type: 'CLEANUP', title: 'New Season' }],
          '2025-04-05': [{ type: 'CLEANUP' }],
          '2025-04-08': [{ type: 'CLEANUP' }, { type: 'SCAN' }],
          '2025-04-10': [{ type: 'CLEANUP', title: 'New Season' }],
          '2025-04-14': [{ type: 'CLEANUP' }, { type: 'SCAN' }],
          '2025-04-17': [{ type: 'CLEANUP', title: 'New Season' }],
          '2025-04-21': [{ type: 'SCAN' }, { type: 'SCAN' }],
          '2025-04-25': [{ type: 'SCAN' }]
        });
        
        setLoading(false);
      }
    };
    
    fetchSchedule();
  }, [currentMonth]);

  // Navigation functions
  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  // Get all days in current month view (including some days from prev/next month)
  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    // Get the day of the week for the first day (0 = Sunday, 1 = Monday, etc.)
    // Adjust to start week on Monday: Sunday (0) becomes position 6
    const firstDayPosition = firstDayOfMonth.getDay() === 0 ? 6 : firstDayOfMonth.getDay() - 1;
    
    const daysInMonth = [];
    
    // Add days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayPosition - 1; i >= 0; i--) {
      const prevMonthDay = prevMonthLastDay - i;
      const date = new Date(year, month - 1, prevMonthDay);
      daysInMonth.push({
        date,
        dayOfMonth: prevMonthDay,
        isCurrentMonth: false,
        dateString: formatDateString(date)
      });
    }
    
    // Add days from current month
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const date = new Date(year, month, i);
      daysInMonth.push({
        date,
        dayOfMonth: i,
        isCurrentMonth: true,
        dateString: formatDateString(date)
      });
    }
    
    // Make sure we have 6 rows of 7 days = 42 days total
    const daysNeeded = 42 - daysInMonth.length;
    for (let i = 1; i <= daysNeeded; i++) {
      const date = new Date(year, month + 1, i);
      daysInMonth.push({
        date,
        dayOfMonth: i,
        isCurrentMonth: false,
        dateString: formatDateString(date)
      });
    }
    
    return daysInMonth;
  };

  // Format date as YYYY-MM-DD
  const formatDateString = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // Format month and year for display
  const formatMonthYear = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Check if a day is today
  const checkIsToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  // Get events for a specific day
  const getEventsForDay = (dateString) => {
    return events[dateString] || [];
  };

  // Handle adding a task
  const handleAddTask = () => {
    // In a real implementation, this would open a dialog to create a new task
    // For now, we'll just show an alert
    alert('This would open the task creation dialog');
    
    // In a real implementation, we would call the API to create a new task
    // api.schedule.createTask(newTask)
    //   .then(response => {
    //     // Update the events state with the new task
    //     const updatedEvents = { ...events };
    //     const dateString = formatDateString(newTask.date);
    //     if (!updatedEvents[dateString]) {
    //       updatedEvents[dateString] = [];
    //     }
    //     updatedEvents[dateString].push({
    //       type: newTask.type,
    //       title: newTask.title
    //     });
    //     setEvents(updatedEvents);
    //   })
    //   .catch(error => {
    //     console.error('Error creating task:', error);
    //     alert('Failed to create task. Please try again.');
    //   });
  };

  // Render the calendar grid
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = getDaysInMonth();

  return (
    <Box sx={{ 
      backgroundColor: '#0f1214', 
      height: '100%',
      color: '#e5e7eb',
      overflow: 'auto',
      p: 3
    }}>
      {/* Header with title and add task button */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 3,
        px: 2
      }}>
        <Typography variant="h1" sx={{ fontSize: '2rem', fontWeight: 'bold' }}>
          Schedule
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddTask}
          sx={{ 
            borderRadius: 50,
            backgroundColor: '#7c5cff',
            '&:hover': {
              backgroundColor: '#6a4ee6',
            }
          }}
        >
          Add Task
        </Button>
      </Box>

      {/* Calendar header with navigation */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        mb: 4,
        px: 2 
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <CalendarMonthIcon sx={{ color: '#65b36d', mr: 1 }} />
          <Typography variant="h6" color="text.secondary">
            Universal Calendar
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={prevMonth} sx={{ color: '#e5e7eb' }}>
            <ArrowBackIosNewIcon fontSize="small" />
          </IconButton>
          <Typography variant="h6" sx={{ mx: 2, color: '#e5e7eb' }}>
            {formatMonthYear(currentMonth)}
          </Typography>
          <IconButton onClick={nextMonth} sx={{ color: '#e5e7eb' }}>
            <ArrowForwardIosIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Task type indicators */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box 
            sx={{ 
              width: 12, 
              height: 12, 
              borderRadius: '50%', 
              bgcolor: TASK_TYPES.CLEANUP.color
            }}
          />
          <Typography variant="caption" sx={{ mr: 2 }}>Cleanup</Typography>
          <Box 
            sx={{ 
              width: 12, 
              height: 12, 
              borderRadius: '50%', 
              bgcolor: TASK_TYPES.SCAN.color
            }}
          />
          <Typography variant="caption">Scan</Typography>
        </Box>
      </Box>
      
      {/* Days of week headers */}
      <Grid container spacing={1} sx={{ px: 2, mb: 1 }}>
        {daysOfWeek.map((day) => (
          <Grid item key={day} xs>
            <Typography 
              variant="subtitle2" 
              align="center"
              color="#6b7280"
              sx={{ mb: 1 }}
            >
              {day}
            </Typography>
          </Grid>
        ))}
      </Grid>
      
      {/* Calendar grid */}
      <Grid container spacing={1} sx={{ px: 2 }}>
        {days.map((day, index) => {
          const dayEvents = getEventsForDay(day.dateString);
          const isTodayDate = checkIsToday(day.date);
          const isSelected = false; // This would be controlled by state
          
          return (
            <Grid item xs key={index} sx={{ width: `${100/7}%`, flexGrow: 1 }}>
              <Box
                sx={{
                  position: 'relative',
                  paddingTop: '100%', // Creates a square aspect ratio
                  width: '100%',
                }}
              >
                <Paper
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    p: 1.5,
                    backgroundColor: isSelected 
                      ? '#1f3a29' 
                      : day.isCurrentMonth 
                        ? '#1a1e24' 
                        : '#131720',
                    color: day.isCurrentMonth ? '#e5e7eb' : '#4b5563',
                    borderRadius: '6px',
                    boxShadow: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    '&:hover': {
                      backgroundColor: day.isCurrentMonth ? '#242a35' : '#1a1f28',
                    }
                  }}
                >
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      fontSize: '1.1rem', 
                      fontWeight: day.isCurrentMonth ? 'normal' : 'light'
                    }}
                  >
                    {day.dayOfMonth}
                  </Typography>
                  
                  {/* Event indicators */}
                  {dayEvents.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {dayEvents.map((event, idx) => (
                        <Box
                          key={idx}
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            backgroundColor: TASK_TYPES[event.type].color,
                          }}
                        />
                      ))}
                    </Box>
                  )}
                  
                  {/* "New Season" label */}
                  {dayEvents.some(e => e.title === 'New Season') && (
                    <Typography
                      variant="caption"
                      sx={{
                        position: 'absolute',
                        bottom: 8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        color: '#3498db',
                        fontSize: '0.7rem',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      New Season
                    </Typography>
                  )}
                </Paper>
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default Schedule;

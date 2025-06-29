// src/utils/helpers.js
import { useState, useEffect } from 'react';

// Format bytes to human-readable size
export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0 || bytes === undefined || bytes === null) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Format date to relative time
export const formatRelativeTime = (date) => {
  if (!date) return 'Unknown';
  
  const now = new Date();
  const diff = now - new Date(date);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days < 1) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

// Format duration in minutes to human readable
export const formatDuration = (minutes) => {
  if (!minutes) return 'Unknown';
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
};

// Get status color based on media status
export const getStatusColor = (status, hasFile = false) => {
  switch (status?.toLowerCase()) {
    case 'continuing':
    case 'available':
      return 'success';
    case 'ended':
    case 'released':
      return hasFile ? 'success' : 'warning';
    case 'upcoming':
    case 'announced':
      return 'info';
    case 'cancelled':
      return 'error';
    default:
      return hasFile ? 'success' : 'default';
  }
};

// Debounce hook for performance optimization
export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Calculate completion percentage
export const calculateCompletionPercentage = (current, total) => {
  if (!total || total === 0) return 0;
  return Math.round((current / total) * 100);
};

// Sort functions for different data types
export const sortFunctions = {
  string: (a, b, field) => a[field]?.localeCompare(b[field]) || 0,
  number: (a, b, field) => (a[field] || 0) - (b[field] || 0),
  date: (a, b, field) => new Date(a[field]) - new Date(b[field]),
  size: (a, b, field) => (a[field] || 0) - (b[field] || 0)
};

// Filter functions
export const filterFunctions = {
  text: (item, field, searchTerm) => 
    item[field]?.toLowerCase().includes(searchTerm.toLowerCase()),
  
  status: (item, field, filterValue) => 
    !filterValue || item[field] === filterValue,
  
  boolean: (item, field, filterValue) => 
    filterValue === null || item[field] === filterValue,
  
  range: (item, field, min, max) => {
    const value = item[field] || 0;
    return value >= (min || 0) && value <= (max || Infinity);
  }
};

// Performance monitoring utilities
export const performanceLogger = {
  start: (label) => {
    if (process.env.NODE_ENV === 'development') {
      console.time(label);
    }
  },
  
  end: (label) => {
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(label);
    }
  },
  
  mark: (label) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`⏱️ ${label}: ${Date.now()}`);
    }
  }
};
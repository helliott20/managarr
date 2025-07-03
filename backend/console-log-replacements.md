# Console Log Replacements Summary

All console.log, console.error, and console.warn statements in `/home/harry/projects/managarr/backend/server.js` have been replaced with proper Pino logging.

## Replacements Made:

### Route Handler Logs (using req.log):
1. **Line 433**: `console.error` → `req.log.error` - Error in /api/media GET
2. **Line 596**: `console.error` → `req.log.error` - Error in /api/media/stats
3. **Line 751**: `console.error` → `req.log.error` - Error in /api/rules GET
4. **Line 772**: `console.error` → `req.log.error` - Error in /api/rules POST
5. **Line 793**: `console.error` → `req.log.error` - Error in /api/rules/:id GET
6. **Line 820**: `console.error` → `req.log.error` - Error in /api/rules/:id PUT
7. **Line 844**: `console.error` → `req.log.error` - Error in /api/rules/:id DELETE
8. **Line 853**: `console.log` → `req.log.warn` - SAFETY REDIRECT warning
9. **Line 862**: `console.error` → `req.log.error` - Error in /api/rules/:id/run
10. **Line 983**: `console.log` → `req.log.warn` - SAFETY BLOCK warning
11. **Line 992**: `console.error` → `req.log.error` - Error in /api/cleanup POST
12. **Line 1011**: `console.error` → `req.log.error` - Error in /api/cleanup/history GET
13. **Line 1028**: `console.error` → `req.log.error` - Error in /api/settings GET
14. **Line 1048, 1076**: `console.log` → `req.log.info` - Sync scheduler restarted (2 occurrences)
15. **Line 1050, 1078**: `console.error` → `req.log.error` - Error restarting sync scheduler (2 occurrences)
16. **Line 1084**: `console.error` → `req.log.error` - Error in /api/settings PUT
17. **Line 1097**: `console.log` → `req.log.info` - Clearing deletion data
18. **Line 1101**: `console.log` → `req.log.info` - Found deletion history records
19. **Line 1105**: `console.log` → `req.log.info` - Cleared all deletion history records
20. **Line 1110**: `console.log` → `req.log.info` - Found pending deletion records
21. **Line 1114**: `console.log` → `req.log.info` - Cleared all pending deletion records
22. **Line 1124**: `console.error` → `req.log.error` - Error clearing deletion data
23. **Line 1515**: `console.log` → `req.log.info` - Testing Plex connection
24. **Line 1557**: `console.log` → `req.log.info` - Plex settings saved to database
25. **Line 1559**: `console.error` → `req.log.error` - Error saving Plex settings to database
26. **Line 1570**: `console.error` → `req.log.error` - Error testing Plex connection
27. **Line 1614**: `console.error` → `req.log.error` - Error getting sync status
28. **Line 1636**: `console.error` → `req.log.error` - Error getting Plex libraries
29. **Line 1678**: `console.error` → `req.log.error` - Error updating Plex library
30. **Line 1697**: `console.log` → `req.log.info` - Syncing Plex libraries
31. **Line 1725**: `console.error` → `req.log.error` - Error starting Plex sync
32. **Line 1961**: `console.log` → `req.log.info` - Getting schedule events
33. **Line 1978**: `console.error` → `req.log.error` - Error getting Plex settings from database
34. **Line 2020**: `console.error` → `req.log.error` - Error generating events from Plex data
35. **Line 2055**: `console.error` → `req.log.error` - Error getting schedule events

### Non-Route Function Logs (using module logger 'log'):
1. **Line 690**: `console.log` → `log.info` - Mock scanning directory
2. **Line 735**: `console.log` → `log.info` - Scan completed for directory
3. **Line 737**: `console.error` → `log.error` - Error scanning directory
4. **Line 873**: `console.log` → `log.warn` - SAFETY MODE warning
5. **Line 874**: `console.log` → `log.warn` - Use safe pending deletions workflow
6. **Line 958**: `console.error` → `log.error` - Error deleting file
7. **Line 972**: `console.log` → `log.info` - Rule executed
8. **Line 974**: `console.error` → `log.error` - Error executing rule
9. **Line 1144**: `console.log` → `log.info` - API request attempt
10. **Line 1154**: `console.error` → `log.error` - Request failed with status
11. **Line 1155**: `console.error` → `log.error` - Response data
12. **Line 1158**: `console.error` → `log.error` - Request failed (no response)
13. **Line 1160**: `console.error` → `log.error` - Request timed out
14. **Line 1164**: `console.error` → `log.error` - Request failed (request setup)
15. **Line 1170**: `console.log` → `log.info` - Retrying request
16. **Line 1204**: `console.error` → `log.error` - Plex connection test failed
17. **Line 1252**: `console.error` → `log.error` - Error getting Plex libraries
18. **Line 1263**: `console.log` → `log.info` - Fetching content for library
19. **Line 1280**: `console.log` → `log.info` - Found items in library
20. **Line 1334**: `console.error` → `log.error` - Error processing item
21. **Line 1343**: `console.error` → `log.error` - Error getting content for library
22. **Line 1408**: `console.error` → `log.error` - Error getting details for item
23. **Line 1416**: `console.log` → `log.info` - Library size calculated
24. **Line 1473**: `console.error` → `log.error` - Error processing item
25. **Line 1480**: `console.log` → `log.info` - Saved media items to database
26. **Line 1482**: `console.error` → `log.error` - Error saving media items to database
27. **Line 1492**: `console.error` → `log.error` - Error calculating size for library
28. **Line 1806**: `console.error` → `log.error` - Error saving library
29. **Line 1812**: `console.error` → `log.error` - Transaction error saving libraries
30. **Line 1876**: `console.error` → `log.error` - Error calculating size for library
31. **Line 1924**: `console.log` → `log.info` - Plex settings updated with last sync time
32. **Line 1926**: `console.error` → `log.error` - Error updating Plex settings in database
33. **Line 1941**: `console.log` → `log.info` - Libraries synced
34. **Line 1943**: `console.error` → `log.error` - Error syncing Plex libraries
35. **Line 2067**: `console.log` → `log.info` - Server running on port

## Key Improvements:
- All logs now use structured logging with Pino
- Route handlers use `req.log` for request-scoped logging
- Non-route functions use the module-specific logger created with `createLogger('server')`
- Log messages include relevant context as objects (first parameter)
- Consistent log levels: `info` for normal operations, `error` for errors, `warn` for warnings
- Removed emojis from log messages for cleaner output
- Template literals replaced with structured data for better log parsing
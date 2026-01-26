# Crash Recovery & Auto-Restart Implementation

## Summary

The Moveify application now has comprehensive crash recovery and auto-restart mechanisms implemented for both backend and frontend.

## Backend Protection

### PM2 Process Manager
- **Auto-restart on crash**: Backend automatically restarts if it crashes
- **Memory monitoring**: Restarts if memory usage exceeds 500MB
- **Exponential backoff**: Prevents rapid restart loops
- **Log management**: All logs stored in `backend/logs/` directory
- **Max restarts**: Will restart up to 10 times if crashes occur within 10 seconds

### Error Handlers in server.js
1. **Error handling middleware**: Catches route errors before they crash the server
2. **Uncaught exception handler**: Gracefully shuts down and lets PM2 restart
3. **Unhandled promise rejection handler**: Catches async errors
4. **SIGTERM handler**: Graceful shutdown on process termination

### Usage

**Start backend with PM2:**
```bash
cd backend
npm run pm2:start
```

**View status:**
```bash
npm run pm2:status
```

**View logs:**
```bash
npm run pm2:logs
```

**Restart manually:**
```bash
npm run pm2:restart
```

**Stop:**
```bash
npm run pm2:stop
```

## Frontend Protection

### React Error Boundary
- **Component error catching**: Catches rendering errors in any React component
- **User-friendly error page**: Shows helpful error page instead of blank screen
- **Recovery options**: Users can reload page or go home
- **Development mode**: Shows error details and stack trace in dev mode
- **Production mode**: Shows clean error message without technical details

### API Retry Logic
- **Automatic retries**: Failed API calls retry up to 3 times
- **Exponential backoff**: Delays increase between retries (1s → 2s → 4s)
- **Timeout protection**: 30-second timeout on all API calls
- **Smart retry**: Only retries on network/server errors, not client errors (4xx)
- **Server health check**: Can detect if backend is down

### Utility Functions

New file: `frontend/src/utils/api.ts`

- `fetchWithRetry()`: Enhanced fetch with automatic retry
- `apiCall()`: Wrapper for JSON API calls with retry
- `checkServerHealth()`: Check if backend is available
- `waitForServer()`: Wait for backend to become ready after restart

## Quick Start Scripts

### Windows Batch Files

**Start everything:**
```bash
start-moveify.bat
```

**Stop everything:**
```bash
stop-moveify.bat
```

## Testing the Auto-Restart

### Test Backend Crash Recovery:

1. Start backend with PM2:
   ```bash
   cd backend
   npm run pm2:start
   ```

2. Find the process ID:
   ```bash
   npm run pm2:status
   ```

3. Kill the process:
   ```bash
   taskkill /F /PID <process_id>
   ```

4. Watch PM2 automatically restart it:
   ```bash
   npm run pm2:status
   ```

You should see the restart counter (↺) increment and status return to "online".

### Test Frontend Error Boundary:

1. Add a throw statement to any component:
   ```typescript
   throw new Error('Test crash');
   ```

2. Navigate to that component

3. You should see the error boundary page with "Oops! Something went wrong"

4. Click "Reload Page" to recover

## Files Modified/Created

### Backend:
- ✅ `backend/ecosystem.config.js` - PM2 configuration
- ✅ `backend/server.js` - Added error handlers
- ✅ `backend/package.json` - Added PM2 scripts
- ✅ `backend/logs/` - Log directory

### Frontend:
- ✅ `frontend/src/components/ErrorBoundary.tsx` - Error boundary component
- ✅ `frontend/src/main.tsx` - Wrapped app with ErrorBoundary
- ✅ `frontend/src/utils/api.ts` - API utility with retry logic

### Scripts:
- ✅ `start-moveify.bat` - Windows startup script
- ✅ `stop-moveify.bat` - Windows shutdown script

### Documentation:
- ✅ `README-DEPLOYMENT.md` - Full deployment guide
- ✅ `CRASH-RECOVERY-SUMMARY.md` - This file

## Current Status

✅ Backend running on port 3000 with PM2
- Process ID: 32912
- Status: online
- Memory: ~55MB
- Uptime: Running
- Auto-restart: Enabled

✅ Error handlers installed
✅ Logging configured
✅ Frontend error boundary ready
✅ API retry logic implemented
✅ Quick start scripts created

## Next Steps

To start the application:

1. **Backend** (if not already running):
   ```bash
   cd backend
   npm run pm2:start
   ```

2. **Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

Or use the quick start script:
```bash
start-moveify.bat
```

## Monitoring

**View real-time logs:**
```bash
cd backend
npm run pm2:logs
```

**View PM2 dashboard:**
```bash
cd backend
npm run pm2:monit
```

**Check health:**
- http://localhost:3000/health
- Should return: `{"status":"OK","timestamp":"..."}`

## Troubleshooting

If backend won't start:
1. Check if port 3000 is in use
2. Delete PM2 process: `npm run pm2:delete`
3. Restart: `npm run pm2:start`
4. Check logs: `npm run pm2:logs`

If frontend crashes:
1. Error boundary will catch it
2. User can reload or go home
3. Check browser console for errors
4. Backend will keep running independently

# Moveify Deployment Guide

## Auto-Restart and Crash Recovery

The Moveify application now has robust auto-restart mechanisms to handle server crashes and ensure high availability.

### Backend (PM2 Process Manager)

The backend uses **PM2** - a production-grade process manager with automatic restart capabilities.

#### Starting the Backend with PM2

```bash
cd backend
npm run pm2:start
```

This will:
- Start the backend server
- Enable automatic restart on crashes
- Monitor memory usage (restarts if >500MB)
- Log all output to `backend/logs/`
- Restart up to 10 times if crashes occur within 10 seconds

#### PM2 Commands

```bash
npm run pm2:status    # View status of all PM2 processes
npm run pm2:logs      # View real-time logs
npm run pm2:restart   # Manually restart the backend
npm run pm2:stop      # Stop the backend
npm run pm2:delete    # Remove from PM2 (use before pm2:start again)
npm run pm2:monit     # Real-time monitoring dashboard
```

#### Viewing Logs

Logs are stored in `backend/logs/`:
- `out.log` - Standard output (console.log)
- `err.log` - Error output (console.error)
- `combined.log` - Both combined

View logs in real-time:
```bash
npm run pm2:logs
```

Or manually:
```bash
tail -f backend/logs/out.log
```

### Frontend (React Error Boundary)

The frontend has a **React Error Boundary** that catches component errors and prevents the entire app from crashing.

Features:
- Catches rendering errors in any component
- Shows user-friendly error page
- Provides "Reload Page" and "Go Home" options
- Logs errors to console for debugging
- Shows error details in development mode

### Crash Recovery Features

#### Backend Features:

1. **Uncaught Exception Handler** - Gracefully shuts down and restarts via PM2
2. **Unhandled Promise Rejection Handler** - Catches async errors
3. **Error Handling Middleware** - Catches route errors before they crash the server
4. **SIGTERM Handler** - Graceful shutdown on process termination
5. **PM2 Auto-Restart** - Automatically restarts on crash with exponential backoff

#### Frontend Features:

1. **Error Boundary** - Catches React component errors
2. **API Retry Logic** - Automatically retries failed API calls up to 3 times
3. **Exponential Backoff** - Increases delay between retries (1s, 2s, 4s)
4. **Timeout Protection** - 30-second timeout on all API calls
5. **Server Health Check** - Can detect if backend is down

### Quick Start Scripts

#### Windows:

**Start Everything:**
```bash
start-moveify.bat
```

This will:
1. Start backend with PM2 (auto-restart enabled)
2. Wait for backend to be ready
3. Start frontend in separate terminal
4. Open browser automatically
5. Show PM2 status

**Stop Everything:**
```bash
stop-moveify.bat
```

#### Manual Start (Development):

**Backend:**
```bash
cd backend
npm run pm2:start    # Production mode with auto-restart
# OR
npm run dev          # Development mode with nodemon
```

**Frontend:**
```bash
cd frontend
npm run dev
```

### Monitoring and Debugging

#### Check if Backend is Running:

```bash
cd backend
npm run pm2:status
```

#### View Real-Time Logs:

```bash
cd backend
npm run pm2:logs
```

#### Check Server Health:

Open browser: http://localhost:3000/health

Should return:
```json
{
  "status": "OK",
  "timestamp": "2026-01-12T..."
}
```

#### PM2 Monitoring Dashboard:

```bash
cd backend
npm run pm2:monit
```

Shows real-time CPU, memory, and request stats.

### Troubleshooting

#### Backend Won't Start:

1. Check if port 3000 is already in use:
   ```bash
   netstat -ano | findstr ":3000"
   ```

2. Kill existing process and restart:
   ```bash
   npm run pm2:delete
   npm run pm2:start
   ```

3. Check logs for errors:
   ```bash
   npm run pm2:logs
   ```

#### Frontend Won't Connect:

1. Verify backend is running:
   ```bash
   curl http://localhost:3000/health
   ```

2. Check browser console for CORS errors

3. Try clearing cache and hard reload (Ctrl+Shift+R)

#### Crash Loop (PM2 keeps restarting):

1. View error logs:
   ```bash
   tail -50 backend/logs/err.log
   ```

2. Stop PM2 and run directly to see error:
   ```bash
   npm run pm2:stop
   node server.js
   ```

3. Fix the error, then restart PM2:
   ```bash
   npm run pm2:start
   ```

### Production Deployment

For production deployment, consider:

1. **Environment Variables:**
   - Set `NODE_ENV=production`
   - Configure proper database path
   - Use secure secrets

2. **PM2 Cluster Mode:**
   - Modify `ecosystem.config.js`:
     ```javascript
     instances: 'max',  // Use all CPU cores
     exec_mode: 'cluster'
     ```

3. **PM2 Startup Script:**
   - Generate startup script for auto-start on server reboot:
     ```bash
     pm2 startup
     pm2 save
     ```

4. **Nginx Reverse Proxy:**
   - Set up nginx to proxy to backend
   - Serve frontend as static files
   - Enable SSL/TLS

5. **Monitoring:**
   - Consider PM2 Plus for advanced monitoring
   - Set up log aggregation (e.g., ELK stack)
   - Configure alerts for crashes

### Configuration Files

- `backend/ecosystem.config.js` - PM2 configuration
- `backend/package.json` - PM2 scripts
- `frontend/src/components/ErrorBoundary.tsx` - React error boundary
- `frontend/src/utils/api.ts` - API retry logic
- `backend/server.js` - Error handlers

### Support

If you encounter issues:
1. Check logs: `npm run pm2:logs`
2. Check PM2 status: `npm run pm2:status`
3. Restart: `npm run pm2:restart`
4. Full reset: `npm run pm2:delete` then `npm run pm2:start`

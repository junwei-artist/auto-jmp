# Redis & Celery Health Check Features

This document describes the new Redis and Celery health check functionality added to the Auto-JMP Settings Panel.

## Overview

The Redis & Celery health check system provides comprehensive monitoring and diagnostics for your application's background task processing infrastructure. It helps you quickly identify and resolve issues with Redis and Celery workers.

## Features

### 1. Redis Health Monitoring

- **Connection Testing**: Basic ping test to verify Redis connectivity
- **Server Information**: Version, memory usage, uptime, and client connections
- **Key Statistics**: Number of keys in database 0
- **Error Detection**: Identifies connection issues and configuration problems

### 2. Celery Health Monitoring

- **Worker Detection**: Identifies active Celery workers
- **Task Statistics**: Counts of active, queued, completed, and failed tasks
- **Queue Information**: Monitors Celery queue status and contents
- **Broker Connectivity**: Tests Redis broker connection

### 3. Overall Health Assessment

- **Healthy**: Redis running + Celery workers active
- **Degraded**: Redis running but no Celery workers
- **Unhealthy**: Redis not running

### 4. Automatic Recommendations

- Start Redis service if not running
- Start Celery worker if no workers detected
- Address failed tasks and connection issues

## Usage

### Via Settings Panel

1. **Start the Settings Panel**:
   ```bash
   cd /Users/lytech/Documents/GitHub/auto-jmp/setting
   python -m setting
   ```

2. **Navigate to Redis & Celery Tab**:
   - Click on the "Redis & Celery" tab in the settings panel
   - View real-time status indicators for both services

3. **Run Health Checks**:
   - Click "Test Connection" for individual service tests
   - Click "Get Status" for detailed service information
   - Click "Run Health Check" for comprehensive analysis

4. **Configure Services**:
   - Update Redis URL, Celery broker URL, and result backend
   - Save configuration changes
   - Test new configuration

### Via API Endpoints

The health check functionality is also available via REST API endpoints:

- `GET /api/test/redis` - Test Redis connection
- `GET /api/redis/status` - Get Redis status
- `GET /api/test/celery` - Test Celery connection
- `GET /api/celery/status` - Get Celery status
- `GET /api/redis-celery/health` - Get comprehensive health status

### Via Test Script

Run the test script to verify functionality:

```bash
cd /Users/lytech/Documents/GitHub/auto-jmp/setting
python test_redis_celery.py
```

## Configuration

### Redis Configuration

- **REDIS_URL**: Redis server connection string (default: `redis://localhost:6379`)
- **CELERY_BROKER_URL**: Celery message broker URL (default: `redis://localhost:6379/0`)
- **CELERY_RESULT_BACKEND**: Celery result backend URL (default: `redis://localhost:6379/0`)

### Configuration Files

- **Backend**: `/Users/lytech/Documents/GitHub/auto-jmp/backend/.env`
- **Settings Panel**: Uses backend configuration for Redis and Celery URLs

## Health Check Methods

### Redis Detection

1. **Connection Test**: Uses `redis-py` library to connect and ping Redis server
2. **Info Retrieval**: Gets server information using `r.info()` command
3. **Key Analysis**: Counts keys in database 0 using `r.keys()` command
4. **Error Handling**: Catches and reports connection errors

### Celery Detection

1. **Task Metadata**: Searches for `celery-task-meta-*` keys in Redis
2. **Queue Analysis**: Examines Celery queue keys and contents
3. **Status Classification**: Categorizes tasks by status (SUCCESS, FAILURE, PENDING, etc.)
4. **Worker Detection**: Identifies active workers based on task activity

## Troubleshooting

### Common Issues

1. **Redis Not Running**:
   - Start Redis: `brew services start redis` (macOS)
   - Check Redis status: `redis-cli ping`

2. **No Celery Workers**:
   - Start Celery worker: `./run-worker.command`
   - Check worker processes: `ps aux | grep celery`

3. **Connection Errors**:
   - Verify Redis URL configuration
   - Check network connectivity
   - Ensure Redis server is accessible

4. **Failed Tasks**:
   - Review Celery logs for error details
   - Check task dependencies and resources
   - Restart Celery workers if needed

### Health Check Results

The health check provides detailed information about:

- **Redis Status**: Running state, version, memory usage, connections
- **Celery Status**: Worker activity, task counts, queue status
- **Overall Health**: Combined assessment with recommendations
- **Error Details**: Specific error messages and troubleshooting hints

## Integration

The Redis and Celery health check system integrates with:

- **Settings Panel**: Web-based configuration and monitoring interface
- **Backend API**: RESTful endpoints for programmatic access
- **Configuration Management**: Automatic loading from backend .env files
- **Error Reporting**: Comprehensive error handling and user feedback

## Benefits

1. **Proactive Monitoring**: Early detection of Redis and Celery issues
2. **Quick Diagnostics**: Rapid identification of service problems
3. **Configuration Management**: Easy setup and modification of service URLs
4. **User-Friendly Interface**: Intuitive web-based monitoring dashboard
5. **Comprehensive Reporting**: Detailed health status and recommendations

## Future Enhancements

Potential improvements for future versions:

- **Real-time Monitoring**: WebSocket-based live status updates
- **Historical Data**: Task execution history and performance metrics
- **Alerting System**: Email/notification alerts for service issues
- **Performance Metrics**: Response times and throughput statistics
- **Auto-recovery**: Automatic service restart capabilities

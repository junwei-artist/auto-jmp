# Single-Port Proxy Setup Guide

This guide explains how to configure your Next.js frontend and FastAPI backend to work with a single-port proxy setup, where all API calls go through the frontend server.

## Overview

**Before**: Browser connects to two different ports
- Frontend: `http://10.5.216.11:4800`
- Backend: `http://10.5.216.11:4700`

**After**: Browser only connects to one port
- Frontend + Backend Proxy: `http://10.5.216.11:4800`
- All API calls: `http://10.5.216.11:4800/api/*`

## Architecture

```
Browser → Next.js Frontend (Port 4800) → FastAPI Backend (Port 4700)
```

The Next.js frontend acts as a proxy, forwarding all `/api/*` requests to the FastAPI backend while serving the frontend application.

## Backend Configuration

### 1. CORS Settings

Update your FastAPI backend to allow requests from the frontend server:

```python
# backend/app/core/config.py
class Settings(BaseSettings):
    # ... existing settings ...
    
    # CORS Configuration
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:4800",
        "http://10.5.216.11:4800",  # Add your server IP
        "http://127.0.0.1:4800",
    ]
```

### 2. API Endpoint Structure

Ensure your backend API endpoints follow the `/api/v1/*` pattern:

```python
# backend/main.py
from app.api.v1.api import api_router

# Include API router with v1 prefix
app.include_router(api_router, prefix=settings.API_V1_STR)  # /api/v1
```

### 3. File Serving Endpoints

Make sure file serving endpoints are properly configured:

```python
# backend/app/api/v1/endpoints/uploads.py
@router.get("/file-serve")
async def file_serve_query(path: Optional[str] = None):
    """Serve files with base64 encoded paths"""
    # Returns URLs like: /api/v1/uploads/file-serve?path=...
```

### 4. Environment Variables

Set up your backend environment:

```bash
# backend/.env
API_V1_STR=/api/v1
BACKEND_CORS_ORIGINS=["http://localhost:4800","http://10.5.216.11:4800"]
```

## Frontend Configuration

### 1. Next.js Rewrite Rules

Configure Next.js to proxy API requests to the backend:

```javascript
// frontend/next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... existing config ...
  
  // Add rewrites for API proxying
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'}/api/:path*`,
      },
    ]
  },
  
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4700',
    NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:4800',
  },
}

module.exports = nextConfig
```

### 2. Environment Variables

Set up your frontend environment:

```bash
# frontend/.env.local
NEXT_PUBLIC_BACKEND_URL=http://10.5.216.11:4700
NEXT_PUBLIC_WS_URL=ws://10.5.216.11:4700
NEXT_PUBLIC_FRONTEND_URL=http://10.5.216.11:4800
```

### 3. API Client Configuration

Update your API client to use relative URLs:

```typescript
// frontend/lib/api.ts
const API_BASE_URL = '/api'

export class ApiClient {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  // Methods use relative URLs like '/v1/auth/login'
  async post(endpoint: string, data: any) {
    return fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    })
  }
}

// API methods use relative paths
export const authApi = {
  async login(email: string, password: string) {
    return apiClient.post('/v1/auth/login', { email, password })
  },
  // ... other methods
}
```

### 4. Component API Calls

Update all components to use relative URLs:

```typescript
// Before (absolute URLs)
const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/auth/login`)

// After (relative URLs)
const response = await fetch('/api/v1/auth/login')
```

### 5. File URL Handling

Handle file URLs correctly to avoid duplication:

```typescript
// frontend/components/ImageGallery.tsx
const imageArtifacts = artifacts?.map(artifact => ({
  ...artifact,
  download_url: artifact.download_url?.startsWith('/api') 
    ? artifact.download_url  // Already has /api prefix
    : artifact.download_url?.startsWith('/') 
      ? `/api${artifact.download_url}`  // Add /api prefix
      : artifact.download_url
})) || []
```

### 6. WebSocket Configuration

WebSocket connections still need absolute URLs (rewrites don't work with WS):

```typescript
// frontend/lib/socket.tsx
const connectWebSocket = () => {
  // For WebSocket, we still need the full URL since rewrites don't work with WS
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'
  const wsUrl = backendUrl.replace('http', 'ws')
  
  const newSocket = new WebSocket(`${wsUrl}/ws/general`)
  // ... rest of WebSocket logic
}
```

## Deployment Steps

### 1. Start Backend

```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 4700
```

### 2. Start Frontend

```bash
cd frontend
npm run dev -- --hostname 0.0.0.0 --port 4800
```

Or use the provided script:

```bash
./run-frontend.command
```

### 3. Verify Setup

Test that the proxy is working:

```bash
# Test API endpoint through proxy
curl -X POST http://10.5.216.11:4800/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# Should return a response from the backend
```

## URL Mapping Examples

| Frontend Request | Backend Destination |
|------------------|-------------------|
| `/api/v1/auth/login` | `http://10.5.216.11:4700/api/v1/auth/login` |
| `/api/v1/projects/` | `http://10.5.216.11:4700/api/v1/projects/` |
| `/api/v1/uploads/file-serve?path=...` | `http://10.5.216.11:4700/api/v1/uploads/file-serve?path=...` |
| `/api/v1/admin/plugins/descriptions` | `http://10.5.216.11:4700/api/v1/admin/plugins/descriptions` |

## Benefits

1. **Single Port Access**: Browser only needs to connect to port 4800
2. **No CORS Issues**: Eliminates cross-origin request problems
3. **Simplified Deployment**: Easier to deploy behind reverse proxies
4. **Better Security**: Backend is not directly exposed to the browser
5. **Easier Development**: No need to manage multiple ports in development

## Troubleshooting

### Common Issues

1. **URL Duplication**: `/api/api/v1/...`
   - **Cause**: Backend returns URLs with `/api` prefix, frontend adds another `/api`
   - **Fix**: Check if URL already starts with `/api` before prepending

2. **CORS Errors**: 
   - **Cause**: Backend CORS not configured for frontend port
   - **Fix**: Add frontend URL to `BACKEND_CORS_ORIGINS`

3. **WebSocket Connection Issues**:
   - **Cause**: WebSocket can't use rewrites
   - **Fix**: Use absolute URLs for WebSocket connections

4. **File Downloads Not Working**:
   - **Cause**: File URLs not properly handled
   - **Fix**: Check URL construction logic in components

### Debug Commands

```bash
# Check if frontend is running
curl -I http://10.5.216.11:4800

# Check if backend is running
curl -I http://10.5.216.11:4700

# Test API proxy
curl -I http://10.5.216.11:4800/api/v1/auth/login

# Check Next.js rewrite logs
# Look for rewrite information in Next.js console output
```

## Production Considerations

### 1. Reverse Proxy Setup

For production, you might want to use a reverse proxy like Nginx:

```nginx
# nginx.conf
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:4800;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /api/ {
        proxy_pass http://localhost:4800;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 2. Environment Variables

Set production environment variables:

```bash
# Production .env.local
NEXT_PUBLIC_BACKEND_URL=http://localhost:4700
NEXT_PUBLIC_WS_URL=ws://localhost:4700
NEXT_PUBLIC_FRONTEND_URL=https://your-domain.com
```

### 3. SSL/HTTPS

For HTTPS, update URLs accordingly:

```bash
NEXT_PUBLIC_BACKEND_URL=https://api.your-domain.com
NEXT_PUBLIC_WS_URL=wss://api.your-domain.com
NEXT_PUBLIC_FRONTEND_URL=https://your-domain.com
```

## Summary

This single-port proxy setup provides a clean architecture where:

- ✅ Browser only connects to one port (4800)
- ✅ All API calls go through Next.js proxy
- ✅ Backend remains accessible only through the proxy
- ✅ WebSocket connections work correctly
- ✅ File downloads and uploads work seamlessly
- ✅ No CORS issues
- ✅ Easy to deploy and maintain

The setup is now complete and ready for production use!

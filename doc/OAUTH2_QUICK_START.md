# OAuth2 Quick Start Guide

## Summary

OAuth2 authorization has been successfully implemented and the database migration has been applied. Your application is now ready to serve as an OAuth2 provider for other applications.

## Current Status

✅ Database tables created (oauth_client, authorization_code)  
✅ OAuth2 endpoints implemented  
✅ Migration applied successfully  
✅ Ready for use

## Quick Example - Register an OAuth2 Client

First, authenticate and get an access token:

```bash
# Login as a user
curl -X POST http://localhost:4700/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin"
  }'

# Save the access_token from the response
```

Then create an OAuth2 client:

```bash
# Create OAuth2 client
curl -X POST http://localhost:4700/api/v1/oauth/clients \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My External App",
    "description": "Integration application",
    "redirect_uris": ["http://localhost:3000/oauth/callback"]
  }'

# Response will include:
# - client_id: Public identifier
# - client_secret: Secret (save this immediately!)
```

## Authorization Flow

### Step 1: Build Authorization URL

```
http://localhost:4700/api/v1/oauth/authorize?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=http://localhost:3000/oauth/callback&
  response_type=code&
  state=random-state-123
```

### Step 2: User Authorizes

User logs in (if needed) and authorizes the application.

Returns to callback URL with:
```
http://localhost:3000/oauth/callback?code=AUTHORIZATION_CODE&state=random-state-123
```

### Step 3: Exchange Code for Token

```bash
curl -X POST http://localhost:4700/api/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=AUTHORIZATION_CODE" \
  -d "redirect_uri=http://localhost:3000/oauth/callback" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"

# Returns access_token to use for API calls
```

### Step 4: Use Access Token

```bash
curl http://localhost:4700/api/v1/projects/ \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

## Available Endpoints

### Client Management (Protected)

- `POST /api/v1/oauth/clients` - Create client
- `GET /api/v1/oauth/clients` - List clients
- `GET /api/v1/oauth/clients/{client_id}` - Get client details
- `DELETE /api/v1/oauth/clients/{client_id}` - Delete client

### Authorization Flow

- `GET /api/v1/oauth/authorize` - Initiate authorization
- `POST /api/v1/oauth/token` - Exchange code for token

## Security Notes

⚠️ **Important:**
- Client secrets are only shown **once** during creation
- Save them securely
- Authorization codes expire in 10 minutes
- Access tokens expire in 30 minutes
- Authorization codes are single-use only

## Full Documentation

See `OAUTH2_IMPLEMENTATION.md` for complete documentation including:
- Detailed flow diagrams
- Python example implementation
- PKCE support
- Security best practices
- Troubleshooting guide

## Test Your OAuth2 Setup

1. Create a client using the endpoint above
2. Open the authorization URL in a browser
3. Authorize the application
4. Copy the authorization code from the callback URL
5. Exchange it for an access token
6. Use the access token to make API calls

Your OAuth2 implementation is ready for production use! 🚀


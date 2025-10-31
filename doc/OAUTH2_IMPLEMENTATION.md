# OAuth2 Implementation for External Applications

This document describes the OAuth2 authorization flow implementation that allows other applications to authenticate users through this platform.

## Overview

The OAuth2 implementation follows the **Authorization Code flow** with optional PKCE (Proof Key for Code Exchange) support for enhanced security. This is the standard OAuth2 flow used by most modern applications.

## Architecture

### Database Tables

Two new tables have been added:

1. **`oauth_client`** - Stores OAuth2 client applications
   - `client_id` - Public identifier for the client
   - `client_secret_hash` - Hashed client secret
   - `client_name` - Application name
   - `redirect_uris` - JSON array of allowed redirect URIs
   - `owner_id` - User who created the client
   - `is_active` - Whether the client is active

2. **`authorization_code`** - Temporary authorization codes
   - `code` - Authorization code (one-time use)
   - `user_id` - User who authorized
   - `client_id` - Client that requested authorization
   - `redirect_uri` - Redirect URI from request
   - `code_challenge` - PKCE code challenge (optional)
   - `code_challenge_method` - PKCE method ('plain' or 'S256')
   - `expires_at` - Expiry time (10 minutes)
   - `used` - Whether code has been exchanged

### API Endpoints

#### Client Management (Protected - requires authentication)

1. **POST `/api/v1/oauth/clients`** - Create a new OAuth2 client
   - **Request:**
     ```json
     {
       "client_name": "My App",
       "description": "Application description",
       "redirect_uris": ["https://myapp.com/callback"]
     }
     ```
   - **Response:**
     ```json
     {
       "id": "uuid",
       "client_id": "base64-encoded-id",
       "client_secret": "secret-only-shown-once",
       "client_name": "My App",
       "description": "Application description",
       "redirect_uris": ["https://myapp.com/callback"],
       "owner_id": "user-uuid",
       "is_active": true,
       "created_at": "2025-10-27T..."
     }
     ```
   - ⚠️ **Important:** Save the `client_secret` immediately! It's only shown once.

2. **GET `/api/v1/oauth/clients`** - List your OAuth2 clients
   - Returns all clients owned by the authenticated user

3. **GET `/api/v1/oauth/clients/{client_id}`** - Get client details
   - Returns client information (without secret)

4. **DELETE `/api/v1/oauth/clients/{client_id}`** - Delete an OAuth2 client
   - Permanently removes the client

#### Authorization Flow (Public Endpoints)

5. **GET `/api/v1/oauth/authorize`** - Initiate authorization
   - **Parameters:**
     - `client_id` - Your client ID (required)
     - `redirect_uri` - Callback URL (required, must match registered URI)
     - `response_type` - Must be `code` (required)
     - `scope` - Optional space-delimited scopes
     - `state` - Optional state parameter for CSRF protection
     - `code_challenge` - Optional PKCE code challenge
     - `code_challenge_method` - Optional PKCE method ('plain' or 'S256')
   - **Returns:** Redirect to `redirect_uri` with authorization code

6. **POST `/api/v1/oauth/token`** - Exchange code for access token
   - **Form Data:**
     - `grant_type` - Must be `authorization_code`
     - `code` - Authorization code from /authorize
     - `redirect_uri` - Must match the original redirect_uri
     - `client_id` - Your client ID
     - `client_secret` - Your client secret
     - `code_verifier` - PKCE code verifier (if PKCE was used)
   - **Response:**
     ```json
     {
       "access_token": "jwt-token",
       "token_type": "Bearer",
       "expires_in": 1800,
       "scope": "optional-scopes"
     }
     ```

## OAuth2 Flow Diagram

```
┌─────────────┐                                          ┌──────────────┐
│             │                                          │   OAuth2     │
│ Client App  │                                          │   Server     │
│             │                                          │  (This App)  │
└──────┬──────┘                                          └──────┬───────┘
       │                                                         │
       │ 1. Redirect user to /oauth/authorize                   │
       │    client_id=abc, redirect_uri=https://myapp.com/cb    │
       ├────────────────────────────────────────────────────────>│
       │                                                         │
       │                                                         │ If not logged in,
       │                                                         │ redirects to login
       │                                                         │
       │ 2. User logs in (if needed)                            │
       │                                                         │
       │ 3. User authorizes the application                     │
       │                                                         │
       │ 4. Redirect to redirect_uri with code                  │
       │    code=xyz789, state=random-state                     │
       │<────────────────────────────────────────────────────────┤
       │                                                         │
       │ 5. POST /oauth/token                                   │
       │    code=xyz789, client_id=abc, client_secret=secret    │
       ├────────────────────────────────────────────────────────>│
       │                                                         │
       │ 6. Returns access_token                                │
       │    {access_token: "jwt", expires_in: 1800}             │
       │<────────────────────────────────────────────────────────┤
       │                                                         │
       │ 7. Use access_token to call API                        │
       │    Authorization: Bearer jwt                            │
       └─────────────────────────────────────────────────────────┘
```

## Implementation Steps for Client Applications

### 1. Register Your Application

First, create an OAuth2 client using the client management endpoint:

```bash
curl -X POST https://yourserver.com/api/v1/oauth/clients \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My Application",
    "description": "Integration with your platform",
    "redirect_uris": ["https://myapp.com/oauth/callback"]
  }'
```

Save the `client_id` and `client_secret` securely!

### 2. Build Authorization URL

Construct the authorization URL:

```
https://yourserver.com/api/v1/oauth/authorize?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=https://myapp.com/oauth/callback&
  response_type=code&
  state=random-state-string
```

Redirect users to this URL for authorization.

### 3. Handle Callback

After user authorization, they'll be redirected back with a `code` parameter:

```
https://myapp.com/oauth/callback?code=AUTHORIZATION_CODE&state=random-state-string
```

Validate the `state` parameter matches what you sent.

### 4. Exchange Code for Token

Exchange the authorization code for an access token:

```bash
curl -X POST https://yourserver.com/api/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=AUTHORIZATION_CODE" \
  -d "redirect_uri=https://myapp.com/oauth/callback" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

### 5. Use Access Token

Use the returned access token to make API calls:

```bash
curl https://yourserver.com/api/v1/projects/ \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

## Security Features

### 1. PKCE Support (Recommended for Public Clients)

For enhanced security, use PKCE:

**Generate code_verifier:**
```python
import secrets
import base64

code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('=')
```

**Generate code_challenge:**
```python
import hashlib

code_challenge = base64.urlsafe_b64encode(
    hashlib.sha256(code_verifier.encode()).digest()
).decode().rstrip('=')
```

**In authorization URL:**
```
?code_challenge=CHALLENGE&code_challenge_method=S256
```

**In token exchange:**
```
?code_verifier=VERIFIER
```

### 2. State Parameter (CSRF Protection)

Always include a random `state` parameter in the authorization request and verify it in the callback to prevent CSRF attacks.

### 3. Token Expiry

Access tokens expire after 30 minutes. Implement token refresh logic or re-authorization as needed.

## Example Client Implementation (Python)

```python
import requests
import secrets
import base64
import hashlib
from urllib.parse import urlencode

class OAuth2Client:
    def __init__(self, client_id, client_secret, server_url):
        self.client_id = client_id
        self.client_secret = client_secret
        self.server_url = server_url
        
    def get_authorization_url(self, redirect_uri, state=None):
        """Generate authorization URL with PKCE"""
        # Generate PKCE parameters
        code_verifier = self._generate_code_verifier()
        code_challenge = self._generate_challenge(code_verifier)
        
        # Store code_verifier for token exchange
        self.code_verifier = code_verifier
        
        params = {
            'client_id': self.client_id,
            'redirect_uri': redirect_uri,
            'response_type': 'code',
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256',
        }
        
        if state:
            params['state'] = state
            
        return f"{self.server_url}/api/v1/oauth/authorize?{urlencode(params)}"
    
    def _generate_code_verifier(self):
        return base64.urlsafe_b64encode(
            secrets.token_bytes(32)
        ).decode().rstrip('=')
    
    def _generate_challenge(self, verifier):
        return base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode()).digest()
        ).decode().rstrip('=')
    
    def exchange_code(self, code, redirect_uri):
        """Exchange authorization code for access token"""
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'code_verifier': self.code_verifier,
        }
        
        response = requests.post(
            f"{self.server_url}/api/v1/oauth/token",
            data=data
        )
        
        return response.json()
    
    def api_call(self, endpoint, access_token):
        """Make an authenticated API call"""
        headers = {'Authorization': f'Bearer {access_token}'}
        response = requests.get(
            f"{self.server_url}{endpoint}",
            headers=headers
        )
        return response.json()

# Usage
client = OAuth2Client(
    client_id='your-client-id',
    client_secret='your-client-secret',
    server_url='https://yourserver.com'
)

# 1. Redirect user to authorization URL
auth_url = client.get_authorization_url(
    redirect_uri='https://myapp.com/callback',
    state='random-state'
)
print(f"Redirect to: {auth_url}")

# 2. In callback handler, exchange code for token
token_response = client.exchange_code(
    code='authorization-code-from-callback',
    redirect_uri='https://myapp.com/callback'
)
access_token = token_response['access_token']

# 3. Use access token for API calls
projects = client.api_call('/api/v1/projects/', access_token)
print(projects)
```

## Database Migration

To apply the OAuth2 tables to your database:

```bash
cd backend
source venv/bin/activate
alembic upgrade head
```

Note: If you encounter permission issues, you may need to run the SQL statements manually:

```sql
-- Create oauth_client table
CREATE TABLE oauth_client (
    id UUID PRIMARY KEY,
    client_id VARCHAR UNIQUE NOT NULL,
    client_secret_hash VARCHAR NOT NULL,
    client_name VARCHAR NOT NULL,
    description TEXT,
    redirect_uris JSON,
    owner_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME Z self
);

-- Create authorization_code table
CREATE TABLE authorization_code (
    id UUID PRIMARY KEY,
    code VARCHAR UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES oauth_client(id) ON DELETE CASCADE,
    redirect_uri VARCHAR NOT NULL_ALL,
    code_challenge VARCHAR,
    code_challenge_method VARCHAR,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used BOOLEAN DEFAULT false
);
```

## Testing

You can test the OAuth2 flow using curl or any HTTP client:

1. Register a client via the API
2. Build an authorization URL
3. Open in browser and authorize
4. Extract code from callback
5. Exchange for access token
6. Use token for API calls

## Troubleshooting

### "Invalid client" error
- Verify `client_id` is correct
- Ensure client is active (`is_active = true`)

### "Invalid redirect URI" error
- Verify redirect URI exactly matches one in `redirect_uris` array
- Check for trailing slashes

### "Authorization code has expired" error
- Authorization codes expire after 10 minutes
- Request a new authorization

### "Invalid or expired authorization code" error
- Authorization codes can only be used once
- Check if code was already exchanged
- Verify code hasn't expired

## Security Considerations

1. **Never commit client secrets to version control**
2. **Use HTTPS for all OAuth2 endpoints**
3. **Implement PKCE for enhanced security**
4. **Use state parameter for CSRF protection**
5. **Store access tokens securely**
6. **Implement token refresh or re-authentication**
7. **Rate limit OAuth2 endpoints**

## Next Steps

After implementing OAuth2:
1. Apply the database migration
2. Test the flow with a sample client
3. Document it for your users
4. Consider adding refresh token support for longer-lived sessions
5. Add audit logging for OAuth2 events


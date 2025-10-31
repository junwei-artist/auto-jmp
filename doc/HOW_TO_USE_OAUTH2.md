# How to Use OAuth2 for External Applications

This guide explains how to set up and use OAuth2 authentication to allow external applications to access your platform.

---

## Table of Contents

1. [What is OAuth2?](#what-is-oauth2)
2. [Prerequisites](#prerequisites)
3. [Step 1: Create an OAuth2 Client](#step-1-create-an-oauth2-client)
4. [Step 2: Implement Authorization Flow](#step-2-implement-authorization-flow)
5. [Step 3: Use the Access Token](#step-3-use-the-access-token)
6. [Complete Working Example](#complete-working-example)
7. [Troubleshooting](#troubleshooting)

---

## What is OAuth2?

OAuth2 allows users to authorize external applications to access your platform without sharing their password. Instead:

1. The external app redirects users to your platform to log in
2. Users approve the application
3. Your platform gives the app a temporary access token
4. The app uses this token to make API calls on behalf of the user

---

## Prerequisites

- An account on the platform
- Administrator access (or user account) to create OAuth2 clients
- Your external application ready to integrate

---

## Step 1: Create an OAuth2 Client

### Get Your Access Token

First, you need to log in to get an access token:

```bash
curl -X POST https://your-server.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "bearer",
  "user_id": "123e4567-e89b-12d3-a456-426614174000",
  "is_guest": false,
  "is_admin": false
}
```

**Save the `access_token`** - you'll need it for the next step.

### Register Your Application

Now create an OAuth2 client for your external application:

```bash
curl -X POST https://your-server.com/api/v1/oauth/clients \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My Cool App",
    "description": "Mobile app for data analysis",
    "redirect_uris": [
      "https://myapp.com/oauth/callback",
      "https://myapp.com/callback",
      "myapp://oauth/callback"
    ]
  }'
```

**Response:**
```json
{
  "id": "uuid-here",
  "client_id": "abcdef123456...",
  "client_secret": "xyz789secret...",
  "client_name": "My Cool App",
  "description": "Mobile app for data analysis",
  "redirect_uris": ["https://myapp.com/oauth/callback"],
  "owner_id": "your-user-id",
  "is_active": true,
  "created_at": "2025-10-27T..."
}
```

⚠️ **CRITICAL:** Save the `client_id` and `client_secret` immediately! The secret is only shown once and cannot be retrieved later.

---

## Step 2: Implement Authorization Flow

### 2.1 Build the Authorization URL

Direct users to this URL to start the authorization process:

```
https://your-server.com/api/v1/oauth/authorize?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=https://myapp.com/oauth/callback&
  response_type=code&
  state=random-security-string-12345
```

**Query Parameters:**
- `client_id` - Your client ID (required)
- `redirect_uri` - Must match one of your registered URIs (required)
- `response_type` - Must be `code` (required)
- `state` - Random string for security (recommended)
- `scope` - Optional space-separated scopes
- `code_challenge` - Optional PKCE challenge
- `code_challenge_method` - Optional PKCE method ('plain' or 'S256')

### 2.2 User Authorization

When users visit this URL:
1. They'll be asked to log in (if not already logged in)
2. They'll see your app name and requested permissions
3. They can choose to **Allow** or **Cancel**

### 2.3 Handle the Callback

After authorization, users are redirected back to your `redirect_uri`:

```
https://myapp.com/oauth/callback?
  code=abc123def456...&
  state=random-security-string-12345
```

**Important:**
- Verify the `state` parameter matches what you sent
- The `code` is temporary (expires in 10 minutes)
- The code can only be used **once**

### 2.4 Exchange Code for Token

Convert the authorization code into an access token:

```bash
curl -X POST https://your-server.com/api/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=abc123def456..." \
  -d "redirect_uri=https://myapp.com/oauth/callback" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

**Response:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 1800
}
```

**Save the `access_token`** - use it for API calls!

---

## Step 3: Use the Access Token

Now you can make authenticated API calls:

```bash
curl https://your-server.com/api/v1/projects/ \
  -H "Authorization: Bearer eyJhbGc..."
```

### Example: Get User Projects

```bash
curl https://your-server.com/api/v1/projects/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Example: Create a New Project

```bash
curl -X POST https://your-server.com/api/v1/projects/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Project",
    "description": "Created via OAuth2"
  }'
```

### Token Expiry

Access tokens expire after **30 minutes**. You have two options:

1. **Request a new authorization** (ask user to re-authorize)
2. **Implement flexibility** to handle expired tokens gracefully

---

## Complete Working Example

Here's a complete flow in Python:

```python
import requests
import secrets
import urllib.parse

class OAuth2Client:
    def __init__(self, client_id, client_secret, server_url, redirect_uri):
        self.client_id = client_id
        self.client_secret = client_secret
        self.server_url = server_url
        self.redirect_uri = redirect_uri
        self.access_token = None
        
    def get_authorization_url(self):
        """Generate the URL to send users to"""
        state = secrets.token_urlsafe(16)
        
        params = {
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'response_type': 'code',
            'state': state
        }
        
        # Store state for verification
        self.state = state
        
        url = f"{self.server_url}/api/v1/oauth/authorize"
        return f"{url}?{urllib.parse.urlencode(params)}"
    
    def exchange_code(self, code, state):
        """Exchange authorization code for access token"""
        # Verify state matches
        if state != self.state:
            raise ValueError("State mismatch - possible CSRF attack")
        
        # Exchange code for token
        response = requests.post(
            f"{self.server_url}/api/v1/oauth/token",
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': self.redirect_uri,
                'client_id': self.client_id,
                'client_secret': self.client_secret,
            }
        )
        
        response.raise_for_status()
        data = response.json()
        self.access_token = data['access_token']
        return self.access_token
    
    def get_projects(self):
        """Example API call using the access token"""
        headers = {'Authorization': f'Bearer {self.access_token}'}
        response = requests.get(
            f"{self.server_url}/api/v1/projects/",
            headers=headers
        )
        response.raise_for_status()
        return response.json()

# Usage
client = OAuth2Client(
    client_id='your-client-id',
    client_secret='your-client-secret',
    server_url='https://your-server.com',
    redirect_uri='https://myapp.com/oauth/callback'
)

# 1. Get authorization URL and send user there
auth_url = client.get_authorization_url()
print(f"Send user to: {auth_url}")

# 2. User authorizes, comes back with code in callback
# Extract code and state from callback URL
callback_url = "https://myapp.com/oauth/callback?code=...&state=..."

# 3. Exchange code for token
parsed = urllib.parse.urlparse(callback_url)
params = urllib.parse.parse_qs(parsed.query)
code = params['code'][0]
state = params['state'][0]

token = client.exchange_code(code, state)
print(f"Access token: {token}")

# 4. Use token for API calls
projects = client.get_projects()
print(f"Projects: {projects}")
```

---

## Frontend Example (JavaScript/React)

```javascript
class OAuth2Client {
  constructor(clientId, clientSecret, serverUrl, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.serverUrl = serverUrl;
    this.redirectUri = redirectUri;
  }

  generateState() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  startAuthorization() {
    const state = this.generateState();
    // Store state for verification
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state: state
    });

    const authUrl = `${this.serverUrl}/api/v1/oauth/authorize?${params}`;
    
    // Redirect user
    window.location.href = authUrl;
  }

  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    
    // Verify state
    const storedState = sessionStorage.getItem('oauth_state');
    if (state !== storedState) {
      throw new Error('State mismatch');
    }

    // Exchange code for token
    const response = await fetch(`${this.serverUrl}/api/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      })
    });

    const data = await response.json();
    
    // Store token
    localStorage.setItem('access_token', data.access_token);
    
    return data.access_token;
  }

  async apiCall(endpoint) {
    const token = localStorage.getItem('access_token');
    const response = await fetch(`${this.serverUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.json();
  }
}

// Usage in React
function LoginButton({ client }) {
  const handleLogin = () => {
    client.startAuthorization();
  };

  return <button onClick={handleLogin}>Login with OAuth2</button>;
}

// In your callback component
useEffect(() => {
  async function handleOAuthCallback() {
    try {
      const token = await client.handleCallback();
      console.log('Logged in!', token);
      // Redirect to main app
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('OAuth error:', error);
    }
  }

  if (window.location.search.includes('code=')) {
    handleOAuthCallback();
  }
}, []);
```

---

## Troubleshooting

### "Invalid client" error
**Problem:** The client_id doesn't exist or is inactive.

**Solution:**
- Verify the client_id is correct
- Check if the client is active via the management endpoint
- Ensure you're using the right server URL

### "Invalid redirect URI" error
**Problem:** The redirect_uri doesn't match registered URIs.

**Solution:**
- Ensure the redirect_uri exactly matches one you registered
- Check for trailing slashes or protocol differences
- The comparison is case-sensitive

### "Authorization code has expired" error
**Problem:** You took more than 10 minutes to exchange the code.

**Solution:**
- Exchange the code immediately after receiving it
- Authorization codes expire in 10 minutes

### "Invalid or expired authorization code" error
**Problem:** The code was already used or doesn't exist.

**Solution:**
- Authorization codes are single-use only
- Request a new authorization if you need another token

### Token expired during use
**Problem:** The 30-minute access token expired.

**Solution:**
- Implement error handling to catch 401 errors
- Request a new authorization when token expires
- Consider implementing a refresh flow

### "State mismatch" error
**Problem:** The state parameter doesn't match.

**Solution:**
- Always verify the state parameter matches what you sent
- This protects against CSRF attacks

---

## Security Best Practices

1. **Always use HTTPS** - Never send tokens over unencrypted connections
2. **Store secrets securely** - Never commit client_secret to version control
3. **Verify state parameter** - Always check state matches to prevent CSRF
4. **Use PKCE for mobile apps** - Enhanced security for apps that can't keep secrets
5. **Handle errors gracefully** - Show user-friendly error messages
6. **Log security events** - Monitor for suspicious activity
7. **Rotate client secrets** - Change secrets periodically

---

## Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/oauth/clients` | POST | Create OAuth2 client |
| `/api/v1/oauth/clients` | GET | List your clients |
| `/api/v1/oauth/authorize` | GET | Start authorization |
| `/api/v1/oauth/token` | POST | Exchange code for token |

| Parameter | Required | Description |
|-----------|----------|-------------|
| `client_id` | Yes | Your application's public ID |
| `client_secret` | Yes | Your application's secret (keep secure!) |
| `redirect_uri` | Yes | Where to send users after authorization |
| `code` | Yes | Authorization code from callback |
| `state` | Recommended | CSRF protection |
| `grant_type` | Yes | Must be "authorization_code" |

---

## Need Help?

- Check the full documentation: `OAUTH2_IMPLEMENTATION.md`
- Quick start guide: `OAUTH2_QUICK_START.md`
- Review API examples above
- Test with a simple curl request first

Happy integrating! 🚀


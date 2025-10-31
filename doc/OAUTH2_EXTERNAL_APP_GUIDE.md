# OAuth2 Integration Guide for External Apps

## Your OAuth2 Credentials

**Client ID:** `iBED5P6aI2dvVJ7uR8j31A`  
**Client Secret:** `Ywi4ZkvSgc1r7etanbFitCqkWNzZklGXtTz135fr1eM` ⚠️ Keep this secret!

**Authorization URL:** `http://10.5.216.11:4800/api/v1/oauth/authorize`  
**Token URL:** `http://10.5.216.11:4800/api/v1/oauth/token`

**Registered Redirect URIs:**
- `http://10.5.216.11:3000/oauth/callback`
- `http://10.5.216.11:3200/auth/oauth/callback`

---

## Complete OAuth2 Flow Implementation

### Step 1: Build Authorization URL

```javascript
const clientId = 'iBED5P6aI2dvVJ7uR8j31A';
const redirectUri = 'http://10.5.216.11:3200/auth/oauth/callback'; // Use your registered URI
const state = generateRandomString(); // For CSRF protection

const authUrl = `http://10.5.216.11:4800/api/v1/oauth/authorize?` +
  `client_id=${encodeURIComponent(clientId)}&` +
  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
  `response_type=code&` +
  `state=${encodeURIComponent(state)}&` +
  `scope=read`; // Optional

// Redirect user to authUrl
window.location.href = authUrl;
```

### Step 2: Handle Callback

After user authorizes, they'll be redirected back to your callback URL with:

```
http://10.5.216.11:3200/auth/oauth/callback?code=AUTHORIZATION_CODE&state=YOUR_STATE
```

**Extract the authorization code:**
```javascript
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');

// Verify state matches what you sent
if (state !== originalState) {
  throw new Error('CSRF validation failed');
}
```

### Step 3: Exchange Code for Token (CRITICAL - This is what you're missing!)

**⚠️ The error shows you're not sending `grant_type`. Here's the correct format:**

```javascript
async function exchangeCodeForToken(code, redirectUri) {
  const clientId = 'iBED5P6aI2dvVJ7uR8j31A';
  const clientSecret = 'Ywi4ZkvSgc1r7etanbFitCqkWNzZklGXtTz135fr1eM';
  
  // IMPORTANT: Send as Form Data (application/x-www-form-urlencoded)
  const formData = new URLSearchParams();
  formData.append('grant_type', 'authorization_code');  // ← REQUIRED!
  formData.append('code', code);                        // ← Authorization code
  formData.append('redirect_uri', redirectUri);        // ← Must match registered URI
  formData.append('client_id', clientId);
  formData.append('client_secret', clientSecret);
  
  const response = await fetch('http://10.5.216.11:4800/api/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',  // ← CRITICAL!
    },
    body: formData.toString()
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Token exchange failed');
  }
  
  const tokenData = await response.json();
  
  // Save access token
  const accessToken = tokenData.access_token;
  console.log('Access token:', accessToken);
  
  return tokenData;
}
```

**Key Points:**
- ✅ Use `POST` method
- ✅ Content-Type must be `application/x-www-form-urlencoded`
- ✅ Send as form data (URLSearchParams), NOT JSON
- ✅ Must include `grant_type=authorization_code`
- ✅ Redirect URI must EXACTLY match registered URI

### Step 4: Use Access Token

```javascript
async function callProtectedAPI(accessToken) {
  const response = await fetch('http://10.5.216.11:4800/api/v1/projects/', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  const data = await response.json();
  return data;
}
```

---

## Common Errors and Solutions

### Error: "Field required: grant_type"
**Solution:** You must send `grant_type=authorization_code` as form data (not JSON).

❌ **Wrong:**
```javascript
fetch('/api/v1/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: code
  })
});
```

✅ **Correct:**
```javascript
const formData = new URLSearchParams();
formData.append('grant_type', 'authorization_code');
formData.append('code', code);
// ... more params

fetch('/api/v1/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: formData.toString()
});
```

### Error: "Invalid redirect URI"
**Solution:** The redirect URI must EXACTLY match one of your registered URIs. Check for:
- Trailing slashes
- HTTP vs HTTPS
- Port numbers
- Path differences

### Error: "Invalid or expired authorization code"
**Solution:** 
- Authorization codes expire in 10 minutes
- Authorization codes can only be used ONCE
- Request a new authorization if expired

---

## Complete Example (JavaScript)

```javascript
class OAuth2Client {
  constructor(clientId, clientSecret, redirectUri, authorizationUrl, tokenUrl) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.authorizationUrl = authorizationUrl;
    this.tokenUrl = tokenUrl;
  }

  // Generate random state for CSRF protection
  generateState() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  // Step 1: Build authorization URL
  buildAuthUrl(state, scope = '') {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state: state
    });
    
    if (scope) params.append('scope', scope);
    
    return `${this.authorizationUrl}?${params.toString()}`;
  }

  // Step 3: Exchange code for token
  async exchangeCodeForToken(code, state, storedState) {
    // Verify state
    if (state !== storedState) {
      throw new Error('CSRF validation failed - state mismatch');
    }

    // Create form data
    const formData = new URLSearchParams();
    formData.append('grant_type', 'authorization_code');
    formData.append('code', code);
    formData.append('redirect_uri', this.redirectUri);
    formData.append('client_id', this.clientId);
    formData.append('client_secret', this.clientSecret);

    // Exchange code
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Token exchange failed');
    }

    return await response.json();
  }

  // Step 4: Call protected API
  async callAPI(endpoint, accessToken) {
    const response = await fetch(`http://10.5.216.11:4800${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }

    return await response.json();
  }
}

// Usage
const client = new OAuth2Client(
  'iBED5P6aI2dvVJ7uR8j31A',
  'Ywi4ZkvSgc1r7etanbFitCqkWNzZklGXtTz135fr1eM',
  'http://10.5.216.11:3200/auth/oauth/callback',
  'http://10.5.216.11:4800/api/v1/oauth/authorize',
  'http://10.5.216.11:4800/api/v1/oauth/token'
);

// Start OAuth flow
const state = client.generateState();
sessionStorage.setItem('oauth_state', state);
window.location.href = client.buildAuthUrl(state);

// In callback handler
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
const state = urlParams.get('state');
const storedState = sessionStorage.getItem('oauth_state');

try {
  const tokenData = await client.exchangeCodeForToken(code, state, storedState);
  console.log('Access Token:', tokenData.access_token);
  
  // Use the token
  const projects = await client.callAPI('/api/v1/projects/', tokenData.access_token);
  console.log('Projects:', projects);
} catch (error) {
  console.error('OAuth error:', error);
}
```

---

## Python Example

```python
import requests

class OAuth2Client:
    def __init__(self, client_id, client_secret, redirect_uri):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.base_url = 'http://10.5.216.11:4800/api/v1/oauth'
    
    def build_auth_url(self, state):
        params = {
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'response_type': 'code',
            'state': state
        }
        return f"{self.base_url}/authorize?{requests.compat.urlencode(params)}"
    
    def exchange_code(self, code, state):
        """Exchange authorization code for access token"""
        data = {
            'grant_type': 'authorization_code',  # CRITICAL!
            'code': code,
            'redirect_uri': self.redirect_uri,
            'client_id': self.client_id,
            'client_secret': self.client_secret
        }
        
        # Send as form data
        response = requests.post(
            f"{self.base_url}/token",
            data=data,  # Use 'data' not 'json'
            headers={'Content-Type': 'application/x-www-form-urlencoded'}
        )
        
        response.raise_for_status()
        return response.json()
    
    def call_api(self, endpoint, access_token):
        """Call protected API endpoint"""
        response = requests.get(
            f'http://10.5.216.11:4800{endpoint}',
            headers={'Authorization': f'Bearer {access_token}'}
        )
        response.raise_for_status()
        return response.json()

# Usage
client = OAuth2Client(
    'iBED5P6aI2dvVJ7uR8j31A',
    'Ywi4ZkvSgc1r7etanbFitCqkWNzZklGXtTz135fr1eM',
    'http://10.5.216.11:3200/auth/oauth/callback'
)

# Exchange code (in your callback handler)
token_data = client.exchange_code('AUTHORIZATION_CODE', 'STATE')
access_token = token_data['access_token']

# Use token
projects = client.call_api('/api/v1/projects/', access_token)
```

---

## Your Current Issue

Your external app received the authorization code successfully but failed to exchange it for a token.

**Error:** Missing `grant_type` parameter

**Fix:** Make sure your token exchange request:

1. Uses `POST` method
2. Content-Type is `application/x-www-form-urlencoded` (NOT `application/json`)
3. Sends as form data (not JSON)
4. Includes ALL these fields:
   - `grant_type=authorization_code`
   - `code=<authorization_code>`
   - `redirect_uri=http://10.5.216.11:3200/auth/oauth/callback`
   - `client_id=iBED5P6aI2dvVJ7uR8j31A`
   - `client_secret=Ywi4ZkvSgc1r7etanbFitCqkWNzZklGXtTz135fr1eM`

---

## Test the Token Exchange

You can test manually with curl:

```bash
curl -X POST http://10.5.216.11:4800/api/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "redirect_uri=http://10.5.216.11:3200/auth/oauth/callback" \
  -d "client_id=iBED5P6aI2dvVJ7uR8j31A" \
  -d "client_secret=Ywi4ZkvSgc1r7etanbFitCqkWNzZklGXtTz135fr1eM"
```

This should return:
```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 1800
}
```


# OAuth2 Callback Handling Guide

## Current Status
✅ Your OAuth authorization flow is working correctly!

You're receiving the callback with an authorization code:
```
http://10.5.216.11:3200/auth/oauth/callback?code=WLFuPPdf6W_wbWyjAGv2-jz9LQGZTT1StS5U26Reb08&state=Tjz-jTtcAe8UgmQANc5SFMSU0QXfkRAkxicS43JZWE8
```

## What Your External App Needs to Do

### Step 1: Extract the Code
Get the `code` parameter from the callback URL:

**JavaScript:**
```javascript
// In your callback handler (e.g., /auth/oauth/callback route)
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');  // "WLFuPPdf6W_wbWyjAGv2-jz9LQGZTT1StS5U26Reb08"
const state = urlParams.get('state');  // "Tjz-jTtcAe8UgmQANc5SFMSU0QXfkRAkxicS43JZWE8"

// Verify state matches what you sent (security)
if (state !== expectedState) {
  console.error('State mismatch - possible CSRF attack');
  return;
}
```

**Python (Flask/FastAPI):**
```python
# In your callback route
code = request.args.get('code')
state = request.args.get('state')

# Verify state matches what you sent (security)
if state != expected_state:
    return {"error": "State mismatch"}, 400
```

### Step 2: Exchange Code for Access Token

⚠️ **CRITICAL**: You MUST use form-encoded data, not JSON!

**JavaScript:**
```javascript
const params = new URLSearchParams({
  grant_type: 'authorization_code',  // REQUIRED!
  code: code,  // From Step 1
  redirect_uri: 'http://10. باره.216.11:3200/auth/oauth/callback',
  client_id: 'iBED5P6aI2dvVJ7uR8j31A',
  client_secret: 'YOUR_CLIENT_SECRET'
});

const response = await fetch('http://10.5.216.11:4800/api/v1/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'  // Important!
  },
  body: params.toString()  // Not JSON.stringify()!
});

const tokenData = await response.json();

if (response.ok) {
  const accessToken = tokenData.access_token;
  console.log('Access token:', accessToken);
  // Use this token for API calls
} else {
  console.error('Token exchange failed:', tokenData);
}
```

**Python:**
```python
import requests

# Exchange code for token
token_url = "http://10.5.216.11:4800/api/v1/oauth/token"
data = {
    "grant_type": "authorization_code",  # REQUIRED!
    "code": code,  # From Step 1
    "redirect_uri": "http://10.5.216.11:3200/auth/oauth/callback",
    "client_id": "iBED5P6aI2dvVJ7uR8j31A",
    "client_secret": "YOUR_CLIENT_SECRET"
}

response = requests.post(token_url, data=data)  # data=, not json=
token_data = response.json()

if response.status_code == 200:
    access_token = token_data["access_token"]
    print(f"Access token: {access_token}")
else:
    print(f"Token exchange failed: {token_data}")
```

### Step 3: Use the Access Token

Once you have the access token, use it to make authenticated API calls:

```javascript
// Example API call
const apiResponse = await fetch('http://10.5.216.11:4800/api/v1/your-endpoint', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

## Common Mistakes to Avoid

❌ **Sending JSON instead of form data:**
```javascript
// WRONG
fetch('/api/v1/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },  // ❌
  body: JSON.stringify({ grant_type: '...', code: '...' })  // ❌
})
```

✅ **Correct way:**
```javascript
// RIGHT
const params = new URLSearchParams({ grant_type: '...', code: '...' });
fetch('/api/v1/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },  // ✅
  body: params.toString()  // ✅
})
```

❌ **Missing grant_type parameter:**
```javascript
// WRONG
body: JSON.stringify({ code: code, client_id: '...' })  // Missing grant_type!
```

✅ **Correct way:**
```javascript
// RIGHT
body: JSON.stringify({ grant_type: 'authorization_code', code: code, ... })  // ✅
```

## Test the Token Exchange

Use this curl command to test:

```bash
curl -X POST http://10.5.216.11:4800/api/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencodedchar" \
  -d "grant_type=authorization_code" \
  -d "code=WLFuPPdf6W_wbWyjAGv2-jz9LQGZTT1StS5U26Reb08" \
  -d "redirect_uri=http://10.5.216.11:3200/auth/oauth/callback" \
  -d "client_id=iBED5P6aI2dvVJ7uR8j31A" come \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

## Expected Success Response

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## Authorization Code Expiry

⚠️ **Important**: Authorization codes expire after **10 minutes**. 

You must exchange the code for a token quickly after receiving it from the callback.

## Complete Flow Diagram

```
1. User clicks "Login with OAuth" on your external app
   ↓
2. User redirected to: 
   http://10.5.216.11:4800/api/v1/oauth/authorize?response_type=code&client_id=...&redirect_uri=...&state=...
   ↓
3. User logs in on authorization page
   ↓
4. User redirected back to your callback:
   http://10.5.216.11:3200/auth/oauth/callback?code=WLFuPPdf6W_wbWyjAGv2-jz9LQGZTT1StS5U26Reb08&state=...
   ↓
5. Your app extracts the code
   ↓
6. Your app exchanges code for access token ⭐ (Current step - see code above)
   ↓
7. Your app stores the access token
   ↓
8. Your app uses the token to make API calls
```

## Next Steps

1. Extract the `code` from your callback URL
2. Exchange it for a token using the correct format (see Step 2)
3. Store and use the access token for authenticated requests

## Need Help?

If you're still having issues after following this guide, check:
- Is the `client_secret` correct? (Check admin panel at http://10.5.216.11:4800/admin/oauth)
- Is the `redirect_uri` exactly matching the registered URI?
- Are you sending `grant_type=authorization_code`?
- Are you using form-encoded data, not JSON?


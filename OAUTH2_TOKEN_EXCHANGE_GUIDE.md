# OAuth2 Token Exchange - Fix for Missing grant_type Error

## Problem

The external app is receiving this error when trying to exchange the authorization code for an access token:

```json
{
  "detail": "OAuth authentication failed: Failed to exchange code for token: {
    \"error\":\"Validation error\",
    \"details\":[{
      \"type\":\"missing\",
      \"loc\":[\"body\",\"grant_type\"],
      \"msg\":\"Field required\",
      \"input\":null,
      \"url\":\"https://errors.pydantic.dev/2.5/v/missing\"
    }],
    \"path\":\"/api/v1/oauth/token\"
  }"
}
```

## Root Cause

The `/api/v1/oauth/token` endpoint expects **form-encoded data** (not JSON), and the `grant_type` parameter is **required**.

## Solution

### Correct Request Format

The external app must make a `POST` request to `http://10.5.216.11:4800/api/v1/oauth/token` with:

1. **Content-Type**: `application/x-www-form-urlencoded` (not JSON)
2. **Body parameters** (form-encoded):
   - `grant_type` = `"authorization_code"` (required)
   - `code` = the authorization code received from the redirect
   - `redirect_uri` = the same redirect URI used in the authorization request
   - `client_id` = your OAuth client ID
   - `client_secret` = your OAuth client secret

### Example Implementation in Different Languages

#### Python (using requests)

```python
import requests

# After receiving the code in the callback
code = request.args.get('code')
state = request.args.get('state')

# Exchange code for token
token_url = "http://10.5.216.11:4800/api/v1/oauth/token"
data = {
    "grant_type": "authorization_code",  # REQUIRED!
    "code": code,
    "redirect_uri": "http://10.5.216.11:3200/auth/oauth/callback",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
}

response = requests.post(token_url, data=data)  # Note: data=, not json=
token_data = response.json()

access_token = token_data.get("access_token")
```

#### JavaScript (using fetch)

```javascript
// After receiving the code in the callback
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');

// Exchange code for token
const tokenUrl = 'http://10.5.216.11:4800/api/v1/oauth/token';
const params = new URLSearchParams({
    grant_type: 'authorization_code',  // REQUIRED!
    code: code,
    redirect_uri: 'http://10.5.216.11:3200/auth/oauth/callback',
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET'
});

const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'  // Important!
    },
    body: params.toString()  // Use params.toString(), not JSON.stringify()
});

const tokenData = await response.json();
const accessToken = tokenData.access_token;
```

#### cURL

```bash
curl -X POST http://10.5.216.11:4800/api/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_AUTHORIZATION_CODE" \
  -d "redirect_uri=http://10.5.216.11:3200/auth/oauth/callback" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

## Complete OAuth2 Flow

1. **User initiates login** on external app
2. **External app redirects** user to:
   ```
   http://10.5.216.11:4800/api/v1/oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=http://10.5.216.11:3200/auth/oauth/callback&state=RANDOM_STATE
   ```
3. **User logs in** on the authorization page
4. **User is redirected back** to external app with code:
   ```
   http://10.5.216.11:3200/auth/oauth/callback?code=AUTHORIZATION_CODE&state=RANDOM_STATE
   ```
5. **External app exchanges code for token** (using the format above) ⭐
6. **External app uses access_token** to make API calls

## Common Mistakes

❌ **Wrong**: Sending JSON body
```javascript
body: JSON.stringify({ grant_type: 'authorization_code', code: '...' })
```

✅ **Right**: Sending form-encoded body
```javascript
body: params.toString()  // where params is URLSearchParams
```

❌ **Wrong**: Missing grant_type parameter
```javascript
body: params.toString()  // params doesn't include grant_type
```

✅ **Right**: Including grant_type
```javascript
params.set('grant_type', 'authorization_code')
```

## Testing

To test the token exchange manually:

```bash
# Replace with actual values from your OAuth client
curl -X POST http://10.5.216.11:4800/api/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=ACTUAL_AUTHORIZATION_CODE_FROM_REDIRECT" \
  -d "redirect_uri=http://10.5.216.11:3200/auth/oauth/callback" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

## Expected Response

If successful, you'll receive:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## Troubleshooting

- **403 Forbidden**: Check that `redirect_uri` exactly matches the registered URI
- **400 Invalid credentials**: Verify `client_id` and `client_secret` are correct
- **400 Invalid or expired code**: The authorization code expires after 10 minutes
- **400 Missing grant_type**: You're not sending the request in the correct format (see examples above)

## Summary

The key fix is to ensure your external app:
1. ✅ Sets `Content-Type: application/x-www-form-urlencoded`
2. ✅ Includes `grant_type=authorization_code` in the request body
3. ✅ Sends data as form-encoded (not JSON)


# CRITICAL FIX REQUIRED - OAuth Token Exchange

## Current Status
The OAuth authorization flow completes successfully, but the **token exchange is failing** because your external app is sending the request in the wrong format.

## The Problem
Your external app is receiving this code:
```
http://10.5.216.11:3200/auth/oauth/callback?code=7N2QzQoSvtMg7zUa_mte0jt65YSWcbBSHwh-vPCu4qo&state=YwGtaHGCbEw7VdMzSgTRhHWqIe92C_OEptptJrEU7vI
```

But when trying to exchange it for an access token, the request fails with:
```json
{"error":"Validation error","details":[{"type":"missing","loc":["body","grant_type"],"msg":"Field required"}]}
```

## Root Cause
The OAuth server expects **form-encoded data**, but your app is likely sending **JSON**.

## The Fix

### Your Current Code (Probably):
```javascript
// ❌ WRONG
fetch('http://10.5.216.11:4800/api/v1/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: code,
    client_id: 'iBED5P6aI2dvVJ7uR8j31A',
    client_secret: 'YOUR_SECRET'
  })
})
```

### Correct Code:
```javascript
// ✅ CORRECT
const data = new URLSearchParams({
  grant_type: 'authorization_code',  // MUST include this!
  code: '7N2QzQoSvtMg7zUa_mte0jt65YSWcbBSHwh-vPCu4qo',  // From callback URL
  redirect_uri: 'http://10.5.216.11:3200/auth/oauth/callback',
  client_id: 'iBED5P6aI2dvVJ7uR8j31A',
  client_secret: 'YOUR_CLIENT_SECRET'
});

fetch('http://10.5.216.11:4800/api/v1/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: data.toString()  // Use toString(), not JSON.stringify()
});
```

## Key Changes Needed:
1. ✅ Add `grant_type: 'authorization_code'` parameter
2. ✅ Change Content-Type to `application/x-www-form-urlencoded`
3. ✅ Use `URLSearchParams` and call `.toString()`
4. ✅ Use `body: data.toString()` instead of `body: JSON.stringify(data)`

## Test Command
To verify it works, run this in your terminal:
```bash
curl -X POST http://10.5.216.11:4800/api/v1/oauth/token \
  -H "Content-Type: application/x-ÎÎwww-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=7N2QzQoSvtMg7zUa_mte0jt65YSWcbBSHwh-vPCu4qo" \
  -d "redirect_uri=http://10.5.216.11:3200/auth/oauth/callback" \
  -d "client_id=iBED5P6aI2dvVJ7uR8j31A" \
  -d "client_secret=YOUR_SECRET_HERE"
```

## Expected Success Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## Summary of Issue

The authorization flow is working correctly:
- ✅ User is redirected to authorization page
- ✅ User logs in successfully
- ✅ Authorization code is generated
- ✅ User is redirected back to your app with the code
- ❌ **Token exchange fails** because request format is wrong

The fix is simple: add `grant_type` and use form-encoded data instead of JSON.

See **OAUTH2_TOKEN_EXCHANGE_GUIDE.md** for complete examples in Python, JavaScript, and cURL.


# OAuth Setup & "Browser Signin Disabled" Fix

## Issue: "The user turned off browser signin"

This error occurs when Chrome's sync feature is disabled. The extension now handles this automatically using an alternative OAuth flow.

## How It Works

### Automatic Fallback System

The extension tries two methods in order:

1. **Method 1: `chrome.identity.getAuthToken`** (requires Chrome sync)
   - Fast and seamless
   - Uses cached credentials
   - **Only works if Chrome sync is enabled**

2. **Method 2: `chrome.identity.launchWebAuthFlow`** (works always)
   - Opens a popup window for Google sign-in
   - Works without Chrome sync
   - Automatically triggered when Method 1 fails

## What You'll See

### First Upload Attempt

**In Background Console:**
```
[Google Drive] Starting upload process...
[Google Drive] Chrome sync disabled, using web auth flow
[Google Drive] Launching web auth flow...
[Google Drive] Redirect URL: https://[extension-id].chromiumapp.org/
```

**In Browser:**
- A popup window will open
- Google sign-in page appears
- Select your Google account
- Grant Drive permissions
- Window closes automatically

**After Success:**
```
[Google Drive] Successfully obtained access token via web auth flow
[Google Drive] Authentication successful
[Google Drive] Campaign folder ready: [folder-id]
[Google Drive] File uploaded successfully
```

### Subsequent Uploads

The token is cached, so you won't see the popup again unless:
- Token expires (usually 1 hour)
- You clear browser data
- You remove and reinstall the extension

## Troubleshooting

### Popup Window Doesn't Appear

**Check:**
1. Popup blockers are disabled for Chrome
2. Background console shows: `[Google Drive] Launching web auth flow...`
3. No console errors about redirect URL

**Solution:**
- Disable popup blockers
- Check Google Cloud Console OAuth configuration

### Popup Closes Immediately

**Common causes:**
- Invalid Client ID in manifest.json
- Wrong redirect URL in Google Cloud Console
- Drive API not enabled

**Solution:**
1. Verify Client ID: `921175753325-c4u5j10qlfpjo9tst0r7qe1f8n8c7vhn.apps.googleusercontent.com`
2. Check Google Cloud Console settings (see below)

### "Redirect URI mismatch" Error

**What it means:**
The redirect URL in Google Cloud Console doesn't match the extension's ID.

**Solution:**
1. Get extension ID from `chrome://extensions/`
2. Go to Google Cloud Console → APIs & Services → Credentials
3. Click OAuth 2.0 Client ID
4. Add to "Authorized redirect URIs":
   ```
   https://[your-extension-id].chromiumapp.org/
   ```
5. Replace `[your-extension-id]` with actual ID (e.g., `abcdefghijklmnopqrstuvwxyz`)
6. Save and reload extension

## Google Cloud Console Setup

### Enable Google Drive API

1. Go to: https://console.cloud.google.com/
2. Select your project (or create new)
3. Navigate to: **APIs & Services → Library**
4. Search: "Google Drive API"
5. Click "Enable"

### Configure OAuth Consent Screen

1. Navigate to: **APIs & Services → OAuth consent screen**
2. Choose "External" (for testing) or "Internal" (if G Workspace)
3. Fill required fields:
   - App name: "GMV Max Campaign Navigator"
   - User support email: Your email
   - Developer contact: Your email
4. Add scopes:
   - `.../auth/drive.file` (Create and modify files in Drive)
5. Add test users (your email)
6. Save

### Create OAuth 2.0 Credentials

1. Navigate to: **APIs & Services → Credentials**
2. Click: **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Chrome extension**
4. Name: "GMV Max Extension"
5. Extension ID: Get from `chrome://extensions/`
6. Click "Create"
7. Copy the Client ID
8. Update `manifest.json`:
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "scopes": ["https://www.googleapis.com/auth/drive.file"]
   }
   ```

### Add Redirect URI (Important!)

1. In the OAuth Client configuration
2. Under "Authorized redirect URIs", add:
   ```
   https://[extension-id].chromiumapp.org/
   ```
3. Example: `https://abcdefghijklmnop.chromiumapp.org/`
4. Save changes

## Testing OAuth Flow

### Manual Test in Background Console

```javascript
// Test web auth flow directly
chrome.identity.getRedirectURL(); // Should show: https://[id].chromiumapp.org/

// Test authentication
chrome.identity.launchWebAuthFlow(
  {
    url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=921175753325-c4u5j10qlfpjo9tst0r7qe1f8n8c7vhn.apps.googleusercontent.com&response_type=token&redirect_uri=' + chrome.identity.getRedirectURL() + '&scope=https://www.googleapis.com/auth/drive.file',
    interactive: true
  },
  console.log
);
```

Expected result:
- Popup opens with Google sign-in
- After auth, console shows response URL with access token
- Example: `https://[id].chromiumapp.org/#access_token=ya29....&expires_in=3599`

## Security Notes

### Token Storage

- Access tokens are **NOT** stored permanently
- Tokens are held in memory during upload process
- Tokens expire after ~1 hour
- Re-authentication happens automatically

### Permissions

The extension only requests:
- `drive.file` scope - Can only access files it creates
- **Cannot** read/modify your existing Drive files
- **Cannot** access files created by other apps

### Privacy

- No data is sent to external servers (except Google Drive API)
- Authentication happens directly with Google
- Extension ID and Client ID are public (not secrets)

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "The user turned off browser signin" | Chrome sync disabled | Automatic fallback to web auth flow |
| "Redirect URI mismatch" | Wrong redirect URL | Add correct URI in Cloud Console |
| "Invalid client ID" | Wrong Client ID in manifest | Verify Client ID matches Cloud Console |
| "Access denied" | User clicked "Cancel" | Try upload again, click "Allow" |
| "API not enabled" | Drive API disabled | Enable in Cloud Console |
| "Popup blocked" | Browser popup blocker | Disable for Chrome |

## For Production Deployment

### Update Redirect URI

When publishing to Chrome Web Store:
1. Get final extension ID after publishing
2. Update redirect URI in Google Cloud Console
3. Extension ID changes between development and production
4. Users will need to re-authenticate after update

### Verification Status

- **Unverified**: Shows warning to users
- **Verified**: Requires domain ownership verification
- For internal use, unverified is fine
- For public distribution, submit for verification

### Rate Limits

Google Drive API has rate limits:
- 1,000 requests per 100 seconds per user
- 10,000 requests per day (free tier)
- For production, monitor usage in Cloud Console

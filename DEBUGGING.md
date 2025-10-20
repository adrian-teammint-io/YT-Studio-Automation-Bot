# Debugging Guide for Google Drive Upload Feature

## Prerequisites
1. Extension is loaded in Chrome (`chrome://extensions/`)
2. Developer mode is enabled
3. OAuth Client ID is configured in `manifest.json`

## How to Check Logs

### 1. Content Script Logs (Campaign Page)
**Where:** Open campaign page → Right-click → Inspect → Console

**Expected logs when auto-click works:**
```
[GMV Max Navigator] Initializing auto-click on GMV Max dashboard
[GMV Max Navigator] Attempt 1/10 to find export button
[GMV Max Navigator] Found export button by test ID
[GMV Max Navigator] Detecting downloaded file...
[GMV Max Navigator] Campaign info: { campaignId: "...", campaignName: "..." }
[GMV Max Navigator] Requesting background script to check downloads...
[GMV Max Navigator] Background script processing upload
```

**If you don't see these logs:**
- Auto-click is disabled in settings
- Export button selectors have changed
- Content script failed to load

### 2. Background Script Logs
**Where:** `chrome://extensions/` → Click "service worker" link under extension → Console

**Expected logs when upload triggers:**
```
[Background] Received CHECK_AND_UPLOAD_DOWNLOAD request
[Background] Checking recent downloads for campaign: CNT-...
[Background] Found Excel download: {...}
[Background] Reading downloaded file...
[Background] Fetching file from: blob:...
[Background] File fetched, size: XXXXX
[Background] Starting upload to Google Drive...
[Google Drive] Starting upload process...
[Google Drive] Authentication successful
[Google Drive] Campaign folder ready: ...
[Google Drive] File uploaded successfully: {...}
[Background] Upload successful: {...}
```

**Common errors to look for:**
- `No recent downloads found` - Export didn't trigger or file isn't downloaded yet
- `Download URL not available` - Chrome downloads API issue
- `Failed to get auth token` - OAuth not configured or user denied permission
- `Failed to upload file` - Google Drive API error

### 3. Popup Logs
**Where:** Right-click extension icon → Inspect popup → Console

**Expected logs:**
```
Upload status updates from chrome.storage
Toast notifications appearing
```

## Testing Checklist

### Step 1: Verify Content Script Loads
1. Navigate to: `https://ads.tiktok.com/i18n/gmv-max/dashboard?campaign_id=...`
2. Open Console (F12)
3. Look for: `[GMV Max Navigator] Initializing auto-click`
4. ✅ If present, content script is working

### Step 2: Verify Auto-Click
1. Watch the page after it loads
2. Export button should click automatically within 10 seconds
3. File should start downloading
4. Check Console for: `[GMV Max Navigator] Found export button by...`

### Step 3: Verify Download Detection
1. After file downloads, check Console for:
   - `[GMV Max Navigator] Detecting downloaded file...`
   - `[GMV Max Navigator] Requesting background script to check downloads...`
2. ✅ If present, detection is working

### Step 4: Verify Background Processing
1. Go to `chrome://extensions/`
2. Find extension → Click "service worker"
3. Look for:
   - `[Background] Received CHECK_AND_UPLOAD_DOWNLOAD request`
   - `[Background] Found Excel download`
4. ✅ If present, background script is processing

### Step 5: Verify Google Drive Upload
1. In background service worker console, look for:
   - `[Google Drive] Starting upload process...`
   - `[Google Drive] Authentication successful` (may prompt for OAuth)
   - `[Google Drive] File uploaded successfully`
2. Check Google Drive test folder: `GMV_Max_Campaign_Navigator_TEST`
3. ✅ If file appears in folder structure, upload is working

### Step 6: Verify UI Feedback
1. Open extension popup
2. Look for upload status icons next to campaigns:
   - 🔵 Blue spinner = Uploading
   - ✅ Green check = Success
   - ❌ Red X = Failed
3. Check for toast notifications

## Common Issues & Solutions

### Issue: No logs in content script
**Solution:**
- Reload extension in `chrome://extensions/`
- Refresh the campaign page
- Check if URL matches pattern in manifest: `https://ads.tiktok.com/i18n/gmv-max/dashboard*`

### Issue: "No recent downloads found"
**Solution:**
- Increase `DOWNLOAD_DETECTION_DELAY` in `content.ts` (currently 3000ms)
- Manually download a test file and check if it appears in downloads
- Check downloads permission in manifest.json

### Issue: "Failed to get auth token" or "The user turned off browser signin"
**Solution:**
- This happens when Chrome sync is disabled
- The extension will automatically fallback to `launchWebAuthFlow`
- You'll see a popup window asking you to sign in to Google
- This is the **expected behavior** when Chrome sync is off
- Grant permissions when prompted
- Look for logs: `[Google Drive] Chrome sync disabled, using web auth flow`

**To verify OAuth is working:**
1. Check background console for: `[Google Drive] Successfully obtained access token via web auth flow`
2. If you see this, OAuth is working correctly even without Chrome sync

**If web auth flow fails:**
- Verify OAuth Client ID in manifest.json is correct
- Check that Google Drive API is enabled in Google Cloud Console
- Ensure redirect URL in Google Cloud Console includes: `https://<extension-id>.chromiumapp.org/`
- Try removing and re-adding the extension to reset OAuth state

### Issue: No UI indicators in popup
**Solution:**
- Check background service worker logs for upload status messages
- Verify `chrome.storage.local` is being updated (check in DevTools → Application → Storage)
- Ensure popup is listening to storage changes (check popup console)

### Issue: Upload succeeds but file not in Drive
**Solution:**
- Verify folder ID: `1B6YGbi5Nqp5LKpFEYxA4WHbFYKirX2Vx`
- Check if you have write access to the test folder
- Look for folder creation logs in background console
- Check Google Drive trash folder

## Manual Testing

### Test OAuth Flow
1. Open background service worker console
2. Run: `chrome.identity.getAuthToken({ interactive: true }, console.log)`
3. Should prompt for Google account selection
4. Should return token object

### Test Downloads API
1. Download any .xlsx file manually
2. Open background service worker console
3. Run:
```javascript
chrome.downloads.search({ orderBy: ["-startTime"], limit: 1 }, console.log)
```
4. Should show the downloaded file

### Test Region Detection
1. Open background service worker console
2. Run:
```javascript
// Assuming you have access to the function
console.log(detectRegionFromCampaign("CNT-Test_250521_US_ProductGMV"))
// Should return: { folderId: "1B6YGbi5Nqp5LKpFEYxA4WHbFYKirX2Vx", region: "TEST_US" }
```

## Debug Mode

To enable verbose logging, you can add this at the top of each script:

```javascript
const DEBUG = true;
if (DEBUG) console.log("[DEBUG]", ...args);
```

## Get Help

If you're still stuck, gather these details:
1. Console logs from content script (campaign page)
2. Console logs from background service worker
3. Console logs from popup
4. Screenshots of any error messages
5. Chrome version: `chrome://version/`
6. Extension manifest version (should be 3)

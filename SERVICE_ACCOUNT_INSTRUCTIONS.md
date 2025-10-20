# Service Account Setup Instructions

## ✅ Service Account Created

Your service account has been configured:
- **Email**: `gmv-max-automation-service-acc@gmv-max-campaign-navigator.iam.gserviceaccount.com`
- **Client ID**: `109308777765274452855`
- **Project**: `gmv-max-campaign-navigator`

## Required Steps to Complete Setup

### Step 1: Download Service Account Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts?project=gmv-max-campaign-navigator)
2. Find service account: `gmv-max-automation-service-acc@gmv-max-campaign-navigator.iam.gserviceaccount.com`
3. Click the service account
4. Go to **Keys** tab
5. Click **Add Key → Create new key**
6. Choose **JSON** format
7. Click **Create**
8. **Save the downloaded JSON file** (you'll need it in Step 3)

### Step 2: Share Google Drive Folders

Share the following folders with the service account email:

**Service Account Email:**
```
gmv-max-automation-service-acc@gmv-max-campaign-navigator.iam.gserviceaccount.com
```

**Folders to share:**

1. **Test Folder:**
   - Name: `GMV_Max_Campaign_Navigator_TEST`
   - ID: `1B6YGbi5Nqp5LKpFEYxA4WHbFYKirX2Vx`
   - [Open in Drive](https://drive.google.com/drive/folders/1B6YGbi5Nqp5LKpFEYxA4WHbFYKirX2Vx)

2. **US Folder:**
   - Name: `2.WEST_US`
   - ID: `1kyao3_UQjYFuzjKDGmf66QpDsYn9dM_p`
   - [Open in Drive](https://drive.google.com/drive/folders/1kyao3_UQjYFuzjKDGmf66QpDsYn9dM_p)

3. **PH Folder:**
   - Name: `1.EAST_PH`
   - ID: `1nX2nVy-Oa2r9o-tke9EIci-Za7iCxl48`
   - [Open in Drive](https://drive.google.com/drive/folders/1nX2nVy-Oa2r9o-tke9EIci-Za7iCxl48)

4. **MY Folder:**
   - Name: `1.EAST_MY`
   - ID: `1QPXQu2xHKi441YE_UhpXU_t37UJSA2cv`
   - [Open in Drive](https://drive.google.com/drive/folders/1QPXQu2xHKi441YE_UhpXU_t37UJSA2cv)

5. **ID Folder:**
   - Name: `1.EAST_ID`
   - ID: `1NGFgCLmFu1If39D8XQnolOV5t1zPVrRm`
   - [Open in Drive](https://drive.google.com/drive/folders/1NGFgCLmFu1If39D8XQnolOV5t1zPVrRm)

**How to share each folder:**
1. Open the folder in Google Drive
2. Click **Share** button
3. Paste the service account email
4. Set permission to **Editor**
5. Uncheck "Notify people" (service accounts don't get emails)
6. Click **Share**

### Step 3: Add Credentials to Extension

1. Open the JSON file you downloaded in Step 1
2. Copy its contents
3. Open file: `extension/config/service-account.ts`
4. Replace the placeholder values with data from your JSON:
   - Find `private_key_id` in JSON → paste into `.ts` file
   - Find `private_key` in JSON → paste into `.ts` file (keep the quotes and newlines)

**Example of what to update:**

```typescript
export const SERVICE_ACCOUNT: ServiceAccountConfig = {
  type: "service_account",
  project_id: "gmv-max-campaign-navigator",
  private_key_id: "PASTE_YOUR_ACTUAL_KEY_ID_HERE", // ← Update this
  private_key: "-----BEGIN PRIVATE KEY-----\nPASTE_YOUR_ACTUAL_KEY_HERE\n-----END PRIVATE KEY-----\n", // ← Update this
  client_email: "gmv-max-automation-service-acc@gmv-max-campaign-navigator.iam.gserviceaccount.com",
  client_id: "109308777765274452855",
  // ... rest stays the same
};
```

**⚠️ IMPORTANT:**
- Keep the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` markers
- Keep the `\n` characters (these represent newlines)
- The private key should be one long string with `\n` separating lines

### Step 4: Enable Google Drive API

1. Go to [Google Cloud Console APIs](https://console.cloud.google.com/apis/library?project=gmv-max-campaign-navigator)
2. Search for "Google Drive API"
3. Click on it
4. Click **Enable** (if not already enabled)
5. Wait for confirmation

### Step 5: Build and Test

```bash
# Build the extension
npm run build:extension

# Load in Chrome
# 1. Go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the `dist` folder
```

## Verification

### Expected Behavior

**When clicking a campaign:**
1. Navigate to campaign page ✓
2. Auto-click export button ✓
3. File downloads ✓
4. **NEW**: Upload happens automatically (no popup) ✓
5. Success indicator appears in popup ✓

### Console Logs

**Background service worker** should show:
```
[Google Drive] Authenticating with service account...
[Google Drive] Service account email: gmv-max-automation-service-acc@...
[Google Drive] JWT assertion created
[Google Drive] Access token obtained successfully
[Google Drive] Authentication successful
[Google Drive] Campaign folder ready: [folder-id]
[Google Drive] File uploaded successfully: {...}
```

### If Authentication Fails

**Error: "Invalid JWT Signature"**
- Private key not copied correctly
- Check for missing/extra characters
- Ensure `\n` characters are preserved

**Error: "Permission denied"**
- Folder not shared with service account
- Check email address is exact match
- Permission must be "Editor", not "Viewer"

**Error: "API not enabled"**
- Google Drive API not enabled
- Go to Cloud Console → Enable API

**Error: "Cannot import key"**
- Private key format incorrect
- Check PEM header/footer are present
- Ensure no extra whitespace

## Security Notes

### File: `extension/config/service-account.ts`

**🚨 THIS FILE CONTAINS SENSITIVE CREDENTIALS 🚨**

- **Never commit to git** (already in .gitignore)
- **Never share publicly**
- **Keep backup in secure location**
- **Can revoke and regenerate if compromised**

### Credentials Can Only:
- ✅ Upload files to shared folders
- ✅ Create subfolders in shared folders
- ❌ Cannot access your personal Drive
- ❌ Cannot access other folders
- ❌ Cannot delete existing files (unless in shared folders)

### If Credentials Are Compromised:
1. Go to Cloud Console → Service Accounts
2. Delete the compromised key
3. Create new key
4. Update extension with new credentials
5. Files already uploaded are safe

## Testing

### Test Upload Flow

1. Load extension in Chrome
2. Configure campaigns in settings
3. Click a campaign
4. Watch console logs:
   - Content script: Export button clicked
   - Background: File detected
   - Background: Service account auth (no popup!)
   - Background: Upload success
5. Check test folder in Google Drive

### Verify No Popup Appears

- Previous: OAuth popup window opens
- **Now: Upload happens silently in background**

## Troubleshooting

### Build Errors

**Error: `Cannot find module './config/service-account'`**

Solution:
1. Make sure `extension/config/service-account.ts` exists
2. Check you updated the placeholder values
3. Run `npm run build:extension` again

### Runtime Errors

**Error: `SERVICE_ACCOUNT is not defined`**

Solution:
1. Check import statement in `google-drive.ts`
2. Verify file exists and has correct export

**Error: `Failed to parse auth response`**

Solution:
1. Check JSON format in service-account.ts
2. Verify private key has proper PEM format
3. Check for copy/paste errors

## Production Deployment

### Before Publishing:

1. **Test thoroughly** with test folder first
2. **Update region mappings** in `extension/utils/region-detector.ts`
   - Uncomment production folder IDs
   - Comment out test folder ID
3. **Share production folders** with service account
4. **Rebuild extension** after changing folder IDs
5. **Distribute to team** via Chrome Web Store or direct installation

### Distribution Options:

**Option A: Chrome Web Store (Public)**
- Package extension as .zip
- Submit to Chrome Web Store
- Team installs from store
- ⚠️ Everyone can see/extract extension code (including credentials)

**Option B: Private Distribution (Recommended)**
- Share .zip file directly with team
- Team loads as unpacked extension
- Better security (credentials not public)
- Requires "Developer mode" enabled

**Option C: Enterprise Managed**
- Use Chrome Enterprise policies
- Force-install extension to managed devices
- Best security and control
- Requires G Workspace Enterprise

## Next Steps

1. ✅ Download service account JSON key
2. ✅ Share all 5 Drive folders with service account
3. ✅ Update `extension/config/service-account.ts` with credentials
4. ✅ Enable Google Drive API
5. ✅ Build extension: `npm run build:extension`
6. ✅ Test with test folder first
7. ✅ Switch to production folders when ready

Need help? Check the console logs and refer to the troubleshooting section above.

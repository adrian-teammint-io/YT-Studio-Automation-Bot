# Google Drive Folder Access Troubleshooting Guide

## Current Folder Structure

Based on your URLs, your structure should be:

```
📁 GMV_Max_Automation (Shared Drive)
│   ID: 0AK422qI5QsUUUk9PVA
│
├── 📁 2.WEST_US
│   │   ID: 13lPkdut0NT3IJ881H30eGfc7hwNctvfQ
│   └── (Campaign folders will be created here)
│
├── 📁 1.EAST_PH
│   │   ID: 1HUY24amItYGEnTE2TTemzDuX1DeRmmcu
│   └── (Campaign folders will be created here)
│
├── 📁 1.EAST_MY
│   │   ID: 1iXfMl3rdukxRI1fnJ0qhQjS6ZL82HzDf
│   └── (Campaign folders will be created here)
│
└── 📁 1.EAST_ID
    │   ID: 1Ct0DX06OKqJmpbaB5q6Xlnwu1UHKYjOV
    └── (Campaign folders will be created here)
```

## ⚠️ Common Issue: 404 Error Despite Admin Access

### Why This Happens

The 404 error occurs when:
1. ❌ Service account was given access to **individual folders** only
2. ❌ Service account is NOT a member of the **Shared Drive itself**
3. ❌ Permissions haven't propagated yet (can take 5-10 minutes)

### ✅ Correct Solution

The service account must be added as a **member of the entire Shared Drive**, not individual folders.

## Step-by-Step Fix

### Step 1: Find Your Service Account Email

Your service account email is in the format:
```
[something]@[project-id].iam.gserviceaccount.com
```

You can find it in:
- `extension/config/service-account.ts` file
- Google Cloud Console → IAM & Admin → Service Accounts

### Step 2: Add Service Account to Shared Drive

1. **Open Google Drive** (as admin who owns the Shared Drive)
   - Go to https://drive.google.com

2. **Navigate to Shared Drives**
   - Click "Shared drives" in the left sidebar
   - Find "GMV_Max_Automation"

3. **Add Member**
   - Right-click on "GMV_Max_Automation_TEST" Shared Drive
   - Select "Manage members"
   - Click "Add members"

4. **Enter Service Account Email**
   - Paste your service account email
   - Select role: **"Content manager"** or **"Manager"**
   - Click "Send"

5. **Wait for Propagation**
   - Permissions can take 5-10 minutes to propagate
   - Don't test immediately after adding

### Step 3: Verify All Folders Are In Shared Drive

For each folder (2.WEST_US, 1.EAST_PH, 1.EAST_MY, 1.EAST_ID):

1. Open the folder in Google Drive
2. Check the breadcrumb path at the top:
   - ✅ Should show: `Shared drives > GMV_Max_Automation > [folder name]`
   - ❌ If it shows: `My Drive > ...` - **WRONG! Not a Shared Drive folder**

3. If any folder is in "My Drive":
   - Create the folder inside the Shared Drive instead
   - Update the folder ID in `extension/utils/region-detector.ts`

## What Changed in the Code

I've updated the code to properly handle Shared Drive folders:

1. **Added `getSharedDriveId()` function**
   - Retrieves the Shared Drive ID from folder metadata

2. **Updated all API calls**
   - Now include `driveId` and `corpora=drive` parameters
   - This tells Google Drive API which Shared Drive to search in

3. **Better error messages**
   - Logs show whether folders are in Shared Drives
   - Easier to diagnose permission issues

## Testing the Fix

### Option 1: Run the Extension

1. Reload the extension in Chrome
2. Try uploading a campaign report
3. Check the browser console for these logs:

```
[Google Drive] - Drive ID: [some-id]           ← Should show a Drive ID
[Google Drive] - Is Shared Drive: true         ← Should be true
[Google Drive] Parent folder is in Shared Drive: [drive-id]
```

If you see:
- `Drive ID: N/A (My Drive)` → **Problem**: Folder is not in a Shared Drive
- `Is Shared Drive: false` → **Problem**: Folder is not in a Shared Drive
- `403` error → **Problem**: Service account doesn't have access
- `404` error → **Problem**: Service account not added to Shared Drive

### Option 2: Manual API Test (Advanced)

Use the `test-folder-access.js` script I created:

1. Get an access token (run extension and check console logs)
2. Update the token in `test-folder-access.js`
3. Run: `node test-folder-access.js`
4. Check which folders are accessible

## Verification Checklist

- [ ] Service account is a **member** of "GMV_Max_Automation" Shared Drive
- [ ] Service account has **"Content Manager"** or **"Manager"** role
- [ ] All region folders (2.WEST_US, etc.) are **inside** the Shared Drive
- [ ] Waited at least **5-10 minutes** after granting access
- [ ] Folder IDs in `region-detector.ts` match the actual folder IDs
- [ ] Extension code has been rebuilt (`npm run build`)
- [ ] Extension has been reloaded in Chrome

## Still Having Issues?

### Check These:

1. **Folder IDs Match**
   - Open each folder in browser
   - URL should be: `https://drive.google.com/drive/folders/[ID]`
   - Compare [ID] with what's in `extension/utils/region-detector.ts`

2. **Service Account Email is Correct**
   - Check `extension/config/service-account.ts`
   - Email format: `[name]@[project].iam.gserviceaccount.com`

3. **Permission Propagation**
   - Wait 10-15 minutes after adding member
   - Try again

4. **Check Browser Console**
   - Look for detailed error messages
   - Share them if you need more help

## Expected Behavior After Fix

When uploading works correctly, you'll see:

```
[Google Drive] ✅ Folder access verified
[Google Drive] - Folder name: 2.WEST_US
[Google Drive] - Is Shared Drive: true
[Google Drive] - Drive ID: [some-drive-id]
[Google Drive] Parent folder is in Shared Drive: [drive-id]
[Google Drive] Creating new folder: [Campaign Name]
[Google Drive] ✅ File verified in Drive - upload succeeded!
```

## Contact

If you're still having issues after following this guide:
1. Check the browser console for error messages
2. Run `test-folder-access.js` to diagnose
3. Share the console logs for further assistance

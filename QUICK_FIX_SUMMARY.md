# Quick Fix Summary - Google Drive 404 Error

## ✅ What I Fixed

### Problem
- Getting 404 error: "File not found: 13lPkdut0NT3IJ881H30eGfc7hwNctvfQ"
- Even though admin granted access to the Shared Drive

### Root Cause
- Code wasn't passing `driveId` parameter to Google Drive API
- Without `driveId`, the API searches globally and can't find folders in Shared Drives
- Service accounts require explicit Shared Drive scoping in API calls

### Solution Implemented
Updated `extension/services/google-drive.ts` to:
1. Extract `driveId` from folder metadata
2. Pass `driveId` to all search/query operations
3. Add `corpora=drive` parameter to scope searches to specific Shared Drive

## 📋 Folder IDs Verified

All your folder IDs are correctly configured:

| Folder Name | Folder ID | Status |
|------------|-----------|--------|
| 2.WEST_US | `13lPkdut0NT3IJ881H30eGfc7hwNctvfQ` | ✅ Match |
| 1.EAST_PH | `1HUY24amItYGEnTE2TTemzDuX1DeRmmcu` | ✅ Match |
| 1.EAST_MY | `1iXfMl3rdukxRI1fnJ0qhQjS6ZL82HzDf` | ✅ Match |
| 1.EAST_ID | `1Ct0DX06OKqJmpbaB5q6Xlnwu1UHKYjOV` | ✅ Match |

## ⚠️ Critical Next Step: Verify Service Account Access

**The admin must add the service account as a MEMBER of the Shared Drive itself.**

### How to Check:

1. Go to Google Drive: https://drive.google.com
2. Click "Shared drives" (left sidebar)
3. Find "GMV_Max_Automation"
4. Right-click → "Manage members"
5. Verify your service account email is in the member list
6. Role should be: **"Content Manager"** or **"Manager"**

### If NOT in member list:

1. Click "Add members"
2. Enter your service account email (from `service-account.ts`)
3. Select role: **"Content Manager"**
4. Click "Send"
5. **Wait 5-10 minutes** for permissions to propagate

## 🧪 Testing

### Method 1: Try the Extension

1. Reload extension in Chrome
2. Try uploading a campaign
3. Check console logs for:
   ```
   [Google Drive] ✅ Folder access verified
   [Google Drive] - Drive ID: [some-id-here]
   [Google Drive] - Is Shared Drive: true
   ```

### Method 2: Run Diagnostic Script

```bash
node test-folder-access.js
```

(You'll need to add your access token to the script first)

## 🎯 Expected Results

### Success Indicators:
- ✅ Logs show "Is Shared Drive: true"
- ✅ Logs show a Drive ID (not "N/A")
- ✅ Files upload successfully
- ✅ No 404 or 403 errors

### Failure Indicators:
- ❌ "Is Shared Drive: false" → Folders not in Shared Drive
- ❌ "Drive ID: N/A (My Drive)" → Folders in wrong location
- ❌ 403 error → Service account lacks permissions
- ❌ 404 error → Service account not a member of Shared Drive

## 📁 Files Changed

1. `extension/services/google-drive.ts`
   - Added `getSharedDriveId()` function
   - Updated `findFolder()` to accept `driveId`
   - Updated `checkFileExists()` to accept `driveId`
   - Updated `uploadFile()` to accept `driveId`
   - Updated `uploadToGoogleDrive()` to extract and pass `driveId`

2. `test-folder-access.js` (NEW)
   - Diagnostic script to test folder access

3. `FOLDER_ACCESS_GUIDE.md` (NEW)
   - Detailed troubleshooting guide

## 🔄 Next Actions

1. **Verify service account is a member** of "GMV_Max_Automation" Shared Drive
2. **Wait 5-10 minutes** after adding member (if just added)
3. **Reload extension** in Chrome
4. **Try uploading** a campaign report
5. **Check console logs** for success messages

## 📞 If Still Having Issues

Share these details:
1. Console log output from upload attempt
2. Whether service account appears in Shared Drive members
3. Service account role (Content Manager, Manager, etc.)
4. How long since permissions were granted

---

**Build Status**: ✅ Extension built successfully
**Folder IDs**: ✅ All verified correct
**Code Changes**: ✅ Shared Drive support added
**Ready to Test**: ✅ After verifying service account membership

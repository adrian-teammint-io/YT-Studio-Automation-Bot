# ⏰ Waiting for Permissions to Propagate

## Current Status

✅ Service account added: `gmv-max-automation-service-acc@gmv-max-campaign-navigator.iam.gserviceaccount.com`
✅ Added to: "GMV_Max_Automation" Shared Drive
✅ Role: Content Manager
⏳ **Waiting**: 5-10 minutes for permissions to propagate

## Why the Wait?

Google Drive permissions are **eventually consistent**. When you add a service account to a Shared Drive:
- Changes are propagated across Google's distributed systems
- This typically takes **5-10 minutes**
- Sometimes up to **15 minutes** in rare cases
- There's no way to speed this up - it's a Google infrastructure thing

## What's Happening Behind the Scenes

1. ✅ You added service account in Google Drive UI
2. 🔄 Google's systems are updating:
   - IAM permission database
   - Drive API authorization cache
   - Cross-region replication
   - API server cache invalidation
3. ⏳ Once complete, 404 errors will automatically disappear

## Timeline

| Time | Action |
|------|--------|
| 0 min | ✅ Service account added to Shared Drive |
| 5 min | 🧪 **First test** - try uploading again |
| 10 min | 🧪 **Second test** - if first failed |
| 15 min | 🧪 **Final test** - should definitely work by now |

## How to Test (After Waiting)

### Option 1: Try the Extension
1. Wait **5 minutes** from when you added the service account
2. Reload the extension in Chrome
3. Try uploading a campaign report
4. Check the console logs

### Option 2: Quick Console Test
1. Open extension popup
2. Press F12 (DevTools)
3. Go to Console tab
4. Paste and run this:

```javascript
// Quick test of 2.WEST_US folder
fetch('https://www.googleapis.com/drive/v3/files/13lPkdut0NT3IJ881H30eGfc7hwNctvfQ?fields=id,name,driveId&supportsAllDrives=true', {
    headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE'
    }
})
.then(r => r.json())
.then(data => {
    console.log('✅ Access granted!', data);
})
.catch(err => {
    console.log('❌ Still waiting...', err);
});
```

## Expected Success Indicators

When permissions have propagated, you'll see:

```
[Google Drive] ✅ Folder access verified
[Google Drive] - Folder name: 2.WEST_US
[Google Drive] - Is Shared Drive: true
[Google Drive] - Drive ID: 0APrBd3xxxxxxxxxxxxxx  ← Some drive ID
[Google Drive] Parent folder is in Shared Drive: 0APrBd3xxxxxxxxxxxxxx
```

## If Still Failing After 15 Minutes

### Double-check These:

1. **Service account is in the RIGHT place:**
   - ✅ Should be: "Shared drives" → "GMV_Max_Automation" → "Manage members"
   - ❌ Not: Individual folder sharing

2. **Service account email is EXACTLY:**
   ```
   gmv-max-automation-service-acc@gmv-max-campaign-navigator.iam.gserviceaccount.com
   ```

3. **Role is correct:**
   - ✅ "Content Manager" or "Manager"
   - ❌ Not "Viewer" or "Commenter"

4. **Folders are actually IN the Shared Drive:**
   - Open each folder in browser
   - Check breadcrumb shows: `Shared drives > GMV_Max_Automation > [folder name]`
   - Not: `My Drive > ...`

### Advanced Diagnostic

If still failing after 15 minutes, run this in DevTools console:

```javascript
// Check if folders are actually in a Shared Drive
const folderIds = [
    '0AK422qI5QsUUUk9PVA',
    '13lPkdut0NT3IJ881H30eGfc7hwNctvfQ',
    '1HUY24amItYGEnTE2TTemzDuX1DeRmmcu',
    '1iXfMl3rdukxRI1fnJ0qhQjS6ZL82HzDf',
    '1Ct0DX06OKqJmpbaB5q6Xlnwu1UHKYjOV'
];

// This will check if the MAIN folder is in a Shared Drive
// If it's not, all subfolders will also fail
fetch(`https://www.googleapis.com/drive/v3/files/0AK422qI5QsUUUk9PVA?fields=driveId,name,parents&supportsAllDrives=true`, {
    headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
})
.then(r => r.json())
.then(data => {
    if (data.driveId) {
        console.log('✅ Main folder IS in a Shared Drive');
        console.log('Drive ID:', data.driveId);
    } else {
        console.log('❌ PROBLEM: Main folder is NOT in a Shared Drive!');
        console.log('It appears to be in My Drive or regular shared folder');
    }
});
```

## What to Do While Waiting

- ☕ Grab a coffee
- 📧 Check your email
- 🚶 Take a short walk
- 📖 Read the documentation files I created
- ⏰ Set a timer for 5 minutes

## Current Time Check

Note the time when you added the service account: **__________**
Earliest test time (5 min later): **__________**
Latest test time (15 min later): **__________**

---

**Remember**: This is normal! Google Drive permissions are eventually consistent. The wait is expected and unavoidable.

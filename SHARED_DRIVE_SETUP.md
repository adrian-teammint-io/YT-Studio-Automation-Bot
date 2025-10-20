# Shared Drive Setup Guide

## Why You're Seeing This Error

If you see this error:
```
Service Accounts do not have storage quota. Leverage shared drives instead.
```

This means your folder IDs in `extension/utils/region-detector.ts` are pointing to **regular "My Drive" folders** instead of **Shared Drive folders**.

## The Problem

Service accounts are "bot" accounts that don't have their own Google Drive storage. They can only:
- ✅ Upload to **Shared Drives** (Team Drives)
- ❌ Cannot upload to **My Drive** folders (even if shared with them)

## The Solution: 3 Steps

### Step 1: Create a Shared Drive

1. Open [Google Drive](https://drive.google.com/)
2. Click **Shared drives** in the left sidebar
3. Click **+ New** button
4. Name it: `GMV Max Campaign Navigator`
5. Click **Create**

### Step 2: Create Your Folder Structure

Inside the Shared Drive, create these folders:
```
GMV Max Campaign Navigator/
├── GMV_Max_Campaign_Navigator_TEST/
├── 2.WEST_US/
├── 1.EAST_PH/
├── 1.EAST_MY/
└── 1.EAST_ID/
```

### Step 3: Add Your Service Account

1. Right-click on the **Shared Drive name** (not individual folders)
2. Select **Manage members**
3. Click **Add members**
4. Paste your service account email:
   ```
   gmv-max-automation-service-acc@gmv-max-campaign-navigator.iam.gserviceaccount.com
   ```
5. Choose **Content Manager** role
6. Uncheck "Notify people"
7. Click **Send**

### Step 4: Update Folder IDs

1. Navigate to each folder in your Shared Drive
2. Copy the folder ID from the URL:
   ```
   https://drive.google.com/drive/folders/1B6YGbi5Nqp5LKpFEYxA4WHbFYKirX2Vx
                                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                            This is the folder ID
   ```
3. Update the folder IDs in `extension/utils/region-detector.ts`

## Verification Checklist

Before testing the extension, verify:

- [ ] You created a **Shared Drive** (not just a shared folder)
- [ ] All folders are **inside the Shared Drive**
- [ ] Service account email is added as **Content Manager** to the Shared Drive
- [ ] Folder IDs in `region-detector.ts` are from the Shared Drive folders
- [ ] You've rebuilt the extension: `npm run build`

## Testing

1. Reload the extension in Chrome
2. Navigate to a TikTok campaign page
3. Export a report
4. Check the Chrome DevTools console for logs
5. Verify the file appears in your Shared Drive folder

## Common Mistakes

### ❌ Wrong: Sharing "My Drive" folder with service account
```
My Drive/
└── GMV_Max_Reports/  ← Service account added here (WON'T WORK)
```

### ✅ Correct: Using Shared Drive
```
Shared drives/
└── GMV Max Campaign Navigator/  ← Service account added here (WORKS)
    └── GMV_Max_Reports/
```

## Troubleshooting

### Error: "storageQuotaExceeded"
**Cause:** Folder is in "My Drive", not Shared Drive
**Fix:** Move folders to Shared Drive and update folder IDs

### Error: "File not found" or "Insufficient Permission"
**Cause:** Service account not added to Shared Drive
**Fix:** Add service account as Content Manager to Shared Drive

### Error: "The user does not have sufficient permissions"
**Cause:** Service account has "Viewer" or "Commenter" role
**Fix:** Change to "Content Manager" or "Manager"

## Additional Resources

- [Google Drive API - Shared Drives](https://developers.google.com/drive/api/guides/about-shareddrives)
- [Service Account Authentication](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Managing Shared Drive Members](https://support.google.com/a/answer/7212025)

## Need Help?

If you're still having issues:
1. Check Chrome DevTools console for detailed error messages
2. Verify folder IDs are correct (from Shared Drive, not My Drive)
3. Confirm service account email in Shared Drive members list
4. Try uploading to the test folder first: `GMV_Max_Campaign_Navigator_TEST`

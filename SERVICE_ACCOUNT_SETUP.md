# Service Account Setup (No User Authentication Required)

## Overview

Service accounts eliminate the need for user OAuth by using a "bot" account that has pre-authorized access to specific Drive folders.

## Advantages

✅ **No user authentication popups**
✅ **Works immediately after installation**
✅ **Perfect for team folders**
✅ **No Chrome sync dependency**
✅ **Consistent access across all users**

## Disadvantages

⚠️ **Credentials must be embedded in extension** (security consideration)
⚠️ **Files owned by service account, not user**
⚠️ **Requires Google Cloud project setup**

## Setup Instructions

### Step 1: Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to: **IAM & Admin → Service Accounts**
4. Click **Create Service Account**
5. Fill details:
   - Name: `GMV Max Uploader`
   - Description: `Service account for automated campaign report uploads`
6. Click **Create and Continue**
7. Skip role assignment (click **Continue**)
8. Click **Done**

### Step 2: Create Service Account Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key → Create new key**
4. Choose **JSON** format
5. Click **Create**
6. **Download and save the JSON file securely**

The JSON file looks like:
```json
{
  "type": "service_account",
  "project_id": "your-project",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "gmv-max-uploader@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

### Step 3: Set Up Shared Drive (CRITICAL)

**⚠️ IMPORTANT:** Service accounts **CANNOT** upload to regular "My Drive" folders. You **MUST** use a Shared Drive (formerly Team Drive).

#### Why Shared Drives Are Required

Service accounts don't have their own storage quota. When you try to upload to "My Drive" folders, Google returns this error:
```
Service Accounts do not have storage quota. Leverage shared drives instead.
```

#### Creating a Shared Drive

1. Go to [Google Drive](https://drive.google.com/)
2. On the left sidebar, click **Shared drives**
3. Click **+ New** to create a new Shared Drive
4. Name it: `GMV Max Campaign Navigator`
5. Click **Create**

#### Setting Up Folders in Shared Drive

1. Open your new Shared Drive
2. Create these folders inside it:
   - `GMV_Max_Campaign_Navigator_TEST`
   - `2.WEST_US`
   - `1.EAST_PH`
   - `1.EAST_MY`
   - `1.EAST_ID`

#### Adding Service Account to Shared Drive

1. Click on the Shared Drive name (right-click → Manage members)
2. Click **Add members**
3. Paste service account email (from JSON: `client_email`)
   - Example: `gmv-max-uploader@your-project.iam.gserviceaccount.com`
4. Set permission: **Content Manager** (or Manager)
5. Uncheck "Notify people"
6. Click **Send**

**Note:** You only need to add the service account to the Shared Drive itself, not to individual folders within it.

#### Getting Folder IDs from Shared Drive

1. Navigate to each folder in the Shared Drive
2. Copy the folder ID from the URL:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID_HERE
   ```
3. Update `extension/utils/region-detector.ts` with these folder IDs

### Step 4: Enable Drive API

1. In Google Cloud Console
2. Navigate to: **APIs & Services → Library**
3. Search: **Google Drive API**
4. Click **Enable**

## Implementation in Extension

### Option A: Embed Credentials (Simple, Less Secure)

Store service account JSON in extension code.

**⚠️ Security Warning:** Anyone who installs the extension can extract credentials.

**Use only if:**
- Extension is for internal team use only
- Not distributed publicly
- Folders only contain non-sensitive data

### Option B: Backend Proxy (Secure, More Complex)

Store credentials on your server, extension calls your API.

**Architecture:**
```
Extension → Your Server (has credentials) → Google Drive
```

**Advantages:**
- Credentials never exposed
- Can revoke access server-side
- Better for public distribution

## Code Changes Required

I can implement either option. Which would you prefer?

### Option A Implementation (Embedded Credentials)

Would modify:
- `extension/services/google-drive.ts` - Add JWT authentication
- `extension/config/service-account.ts` - Store credentials (gitignored)
- Remove OAuth flow entirely

### Option B Implementation (Backend Proxy)

Would create:
- Backend API endpoint (Node.js/Python/etc.)
- Extension calls your API instead of Drive directly
- API handles all Drive operations with service account

## Security Best Practices

### If Using Option A (Embedded):

1. **Add to .gitignore:**
   ```
   extension/config/service-account.json
   ```

2. **Environment variable for build:**
   ```bash
   SERVICE_ACCOUNT_KEY="..." npm run build:extension
   ```

3. **Restrict folder permissions:**
   - Service account can only access shared folders
   - Cannot access your personal Drive

4. **Monitor usage:**
   - Check Drive activity for unexpected uploads
   - Revoke and regenerate keys periodically

### If Using Option B (Backend Proxy):

1. **Store credentials in environment variables**
2. **Add rate limiting to API**
3. **Validate requests from extension**
4. **Use HTTPS only**
5. **Log all uploads for audit**

## Comparison: OAuth vs Service Account

| Feature | OAuth (Current) | Service Account |
|---------|----------------|-----------------|
| User authentication | Required | Not required |
| Popup windows | Yes | No |
| Chrome sync dependency | Yes | No |
| Setup complexity | Medium | High (initial), Low (ongoing) |
| Security | User-controlled | Admin-controlled |
| File ownership | User | Service account |
| Best for | Personal use | Team/automated use |
| Public distribution | Better | Worse (if embedded) |
| Internal team use | Okay | Better |

## Cost

- Service accounts are **free**
- Drive API usage is **free** (within quotas)
- 10,000 requests/day limit (same as OAuth)

## Testing Service Account Access

After sharing folders, test access:

```bash
# Install google-auth-library
npm install google-auth-library googleapis

# Test script (Node.js)
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

const serviceAccountKey = require('./service-account.json');

const auth = new JWT({
  email: serviceAccountKey.client_email,
  key: serviceAccountKey.private_key,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

// Test: List files in test folder
drive.files.list({
  q: `'1B6YGbi5Nqp5LKpFEYxA4WHbFYKirX2Vx' in parents`,
  fields: 'files(id, name)',
}, (err, res) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  console.log('Files in test folder:', res.data.files);
});
```

## Next Steps

**Tell me which option you prefer:**

1. **Option A (Embedded)** - I'll implement service account auth in the extension
2. **Option B (Proxy)** - I'll provide backend server code + extension modifications
3. **Keep OAuth** - Stick with current implementation (popup required)

For team internal use, I recommend **Option A** for simplicity.

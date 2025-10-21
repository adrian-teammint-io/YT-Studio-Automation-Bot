/**
 * Diagnostic script to test Google Drive folder access
 * Run this to verify service account permissions
 *
 * Usage: node test-folder-access.js
 */

// You'll need to import these from your extension
// This is a template - adjust paths as needed

const folders = [
  { name: 'GMV_Max_Automation (main)', id: '0AK422qI5QsUUUk9PVA' },
  { name: '2.WEST_US', id: '13lPkdut0NT3IJ881H30eGfc7hwNctvfQ' },
  { name: '1.EAST_PH', id: '1HUY24amItYGEnTE2TTemzDuX1DeRmmcu' },
  { name: '1.EAST_MY', id: '1iXfMl3rdukxRI1fnJ0qhQjS6ZL82HzDf' },
  { name: '1.EAST_ID', id: '1Ct0DX06OKqJmpbaB5q6Xlnwu1UHKYjOV' }
];

async function checkFolderAccess(token, folderId, folderName) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,driveId,capabilities,permissions&supportsAllDrives=true`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = { message: errorText };
      }

      console.log(`\n❌ FAILED: ${folderName}`);
      console.log(`   Folder ID: ${folderId}`);
      console.log(`   Error: HTTP ${response.status}: ${errorJson.error?.message || errorText}`);
      console.log(`   Details:`, JSON.stringify(errorJson, null, 2));
      return false;
    }

    const data = await response.json();
    console.log(`\n✅ SUCCESS: ${folderName}`);
    console.log(`   Folder ID: ${folderId}`);
    console.log(`   Folder Name: ${data.name}`);
    console.log(`   Drive ID: ${data.driveId || 'N/A (My Drive)'}`);
    console.log(`   Is Shared Drive: ${!!data.driveId ? 'YES' : 'NO'}`);
    console.log(`   Can Edit: ${data.capabilities?.canEdit || 'unknown'}`);
    console.log(`   Can Add Children: ${data.capabilities?.canAddChildren || 'unknown'}`);
    return true;
  } catch (error) {
    console.log(`\n❌ ERROR: ${folderName}`);
    console.log(`   Folder ID: ${folderId}`);
    console.log(`   Error:`, error.message);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('GOOGLE DRIVE FOLDER ACCESS DIAGNOSTIC');
  console.log('='.repeat(60));

  // You need to get the token from your extension
  // For testing, you can temporarily add this to your extension:
  // 1. Import getAuthToken from google-drive.ts
  // 2. Call it and log the token
  // 3. Copy the token here

  const token = 'REPLACE_WITH_YOUR_ACCESS_TOKEN';

  if (token === 'REPLACE_WITH_YOUR_ACCESS_TOKEN') {
    console.log('\n⚠️  You need to replace the token in this script!');
    console.log('\nTo get the token:');
    console.log('1. Open your extension popup');
    console.log('2. Open DevTools (F12)');
    console.log('3. Run this in the console:');
    console.log('   chrome.runtime.sendMessage({type: "GET_DEBUG_TOKEN"}, console.log)');
    console.log('\nOR run the extension and check the logs for the access token');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const folder of folders) {
    const success = await checkFolderAccess(token, folder.id, folder.name);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // Wait a bit between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total folders checked: ${folders.length}`);
  console.log(`✅ Accessible: ${successCount}`);
  console.log(`❌ Not accessible: ${failCount}`);

  if (failCount > 0) {
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('1. Verify service account is added to the Shared Drive (not individual folders)');
    console.log('2. Check the service account has "Content Manager" or "Manager" role');
    console.log('3. Wait 5-10 minutes after granting access for permissions to propagate');
    console.log('4. Verify these are actually Shared Drive folders, not My Drive folders');
  }
}

main().catch(console.error);

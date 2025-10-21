/**
 * Quick test to check if service account can access folders
 * Run this in the browser console when the extension popup is open
 *
 * Instructions:
 * 1. Open your extension popup
 * 2. Press F12 to open DevTools
 * 3. Go to Console tab
 * 4. Copy and paste this entire file
 * 5. Run: testFolderAccess()
 */

async function testFolderAccess() {
    console.log('='.repeat(60));
    console.log('🔍 TESTING GOOGLE DRIVE FOLDER ACCESS');
    console.log('='.repeat(60));
    console.log('Service Account: gmv-max-automation-service-acc@gmv-max-campaign-navigator.iam.gserviceaccount.com');
    console.log('');

    const folders = [
        { name: 'GMV_Max_Automation (main)', id: '0AK422qI5QsUUUk9PVA' },
        { name: '2.WEST_US', id: '13lPkdut0NT3IJ881H30eGfc7hwNctvfQ' },
        { name: '1.EAST_PH', id: '1HUY24amItYGEnTE2TTemzDuX1DeRmmcu' },
        { name: '1.EAST_MY', id: '1iXfMl3rdukxRI1fnJ0qhQjS6ZL82HzDf' },
        { name: '1.EAST_ID', id: '1Ct0DX06OKqJmpbaB5q6Xlnwu1UHKYjOV' }
    ];

    try {
        // You'll need to have this function available in your extension
        // If using in popup, import it first or expose it globally
        const { getAuthToken } = await import('./extension/services/google-drive.ts');

        console.log('🔐 Getting authentication token...');
        const token = await getAuthToken();
        console.log('✅ Authentication successful\n');

        let successCount = 0;
        let failCount = 0;

        for (const folder of folders) {
            console.log(`\n📁 Checking: ${folder.name}`);
            console.log(`   ID: ${folder.id}`);

            try {
                const response = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${folder.id}?fields=id,name,driveId,capabilities&supportsAllDrives=true`,
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

                    console.log(`   ❌ FAILED`);
                    console.log(`   Error: HTTP ${response.status}: ${errorJson.error?.message || errorText}`);
                    failCount++;
                } else {
                    const data = await response.json();
                    console.log(`   ✅ SUCCESS`);
                    console.log(`   - Name: ${data.name}`);
                    console.log(`   - Drive ID: ${data.driveId || 'N/A (My Drive)'}`);
                    console.log(`   - Is Shared Drive: ${!!data.driveId ? 'YES ✅' : 'NO ❌'}`);
                    console.log(`   - Can Edit: ${data.capabilities?.canEdit ?? 'unknown'}`);
                    console.log(`   - Can Add Children: ${data.capabilities?.canAddChildren ?? 'unknown'}`);
                    successCount++;
                }
            } catch (error) {
                console.log(`   ❌ ERROR: ${error.message}`);
                failCount++;
            }

            // Wait between requests
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        console.log('\n' + '='.repeat(60));
        console.log('📊 SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total folders: ${folders.length}`);
        console.log(`✅ Accessible: ${successCount}`);
        console.log(`❌ Not accessible: ${failCount}`);

        if (failCount > 0) {
            console.log('\n⏰ If folders are not accessible:');
            console.log('   1. Wait 5-10 more minutes for permissions to propagate');
            console.log('   2. Verify service account is added to the SHARED DRIVE (not individual folders)');
            console.log('   3. Check service account has "Content Manager" role');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.log('\n💡 Make sure to run this in the extension popup context');
    }
}

// Also create a simpler version that uses chrome.runtime to test from background
async function testFromBackground() {
    console.log('Testing from background context...');

    chrome.runtime.sendMessage({
        type: 'TEST_FOLDER_ACCESS',
        folderId: '13lPkdut0NT3IJ881H30eGfc7hwNctvfQ',
        folderName: '2.WEST_US'
    }, (response) => {
        if (response.accessible) {
            console.log('✅ Folder is accessible!');
            console.log('Details:', response.details);
        } else {
            console.log('❌ Folder is NOT accessible');
            console.log('Error:', response.error);
        }
    });
}

console.log('Test functions loaded!');
console.log('Run: testFolderAccess()');
console.log('Or from background: testFromBackground()');

/**
 * Script to fetch the latest downloaded TSV file from Downloads folder
 * Run with: npx ts-node fetch-latest-download.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { uploadTSVToSheets, validateTSVContent, logTSVStats } from './standalone/tsv-processor.ts';

/**
 * Get the Downloads folder path based on the operating system
 */
function getDownloadsFolder(): string {
  const platform = os.platform();
  const homeDir = os.homedir();

  switch (platform) {
    case 'darwin': // macOS
      return path.join(homeDir, 'Downloads');
    case 'win32': // Windows
      return path.join(homeDir, 'Downloads');
    case 'linux': // Linux
      return path.join(homeDir, 'Downloads');
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Find the latest TSV file in the Downloads folder
 */
function findLatestTSVFile(downloadsFolder: string): { filePath: string; stats: fs.Stats } | null {
  if (!fs.existsSync(downloadsFolder)) {
    throw new Error(`Downloads folder not found: ${downloadsFolder}`);
  }

  const files = fs.readdirSync(downloadsFolder);
  const tsvFiles: Array<{ filePath: string; stats: fs.Stats }> = [];

  for (const file of files) {
    if (file.toLowerCase().endsWith('.tsv')) {
      const filePath = path.join(downloadsFolder, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          tsvFiles.push({ filePath, stats });
        }
      } catch (error) {
        // Skip files that can't be accessed
        console.warn(`Warning: Could not access file ${file}:`, error);
      }
    }
  }

  if (tsvFiles.length === 0) {
    return null;
  }

  // Sort by modification time (most recent first)
  tsvFiles.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

  return tsvFiles[0];
}

/**
 * Fetch the latest downloaded TSV file content
 */
async function fetchLatestDownload(): Promise<{ content: string; filename: string; filePath: string }> {
  try {
    console.log("========================================");
    console.log("Fetching Latest Downloaded TSV File");
    console.log("========================================");

    const downloadsFolder = getDownloadsFolder();
    console.log(`Downloads folder: ${downloadsFolder}`);

    const latestFile = findLatestTSVFile(downloadsFolder);

    if (!latestFile) {
      throw new Error('No TSV files found in Downloads folder');
    }

    const { filePath, stats } = latestFile;
    const filename = path.basename(filePath);

    console.log(`\nFound latest TSV file: ${filename}`);
    console.log(`File path: ${filePath}`);
    console.log(`File size: ${stats.size} bytes`);
    console.log(`Modified: ${stats.mtime.toLocaleString()}`);
    console.log("");

    // Read the file content
    console.log("Reading file content...");
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`Content length: ${content.length} characters`);
    console.log(`Content lines: ${content.split('\n').filter(l => l.trim()).length} lines`);

    // Show preview
    const lines = content.split('\n').slice(0, 3);
    console.log("\nFirst 3 lines preview:");
    lines.forEach((line, i) => {
      console.log(`  Line ${i + 1}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
    });

    // Validate TSV content using shared utility
    const validation = validateTSVContent(content);
    if (!validation.isValid) {
      console.error("\n❌ Error:", validation.error);
      console.error("Content preview:", content.substring(0, 500));
      throw new Error(validation.error || "Invalid TSV content");
    }

    // Log stats
    if (validation.stats) {
      console.log(`\nValidation successful:`);
      console.log(`- Rows: ${validation.stats.lines}`);
      console.log(`- Columns: ${validation.stats.columns}`);
      console.log(`- Tab characters: ${validation.stats.tabCount}`);
    }

    console.log("\n========================================");
    console.log("✅ Successfully fetched latest download");
    console.log("========================================");

    return {
      content,
      filename,
      filePath,
    };
  } catch (error) {
    console.error("\n========================================");
    console.error("❌ Failed to fetch latest download");
    console.error("========================================");
    console.error(error);
    throw error;
  }
}

/**
 * Verify data was uploaded by reading it back from Google Sheets
 */
async function verifyUpload(spreadsheetId: string, sheetName: string, expectedRows: number): Promise<void> {
  try {
    // Import the google-sheets module to access getAuthToken
    const googleSheetsModule = await import('./extension/services/google-sheets.ts');
    // We need to get the token, but getAuthToken is not exported, so we'll use a workaround
    // Actually, let's just use the service account directly
    const { SERVICE_ACCOUNT } = await import('./extension/config/service-account.ts');
    const { createJWTAssertion, getAccessTokenFromJWT } = await import('./extension/utils/jwt.ts');

    const scope = "https://www.googleapis.com/auth/spreadsheets";
    const jwtAssertion = await createJWTAssertion(
      SERVICE_ACCOUNT.client_email,
      SERVICE_ACCOUNT.private_key,
      scope
    );
    const token = await getAccessTokenFromJWT(jwtAssertion);

    // Read the sheet to verify data
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      const totalRows = data.values?.length || 0;
      console.log(`\n🔍 Verification: Sheet currently has ${totalRows} rows`);

      if (totalRows >= expectedRows) {
        console.log(`✅ Verified: At least ${expectedRows} rows are present in the sheet`);
        // Show last few rows
        if (data.values && data.values.length > 0) {
          const lastRows = data.values.slice(-Math.min(3, data.values.length));
          console.log(`\nLast ${lastRows.length} rows in sheet:`);
          lastRows.forEach((row: string[], index: number) => {
            console.log(`  Row ${totalRows - lastRows.length + index + 1}: ${row.slice(0, 5).join(' | ')}${row.length > 5 ? '...' : ''}`);
          });
        }
      } else {
        console.log(`⚠️  Warning: Expected ${expectedRows} rows but sheet only has ${totalRows} rows`);
      }
    }
  } catch (error) {
    console.warn(`⚠️  Could not verify upload: ${error}`);
  }
}

/**
 * Upload file content to Google Sheets
 */
async function uploadToGoogleSheets(fileContent: string): Promise<void> {
  try {
    console.log("\n");

    // Use shared upload utility
    const result = await uploadTSVToSheets(fileContent);

    if (result.success) {
      if (result.updatedRange) {
        // Parse the range to extract row numbers
        const rangeMatch = result.updatedRange.match(/(\d+):(\w+)(\d+)/);
        if (rangeMatch) {
          const startRow = rangeMatch[1];
          const endRow = rangeMatch[3];
          console.log(`\n📍 Data was appended to rows ${startRow}-${endRow}`);
          console.log(`   📌 IMPORTANT: Scroll down to row ${startRow} in your Google Sheet to see the uploaded data!`);
          console.log(`   📌 The data is NOT at the top - it was appended after existing data.`);
        } else {
          console.log(`\n📍 Data was appended to: ${result.updatedRange}`);
          console.log(`   Check this range in your Google Sheet to see the uploaded data.`);
        }
      }

      // Verify the upload by reading back the data
      if (result.updatedRows) {
        console.log(`\n🔍 Verifying upload...`);
        const TARGET_SPREADSHEET_ID = "1wKCk9VQ1sL47AK87wnQHNk0HJjoGptUU010Zv6O2Kw0";
        const TARGET_SHEET_NAME = "Sheet1";
        await verifyUpload(TARGET_SPREADSHEET_ID, TARGET_SHEET_NAME, result.updatedRows);
      }
    } else {
      throw new Error(result.error || "Upload failed");
    }
  } catch (error) {
    console.error("\n========================================");
    console.error("❌ Failed to upload to Google Sheets");
    console.error("========================================");
    console.error(error);
    throw error;
  }
}

// Export for use as a module
export { fetchLatestDownload, getDownloadsFolder, findLatestTSVFile, uploadToGoogleSheets };

// Run if executed directly
// Simple check: if this file is run directly (not imported), execute the function
const currentFile = fileURLToPath(import.meta.url);
const mainModule = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMainModule = mainModule === currentFile ||
                     (mainModule?.endsWith('fetch-latest-download.ts') ?? false);

if (isMainModule) {
  fetchLatestDownload()
    .then(async (result) => {
      console.log(`\nFile: ${result.filename}`);
      console.log(`Path: ${result.filePath}`);
      console.log(`Content length: ${result.content.length} characters`);

      // Upload to Google Sheets
      await uploadToGoogleSheets(result.content);

      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}


/**
 * Test script to upload sample.tsv to Google Sheets
 * Run with: npx ts-node test-upload.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { uploadFileToGoogleSheet } from './extension/services/google-sheets';

// Target Google Sheet configuration (same as in background.ts)
const TARGET_SPREADSHEET_ID = "1wKCk9VQ1sL47AK87wnQHNk0HJjoGptUU010Zv6O2Kw0";
const TARGET_SHEET_NAME = "Sheet1";

async function testUpload() {
  try {
    console.log("========================================");
    console.log("Testing TSV file upload to Google Sheets");
    console.log("========================================");

    // Read the sample.tsv file
    const filePath = path.join(__dirname, 'sample.tsv');
    console.log(`Reading file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    console.log(`File size: ${fileContent.length} characters`);
    console.log(`File lines: ${fileContent.split('\n').filter(l => l.trim()).length} lines`);
    console.log("");

    // Show first few lines
    const lines = fileContent.split('\n').slice(0, 3);
    console.log("First 3 lines preview:");
    lines.forEach((line, i) => {
      console.log(`  Line ${i + 1}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
    });
    console.log("");

    // Upload to Google Sheets
    console.log("Uploading to Google Sheets...");
    console.log(`- Spreadsheet ID: ${TARGET_SPREADSHEET_ID}`);
    console.log(`- Sheet name: ${TARGET_SHEET_NAME}`);
    console.log("");

    const result = await uploadFileToGoogleSheet({
      spreadsheetId: TARGET_SPREADSHEET_ID,
      sheetName: TARGET_SHEET_NAME,
      fileContent: fileContent,
    });

    if (result.success) {
      console.log("========================================");
      console.log("✅ Upload successful!");
      console.log("========================================");
      console.log(`- Updated rows: ${result.updatedRows}`);
      if (result.updatedRange) {
        console.log(`- Updated range: ${result.updatedRange}`);
      }
    } else {
      console.log("========================================");
      console.log("❌ Upload failed!");
      console.log("========================================");
      console.log(`Error: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("========================================");
    console.error("❌ Test failed!");
    console.error("========================================");
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testUpload();


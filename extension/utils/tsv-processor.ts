/**
 * Shared TSV processing utilities for Chrome extension (webpack bundled)
 * For ES modules/standalone scripts, use tsv-processor-esm.ts
 */

import { uploadFileToGoogleSheet } from "../services/google-sheets";

// Target Google Sheet configuration
const TARGET_SPREADSHEET_ID = "1wKCk9VQ1sL47AK87wnQHNk0HJjoGptUU010Zv6O2Kw0";
const TARGET_SHEET_NAME = "Sheet1";

export interface TSVValidationResult {
  isValid: boolean;
  error?: string;
  stats?: {
    length: number;
    lines: number;
    columns: number;
    tabCount: number;
  };
}

/**
 * Validate TSV content
 */
export function validateTSVContent(content: string): TSVValidationResult {
  const trimmedContent = content.trim();

  // Check for HTML content (common issue)
  const isHTML =
    trimmedContent.toLowerCase().startsWith('<!doctype') ||
    trimmedContent.toLowerCase().startsWith('<html') ||
    trimmedContent.toLowerCase().includes('<!doctype html') ||
    trimmedContent.toLowerCase().includes('<html lang') ||
    trimmedContent.toLowerCase().includes('<head>') ||
    trimmedContent.toLowerCase().includes('<body>') ||
    (trimmedContent.startsWith('<') && trimmedContent.includes('html'));

  if (isHTML) {
    return {
      isValid: false,
      error: "File contains HTML content instead of TSV data"
    };
  }

  // Check if content is empty
  if (!content || content.trim().length === 0) {
    return {
      isValid: false,
      error: "File content is empty"
    };
  }

  // Validate TSV format - must have tabs
  if (!content.includes('\t')) {
    return {
      isValid: false,
      error: "File does not contain tab characters - not valid TSV format"
    };
  }

  // Calculate stats
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  const linesWithTabs = lines.filter(line => line.includes('\t'));
  const columnCount = lines[0]?.split('\t').length || 0;
  const tabCount = (content.match(/\t/g) || []).length;

  if (linesWithTabs.length === 0) {
    return {
      isValid: false,
      error: "No lines contain tabs - not valid TSV format"
    };
  }

  return {
    isValid: true,
    stats: {
      length: content.length,
      lines: lines.length,
      columns: columnCount,
      tabCount
    }
  };
}

/**
 * Upload TSV content to Google Sheets
 */
export async function uploadTSVToSheets(
  fileContent: string,
  options?: {
    spreadsheetId?: string;
    sheetName?: string;
  }
): Promise<{
  success: boolean;
  updatedRows?: number;
  updatedRange?: string;
  error?: string;
}> {
  try {
    console.log("========================================");
    console.log("Uploading to Google Sheets");
    console.log("========================================");

    const spreadsheetId = options?.spreadsheetId || TARGET_SPREADSHEET_ID;
    const sheetName = options?.sheetName || TARGET_SHEET_NAME;

    console.log(`- Spreadsheet ID: ${spreadsheetId}`);
    console.log(`- Sheet name: ${sheetName}`);
    console.log(`- Content length: ${fileContent.length} characters`);

    // Validate content before uploading
    const validation = validateTSVContent(fileContent);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    console.log("- Content validated successfully");
    if (validation.stats) {
      console.log(`- Rows: ${validation.stats.lines}`);
      console.log(`- Columns: ${validation.stats.columns}`);
    }

    const result = await uploadFileToGoogleSheet({
      spreadsheetId,
      sheetName,
      fileContent,
    });

    if (!result.success) {
      throw new Error(result.error || "Upload failed");
    }

    console.log("========================================");
    console.log("✅ Upload successful!");
    console.log("========================================");
    console.log(`- Updated rows: ${result.updatedRows}`);
    if (result.updatedRange) {
      console.log(`- Updated range: ${result.updatedRange}`);
    }

    return result;
  } catch (error) {
    console.error("========================================");
    console.error("❌ Failed to upload to Google Sheets");
    console.error("========================================");
    console.error(error);

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Log TSV content stats for debugging
 */
export function logTSVStats(content: string, source: string = "Unknown"): void {
  console.log("========================================");
  console.log(`📄 TSV Content Verification (${source})`);
  console.log("========================================");
  console.log(`File size: ${content.length} characters`);
  console.log(`File size: ${(content.length / 1024).toFixed(2)} KB`);

  // Show first few lines
  const lines = content.split('\n').slice(0, 5);
  console.log("First 5 lines of content:");
  lines.forEach((line, index) => {
    console.log(`  Line ${index + 1}: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
  });

  // Count rows and columns
  const allLines = content.split('\n').filter(line => line.trim().length > 0);
  const columnCount = allLines[0]?.split('\t').length || 0;
  console.log(`Total rows: ${allLines.length}`);
  console.log(`Columns in first row: ${columnCount}`);
  console.log(`Tab character count: ${(content.match(/\t/g) || []).length}`);
  console.log("========================================");
}

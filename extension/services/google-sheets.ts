/**
 * Google Sheets API service for appending TSV data to sheets
 * Uses Service Account authentication (no user OAuth required)
 *
 * IMPORTANT: Service accounts require proper sheet sharing
 * - The service account email must have "Editor" access to the target sheet
 * - Share the sheet with the service account email just like sharing with a regular user
 */

import { SERVICE_ACCOUNT } from "../config/service-account";
import { createJWTAssertion, getAccessTokenFromJWT } from "../utils/jwt";

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName: string; // Tab name (e.g., "Sheet1")
  data: string[][]; // 2D array of values to append (legacy, for parsed data)
}

export interface UploadFileConfig {
  spreadsheetId: string;
  sheetName: string; // Tab name (e.g., "Sheet1")
  fileContent: string; // Raw file content as string
}

export interface AppendResult {
  success: boolean;
  updatedRange?: string;
  updatedRows?: number;
  error?: string;
}

/**
 * Get OAuth token using Service Account (JWT)
 * Scopes: Google Sheets read/write access
 */
export async function getAuthToken(): Promise<string> {
  try {
    console.log("[Google Sheets] Authenticating with service account...");
    console.log("[Google Sheets] Service account email:", SERVICE_ACCOUNT.client_email);

    // Create JWT assertion with Sheets scope
    const scope = "https://www.googleapis.com/auth/spreadsheets";
    const jwtAssertion = await createJWTAssertion(
      SERVICE_ACCOUNT.client_email,
      SERVICE_ACCOUNT.private_key,
      scope
    );

    console.log("[Google Sheets] JWT assertion created");

    // Exchange JWT for access token
    const accessToken = await getAccessTokenFromJWT(jwtAssertion);

    console.log("[Google Sheets] Access token obtained successfully");
    return accessToken;
  } catch (error) {
    console.error("[Google Sheets] Service account authentication failed:", error);
    throw new Error(`Failed to authenticate with service account: ${error}`);
  }
}

/**
 * Check if service account can access a spreadsheet
 * Returns detailed error information for diagnostics
 */
export async function checkSheetAccess(
  token: string,
  spreadsheetId: string
): Promise<{ accessible: boolean; error?: string; details?: any }> {
  try {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties`,
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

      return {
        accessible: false,
        error: `HTTP ${response.status}: ${errorJson.error?.message || errorText}`,
        details: errorJson,
      };
    }

    const data = await response.json();
    return {
      accessible: true,
      details: {
        spreadsheetId: data.spreadsheetId,
        title: data.properties?.title,
      },
    };
  } catch (error) {
    return {
      accessible: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Append rows to a Google Sheet
 * Uses the APPEND operation to add data to the end of existing content
 */
export async function appendToGoogleSheet(config: GoogleSheetsConfig): Promise<AppendResult> {
  try {
    console.log("[Google Sheets] Starting append process...");
    console.log("[Google Sheets] Config:", {
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      rowCount: config.data.length,
      columnCount: config.data[0]?.length || 0,
    });

    // Get authentication token
    const token = await getAuthToken();
    console.log("[Google Sheets] Authentication successful");

    // Check if service account can access the sheet
    console.log("[Google Sheets] ========================================");
    console.log("[Google Sheets] DIAGNOSTIC: Checking sheet access...");
    const accessCheck = await checkSheetAccess(token, config.spreadsheetId);

    if (!accessCheck.accessible) {
      console.error("[Google Sheets] ❌ SHEET ACCESS DENIED");
      console.error("[Google Sheets] Spreadsheet ID:", config.spreadsheetId);
      console.error("[Google Sheets] Error:", accessCheck.error);
      console.error("[Google Sheets] Details:", accessCheck.details);
      console.error("");
      console.error("[Google Sheets] 🔧 SOLUTION:");
      console.error("[Google Sheets] 1. Open the Google Sheet in your browser");
      console.error("[Google Sheets] 2. Click 'Share' button");
      console.error("[Google Sheets] 3. Add service account email with 'Editor' role:");
      console.error("[Google Sheets] 4. Service account email:", SERVICE_ACCOUNT.client_email);
      console.error("");

      throw new Error(
        `Service account cannot access spreadsheet ${config.spreadsheetId}. ` +
        `Please share the sheet with the service account email. Details: ${accessCheck.error}`
      );
    }

    console.log("[Google Sheets] ✅ Sheet access verified");
    console.log("[Google Sheets] - Sheet title:", accessCheck.details?.title);
    console.log("[Google Sheets] ========================================");

    // Append data using the append API
    // Range format: "Sheet1!A:Z" will append to the first empty row
    const range = `${config.sheetName}`;

    const requestBody = {
      values: config.data,
    };

    console.log("[Google Sheets] Appending data...");
    console.log("[Google Sheets] - Target range:", range);
    console.log("[Google Sheets] - Rows to append:", config.data.length);

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Google Sheets] Append failed:", errorText);
      throw new Error(`Failed to append to sheet: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    console.log("[Google Sheets] ✅ Append successful");
    console.log("[Google Sheets] - Updated range:", result.updates?.updatedRange);
    console.log("[Google Sheets] - Rows added:", result.updates?.updatedRows);
    console.log("[Google Sheets] ========================================");

    return {
      success: true,
      updatedRange: result.updates?.updatedRange,
      updatedRows: result.updates?.updatedRows,
    };
  } catch (error) {
    console.error("[Google Sheets] Append failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Upload raw file content to Google Sheets
 * Uses pasteData API which lets Google Sheets automatically detect and parse separators
 * Appends data to the end of the current sheet
 */
export async function uploadFileToGoogleSheet(config: UploadFileConfig): Promise<AppendResult> {
  try {
    console.log("[Google Sheets] Starting file upload...");
    console.log("[Google Sheets] Config:", {
      spreadsheetId: config.spreadsheetId,
      sheetName: config.sheetName,
      fileSize: config.fileContent.length,
    });

    // Get authentication token
    const token = await getAuthToken();
    console.log("[Google Sheets] Authentication successful");

    // Check if service account can access the sheet
    const accessCheck = await checkSheetAccess(token, config.spreadsheetId);

    if (!accessCheck.accessible) {
      console.error("[Google Sheets] ❌ SHEET ACCESS DENIED");
      console.error("[Google Sheets] Spreadsheet ID:", config.spreadsheetId);
      console.error("[Google Sheets] Error:", accessCheck.error);
      throw new Error(
        `Service account cannot access spreadsheet ${config.spreadsheetId}. ` +
        `Please share the sheet with the service account email. Details: ${accessCheck.error}`
      );
    }

    console.log("[Google Sheets] ✅ Sheet access verified");

    // Get the sheet ID for the target sheet name
    const spreadsheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!spreadsheetResponse.ok) {
      throw new Error(`Failed to get spreadsheet info: ${spreadsheetResponse.statusText}`);
    }

    const spreadsheetData = await spreadsheetResponse.json();
    const targetSheet = spreadsheetData.sheets?.find(
      (sheet: any) => sheet.properties.title === config.sheetName
    );

    if (!targetSheet) {
      throw new Error(`Sheet "${config.sheetName}" not found in spreadsheet`);
    }

    const sheetId = targetSheet.properties.sheetId;

    // Find the last row with data to append after it
    const valuesResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(config.sheetName)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    let startRow = 0;
    if (valuesResponse.ok) {
      const valuesData = await valuesResponse.json();
      if (valuesData.values && valuesData.values.length > 0) {
        startRow = valuesData.values.length;
      }
    }

    console.log("[Google Sheets] Appending data starting at row:", startRow + 1);

    // Automatically detect delimiter from file content
    const lines = config.fileContent.split('\n').filter(line => line.trim().length > 0).slice(0, 10);
    let delimiterChar = "\t"; // Default to tab

    if (lines.length > 0) {
      const firstLine = lines[0];
      const tabCount = (firstLine.match(/\t/g) || []).length;
      const commaCount = (firstLine.match(/,/g) || []).length;
      const semicolonCount = (firstLine.match(/;/g) || []).length;

      if (commaCount > tabCount && commaCount > semicolonCount) {
        delimiterChar = ",";
      } else if (semicolonCount > tabCount && semicolonCount > commaCount) {
        delimiterChar = ";";
      } else {
        delimiterChar = "\t";
      }

      console.log("[Google Sheets] Detected delimiter:", delimiterChar === "\t" ? "TAB" : delimiterChar === "," ? "COMMA" : "SEMICOLON", {
        tabs: tabCount,
        commas: commaCount,
        semicolons: semicolonCount
      });
    }

    // Minimal parsing: Split by lines and then by delimiter
    // This is the minimal parsing needed to convert raw file content to 2D array format
    // that Google Sheets API expects for proper column separation
    const parsedData = config.fileContent
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.split(delimiterChar));

    const rowsAdded = parsedData.length;

    console.log("[Google Sheets] Parsed data:", rowsAdded, "rows,", parsedData[0]?.length || 0, "columns");

    // Use values.append API which properly handles column separation
    const range = `${config.sheetName}`;
    const requestBody = {
      values: parsedData,
    };

    console.log("[Google Sheets] Appending data to sheet...");
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Google Sheets] Append failed:", errorText);
      throw new Error(`Failed to append to sheet: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();

    console.log("[Google Sheets] ✅ File upload successful");
    console.log("[Google Sheets] - API Response:", JSON.stringify(result, null, 2));
    console.log("[Google Sheets] - Updated range:", result.updates?.updatedRange);
    console.log("[Google Sheets] - Rows added:", result.updates?.updatedRows || rowsAdded);
    console.log("[Google Sheets] ========================================");

    return {
      success: true,
      updatedRange: result.updates?.updatedRange,
      updatedRows: result.updates?.updatedRows || rowsAdded,
    };
  } catch (error) {
    console.error("[Google Sheets] File upload failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

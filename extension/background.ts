// Background service worker for NaverSA Chrome extension

import { STORAGE_KEYS } from "./constants/storage";
import { uploadTSVToSheets, validateTSVContent, logTSVStats } from "./utils/tsv-processor";

interface UploadStatusMessage {
  type: "UPLOAD_STATUS";
  status: "started" | "success" | "error";
  error?: string;
}

/**
 * Broadcast upload status to content script
 */
function broadcastUploadStatus(message: UploadStatusMessage): void {
  // Send to all tabs (content scripts)
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Ignore errors for tabs that don't have content scripts
        });
      }
    });
  });

  // Also store in chrome.storage for popup to read
  chrome.storage.local.set({
    [STORAGE_KEYS.LAST_UPLOAD_STATUS]: message,
  });
}

/**
 * Process TSV upload to Google Sheets
 * Receives TSV content from content script and uploads to sheet
 */
async function processTSVUpload(tsvContent: string, dateRange: any): Promise<void> {
  console.log("[NaverSA Background] Processing TSV upload...");
  console.log("[NaverSA Background] Received TSV content length:", tsvContent.length, "characters");

  // Send "started" status
  broadcastUploadStatus({
    type: "UPLOAD_STATUS",
    status: "started",
  });

  try {
    // Validate TSV content using shared utility
    const validation = validateTSVContent(tsvContent);
    if (!validation.isValid) {
      console.error("[NaverSA Background] ❌ Invalid TSV content:", validation.error);
      console.error("[NaverSA Background] Content preview:", tsvContent.substring(0, 500));
      throw new Error(validation.error || "Invalid TSV content");
    }

    // Log TSV stats for debugging
    logTSVStats(tsvContent, "Background Script");

    // Upload using shared utility
    console.log("[NaverSA Background] Uploading TSV content to Google Sheets...");
    const result = await uploadTSVToSheets(tsvContent);

    if (!result.success) {
      throw new Error(result.error || "Upload failed");
    }

    console.log("[NaverSA Background] ✅ Upload successful!");
    console.log("[NaverSA Background] - Updated range:", result.updatedRange);
    console.log("[NaverSA Background] - Rows added:", result.updatedRows);

    // Send "success" status
    broadcastUploadStatus({
      type: "UPLOAD_STATUS",
      status: "success",
    });
  } catch (error) {
    console.error("[NaverSA Background] Upload failed:", error);

    // Send "error" status
    broadcastUploadStatus({
      type: "UPLOAD_STATUS",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Store pending download info for interception
let pendingDownloadId: number | null = null;
let downloadUrlToFetch: string | null = null;
let downloadCompleteCallbacks: Map<number, (content: string) => void> = new Map();

// Listen for download events to intercept TSV downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
  if (downloadItem.filename.endsWith('.tsv')) {
    console.log("[NaverSA Background] TSV download detected:", downloadItem.id, downloadItem.url);
    pendingDownloadId = downloadItem.id;
    downloadUrlToFetch = downloadItem.url || null;
  }
});

chrome.downloads.onChanged.addListener(async (downloadDelta) => {
  // When download completes, try to read the file content
  if (pendingDownloadId === downloadDelta.id && downloadDelta.state?.current === 'complete') {
    console.log("[NaverSA Background] TSV download completed:", downloadDelta.id);

    // Get the download item details
    chrome.downloads.search({ id: downloadDelta.id }, async (downloads) => {
      if (!downloads || downloads.length === 0) return;

      const download = downloads[0];
      console.log("[NaverSA Background] Reading completed download:", download.filename);

      // Try to read the file using the File API via a content script injection
      // Since we can't read files directly, we'll use the download URL with proper timing
      // The download URL should work immediately after the download completes
      if (download.url) {
        // Wait a moment for the download to fully complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try fetching with a fresh request - the download completion might have refreshed auth
        try {
          const response = await fetch(download.url, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'text/tab-separated-values, text/plain, */*',
            }
          });

          if (response.ok) {
            const content = await response.text();

            // Validate TSV content using shared utility
            const validation = validateTSVContent(content);
            if (validation.isValid) {
              console.log("[NaverSA Background] ✅ Successfully read TSV content after download completion");
              // Store it for when content script requests it
              downloadUrlToFetch = download.url;
              // Content will be fetched when requested
            }
          }
        } catch (error) {
          console.log("[NaverSA Background] Could not read file immediately after download:", error);
        }
      }
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle GET_TSV_FILE_CONTENT
  // Reads the most recently downloaded TSV file directly using fetch() in background script
  if (message.type === "GET_TSV_FILE_CONTENT") {
    console.log("[NaverSA Background] Received GET_TSV_FILE_CONTENT request");

    // Find the most recent TSV download
    chrome.downloads.search(
      {
        orderBy: ["-startTime"], // Most recent first
        limit: 10, // Check more downloads in case some are still in progress
      },
      async (downloads) => {
        if (chrome.runtime.lastError) {
          console.error("[NaverSA Background] Error searching downloads:", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }

        if (!downloads || downloads.length === 0) {
          sendResponse({ success: false, error: "No recent downloads found" });
          return;
        }

        console.log("[NaverSA Background] Found", downloads.length, "recent downloads");

        // Find TSV file that's complete
        const tsvDownload = downloads.find(
          (d) => d.filename.endsWith(".tsv") && d.state === "complete"
        );

        if (!tsvDownload) {
          // Check if there's a TSV download in progress
          const inProgress = downloads.find(
            (d) => d.filename.endsWith(".tsv") && d.state === "in_progress"
          );
          if (inProgress) {
            sendResponse({
              success: false,
              error: "TSV file is still downloading. Please wait a moment and try again."
            });
            return;
          }
          sendResponse({ success: false, error: "No completed TSV file found in recent downloads" });
          return;
        }

        console.log("[NaverSA Background] Found TSV file:", tsvDownload.filename);
        console.log("[NaverSA Background] Download URL:", tsvDownload.url);

        // Read the file directly using fetch() - this works in background script context
        try {
          if (!tsvDownload.url) {
            throw new Error("Download URL not available");
          }

          console.log("[NaverSA Background] Reading downloaded file content...");

          // Fetch the file content
          const response = await fetch(tsvDownload.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
          }

          // Get file as text
          const content = await response.text();
          console.log("[NaverSA Background] File read successfully, size:", content.length, "characters");

          // Validate TSV content using shared utility
          const validation = validateTSVContent(content);
          if (!validation.isValid) {
            console.error("[NaverSA Background] ❌ Invalid TSV content:", validation.error);
            console.error("[NaverSA Background] Content preview:", content.substring(0, 500));
            throw new Error(validation.error || "Invalid TSV content");
          }

          console.log("[NaverSA Background] ✅ Successfully read and validated TSV content");
          sendResponse({
            success: true,
            content: content,
            filename: tsvDownload.filename
          });
        } catch (error) {
          console.error("[NaverSA Background] Failed to read download file:", error);
          sendResponse({
            success: false,
            error: `Failed to read downloaded file: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }
    );

    return true; // Keep message channel open for async response
  }

  // Legacy handler for backward compatibility
  if (message.type === "GET_TSV_FILE_URL") {
    console.log("[NaverSA Background] Received GET_TSV_FILE_URL request (legacy mode - redirecting)");
    // Call the new handler
    chrome.runtime.onMessage.hasListeners();
    // Just redirect to new handler by calling it
    const handler = chrome.runtime.onMessage;
    // Actually, just handle it the same way
    chrome.downloads.search(
      {
        orderBy: ["-startTime"],
        limit: 10,
      },
      (downloads) => {
        if (!downloads || downloads.length === 0) {
          sendResponse({ success: false, error: "No recent downloads found" });
          return;
        }
        const tsvDownload = downloads.find(
          (d) => d.filename.endsWith(".tsv") && d.state === "complete"
        );
        if (!tsvDownload || !tsvDownload.url) {
          sendResponse({ success: false, error: "No TSV file found" });
          return;
        }
        sendResponse({
          success: true,
          url: tsvDownload.url,
          filename: tsvDownload.filename
        });
      }
    );
    return true;
  }

  if (message.type === "PROCESS_TSV_UPLOAD") {
    console.log("[NaverSA Background] Received PROCESS_TSV_UPLOAD request");

    // Check if we have TSV content
    if (!message.tsvContent) {
      console.error("[NaverSA Background] No TSV content provided");
      sendResponse({ success: false, error: "No TSV content provided" });
      return true;
    }

    processTSVUpload(message.tsvContent, message.dateRange)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("[NaverSA Background] Processing failed:", error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep message channel open for async response
  }
});

// Extension startup
chrome.runtime.onInstalled.addListener(() => {
  console.log("[NaverSA Background] Extension installed/updated");
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[NaverSA Background] Extension started");
});

console.log("[NaverSA Background] Background script loaded");

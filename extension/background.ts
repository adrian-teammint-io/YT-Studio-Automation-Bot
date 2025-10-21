// Background service worker for Chrome extension

import { uploadToGoogleDrive, type GoogleDriveConfig, getAuthToken } from "./services/google-drive";
import { detectRegionFromCampaign } from "./utils/region-detector";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

interface UploadRequest {
  campaignName: string;
  fileName: string;
  fileUrl: string;
}

interface UploadStatusMessage {
  type: "UPLOAD_STATUS";
  status: "started" | "success" | "error";
  campaignName: string;
  fileName?: string;
  error?: string;
}

// Update badge when todos change
function updateBadge() {
  chrome.storage.local.get(["todos"], (result) => {
    const todos: Todo[] = result.todos || [];
    const incompleteCount = todos.filter((todo) => !todo.completed).length;

    if (incompleteCount > 0) {
      chrome.action.setBadgeText({ text: incompleteCount.toString() });
      chrome.action.setBadgeBackgroundColor({ color: "#6366f1" }); // Indigo color
    } else {
      chrome.action.setBadgeText({ text: "" }); // Clear badge when no incomplete tasks
    }
  });
}

/**
 * Handle file upload to Google Drive
 * Orchestrates region detection, file download, and Drive upload
 */
async function handleFileUpload(request: UploadRequest): Promise<void> {
  const { campaignName, fileName, fileUrl } = request;

  console.log("[Background] Starting file upload process:", { campaignName, fileName });

  // Send "started" status to popup
  broadcastUploadStatus({
    type: "UPLOAD_STATUS",
    status: "started",
    campaignName,
  });

  try {
    // Step 1: Detect region from campaign name
    const regionInfo = detectRegionFromCampaign(campaignName);
    if (!regionInfo) {
      throw new Error(`Could not detect region from campaign name: ${campaignName}`);
    }

    console.log("[Background] Region detected:", regionInfo);

    // Step 2: Download the file as a Blob
    console.log("[Background] Downloading file from:", fileUrl);
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    const fileBlob = await response.blob();
    console.log("[Background] File downloaded, size:", fileBlob.size);

    // Step 3: Upload to Google Drive
    const uploadConfig: GoogleDriveConfig = {
      parentFolderId: regionInfo.folderId,
      campaignFolderName: campaignName,
      fileName: fileName,
      fileBlob: fileBlob,
    };

    const result = await uploadToGoogleDrive(uploadConfig);

    if (!result.success) {
      throw new Error(result.error || "Upload failed");
    }

    console.log("[Background] Upload successful:", result);

    // Send "success" status to popup
    broadcastUploadStatus({
      type: "UPLOAD_STATUS",
      status: "success",
      campaignName,
      fileName: result.fileName,
    });
  } catch (error) {
    console.error("[Background] Upload failed:", error);

    // Send "error" status to popup
    broadcastUploadStatus({
      type: "UPLOAD_STATUS",
      status: "error",
      campaignName,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Broadcast upload status to all listening contexts (popup, content scripts)
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
    lastUploadStatus: message,
  });
}

/**
 * Check recent downloads and trigger upload
 */
async function checkAndUploadDownload(campaignName: string): Promise<void> {
  console.log("[Background] Checking recent downloads for campaign:", campaignName);

  // Wait a bit for the download to complete
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return new Promise((resolve, reject) => {
    chrome.downloads.search(
      {
        orderBy: ["-startTime"],
        limit: 5, // Check last 5 downloads to be safe
      },
      async (downloads) => {
        if (chrome.runtime.lastError) {
          console.error("[Background] Error querying downloads:", chrome.runtime.lastError);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!downloads || downloads.length === 0) {
          console.warn("[Background] No recent downloads found");
          reject(new Error("No recent downloads found"));
          return;
        }

        // Find the most recent .xlsx file
        const xlsxDownload = downloads.find(
          (d) => d.filename.endsWith(".xlsx") && d.state === "complete"
        );

        if (!xlsxDownload) {
          console.warn("[Background] No completed Excel file found in recent downloads");
          reject(new Error("No Excel file found"));
          return;
        }

        console.log("[Background] Found Excel download:", xlsxDownload);

        // Extract filename from path
        const fileName = xlsxDownload.filename.split(/[/\\]/).pop() || "report.xlsx";

        // Get the file from the filesystem using FileSystem Access API
        try {
          console.log("[Background] Reading downloaded file...");

          // Use chrome.downloads.download to get file URL that we can fetch
          // The file URL from downloads API can be fetched in background context
          if (!xlsxDownload.url) {
            throw new Error("Download URL not available");
          }

          console.log("[Background] Fetching file from:", xlsxDownload.url);

          // Fetch the file content
          const response = await fetch(xlsxDownload.url);
          if (!response.ok) {
            throw new Error(`Failed to fetch downloaded file: ${response.statusText}`);
          }

          const fileBlob = await response.blob();
          console.log("[Background] File fetched, size:", fileBlob.size);

          // Directly call the upload logic with the blob
          console.log("[Background] Starting upload to Google Drive...");

          // Send "started" status
          broadcastUploadStatus({
            type: "UPLOAD_STATUS",
            status: "started",
            campaignName,
          });

          // Detect region
          const regionInfo = detectRegionFromCampaign(campaignName);
          if (!regionInfo) {
            throw new Error(`Could not detect region from campaign name: ${campaignName}`);
          }

          // Upload to Google Drive
          const uploadConfig: GoogleDriveConfig = {
            parentFolderId: regionInfo.folderId,
            campaignFolderName: campaignName,
            fileName: fileName,
            fileBlob: fileBlob,
          };

          const result = await uploadToGoogleDrive(uploadConfig);

          if (!result.success) {
            throw new Error(result.error || "Upload failed");
          }

          console.log("[Background] Upload successful:", result);

          // Send "success" status
          broadcastUploadStatus({
            type: "UPLOAD_STATUS",
            status: "success",
            campaignName,
            fileName: result.fileName,
          });

          resolve();
        } catch (error) {
          console.error("[Background] Error processing download:", error);

          // Send "error" status
          broadcastUploadStatus({
            type: "UPLOAD_STATUS",
            status: "error",
            campaignName,
            error: error instanceof Error ? error.message : "Unknown error",
          });

          reject(error);
        }
      }
    );
  });
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REFETCH_UPLOAD_STATUSES") {
    (async () => {
      try {
        // Load campaigns and current statuses
        const stored = await chrome.storage.local.get([
          "gmv_max_campaign_data",
          "gmv_max_upload_success_status",
        ]);

        const campaigns: Array<{ name: string; id: string }> = stored.gmv_max_campaign_data || [];
        const currentStatuses: Record<string, { status: string }> = stored.gmv_max_upload_success_status || {};

        if (campaigns.length === 0) {
          sendResponse({ success: true });
          return;
        }

        // Auth once
        const token = await getAuthToken();

        // For each campaign, check if a file exists in its region folder
        const updatedStatuses: Record<string, { status: string }> = { ...currentStatuses };

        for (const campaign of campaigns) {
          const regionInfo = detectRegionFromCampaign(campaign.name);
          if (!regionInfo) {
            continue;
          }

          try {
            const searchQuery = encodeURIComponent(
              `name contains '${campaign.name}' and '${regionInfo.folderId}' in parents and trashed=false`
            );
            const resp = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&fields=files(id,name,createdTime)&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=createdTime desc`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (resp.ok) {
              const data = await resp.json();
              if (Array.isArray(data.files) && data.files.length > 0) {
                updatedStatuses[campaign.name] = { status: "success" } as any;
              }
            }
          } catch (_) {
            // Ignore per-campaign errors to allow others to proceed
          }
        }

        await chrome.storage.local.set({ gmv_max_upload_success_status: updatedStatuses });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
    return true;
  }
  if (message.type === "CHECK_AND_UPLOAD_DOWNLOAD") {
    // Handle download check and upload request from content script
    console.log("[Background] Received CHECK_AND_UPLOAD_DOWNLOAD request");
    checkAndUploadDownload(message.campaignName)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("[Background] Failed to check and upload:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }

  if (message.type === "UPLOAD_FILE") {
    // Handle direct file upload request
    handleFileUpload(message as UploadRequest)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.todos) {
    updateBadge();
  }
});

// Update badge on extension install/startup
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Initial badge update
updateBadge();

// Background service worker for Chrome extension

import { uploadToGoogleDrive, type GoogleDriveConfig, getAuthToken } from "./services/google-drive";
import { detectRegionFromCampaign, validateSharedDriveFolders } from "./utils/region-detector";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

interface UploadRequest {
  campaignName: string;
  fileName: string;
  fileUrl: string;
  folderId?: string; // Optional: direct folder ID to upload to
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
  const { campaignName, fileName, fileUrl, folderId } = request;

  console.log("[Background] Starting file upload process:", { campaignName, fileName, folderId });

  // Send "started" status to popup
  broadcastUploadStatus({
    type: "UPLOAD_STATUS",
    status: "started",
    campaignName,
  });

  try {
    // Step 1: Detect region from campaign name (if folder ID not provided)
    let parentFolderId: string;

    if (folderId) {
      // Use provided folder ID directly
      console.log("[Background] Using provided folder ID:", folderId);
      parentFolderId = ""; // Not needed when using direct folderId
    } else {
      // Detect region from campaign name
      const regionInfo = detectRegionFromCampaign(campaignName);
      if (!regionInfo) {
        throw new Error(`Could not detect region from campaign name: ${campaignName}`);
      }
      console.log("[Background] Region detected:", regionInfo);
      parentFolderId = regionInfo.folderId;
    }

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
      parentFolderId: folderId || parentFolderId,
      ...(folderId ? { folderId } : { campaignFolderName: campaignName }),
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
async function checkAndUploadDownload(campaignName: string, campaignId: string, folderId?: string): Promise<void> {
  console.log("[Background] Checking recent downloads for campaign:", campaignName, "folderId:", folderId);

  // Validate campaign name is not empty
  if (!campaignName || campaignName.trim() === "") {
    const errorMsg = `Campaign name is empty for campaign ID: ${campaignId}. Please check your campaign data in the extension settings.`;
    console.error("[Background]", errorMsg);
    broadcastUploadStatus({
      type: "UPLOAD_STATUS",
      status: "error",
      campaignName: campaignId, // Use campaignId as fallback
      error: errorMsg,
    });
    throw new Error(errorMsg);
  }

  // STEP 0: Check if file already exists in Google Drive before downloading
  try {
    console.log("[Background] STEP 0: Checking if file already exists in Google Drive...");

    // Get auth token
    const token = await getAuthToken();

    // Determine target folder ID
    let campaignFolderId: string | null = null;

    if (folderId) {
      // Use provided folder ID directly
      console.log("[Background] Using provided folder ID:", folderId);
      campaignFolderId = folderId;
    } else {
      // Detect region to get the correct folder
      const regionInfo = detectRegionFromCampaign(campaignName);
      if (!regionInfo) {
        throw new Error(`Could not detect region from campaign name: ${campaignName}`);
      }

      // Find the campaign folder by name
      const searchQuery = encodeURIComponent(
        `name='${campaignName}' and '${regionInfo.folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
      );
      const folderResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${searchQuery}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (folderResponse.ok) {
        const folderData = await folderResponse.json();
        if (folderData.files && folderData.files.length > 0) {
          campaignFolderId = folderData.files[0].id;
        }
      }
    }

    if (campaignFolderId) {
        console.log("[Background] Campaign folder exists:", campaignFolderId);
        
        // Now check if a file with the campaign ID in its name exists
        const fileSearchQuery = encodeURIComponent(
          `'${campaignFolderId}' in parents and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and trashed=false`
        );
        const fileResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${fileSearchQuery}&fields=files(id,name,createdTime)&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=createdTime desc`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        
        if (fileResponse.ok) {
          const fileData = await fileResponse.json();

          // Check if any file matches BOTH campaign ID AND today's date
          // File format: "Product data YYYY-MM-DD - YYYY-MM-DD - Campaign {campaignId}"
          const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
          const expectedFileName = `Product data ${today} - ${today} - Campaign ${campaignId}`;

          const existingFile = fileData.files?.find((file: any) => {
            // Exact file name match ensures both date and campaign ID are correct
            return file.name === expectedFileName;
          });

          if (existingFile) {
            console.log("[Background] ✅ File already exists in Google Drive:", existingFile.name);
            console.log("[Background] Skipping download and upload - marking as success");

            // Broadcast success status immediately
            broadcastUploadStatus({
              type: "UPLOAD_STATUS",
              status: "success",
              campaignName,
              fileName: existingFile.name,
            });

            return; // Exit early - no need to download or upload
          }
        }
      }

    console.log("[Background] File does not exist in Google Drive - proceeding with download");
  } catch (error) {
    console.warn("[Background] Error checking file existence, proceeding with download:", error);
    // Continue with download even if check fails
  }

  // Wait a bit for the download to complete
  // Increased delay to ensure file is fully downloaded before checking
  await new Promise((resolve) => setTimeout(resolve, 3000));

  return new Promise((resolve, reject) => {
    chrome.downloads.search(
      {
        orderBy: ["-startTime"],
        limit: 10, // Check last 10 downloads to handle multiple campaigns
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

        // Find the most recent .xlsx file that matches the campaign ID
        // File format: "(Product|Livestream) data YYYY-MM-DD - YYYY-MM-DD - Campaign {campaignId}( (n))?.xlsx"
        const xlsxDownload = downloads.find(
          (d) => {
            if (!d.filename.endsWith(".xlsx") || d.state !== "complete") {
              return false;
            }
            // Match campaign ID with optional duplicate suffix like " (6)"
            const campaignPattern = new RegExp(`Campaign ${campaignId}(?:\s*\(\d+\))?`);
            return campaignPattern.test(d.filename);
          }
        );

        if (!xlsxDownload) {
          console.warn("[Background] No completed Excel file found for campaign ID:", campaignId);
          console.warn("[Background] Available downloads:", downloads.map(d => d.filename));
          reject(new Error(`No Excel file found for campaign ${campaignId}`));
          return;
        }

        console.log("[Background] Found Excel download for campaign:", xlsxDownload);

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

          // Determine upload configuration
          let uploadConfig: GoogleDriveConfig;

          if (folderId) {
            // Use provided folder ID directly
            console.log("[Background] Using provided folder ID:", folderId);
            uploadConfig = {
              parentFolderId: folderId,
              folderId: folderId,
              fileName: fileName,
              fileBlob: fileBlob,
            };
          } else {
            // Detect region from campaign name
            const regionInfo = detectRegionFromCampaign(campaignName);
            if (!regionInfo) {
              throw new Error(`Could not detect region from campaign name: ${campaignName}`);
            }
            uploadConfig = {
              parentFolderId: regionInfo.folderId,
              campaignFolderName: campaignName,
              fileName: fileName,
              fileBlob: fileBlob,
            };
          }

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
            // Step 1: Search for the campaign folder inside the region parent folder
            const folderSearchQuery = encodeURIComponent(
              `name='${campaign.name}' and '${regionInfo.folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
            );
            const folderResp = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${folderSearchQuery}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`,
              { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!folderResp.ok) {
              // If folder search fails, do not mark as success
              continue;
            }

            const folderData = await folderResp.json();
            if (!Array.isArray(folderData.files) || folderData.files.length === 0) {
              // No folder found for this campaign - do not mark as success
              // Remove from statuses if it was previously marked as success
              if (updatedStatuses[campaign.name]?.status === "success") {
                delete updatedStatuses[campaign.name];
              }
              continue;
            }

            // Step 2: Check if the campaign folder contains a file with the campaign ID in its name
            const campaignFolderId = folderData.files[0].id;
            const fileSearchQuery = encodeURIComponent(
              `'${campaignFolderId}' in parents and mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' and trashed=false`
            );
            const fileResp = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${fileSearchQuery}&fields=files(id,name,createdTime)&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=createdTime desc`,
              { headers: { Authorization: `Bearer ${token}` } }
            );

            if (fileResp.ok) {
              const fileData = await fileResp.json();

              // Check if any file matches BOTH campaign ID AND today's date
              // File format: "Product data YYYY-MM-DD - YYYY-MM-DD - Campaign {campaignId}"
              const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
              const expectedFileName = `Product data ${today} - ${today} - Campaign ${campaign.id}`;

              const hasMatchingFile = Array.isArray(fileData.files) &&
                fileData.files.some((file: any) => file.name === expectedFileName);

              if (hasMatchingFile) {
                // Found .xlsx file with exact filename match (date + campaign ID) - mark as success
                updatedStatuses[campaign.name] = { status: "success" } as any;
              } else {
                // Folder exists but no file with exact match - remove success status if previously set
                if (updatedStatuses[campaign.name]?.status === "success") {
                  delete updatedStatuses[campaign.name];
                }
              }
            } else {
              // File search failed - remove success status if previously set
              if (updatedStatuses[campaign.name]?.status === "success") {
                delete updatedStatuses[campaign.name];
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
    checkAndUploadDownload(message.campaignName, message.campaignId, message.folderId)
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
  
  // 🔧 DEVELOPMENT ONLY: Validate Shared Drive configuration
  // ✅ ENABLED - Verify folder IDs are in Shared Drives
  // ⚠️ REMEMBER TO COMMENT OUT before production deployment
  (async () => {
    try {
      const token = await getAuthToken();
      const validation = await validateSharedDriveFolders(token);
      
      console.log("========================================");
      console.log("📁 SHARED DRIVE VALIDATION RESULTS");
      console.log("========================================");
      
      validation.results.forEach(({ region, folderId, accessible, isSharedDrive, folderName, error }) => {
        const status = (accessible && isSharedDrive) ? "✅" : "❌";
        console.log(`${status} ${region}`);
        console.log(`   Folder ID: ${folderId}`);
        if (folderName) console.log(`   Folder Name: ${folderName}`);
        console.log(`   Accessible: ${accessible}`);
        console.log(`   Shared Drive: ${isSharedDrive}`);
        if (error) console.log(`   Error: ${error}`);
        console.log("");
      });
      
      console.log("========================================");
      console.log(`Overall Status: ${validation.valid ? "✅ ALL VALID" : "❌ SOME FOLDERS ARE INVALID"}`);
      console.log("========================================");
      
      if (!validation.valid) {
        console.error("");
        console.error("========================================");
        console.error("⚠️ ACTION REQUIRED: Fix Folder Access");
        console.error("========================================");
        console.error("");
        console.error("🔧 SOLUTION:");
        console.error("1. Go to Google Drive → Shared drives");
        console.error("2. Find 'GMV_Max_Automation_TEST' Shared Drive");
        console.error("3. Right-click the Shared Drive → 'Manage members'");
        console.error("4. Click 'Add members'");
        console.error("5. Add this service account email:");
        console.error("   gmv-max-automation-service-acc@gmv-max-campaign-navigator.iam.gserviceaccount.com");
        console.error("6. Set role to 'Content manager' or 'Manager'");
        console.error("7. Click 'Send'");
        console.error("");
        console.error("========================================");
      }
    } catch (error) {
      console.error("Failed to validate folders:", error);
    }
  })();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// Initial badge update
updateBadge();

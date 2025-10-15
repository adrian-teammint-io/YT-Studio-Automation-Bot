/**
 * Google Drive API service for uploading files to specific folders
 * Handles authentication, folder management, and file uploads
 */

export interface GoogleDriveConfig {
  parentFolderId: string;
  campaignFolderName: string;
  fileName: string;
  fileBlob: Blob;
}

export interface UploadResult {
  success: boolean;
  fileId?: string;
  fileName?: string;
  error?: string;
}

/**
 * Get OAuth token for Google Drive API access
 */
export async function getAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || "Failed to get auth token"));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Remove cached OAuth token (useful for re-authentication)
 */
export async function removeAuthToken(token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.identity.removeCachedAuthToken({ token }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Search for a folder by name within a parent folder
 */
async function findFolder(
  token: string,
  folderName: string,
  parentFolderId: string
): Promise<string | null> {
  const query = encodeURIComponent(
    `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to search for folder: ${response.statusText}`);
  }

  const data = await response.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

/**
 * Create a new folder in Google Drive
 */
async function createFolder(
  token: string,
  folderName: string,
  parentFolderId: string
): Promise<string> {
  const metadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentFolderId],
  };

  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    throw new Error(`Failed to create folder: ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Get or create a folder (finds existing or creates new)
 */
async function getOrCreateFolder(
  token: string,
  folderName: string,
  parentFolderId: string
): Promise<string> {
  // Try to find existing folder first
  const existingFolderId = await findFolder(token, folderName, parentFolderId);

  if (existingFolderId) {
    console.log(`[Google Drive] Found existing folder: ${folderName}`);
    return existingFolderId;
  }

  // Create new folder if not found
  console.log(`[Google Drive] Creating new folder: ${folderName}`);
  return await createFolder(token, folderName, parentFolderId);
}

/**
 * Upload a file to Google Drive
 */
async function uploadFile(
  token: string,
  fileName: string,
  fileBlob: Blob,
  folderId: string
): Promise<{ id: string; name: string }> {
  // Step 1: Create metadata
  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  // Step 2: Prepare multipart upload
  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const metadataPart = delimiter + "Content-Type: application/json\r\n\r\n" + JSON.stringify(metadata);

  const fileData = await fileBlob.arrayBuffer();
  const filePart = delimiter + "Content-Type: " + fileBlob.type + "\r\n\r\n";

  // Combine parts
  const multipartBody = new Blob(
    [
      metadataPart,
      filePart,
      fileData,
      closeDelimiter,
    ],
    { type: `multipart/related; boundary=${boundary}` }
  );

  // Step 3: Upload to Google Drive
  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload file: ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Main upload function: orchestrates folder creation and file upload
 */
export async function uploadToGoogleDrive(config: GoogleDriveConfig): Promise<UploadResult> {
  try {
    console.log("[Google Drive] Starting upload process...");
    console.log("[Google Drive] Config:", {
      parentFolderId: config.parentFolderId,
      campaignFolderName: config.campaignFolderName,
      fileName: config.fileName,
    });

    // Get authentication token
    const token = await getAuthToken();
    console.log("[Google Drive] Authentication successful");

    // Get or create campaign folder
    const campaignFolderId = await getOrCreateFolder(
      token,
      config.campaignFolderName,
      config.parentFolderId
    );
    console.log("[Google Drive] Campaign folder ready:", campaignFolderId);

    // Upload file
    const uploadedFile = await uploadFile(
      token,
      config.fileName,
      config.fileBlob,
      campaignFolderId
    );
    console.log("[Google Drive] File uploaded successfully:", uploadedFile);

    return {
      success: true,
      fileId: uploadedFile.id,
      fileName: uploadedFile.name,
    };
  } catch (error) {
    console.error("[Google Drive] Upload failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

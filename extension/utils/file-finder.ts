/**
 * Chrome Extension utilities for finding the latest downloaded TSV file
 * Uses Chrome Downloads API instead of Node.js fs module
 */

export interface DownloadedFile {
  id: number;
  filename: string;
  url?: string;
  fileSize: number;
  startTime: string;
  endTime?: string;
  state: string;
}

/**
 * Find the latest TSV file from Chrome downloads
 * @param limit Number of recent downloads to check (default: 50)
 * @returns Promise resolving to the most recent TSV download or null
 */
export async function findLatestTSVFile(limit: number = 50): Promise<DownloadedFile | null> {
  return new Promise((resolve, reject) => {
    if (!chrome?.downloads) {
      reject(new Error('Chrome downloads API not available'));
      return;
    }

    chrome.downloads.search(
      {
        orderBy: ['-startTime'], // Most recent first
        limit: limit,
      },
      (downloads) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!downloads || downloads.length === 0) {
          resolve(null);
          return;
        }

        // Filter for TSV files that are complete
        // Chrome may keep blob URLs even after file is saved, so we construct file:// URL from filename
        const tsvFiles = downloads.filter(
          (d) => {
            const isTSV = d.filename.toLowerCase().endsWith('.tsv');
            const isComplete = d.state === 'complete';
            return isTSV && isComplete;
          }
        );

        if (tsvFiles.length === 0) {
          resolve(null);
          return;
        }

        // Already sorted by startTime (most recent first)
        const latestTSV = tsvFiles[0];

        // Construct file:// URL from filename if URL is blob or missing
        let fileUrl = latestTSV.url;

        if (!fileUrl || fileUrl.startsWith('blob:')) {
          // Construct file:// URL from filename
          const filename = latestTSV.filename;

          // Ensure filename is absolute path
          if (filename && filename.startsWith('/')) {
            fileUrl = `file://${filename}`;
          } else {
            // Can't construct file:// URL from relative path
            resolve(null);
            return;
          }
        }

        resolve({
          id: latestTSV.id,
          filename: latestTSV.filename,
          url: fileUrl,
          fileSize: latestTSV.fileSize,
          startTime: latestTSV.startTime,
          endTime: latestTSV.endTime,
          state: latestTSV.state,
        });
      }
    );
  });
}

/**
 * Get the content of a downloaded file by its file:// URL
 * This matches the implementation from READ_LATEST_DOWNLOADED_FILE_GUIDE.md
 * The guide states: "The url property from chrome.downloads.search() is a file:// URL"
 * @param fileUrl The file:// URL pointing to the file in Downloads folder
 * @returns Promise resolving to the file content as text
 */
export async function getDownloadContentByUrl(fileUrl: string): Promise<string> {
  if (!fileUrl) {
    throw new Error('Download URL not available');
  }

  // Verify it's a file:// URL (as per guide)
  if (!fileUrl.startsWith('file://')) {
    throw new Error(`Expected file:// URL but got: ${fileUrl.substring(0, 50)}... (file must be saved to Downloads folder)`);
  }

  console.log('[FileFinder] Fetching file from Downloads folder:', fileUrl);

  // Wait a moment for the download to fully complete (as per guide - Step 3)
  // The guide shows waiting 500ms after download completion before fetching
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // Fetch the file content (as per guide - Step 3)
    // The file:// URL from downloads API can be fetched in background context
    // According to the guide: "In background script context, you can fetch file:// URLs directly"
    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch downloaded file: ${response.statusText} (status: ${response.status})`);
    }

    const content = await response.text();
    console.log('[FileFinder] File fetched successfully from Downloads folder, size:', content.length, 'characters');

    return content;
  } catch (error) {
    console.error('[FileFinder] Error fetching file from Downloads folder:', error);
    console.error('[FileFinder] File URL:', fileUrl);
    console.error('[FileFinder] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[FileFinder] Error message:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Get the content of a downloaded file by its download ID
 * @param downloadId The Chrome download ID
 * @returns Promise resolving to the file content as text
 */
export async function getDownloadContent(downloadId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.downloads.search({ id: downloadId }, async (downloads) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!downloads || downloads.length === 0) {
        reject(new Error('Download not found'));
        return;
      }

      const download = downloads[0];

      if (!download.url) {
        reject(new Error('Download URL not available'));
        return;
      }

      try {
        const content = await getDownloadContentByUrl(download.url);
        resolve(content);
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Wait for the latest TSV download to complete by polling
 * This matches the polling pattern from READ_LATEST_DOWNLOADED_FILE_GUIDE.md
 * @param maxWaitMs Maximum time to wait in milliseconds (default: 10000 = 10 seconds)
 * @param pollInterval Interval between polls in milliseconds (default: 300)
 * @param limit Number of recent downloads to check per poll (default: 10)
 * @returns Promise resolving to the most recent completed TSV download or null
 */
export async function waitForLatestTSVFile(
  maxWaitMs: number = 10000,
  pollInterval: number = 300,
  limit: number = 10
): Promise<DownloadedFile | null> {
  const startTime = Date.now();
  let attemptCount = 0;

  console.log(`[FileFinder] Starting to poll for TSV download (max ${maxWaitMs}ms, interval ${pollInterval}ms)`);

  while (Date.now() - startTime < maxWaitMs) {
    attemptCount++;
    try {
      // Search for downloads (as per guide pattern)
      const downloads = await new Promise<chrome.downloads.DownloadItem[]>((resolve, reject) => {
        chrome.downloads.search(
          {
            orderBy: ['-startTime'],
            limit: limit,
          },
          (items) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(items || []);
          }
        );
      });

      // Filter for completed TSV files
      // Chrome may keep blob URLs even after file is saved, so we construct file:// URL from filename
      const tsvFiles = downloads.filter(
        (d) => {
          const isTSV = d.filename.toLowerCase().endsWith('.tsv');
          const isComplete = d.state === 'complete';
          return isTSV && isComplete;
        }
      );

      if (tsvFiles.length > 0) {
        const latestTSV = tsvFiles[0]; // Already sorted by startTime

        // Construct file:// URL from filename if URL is blob or missing
        // The filename contains the full path to the file in Downloads folder
        let fileUrl = latestTSV.url;

        if (!fileUrl || fileUrl.startsWith('blob:')) {
          // Construct file:// URL from filename
          // Filename format: /Users/username/Downloads/filename.tsv
          // Convert to: file:///Users/username/Downloads/filename.tsv
          const filename = latestTSV.filename;

          // Ensure filename starts with / (absolute path)
          if (filename && !filename.startsWith('/')) {
            // If relative path, we can't construct file:// URL reliably
            console.warn(`[FileFinder] Filename is relative path, cannot construct file:// URL: ${filename}`);
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
            continue;
          }

          // Construct file:// URL (file:// + absolute path)
          fileUrl = `file://${filename}`;
          console.log(`[FileFinder] Constructed file:// URL from filename: ${fileUrl}`);
        }

        if (!fileUrl || !fileUrl.startsWith('file://')) {
          console.warn(`[FileFinder] Cannot construct valid file:// URL for: ${latestTSV.filename}`);
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          continue;
        }

        console.log(`[FileFinder] Found completed TSV file after ${attemptCount} attempts: ${latestTSV.filename}`);
        console.log(`[FileFinder] Using file URL: ${fileUrl}`);

        return {
          id: latestTSV.id,
          filename: latestTSV.filename,
          url: fileUrl,
          fileSize: latestTSV.fileSize || 0,
          startTime: latestTSV.startTime || '',
          endTime: latestTSV.endTime,
          state: latestTSV.state,
        };
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(`[FileFinder] Error during polling (attempt ${attemptCount}):`, error);
      // Continue polling despite errors
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  console.warn(`[FileFinder] Timeout: No completed TSV file found within ${maxWaitMs}ms after ${attemptCount} attempts`);
  return null;
}

/**
 * Find and read the latest TSV file
 * This matches the implementation pattern from READ_LATEST_DOWNLOADED_FILE_GUIDE.md
 * @param limit Number of recent downloads to check (default: 50)
 * @param waitForCompletion If true, poll for download completion (default: false)
 * @param maxWaitMs Maximum time to wait for completion if waitForCompletion is true (default: 10000)
 * @returns Promise resolving to object with file info and content, or null if no TSV found
 */
export async function getLatestTSVFile(
  limit: number = 50,
  waitForCompletion: boolean = false,
  maxWaitMs: number = 10000
): Promise<{ file: DownloadedFile; content: string } | null> {
  try {
    let latestFile: DownloadedFile | null;

    if (waitForCompletion) {
      // Poll for completion
      console.log('[FileFinder] Polling for completed TSV download...');
      latestFile = await waitForLatestTSVFile(maxWaitMs, 300, limit);
    } else {
      // Immediate search (no polling)
      latestFile = await findLatestTSVFile(limit);
    }

    if (!latestFile) {
      console.warn('[FileFinder] No TSV file found');
      return null;
    }

    if (!latestFile.url) {
      console.error('[FileFinder] Download URL not available for file:', latestFile.filename);
      return null;
    }

    console.log('[FileFinder] Found TSV file:', latestFile.filename);
    console.log('[FileFinder] File details:', {
      id: latestFile.id,
      filename: latestFile.filename,
      url: latestFile.url,
      state: latestFile.state,
      fileSize: latestFile.fileSize,
      startTime: latestFile.startTime,
      endTime: latestFile.endTime,
    });

    // Verify the file is actually complete and has a valid URL
    if (latestFile.state !== 'complete') {
      throw new Error(`File is not complete: state is ${latestFile.state}`);
    }

    if (!latestFile.url) {
      throw new Error('Download URL not available');
    }

    // Verify we have a file:// URL (should be guaranteed by our filtering, but double-check)
    if (!latestFile.url.startsWith('file://')) {
      throw new Error(`Expected file:// URL but got: ${latestFile.url.substring(0, 50)}... (file may not be saved to Downloads folder yet)`);
    }

    console.log('[FileFinder] URL is a file:// URL (correct for background script)');
    console.log('[FileFinder] Reading downloaded file from Downloads folder...');

    // Use the URL directly from the download item (as per guide)
    // This avoids searching again and uses the file:// URL we already have
    const content = await getDownloadContentByUrl(latestFile.url);

    return {
      file: latestFile,
      content,
    };
  } catch (error) {
    console.error('[FileFinder] Error getting latest TSV file:', error);
    throw error; // Re-throw to let caller handle it
  }
}

# How to Read the Latest Downloaded File in a Chrome Extension

## Overview
This guide explains how to read the most recently downloaded file in a Chrome extension using the Chrome Downloads API. This is useful for automatically processing files after they're downloaded.

## Prerequisites

### 1. Required Permissions
Add the `downloads` permission to your `manifest.json`:

```json
{
  "permissions": [
    "downloads"
  ]
}
```

### 2. Background Script Context
The Downloads API can only be accessed from:
- **Background service worker** (Manifest V3) ✅ Recommended
- **Background page** (Manifest V2)
- **Extension pages** (popup, options, etc.)

**Cannot be accessed from:**
- Content scripts ❌
- Web pages ❌

## Quick Code Snippet (From Codebase)

Here's the simplest version extracted from the actual codebase:

```typescript
// Find latest downloaded file matching criteria
function findLatestDownloadedFile(fileExtension: string = ".xlsx", pattern?: RegExp): Promise<chrome.downloads.DownloadItem | null> {
  return new Promise((resolve, reject) => {
    chrome.downloads.search(
      {
        orderBy: ["-startTime"],  // Most recent first
        limit: 10                 // Check last 10 downloads
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

        // Find first matching download (already sorted by most recent)
        const latest = downloads.find((d) => {
          // Must be completed
          if (d.state !== "complete") return false;

          // Check file extension
          if (!d.filename.endsWith(fileExtension)) return false;

          // Check pattern if provided
          if (pattern) {
            const fileName = d.filename.split(/[/\\]/).pop() || d.filename;
            if (!pattern.test(fileName)) return false;
          }

          return true;
        });

        resolve(latest || null);
      }
    );
  });
}

// Read the file content as Blob
async function readDownloadedFile(download: chrome.downloads.DownloadItem): Promise<Blob> {
  if (!download.url) {
    throw new Error("Download URL not available");
  }

  const response = await fetch(download.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }

  return await response.blob();
}

// Usage:
const latest = await findLatestDownloadedFile(".xlsx");
if (latest) {
  const blob = await readDownloadedFile(latest);
  console.log("File:", latest.filename, "Size:", blob.size);
}
```

## Step-by-Step Implementation

### Step 1: Search for Recent Downloads

Use `chrome.downloads.search()` to query the download history:

```typescript
chrome.downloads.search(
  {
    orderBy: ["-startTime"],  // Most recent first
    limit: 10                  // Get last 10 downloads
  },
  (downloads) => {
    if (chrome.runtime.lastError) {
      console.error("Error:", chrome.runtime.lastError);
      return;
    }

    // Process downloads array
    console.log("Found downloads:", downloads);
  }
);
```

**Key Parameters:**
- `orderBy: ["-startTime"]` - Orders by most recent download time
- `limit: N` - Limits results (useful for performance)

### Step 2: Filter for Your Target File

Filter the downloads array to find the file you need:

```typescript
const targetDownload = downloads.find((d) => {
  // Check file extension
  if (!d.filename.endsWith(".xlsx")) {
    return false;
  }

  // Check download state (must be complete)
  if (d.state !== "complete") {
    return false;
  }

  // Check filename pattern (customize for your use case)
  const fileName = d.filename.split(/[/\\]/).pop() || d.filename;
  const matchesPattern = /your-pattern-here/.test(fileName);

  return matchesPattern;
});
```

**Important Download States:**
- `"complete"` - Download finished successfully ✅
- `"in_progress"` - Still downloading
- `"interrupted"` - Download failed/cancelled

### Step 3: Read the File Content

Once you have the download item, read it using `fetch()`:

```typescript
if (!targetDownload.url) {
  throw new Error("Download URL not available");
}

// Fetch the file content
const response = await fetch(targetDownload.url);
if (!response.ok) {
  throw new Error(`Failed to fetch file: ${response.statusText}`);
}

// Get file as Blob
const fileBlob = await response.blob();
console.log("File size:", fileBlob.size, "bytes");
```

**Why this works:**
- The `url` property from `chrome.downloads.search()` is a `file://` URL
- In background script context, you can fetch `file://` URLs directly
- The response can be converted to a Blob for processing

### Step 4: Handle Edge Cases

#### Case 1: File Not Downloaded Yet
If you're checking immediately after triggering a download, you may need to poll:

```typescript
async function waitForDownload(pattern: RegExp, maxWaitMs = 5000): Promise<chrome.downloads.DownloadItem | null> {
  const startTime = Date.now();
  const pollInterval = 300; // Check every 300ms

  while (Date.now() - startTime < maxWaitMs) {
    const downloads = await new Promise<chrome.downloads.DownloadItem[]>((resolve) => {
      chrome.downloads.search(
        { orderBy: ["-startTime"], limit: 5 },
        (items) => resolve(items || [])
      );
    });

    const found = downloads.find((d) => {
      if (d.state !== "complete" || !d.filename.endsWith(".xlsx")) {
        return false;
      }
      const fileName = d.filename.split(/[/\\]/).pop() || d.filename;
      return pattern.test(fileName);
    });

    if (found) {
      return found;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return null; // Not found within timeout
}
```

#### Case 2: Multiple Files with Same Pattern
If multiple files match, you can get the most recent one:

```typescript
// Downloads are already sorted by -startTime, so first match is most recent
const mostRecent = downloads.find(/* your filter */);
```

Or if you need to process all matches:

```typescript
const matchingDownloads = downloads.filter(/* your filter */);
// Process each one
```

## Complete Example (From Actual Codebase)

Here's the actual code from `extension/background.ts` that finds and reads the latest downloaded file:

```typescript
// This is the actual implementation from the codebase
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

      // Find the most recent .xlsx file that matches the pattern
      const xlsxDownload = downloads.find(
        (d) => {
          if (!d.filename.endsWith(".xlsx") || d.state !== "complete") {
            return false;
          }
          // Match pattern (customize for your use case)
          const campaignPattern = new RegExp(`(Product|Live shopping|Livestream) data .*Campaign ${campaignId}(?:\\s*\\(\\d+\\))?`);
          // Extract just the filename from the full path for matching
          const fileName = d.filename.split(/[/\\]/).pop() || d.filename;
          const matches = campaignPattern.test(fileName);
          console.log(`[Background] Checking file: "${fileName}", matches: ${matches}`);
          return matches;
        }
      );

      if (!xlsxDownload) {
        console.warn("[Background] No completed Excel file found");
        reject(new Error(`No Excel file found`));
        return;
      }

      console.log("[Background] Found Excel download:", xlsxDownload);

      // Extract filename from path
      const fileName = xlsxDownload.filename.split(/[/\\]/).pop() || "report.xlsx";

      // Read the file
      try {
        console.log("[Background] Reading downloaded file...");

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

        // Use the blob (upload, process, etc.)
        resolve(fileBlob);
      } catch (error) {
        console.error("[Background] Error processing download:", error);
        reject(error);
      }
    }
  );
});
```

## Common Issues and Solutions

### Issue 1: "Download URL not available"
**Cause:** The download item doesn't have a `url` property (rare, but can happen)
**Solution:** Check if `url` exists before fetching, or use `chrome.downloads.getFileIcon()` as alternative

### Issue 2: "Failed to fetch file"
**Cause:** Trying to fetch from content script or web page context
**Solution:** Ensure you're calling this from a background script

### Issue 3: File not found immediately after download
**Cause:** Download hasn't completed yet
**Solution:** Implement polling with timeout (see Step 4, Case 1)

### Issue 4: Wrong file selected
**Cause:** Pattern matches multiple files or incorrect pattern
**Solution:**
- Make pattern more specific
- Check `startTime` to ensure it's recent
- Add additional filters (file size, etc.)

## TypeScript Types

If using TypeScript, you can type the download item:

```typescript
interface DownloadItem {
  id: number;
  url?: string;
  filename: string;
  state: "in_progress" | "complete" | "interrupted";
  startTime?: string;
  endTime?: string;
  totalBytes?: number;
  fileSize?: number;
  // ... other properties
}
```

## Testing Tips

1. **Test with real downloads:** Trigger actual downloads in your extension
2. **Check browser console:** Look for errors in background script console
3. **Verify permissions:** Ensure `downloads` permission is in manifest
4. **Test timing:** If checking immediately after download, test polling logic

## Reference: Actual Code from Codebase

Here are the exact code snippets from `extension/background.ts`:

### Finding Latest Download (with polling for timing)

```172:195:extension/background.ts
    const downloads = await new Promise<chrome.downloads.DownloadItem[]>((resolve) => {
      chrome.downloads.search(
        {
          orderBy: ["-startTime"],
          limit: 5,
        },
        (items) => resolve(items || [])
      );
    });

    // Look for the campaign file
    // Match both regular campaigns and LIVE shopping campaigns
    // Patterns: "Product data..." OR "Live shopping data..." OR "Livestream data..."
    const campaignPattern = new RegExp(`(Product|Live shopping|Livestream) data .*Campaign ${campaignId}(?:\\s*\\(\\d+\\))?`);
    const foundDownload = downloads.find(
      (d) => {
        if (!d.filename.endsWith(".xlsx") || d.state !== "complete") {
          return false;
        }
        // Extract just the filename from the full path
        const fileName = d.filename.split(/[/\\]/).pop() || d.filename;
        return campaignPattern.test(fileName);
      }
    );
```

### Reading the File Content

```368:386:extension/background.ts
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
```

### Complete Search Implementation

```311:360:extension/background.ts
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
        // File format: "(Product|Live shopping|Livestream) data YYYY-MM-DD - YYYY-MM-DD - Campaign {campaignId}( (n))?.xlsx"
        console.log(`[Background] Searching for campaign ID: ${campaignId}`);
        console.log(`[Background] Total downloads found: ${downloads.length}`);
        downloads.forEach((d, i) => {
          const fileName = d.filename.split(/[/\\]/).pop() || d.filename;
          console.log(`[Background] Download ${i}: "${fileName}" (state: ${d.state})`);
        });

        const xlsxDownload = downloads.find(
          (d) => {
            if (!d.filename.endsWith(".xlsx") || d.state !== "complete") {
              return false;
            }
            // Match campaign ID with optional duplicate suffix like " (6)"
            // Also match the data type prefix (Product, Live shopping, or Livestream)
            const campaignPattern = new RegExp(`(Product|Live shopping|Livestream) data .*Campaign ${campaignId}(?:\s*\(\d+\))?`);
            // Extract just the filename from the full path for matching
            const fileName = d.filename.split(/[/\\]/).pop() || d.filename;
            const matches = campaignPattern.test(fileName);
            console.log(`[Background] Checking file: "${fileName}", matches: ${matches}`);
            return matches;
          }
        );

        if (!xlsxDownload) {
          console.warn("[Background] No completed Excel file found for campaign ID:", campaignId);
          console.warn("[Background] Available downloads:", downloads.map(d => d.filename));
          reject(new Error(`No Excel file found for campaign ${campaignId}`));
          return;
        }
```

## Summary Checklist

- [ ] Added `"downloads"` permission to manifest.json
- [ ] Implemented `chrome.downloads.search()` with proper ordering
- [ ] Added filtering logic for file extension and state
- [ ] Added filename pattern matching
- [ ] Implemented `fetch(downloadItem.url)` to read file
- [ ] Converted response to Blob
- [ ] Added error handling for missing URL, fetch failures
- [ ] Considered polling if checking immediately after download
- [ ] Tested in background script context (not content script)

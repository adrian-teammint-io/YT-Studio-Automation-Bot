/**
 * Content script for auto-clicking export button on TikTok Ads GMV Max dashboard
 * Runs on campaign pages and automatically clicks the export button when available
 * Also detects downloaded files and triggers upload to Google Drive
 */

const STORAGE_KEY = "gmv_max_auto_click_enabled";
const WORKFLOW_PAUSED_KEY = "gmv_max_workflow_paused";
const MAX_RETRY_ATTEMPTS = 10;
const RETRY_INTERVAL = 1000; // 1 second
const DOWNLOAD_DETECTION_DELAY = 3000; // Wait 3 seconds after clicking before checking downloads
const AUTO_NAVIGATION_DELAY = 2000; // Wait 2 seconds after upload success before auto-navigating to next campaign

// Deduplication: Track if we've already clicked to prevent duplicate uploads
let hasClickedExportButton = false;
let uploadInProgress = false;

// Auto-navigation control - load from localStorage, default state is paused
let isAutoNavigationPaused = true;

// Region configuration with aadvid, oec_seller_id, and bc_id
const REGION_CONFIG = {
  US: {
    aadvid: "6860053951073484806",
    oec_seller_id: "7495275617887947202",
    bc_id: "7278556643061792769",
    utcOffset: 9, // UTC+09:00
  },
  ID: {
    aadvid: "7208105767293992962",
    oec_seller_id: "7494928748302076708",
    bc_id: "7208106862128939009",
    utcOffset: 7, // UTC+07:00
  },
  PH: {
    aadvid: "7265198676149075969",
    oec_seller_id: "7495168184921196786",
    bc_id: "7265198572054888449",
    utcOffset: 8, // UTC+08:00
  },
  MY: {
    aadvid: "7525257295555772423",
    oec_seller_id: "7496261644146150198",
    bc_id: "7525256178398674952",
    utcOffset: 8, // UTC+08:00
  },
} as const;

const BASE_URL = "https://ads.tiktok.com/i18n/gmv-max/dashboard/product";

/**
 * Convert region-specific date to timestamp
 */
function regionDateToTimestamp(
  region: "US" | "ID" | "MY" | "PH",
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0
): number {
  const offset = REGION_CONFIG[region].utcOffset;
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour - offset, minute, second));
  return utcDate.getTime();
}

/**
 * Build campaign URL with region-specific parameters
 */
function buildCampaignUrl(
  region: "US" | "ID" | "MY" | "PH",
  campaignId: string,
  startTimestamp: number,
  endTimestamp: number
): string {
  const config = REGION_CONFIG[region];
  const params = new URLSearchParams({
    aadvid: config.aadvid,
    oec_seller_id: config.oec_seller_id,
    bc_id: config.bc_id,
    type: "product",
    campaign_id: campaignId,
    list_status: "delivery_ok",
    campaign_start_date: startTimestamp.toString(),
    campaign_end_date: endTimestamp.toString(),
  });

  return `${BASE_URL}?${params.toString()}`;
}



/**
 * Attempt to find and click the export button
 * Uses multiple selector strategies for robustness
 * Includes deduplication to prevent multiple clicks
 */
function findAndClickExportButton(): boolean {
  // Prevent duplicate clicks
  if (hasClickedExportButton) {
    console.log("[GMV Max Navigator] Export button already clicked, skipping");
    return true;
  }

  // Strategy 1: Use data-testid attribute (most reliable)
  const buttonByTestId = document.querySelector(
    'button[data-testid="export-button-index-wN5QRr"]'
  ) as HTMLButtonElement;

  if (buttonByTestId) {
    console.log("[GMV Max Navigator] Found export button by test ID");
    hasClickedExportButton = true;
    buttonByTestId.click();

    // Trigger download detection after clicking
    setTimeout(() => detectAndUploadDownloadedFile(), DOWNLOAD_DETECTION_DELAY);

    return true;
  }

  // Strategy 2: Use data-tea-click_for attribute
  const buttonByTeaClick = document.querySelector(
    'button[data-tea-click_for="export_button_view_data_product"]'
  ) as HTMLButtonElement;

  if (buttonByTeaClick) {
    console.log("[GMV Max Navigator] Found export button by tea-click attribute");
    hasClickedExportButton = true;
    buttonByTeaClick.click();

    // Trigger download detection after clicking
    setTimeout(() => detectAndUploadDownloadedFile(), DOWNLOAD_DETECTION_DELAY);

    return true;
  }

  // Strategy 3: Use data-tid attribute
  const buttonByTid = document.querySelector(
    'button[data-tid="m4b_button"][data-uid*="exportbutton"]'
  ) as HTMLButtonElement;

  if (buttonByTid) {
    console.log("[GMV Max Navigator] Found export button by tid attribute");
    hasClickedExportButton = true;
    buttonByTid.click();

    // Trigger download detection after clicking
    setTimeout(() => detectAndUploadDownloadedFile(), DOWNLOAD_DETECTION_DELAY);

    return true;
  }

  // Strategy 4: Look for button with launch icon SVG
  const buttons = document.querySelectorAll('button.theme-m4b-button');
  for (const button of buttons) {
    const svg = button.querySelector('svg.theme-arco-icon-launch');
    if (svg) {
      console.log("[GMV Max Navigator] Found export button by SVG icon");
      hasClickedExportButton = true;
      (button as HTMLButtonElement).click();

      // Trigger download detection after clicking
      setTimeout(() => detectAndUploadDownloadedFile(), DOWNLOAD_DETECTION_DELAY);

      return true;
    }
  }

  return false;
}

/**
 * Extract campaign ID from current URL
 */
function getCampaignIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("campaign_id");
}

/**
 * Get campaign name from localStorage using campaign ID
 */
async function getCampaignName(campaignId: string): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["gmv_max_campaign_data"], (result) => {
      const campaigns = result.gmv_max_campaign_data || [];
      const campaign = campaigns.find((c: { id: string; name: string }) => c.id === campaignId);
      resolve(campaign ? campaign.name : null);
    });
  });
}

/**
 * Detect and upload the most recently downloaded file
 * Sends request to background script which has access to downloads API
 * Includes deduplication to prevent multiple uploads
 */
async function detectAndUploadDownloadedFile(): Promise<void> {
  try {
    // Prevent duplicate uploads
    if (uploadInProgress) {
      console.log("[GMV Max Navigator] Upload already in progress, skipping");
      return;
    }

    uploadInProgress = true;
    console.log("[GMV Max Navigator] Detecting downloaded file...");

    // Get campaign info from URL
    const campaignId = getCampaignIdFromUrl();
    if (!campaignId) {
      console.warn("[GMV Max Navigator] No campaign ID found in URL");
      uploadInProgress = false;
      return;
    }

    const campaignName = await getCampaignName(campaignId);
    if (!campaignName) {
      console.warn("[GMV Max Navigator] No campaign name found for ID:", campaignId);
      uploadInProgress = false;
      return;
    }

    console.log("[GMV Max Navigator] Campaign info:", { campaignId, campaignName });

    // Send request to background script to handle download detection and upload
    console.log("[GMV Max Navigator] Requesting background script to check downloads...");
    chrome.runtime.sendMessage(
      {
        type: "CHECK_AND_UPLOAD_DOWNLOAD",
        campaignName: campaignName,
        campaignId: campaignId,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "[GMV Max Navigator] Error sending message to background:",
            chrome.runtime.lastError
          );
          uploadInProgress = false;
          return;
        }

        if (response?.success) {
          console.log("[GMV Max Navigator] Background script processing upload");
        } else {
          console.error("[GMV Max Navigator] Background script error:", response?.error);
        }

        // Reset flag after upload completes (with delay to ensure background processing finishes)
        setTimeout(() => {
          uploadInProgress = false;
        }, 5000);
      }
    );
  } catch (error) {
    console.error("[GMV Max Navigator] Error in detectAndUploadDownloadedFile:", error);
    uploadInProgress = false;
  }
}

/**
 * Retry logic for finding and clicking the button
 * The button might not be immediately available when the page loads
 */
function attemptAutoClick(attempt: number = 1) {
  console.log(`[GMV Max Navigator] Attempt ${attempt}/${MAX_RETRY_ATTEMPTS} to find export button`);

  const clicked = findAndClickExportButton();

  if (clicked) {
    console.log("[GMV Max Navigator] Successfully clicked export button");
    return;
  }

  if (attempt < MAX_RETRY_ATTEMPTS) {
    setTimeout(() => attemptAutoClick(attempt + 1), RETRY_INTERVAL);
  } else {
    console.log("[GMV Max Navigator] Max retry attempts reached. Export button not found.");
  }
}

/**
 * Navigate to the previous uncompleted campaign
 */
async function goToPrevCampaign(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      "gmv_max_campaign_data",
      "gmv_max_current_index",
      "gmv_max_upload_success_status",
      "gmv_max_campaign_regions",
      "gmv_max_date_range",
    ]);

    const campaigns = result.gmv_max_campaign_data || [];
    const currentIndex = parseInt(result.gmv_max_current_index || "0", 10);
    const uploadSuccessStatus = result.gmv_max_upload_success_status || {};
    const campaignRegions = result.gmv_max_campaign_regions || {};
    const dateRange = result.gmv_max_date_range;

    if (campaigns.length === 0) {
      alert("No campaigns available");
      return;
    }

    if (!dateRange) {
      alert("Date range not configured. Please set date range in extension popup.");
      return;
    }

    // Find the previous uncompleted campaign
    let prevIndex = currentIndex - 1;
    let foundPrev = false;

    // Search backward from current position
    for (let i = prevIndex; i >= 0; i--) {
      const campaign = campaigns[i];
      const uploadStatus = uploadSuccessStatus[campaign.name];

      // Skip completed campaigns
      if (!uploadStatus || uploadStatus.status !== "success") {
        prevIndex = i;
        foundPrev = true;
        break;
      }
    }

    // If no uncompleted campaign found before, wrap around to end
    if (!foundPrev) {
      for (let i = campaigns.length - 1; i >= currentIndex; i--) {
        const campaign = campaigns[i];
        const uploadStatus = uploadSuccessStatus[campaign.name];

        if (!uploadStatus || uploadStatus.status !== "success") {
          prevIndex = i;
          foundPrev = true;
          break;
        }
      }
    }

    if (!foundPrev) {
      alert("All campaigns completed! 🎉");
      return;
    }

    // Navigate to previous campaign with proper URL building
    const campaign = campaigns[prevIndex];
    const region = campaignRegions[campaign.id];

    if (!region) {
      alert(`Please select a region for campaign: ${campaign.name}`);
      return;
    }

    // Calculate timestamps based on region
    const startTimestamp = regionDateToTimestamp(
      region,
      dateRange.startYear,
      dateRange.startMonth,
      dateRange.startDay
    );
    const endTimestamp = regionDateToTimestamp(
      region,
      dateRange.endYear,
      dateRange.endMonth,
      dateRange.endDay
    );

    // Build the campaign URL
    const newUrl = buildCampaignUrl(region, campaign.id, startTimestamp, endTimestamp);

    // Update current index
    await chrome.storage.local.set({ gmv_max_current_index: prevIndex.toString() });

    console.log(`[GMV Max Navigator] Navigating to previous campaign: ${campaign.name}`);
    window.location.href = newUrl;
  } catch (error) {
    console.error("[GMV Max Navigator] Error navigating to previous campaign:", error);
    alert("Failed to navigate to previous campaign");
  }
}

/**
 * Navigate to the first uncompleted campaign in the list
 */
async function goToFirstCampaign(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      "gmv_max_campaign_data",
      "gmv_max_upload_success_status",
      "gmv_max_campaign_regions",
      "gmv_max_date_range",
    ]);

    const campaigns = result.gmv_max_campaign_data || [];
    const uploadSuccessStatus = result.gmv_max_upload_success_status || {};
    const campaignRegions = result.gmv_max_campaign_regions || {};
    const dateRange = result.gmv_max_date_range;

    if (campaigns.length === 0) {
      alert("No campaigns available");
      return;
    }

    if (!dateRange) {
      alert("Date range not configured. Please set date range in extension popup.");
      return;
    }

    // Find the first uncompleted campaign
    let firstIndex = -1;
    for (let i = 0; i < campaigns.length; i++) {
      const campaign = campaigns[i];
      const uploadStatus = uploadSuccessStatus[campaign.name];

      // Skip completed campaigns
      if (!uploadStatus || uploadStatus.status !== "success") {
        firstIndex = i;
        break;
      }
    }

    if (firstIndex === -1) {
      alert("All campaigns completed! 🎉");
      return;
    }

    // Navigate to first uncompleted campaign with proper URL building
    const campaign = campaigns[firstIndex];
    const region = campaignRegions[campaign.id];

    if (!region) {
      alert(`Please select a region for campaign: ${campaign.name}`);
      return;
    }

    // Calculate timestamps based on region
    const startTimestamp = regionDateToTimestamp(
      region,
      dateRange.startYear,
      dateRange.startMonth,
      dateRange.startDay
    );
    const endTimestamp = regionDateToTimestamp(
      region,
      dateRange.endYear,
      dateRange.endMonth,
      dateRange.endDay
    );

    // Build the campaign URL
    const newUrl = buildCampaignUrl(region, campaign.id, startTimestamp, endTimestamp);

    // Update current index
    await chrome.storage.local.set({ gmv_max_current_index: firstIndex.toString() });

    console.log(`[GMV Max Navigator] Navigating to first campaign: ${campaign.name}`);
    window.location.href = newUrl;
  } catch (error) {
    console.error("[GMV Max Navigator] Error navigating to first campaign:", error);
    alert("Failed to navigate to first campaign");
  }
}

/**
 * Navigate to the next uncompleted campaign
 */
async function goToNextCampaign(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      "gmv_max_campaign_data",
      "gmv_max_current_index",
      "gmv_max_upload_success_status",
      "gmv_max_campaign_regions",
      "gmv_max_date_range",
    ]);

    const campaigns = result.gmv_max_campaign_data || [];
    const currentIndex = parseInt(result.gmv_max_current_index || "0", 10);
    const uploadSuccessStatus = result.gmv_max_upload_success_status || {};
    const campaignRegions = result.gmv_max_campaign_regions || {};
    const dateRange = result.gmv_max_date_range;

    if (campaigns.length === 0) {
      alert("No campaigns available");
      return;
    }

    if (!dateRange) {
      alert("Date range not configured. Please set date range in extension popup.");
      return;
    }

    // Find the next uncompleted campaign
    let nextIndex = currentIndex + 1;
    let foundNext = false;

    // Search forward from current position
    for (let i = nextIndex; i < campaigns.length; i++) {
      const campaign = campaigns[i];
      const uploadStatus = uploadSuccessStatus[campaign.name];

      // Skip completed campaigns
      if (!uploadStatus || uploadStatus.status !== "success") {
        nextIndex = i;
        foundNext = true;
        break;
      }
    }

    // If no uncompleted campaign found ahead, wrap around to beginning
    if (!foundNext) {
      for (let i = 0; i <= currentIndex; i++) {
        const campaign = campaigns[i];
        const uploadStatus = uploadSuccessStatus[campaign.name];

        if (!uploadStatus || uploadStatus.status !== "success") {
          nextIndex = i;
          foundNext = true;
          break;
        }
      }
    }

    if (!foundNext) {
      alert("All campaigns completed! 🎉");
      return;
    }

    // Navigate to next campaign with proper URL building
    const campaign = campaigns[nextIndex];
    const region = campaignRegions[campaign.id];

    if (!region) {
      alert(`Please select a region for campaign: ${campaign.name}`);
      return;
    }

    // Calculate timestamps based on region
    const startTimestamp = regionDateToTimestamp(
      region,
      dateRange.startYear,
      dateRange.startMonth,
      dateRange.startDay
    );
    const endTimestamp = regionDateToTimestamp(
      region,
      dateRange.endYear,
      dateRange.endMonth,
      dateRange.endDay
    );

    // Build the campaign URL
    const newUrl = buildCampaignUrl(region, campaign.id, startTimestamp, endTimestamp);

    // Update current index
    await chrome.storage.local.set({ gmv_max_current_index: nextIndex.toString() });

    console.log(`[GMV Max Navigator] Navigating to next campaign: ${campaign.name}`);
    window.location.href = newUrl;
  } catch (error) {
    console.error("[GMV Max Navigator] Error navigating to next campaign:", error);
    alert("Failed to navigate to next campaign");
  }
}

/**
 * Update upload status toast with current status
 */
function updateUploadStatusToast(
  status: "idle" | "uploading" | "success" | "error",
  message?: string
): void {
  const toast = document.getElementById("gmv-max-upload-status-toast");
  if (!toast) return;

  // Update status class
  toast.className = `gmv-max-upload-status-toast gmv-max-upload-status-${status}`;

  // Update icon and message
  let icon = "";
  let text = "";

  switch (status) {
    case "idle":
      toast.style.display = "none";
      return;
    case "uploading":
      icon = `<svg class="gmv-max-status-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>`;
      text = message || "업로드 중...";
      break;
    case "success":
      icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>`;
      text = message || "업로드 완료!";
      break;
    case "error":
      icon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>`;
      text = message || "업로드 실패";
      break;
  }

  toast.innerHTML = `
    <div class="gmv-max-status-content">
      ${icon}
      <span>${text}</span>
    </div>
  `;

  toast.style.display = "flex";

  // Auto-hide success/error messages after 5 seconds
  if (status === "success" || status === "error") {
    setTimeout(() => {
      toast.style.display = "none";
    }, 5000);
  }
}

/**
 * Inject status toast element above the Next Campaign button
 * Always visible but may show different states based on configuration
 */
async function injectUploadStatusToast(): Promise<void> {
  // Check if toast already exists
  if (document.getElementById("gmv-max-upload-status-toast")) {
    return;
  }

  // Create toast element
  const toast = document.createElement("div");
  toast.id = "gmv-max-upload-status-toast";
  toast.className = "gmv-max-upload-status-toast gmv-max-upload-status-idle";

  // Add styles using a style tag for animations and complex selectors
  const styleTag = document.createElement("style");
  styleTag.textContent = `
    .gmv-max-upload-status-toast {
      position: fixed;
      bottom: 184px;
      right: 32px;
      z-index: 10000;
      background: white;
      border: 2px solid black;
      box-shadow: 0.2rem 0.2rem 0 0 black;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      display: none;
      align-items: center;
      gap: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      width: 150px;
    }

    .gmv-max-status-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .gmv-max-upload-status-uploading {
      background: #eff6ff;
      border-color: #3b82f6;
      color: #1e40af;
    }

    .gmv-max-upload-status-success {
      background: #f0fdf4;
      border-color: #22c55e;
      color: #15803d;
    }

    .gmv-max-upload-status-error {
      background: #fef2f2;
      border-color: #ef4444;
      color: #991b1b;
    }

    .gmv-max-status-spinner {
      animation: gmv-max-spin 1s linear infinite;
    }

    @keyframes gmv-max-spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `;

  // Inject styles and toast
  document.head.appendChild(styleTag);
  document.body.appendChild(toast);
  console.log("[GMV Max Navigator] Upload status toast injected");
}

/**
 * Inject a permanent progress toast showing uploaded/total campaigns
 * Positioned between the upload status toast and the control buttons
 */
async function injectProgressToast(): Promise<void> {
  if (document.getElementById("gmv-max-progress-toast")) {
    return;
  }

  const toast = document.createElement("div");
  toast.id = "gmv-max-progress-toast";
  toast.className = "gmv-max-progress-toast";
  toast.style.cssText = `
    position: fixed;
    bottom: 130px; /* between upload toast (150px) and buttons (85px) */
    right: 32px;
    z-index: 10000;
    background: white;
    border: 2px solid black;
    box-shadow: 0.2rem 0.2rem 0 0 black;
    padding: 10px 14px;
    font-size: 14px;
    font-weight: 700;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    width: 150px;
    text-align: center;
    position: fixed;
  `;

  // Create refetch button (always visible next to campaign number)
  const refetchBtn = document.createElement("button");
  refetchBtn.id = "gmv-max-refetch-btn";
  refetchBtn.className = "gmv-max-refetch-btn";
  refetchBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
    </svg>
  `;
  refetchBtn.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 5px;
    padding: 4px;
    width: 24px;
    height: 24px;
    border: 2px solid black;
    background: #ffffff;
    cursor: pointer;
    box-shadow: 0.15rem 0.15rem 0 0 black;
  `;

  // Click handler to ask background to re-check Drive and update statuses
  refetchBtn.addEventListener("click", async (e) => {
    e.stopPropagation();

    // Prevent multiple simultaneous requests but allow re-clicking after completion
    if (refetchBtn.classList.contains("refetching")) {
      return;
    }

    refetchBtn.classList.add("refetching");
    const originalHTML = refetchBtn.innerHTML;

    // Show "로딩 중..." text
    const countSpan = document.getElementById("gmv-max-progress-count");
    const originalCountText = countSpan?.textContent || "";
    if (countSpan) {
      countSpan.textContent = "로딩 중...";
    }

    // Show spinner animation in button
    refetchBtn.innerHTML = `
      <svg class="refetch-spinner" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
      </svg>
    `;

    // Add spinner animation style
    const spinnerStyle = document.createElement("style");
    spinnerStyle.textContent = `
      .refetch-spinner {
        animation: refetch-spin 1s linear infinite;
      }
      @keyframes refetch-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    if (!document.getElementById("refetch-spinner-style")) {
      spinnerStyle.id = "refetch-spinner-style";
      document.head.appendChild(spinnerStyle);
    }

    try {
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "REFETCH_UPLOAD_STATUSES" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.success) {
            resolve();
          } else {
            reject(new Error(response?.error || "Refetch failed"));
          }
        });
      });
    } catch (_) {
      // Keep silent in content UI, rely on progress updating when possible
    } finally {
      await updateProgressToast();
      refetchBtn.innerHTML = originalHTML;
      refetchBtn.classList.remove("refetching");
    }
  });

  // Compose toast content container so numbers and button align
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "space-between";
  wrapper.style.gap = "8px";
  wrapper.style.width = "100%";

  const countSpan = document.createElement("span");
  countSpan.id = "gmv-max-progress-count";
  wrapper.appendChild(countSpan);
  wrapper.appendChild(refetchBtn);
  toast.appendChild(wrapper);

  document.body.appendChild(toast);
  await updateProgressToast();
  console.log("[GMV Max Navigator] Progress toast injected");
}

/**
 * Compute and render uploaded/total campaigns in the progress toast
 */
async function updateProgressToast(): Promise<void> {
  const toast = document.getElementById("gmv-max-progress-toast");
  if (!toast) return;

  try {
    const result = await chrome.storage.local.get([
      "gmv_max_campaign_data",
      "gmv_max_upload_success_status",
    ]);

    const campaigns: Array<{ name: string; id: string }> = result.gmv_max_campaign_data || [];
    const successStatuses: Record<string, { status: string }> = result.gmv_max_upload_success_status || {};

    const total = campaigns.length;
    const uploaded = total === 0 ? 0 : campaigns.filter((c) => successStatuses[c.name]?.status === "success").length;

    if (total > 0) {
      // Show progress numbers by default, will be hidden on hover
      const countSpan = document.getElementById("gmv-max-progress-count");
      if (countSpan) {
        countSpan.textContent = `${uploaded}/${total}`;
        countSpan.style.display = "inline";
      } else {
        toast.textContent = ` ${uploaded}/${total}`;
      }
      toast.style.display = "flex";
    } else {
      toast.style.display = "none";
    }
  } catch (e) {
    // On error, hide to avoid stale display
    toast.style.display = "none";
  }
}

/**
 * Check campaigns and pause workflow if none pending
 */
async function checkAndPauseIfNoPendingCampaigns(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      "gmv_max_campaign_data",
      "gmv_max_upload_success_status",
    ]);

    const campaigns: Array<{ name: string; id: string }> = result.gmv_max_campaign_data || [];
    const successStatuses: Record<string, { status: string }> = result.gmv_max_upload_success_status || {};

    const total = campaigns.length;
    const uploaded = total === 0 ? 0 : campaigns.filter((c) => successStatuses[c.name]?.status === "success").length;
    const hasPending = total > 0 && uploaded < total;

    if (!hasPending) {
      // No campaigns or all completed -> pause
      isAutoNavigationPaused = true;
      chrome.storage.local.set({ [WORKFLOW_PAUSED_KEY]: true });
      updateControlButtons();
      updateUploadStatusToast("idle");
      console.log("[GMV Max Navigator] No pending campaigns. Workflow paused.");
    }
  } catch (e) {
    // Ignore errors, do not force resume
  }
}

/**
 * Update control buttons visibility and state
 */
async function updateControlButtons(): Promise<void> {
  const stopButton = document.getElementById("gmv-max-stop-btn") as HTMLButtonElement | null;
  const resumeButton = document.getElementById("gmv-max-resume-btn") as HTMLButtonElement | null;

  if (stopButton && resumeButton) {
    // Check if campaigns are configured (only need campaign data now)
    const result = await chrome.storage.local.get([
      "gmv_max_campaign_data",
      "gmv_max_upload_success_status",
    ]);
    const campaigns = result.gmv_max_campaign_data || [];
    const successStatuses: Record<string, { status: string }> = result.gmv_max_upload_success_status || {};
    const isConfigured = campaigns.length > 0;

    // Check if progress is full (all campaigns uploaded)
    const total = campaigns.length;
    const uploaded = total === 0 ? 0 : campaigns.filter((c: { name: string }) => successStatuses[c.name]?.status === "success").length;
    const isProgressFull = total > 0 && uploaded === total;

    // Disable buttons if not configured OR if progress is full
    const shouldDisable = !isConfigured || isProgressFull;
    stopButton.disabled = shouldDisable;
    resumeButton.disabled = shouldDisable;

    // Update opacity to show disabled state
    if (shouldDisable) {
      stopButton.style.opacity = "0.5";
      stopButton.style.cursor = "not-allowed";
      resumeButton.style.opacity = "0.5";
      resumeButton.style.cursor = "not-allowed";
    } else {
      stopButton.style.opacity = "1";
      stopButton.style.cursor = "pointer";
      resumeButton.style.opacity = "1";
      resumeButton.style.cursor = "pointer";
    }

    // Update visibility based on paused state
    if (isAutoNavigationPaused) {
      stopButton.style.display = "none";
      resumeButton.style.display = "flex";
    } else {
      stopButton.style.display = "flex";
      resumeButton.style.display = "none";
    }
  }
}

/**
 * Update navigation buttons state based on current configuration
 */
async function updateNavigationButtons(): Promise<void> {
  const prevButton = document.getElementById("gmv-max-prev-campaign-btn") as HTMLButtonElement | null;
  const nextButton = document.getElementById("gmv-max-next-campaign-btn") as HTMLButtonElement | null;

  if (prevButton && nextButton) {
    // Check if campaigns are configured (only need campaign data now)
    const result = await chrome.storage.local.get(["gmv_max_campaign_data"]);
    const campaigns = result.gmv_max_campaign_data || [];
    const isConfigured = campaigns.length > 0;

    // Disable buttons if not configured
    const shouldDisable = !isConfigured;

    // Update button states
    prevButton.disabled = shouldDisable;
    prevButton.style.opacity = shouldDisable ? "0.5" : "1";
    prevButton.style.cursor = shouldDisable ? "not-allowed" : "pointer";

    nextButton.disabled = shouldDisable;
    nextButton.style.opacity = shouldDisable ? "0.5" : "1";
    nextButton.style.cursor = shouldDisable ? "not-allowed" : "pointer";

    console.log("[GMV Max Navigator] Navigation buttons state updated:", { isConfigured });
  }
}

/**
 * Inject stop and resume control buttons
 * Always visible, but disabled when campaigns are not configured
 */
async function injectControlButtons(): Promise<void> {
  // Check if buttons already exist
  if (document.getElementById("gmv-max-stop-btn") || document.getElementById("gmv-max-resume-btn")) {
    return;
  }

  // Create Stop button
  const stopButton = document.createElement("button");
  stopButton.id = "gmv-max-stop-btn";
  stopButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="6" y="6" width="12" height="12"></rect>
    </svg>
    <span>일시정지</span>
  `;

  stopButton.style.cssText = `
    position: fixed;
    bottom: 85px;
    right: 32px;
    width: 150px;
    height: 40px;
    z-index: 10000;
    background: red;
    color: white;
    border: 2px solid black;
    box-shadow: 0.2rem 0.2rem 0 0 black;
    padding: 12px 18px;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Create Resume button
  const resumeButton = document.createElement("button");
  resumeButton.id = "gmv-max-resume-btn";
  resumeButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
    <span>재개</span>
  `;

  resumeButton.style.cssText = `
    position: fixed;
    bottom: 85px;
    right: 32px;
    width: 150px;
    height: 40px;
    z-index: 10000;
    background: #22c55e;
    border: 2px solid black;
    box-shadow: 0.2rem 0.2rem 0 0 black;
    padding: 12px 18px;
    font-size: 14px;
    font-weight: 600;
    display: none;
    align-items: center;
    gap: 6px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: white;
  `;

  // Add hover effects for Stop button
  stopButton.addEventListener("mouseenter", () => {
    stopButton.style.boxShadow = "none";
  });

  stopButton.addEventListener("mouseleave", () => {
    stopButton.style.boxShadow = "0.2rem 0.2rem 0 0 black";
  });

  // Add hover effects for Resume button
  resumeButton.addEventListener("mouseenter", () => {
    resumeButton.style.boxShadow = "none";
  });

  resumeButton.addEventListener("mouseleave", () => {
    resumeButton.style.boxShadow = "0.2rem 0.2rem 0 0 black";
  });

  // Stop button click handler
  stopButton.addEventListener("click", async () => {
    if (stopButton.disabled) return;
    isAutoNavigationPaused = true;

    // Persist workflow paused state to localStorage
    chrome.storage.local.set({ [WORKFLOW_PAUSED_KEY]: true });

    await updateControlButtons();
    console.log("[GMV Max Navigator] Auto-navigation paused");
    updateUploadStatusToast("idle");
  });

  // Resume button click handler
  resumeButton.addEventListener("click", async () => {
    if (resumeButton.disabled) return;

    console.log("[GMV Max Navigator] Auto-navigation resumed, navigating to first campaign");
    isAutoNavigationPaused = false;

    // Persist workflow resumed state to localStorage
    chrome.storage.local.set({ [WORKFLOW_PAUSED_KEY]: false });

    // Reset the click flag to allow clicking again
    hasClickedExportButton = false;

    // Navigate to the first uncompleted campaign
    await goToFirstCampaign();

    // Update control buttons to show stop button
    updateControlButtons();

    // Enable navigation buttons
    updateNavigationButtons();
  });

  // Inject buttons
  document.body.appendChild(stopButton);
  document.body.appendChild(resumeButton);
  console.log("[GMV Max Navigator] Control buttons injected");

  // Set initial button visibility based on paused state
  updateControlButtons();
}

/**
 * Inject floating navigation buttons (Prev/Next) into the page
 * Always visible, but disabled when campaigns are not configured
 */
async function injectNavigationButtons(): Promise<void> {
  // Check if buttons already exist
  if (document.getElementById("gmv-max-prev-campaign-btn") || document.getElementById("gmv-max-next-campaign-btn")) {
    return;
  }

  // Check if campaigns are configured (only need campaign data now)
  const result = await chrome.storage.local.get(["gmv_max_campaign_data"]);
  const campaigns = result.gmv_max_campaign_data || [];
  const isConfigured = campaigns.length > 0;

  // Create container for buttons
  const container = document.createElement("div");
  container.id = "gmv-max-navigation-container";
  container.style.cssText = `
    position: fixed;
    bottom: 32px;
    right: 32px;
    z-index: 10000;
    display: flex;
    gap: 4px;
    width: 150px;
  `;

  // Create Prev button
  const prevButton = document.createElement("button");
  prevButton.id = "gmv-max-prev-campaign-btn";
  prevButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  `;

  // Set initial disabled state
  prevButton.disabled = !isConfigured;

  // Add styles for prev button
  prevButton.style.cssText = `
    flex: 1;
    background: white;
    color: black;
    border: 2px solid black;
    box-shadow: 0.2rem 0.2rem 0 0 black;
    padding: 12px;
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: ${isConfigured ? "pointer" : "not-allowed"};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    opacity: ${isConfigured ? "1" : "0.5"};
  `;

  // Create Next button
  const nextButton = document.createElement("button");
  nextButton.id = "gmv-max-next-campaign-btn";
  nextButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  `;

  // Set initial disabled state
  nextButton.disabled = !isConfigured;

  // Add styles for next button
  nextButton.style.cssText = `
    flex: 1;
    background: black;
    color: white;
    border: 2px solid black;
    box-shadow: 0.2rem 0.2rem 0 0 black;
    padding: 12px;
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: ${isConfigured ? "pointer" : "not-allowed"};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    opacity: ${isConfigured ? "1" : "0.5"};
  `;

  // Add hover effects for prev button
  prevButton.addEventListener("mouseenter", () => {
    if (!prevButton.disabled) {
      prevButton.style.boxShadow = "none";
    }
  });

  prevButton.addEventListener("mouseleave", () => {
    if (!prevButton.disabled) {
      prevButton.style.boxShadow = "0.2rem 0.2rem 0 0 black";
    }
  });

  // Add hover effects for next button
  nextButton.addEventListener("mouseenter", () => {
    if (!nextButton.disabled) {
      nextButton.style.boxShadow = "none";
    }
  });

  nextButton.addEventListener("mouseleave", () => {
    if (!nextButton.disabled) {
      nextButton.style.boxShadow = "0.2rem 0.2rem 0 0 black";
    }
  });

  // Add click handler for prev button
  prevButton.addEventListener("click", async () => {
    if (prevButton.disabled) return;

    const originalDisabled = prevButton.disabled;
    prevButton.disabled = true;
    prevButton.style.opacity = "0.6";
    prevButton.style.cursor = "not-allowed";

    try {
      await goToPrevCampaign();
    } finally {
      prevButton.disabled = originalDisabled;
      prevButton.style.opacity = isConfigured ? "1" : "0.5";
      prevButton.style.cursor = isConfigured ? "pointer" : "not-allowed";
    }
  });

  // Add click handler for next button
  nextButton.addEventListener("click", async () => {
    if (nextButton.disabled) return;

    const originalDisabled = nextButton.disabled;
    nextButton.disabled = true;
    nextButton.style.opacity = "0.6";
    nextButton.style.cursor = "not-allowed";

    try {
      await goToNextCampaign();
    } finally {
      nextButton.disabled = originalDisabled;
      nextButton.style.opacity = isConfigured ? "1" : "0.5";
      nextButton.style.cursor = isConfigured ? "pointer" : "not-allowed";
    }
  });

  // Append buttons to container
  container.appendChild(prevButton);
  container.appendChild(nextButton);

  // Inject container into page
  document.body.appendChild(container);
  console.log("[GMV Max Navigator] Navigation buttons injected");
}

/**
 * Listen for upload status messages from background script
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "UPLOAD_STATUS") {
    console.log("[GMV Max Navigator] Received upload status:", message);

    // Get campaign info from current URL to check if this status update is for the current campaign
    const campaignId = getCampaignIdFromUrl();
    if (!campaignId) return;

    getCampaignName(campaignId).then((campaignName) => {
      // Only show status if it's for the current campaign
      if (campaignName === message.campaignName) {
        switch (message.status) {
          case "started":
            updateUploadStatusToast("uploading", "업로드 중...");
            updateProgressToast();
            break;
          case "success":
            updateUploadStatusToast("success", "업로드 완료");

            // Persist success to chrome.storage so progress stays accurate even if popup is closed
            chrome.storage.local.get(["gmv_max_upload_success_status"], (result) => {
              const successStatuses = result.gmv_max_upload_success_status || {};
              successStatuses[message.campaignName] = { status: "success" } as any;
              chrome.storage.local.set({ gmv_max_upload_success_status: successStatuses }, () => {
                updateProgressToast();
              });
            });

            // Auto-click "Next Campaign" button after successful upload (only if not paused)
            if (!isAutoNavigationPaused) {
              console.log(`[GMV Max Navigator] Upload successful, auto-clicking next campaign button in ${AUTO_NAVIGATION_DELAY / 1000} seconds...`);
              setTimeout(() => {
                // Check again if still not paused (user might have clicked stop during delay)
                if (!isAutoNavigationPaused) {
                  const nextButton = document.getElementById("gmv-max-next-campaign-btn") as HTMLButtonElement;
                  if (nextButton) {
                    console.log("[GMV Max Navigator] Auto-clicking next campaign button");
                    nextButton.click();
                  } else {
                    console.warn("[GMV Max Navigator] Next campaign button not found");
                  }
                } else {
                  console.log("[GMV Max Navigator] Auto-navigation is paused, skipping auto-click");
                }
              }, AUTO_NAVIGATION_DELAY);
            } else {
              console.log("[GMV Max Navigator] Auto-navigation is paused, skipping auto-click");
            }
            break;
          case "error":
            updateUploadStatusToast("error", `업로드 실패: ${message.error || "알 수 없는 오류"}`);
            updateProgressToast();
            break;
        }
      }
    });
  }
});

/**
 * Listen for storage changes and update button states accordingly
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") {
    // Check if campaign data changed
    if (changes["gmv_max_campaign_data"]) {
      console.log("[GMV Max Navigator] Configuration changed, updating button states");

      // Update all buttons that depend on configuration
      updateNavigationButtons();
      updateControlButtons();
    }

    // Update progress when relevant storage keys change
    if (changes["gmv_max_campaign_data"] || changes["gmv_max_upload_success_status"]) {
      updateProgressToast();
      // Auto-pause when everything is completed or no campaigns exist
      checkAndPauseIfNoPendingCampaigns();
    }
  }
});

/**
 * Initialize auto-click functionality
 * Checks if feature is enabled in storage before attempting
 */
async function initialize() {
  try {
    // Check if we're on the correct URL
    const urlPattern = /ads\.tiktok\.com\/i18n\/gmv-max\/dashboard/;
    if (!urlPattern.test(window.location.href)) {
      console.log("[GMV Max Navigator] Not on GMV Max dashboard page");
      return;
    }

    console.log("[GMV Max Navigator] Initializing on GMV Max dashboard");

    // Restore paused/resumed state from storage (default to paused)
    try {
      const storedState = await chrome.storage.local.get([WORKFLOW_PAUSED_KEY]);
      // If explicitly set to false, it means resumed; otherwise treat as paused by default
      isAutoNavigationPaused = storedState[WORKFLOW_PAUSED_KEY] !== false;
      console.log("[GMV Max Navigator] Restored paused state:", isAutoNavigationPaused);
    } catch (e) {
      console.warn("[GMV Max Navigator] Failed to restore paused state, defaulting to paused");
      isAutoNavigationPaused = true;
    }

    // Inject UI elements (always visible, disabled if not configured)
    await injectNavigationButtons();
    await injectUploadStatusToast();
    await injectProgressToast();
    await injectControlButtons();

    // Ensure paused when there are no campaigns to upload
    await checkAndPauseIfNoPendingCampaigns();

    // Check if auto-click is enabled
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const isEnabled = result[STORAGE_KEY] !== false; // Default to true

    if (!isEnabled) {
      console.log("[GMV Max Navigator] Auto-click is disabled");
      return;
    }

    console.log("[GMV Max Navigator] Auto-click is enabled");

    // Only start auto-click if not paused
    if (!isAutoNavigationPaused) {
      console.log("[GMV Max Navigator] Starting auto-click workflow");

      // Start attempting to click the button
      attemptAutoClick();

      // Also observe for dynamic content changes
      const observer = new MutationObserver((mutations) => {
        // Check if any mutations added nodes
        const hasNewNodes = mutations.some(mutation => mutation.addedNodes.length > 0);

        if (hasNewNodes) {
          // Debounce: only check once after changes settle
          const clicked = findAndClickExportButton();
          if (clicked) {
            observer.disconnect(); // Stop observing once we've clicked
          }
        }
      });

      // Observe the entire document for changes
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Disconnect observer after a reasonable time to avoid memory leaks
      setTimeout(() => observer.disconnect(), 30000); // 30 seconds
    } else {
      console.log("[GMV Max Navigator] Auto-click workflow is paused, waiting for user to resume");
    }

  } catch (error) {
    console.error("[GMV Max Navigator] Error in auto-click initialization:", error);
  }
}

// Run initialization when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

/**
 * Content script for auto-clicking export button on TikTok Ads GMV Max dashboard
 * Runs on campaign pages and automatically clicks the export button when available
 */

const STORAGE_KEY = "gmv_max_auto_click_enabled";
const MAX_RETRY_ATTEMPTS = 10;
const RETRY_INTERVAL = 1000; // 1 second

/**
 * Attempt to find and click the export button
 * Uses multiple selector strategies for robustness
 */
function findAndClickExportButton(): boolean {
  // Strategy 1: Use data-testid attribute (most reliable)
  const buttonByTestId = document.querySelector(
    'button[data-testid="export-button-index-wN5QRr"]'
  ) as HTMLButtonElement;

  if (buttonByTestId) {
    console.log("[GMV Max Navigator] Found export button by test ID");
    buttonByTestId.click();
    return true;
  }

  // Strategy 2: Use data-tea-click_for attribute
  const buttonByTeaClick = document.querySelector(
    'button[data-tea-click_for="export_button_view_data_product"]'
  ) as HTMLButtonElement;

  if (buttonByTeaClick) {
    console.log("[GMV Max Navigator] Found export button by tea-click attribute");
    buttonByTeaClick.click();
    return true;
  }

  // Strategy 3: Use data-tid attribute
  const buttonByTid = document.querySelector(
    'button[data-tid="m4b_button"][data-uid*="exportbutton"]'
  ) as HTMLButtonElement;

  if (buttonByTid) {
    console.log("[GMV Max Navigator] Found export button by tid attribute");
    buttonByTid.click();
    return true;
  }

  // Strategy 4: Look for button with launch icon SVG
  const buttons = document.querySelectorAll('button.theme-m4b-button');
  for (const button of buttons) {
    const svg = button.querySelector('svg.theme-arco-icon-launch');
    if (svg) {
      console.log("[GMV Max Navigator] Found export button by SVG icon");
      (button as HTMLButtonElement).click();
      return true;
    }
  }

  return false;
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
 * Initialize auto-click functionality
 * Checks if feature is enabled in storage before attempting
 */
async function initialize() {
  try {
    // Check if auto-click is enabled
    const result = await chrome.storage.local.get([STORAGE_KEY]);
    const isEnabled = result[STORAGE_KEY] !== false; // Default to true

    if (!isEnabled) {
      console.log("[GMV Max Navigator] Auto-click is disabled");
      return;
    }

    // Check if we're on the correct URL
    const urlPattern = /ads\.tiktok\.com\/i18n\/gmv-max\/dashboard/;
    if (!urlPattern.test(window.location.href)) {
      console.log("[GMV Max Navigator] Not on GMV Max dashboard page");
      return;
    }

    console.log("[GMV Max Navigator] Initializing auto-click on GMV Max dashboard");

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

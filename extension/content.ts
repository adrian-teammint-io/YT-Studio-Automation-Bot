/**
 * Content script for Naver SearchAd report automation
 * Runs on Naver SearchAd report download page and automates:
 * 1. Click "대용량 보고서 다운로드" tab
 * 2. Select report type dropdown
 * 3. Configure date range
 * 4. Create report
 * 5. Wait and refresh
 * 6. Download TSV file
 * 7. Upload to Google Sheets
 */

import { STORAGE_KEYS } from "./constants/storage";

const RETRY_INTERVAL = 1000; // 1 second between retries
const MAX_RETRY_ATTEMPTS = 10;
const REFRESH_DELAY = 1500; // 1.5 seconds before refresh
const POLL_INTERVAL = 2000; // 2 seconds between table checks
const MAX_POLL_ATTEMPTS = 30; // 60 seconds total polling

// Workflow state
let currentStep: "idle" | "clicking_tab" | "selecting_dropdown" | "setting_date" | "creating_report" | "waiting_refresh" | "polling_table" | "downloading" | "uploading" = "idle";
let isWorkflowPaused = true; // Default to paused
let pollAttempts = 0;

/**
 * Show toast notification at bottom of page
 */
function showToast(message: string, type: "info" | "success" | "error" | "loading" = "info"): void {
  const toast = document.getElementById("naversa-toast");
  if (!toast) return;

  const icons = {
    info: "ℹ️",
    success: "✅",
    error: "❌",
    loading: "⏳"
  };

  toast.textContent = `${icons[type]} ${message}`;
  toast.className = `naversa-toast naversa-toast-${type}`;
  toast.style.display = "block";

  // Auto-hide after 3 seconds for success/error
  if (type === "success" || type === "error") {
    setTimeout(() => {
      toast.style.display = "none";
    }, 3000);
  }
}

/**
 * Check if extension context is still valid
 */
function isExtensionContextValid(): boolean {
  try {
    // Try to access chrome.runtime.id - if context is invalidated, this will throw
    return chrome.runtime?.id !== undefined;
  } catch (error) {
    return false;
  }
}

/**
 * Show page reload prompt when extension is invalidated
 */
function showReloadPrompt(): void {
  showToast("확장 프로그램이 업데이트되었습니다. 페이지를 새로고침하세요.", "error");

  // Create a persistent reload button
  const existingButton = document.getElementById("naversa-reload-btn");
  if (existingButton) return;

  const reloadBtn = document.createElement("button");
  reloadBtn.id = "naversa-reload-btn";
  reloadBtn.innerHTML = "🔄 새로고침";
  reloadBtn.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 32px;
    width: 120px;
    height: 40px;
    z-index: 10001;
    background: #ef4444;
    color: white;
    border: 2px solid black;
    box-shadow: 0.2rem 0.2rem 0 0 black;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  reloadBtn.onclick = () => window.location.reload();
  document.body.appendChild(reloadBtn);
}

/**
 * Step 1: Click "대용량 보고서 다운로드" tab
 */
async function clickReportTab(): Promise<boolean> {
  console.log("[NaverSA] Step 1: Clicking '대용량 보고서 다운로드' tab...");
  showToast("'대용량 보고서 다운로드' 탭 클릭 중...", "loading");

  // Strategy: Find tab/button with text "대용량 보고서 다운로드"
  const tabs = document.querySelectorAll('button, a, [role="tab"]');

  for (const tab of tabs) {
    if (tab.textContent?.includes("대용량 보고서 다운로드")) {
      console.log("[NaverSA] Found report tab, clicking...");
      (tab as HTMLElement).click();
      showToast("탭 클릭 완료", "success");
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for tab content to load
      return true;
    }
  }

  console.warn("[NaverSA] Report tab not found");
  return false;
}

/**
 * Step 2: Select "쇼핑검색 검색어 전환 상세 보고서" from dropdown
 */
async function selectReportType(): Promise<boolean> {
  console.log("[NaverSA] Step 2: Selecting report type...");
  showToast("보고서 유형 선택 중...", "loading");

  // === DIAGNOSTIC LOGGING: Layer 1 - Find title areas ===
  const titleAreas = document.querySelectorAll('.title-area');
  console.log("[NaverSA] DEBUG: Found", titleAreas.length, "elements with class '.title-area'");

  if (titleAreas.length === 0) {
    console.error("[NaverSA] DIAGNOSTIC: No .title-area elements found on page");
    console.error("[NaverSA] DIAGNOSTIC: Available classes on page:", Array.from(new Set(Array.from(document.querySelectorAll('[class]')).map(el => el.className))).slice(0, 20));
    return false;
  }

  // === DIAGNOSTIC LOGGING: Layer 2 - Check text content ===
  console.log("[NaverSA] DEBUG: Checking title areas for text '다운로드 항목 선택'");
  titleAreas.forEach((area, idx) => {
    console.log(`[NaverSA] DEBUG: titleArea[${idx}] text:`, area.textContent?.trim().substring(0, 50));
  });

  let dropdownButton: HTMLElement | null = null;
  let foundTitleArea = false;

  for (const titleArea of titleAreas) {
    if (titleArea.textContent?.includes("다운로드 항목 선택")) {
      foundTitleArea = true;
      console.log("[NaverSA] DEBUG: ✓ Found title area with matching text");

      // === FIX: Expand search scope - try multiple strategies ===

      // Strategy 1: Search in parent container (go up more levels)
      const parentContainer = titleArea.closest('div')?.parentElement;
      console.log("[NaverSA] DEBUG: Trying parent container...");

      if (parentContainer) {
        // Try multiple selector patterns
        dropdownButton = parentContainer.querySelector('.dropdown-toggle') as HTMLElement;

        if (!dropdownButton) {
          dropdownButton = parentContainer.querySelector('button[class*="dropdown"]') as HTMLElement;
        }

        if (!dropdownButton) {
          dropdownButton = parentContainer.querySelector('select') as HTMLElement;
        }

        if (!dropdownButton) {
          // Look for any button near the title
          const buttons = parentContainer.querySelectorAll('button');
          if (buttons.length > 0) {
            dropdownButton = buttons[0] as HTMLElement;
            console.log("[NaverSA] DEBUG: Found button by fallback strategy");
          }
        }
      }

      // Strategy 2: Search in next sibling
      if (!dropdownButton) {
        console.log("[NaverSA] DEBUG: Trying sibling elements...");
        let sibling = titleArea.nextElementSibling;
        while (sibling && !dropdownButton) {
          dropdownButton = sibling.querySelector('.dropdown-toggle, button, select') as HTMLElement;
          if (!dropdownButton && (sibling.tagName === 'BUTTON' || sibling.tagName === 'SELECT')) {
            dropdownButton = sibling as HTMLElement;
          }
          sibling = sibling.nextElementSibling;
        }
      }

      console.log("[NaverSA] DEBUG: Final dropdown button found:", dropdownButton !== null);
      if (dropdownButton) {
        console.log("[NaverSA] DEBUG: Dropdown element tag:", dropdownButton.tagName);
        console.log("[NaverSA] DEBUG: Dropdown element classes:", dropdownButton.className);
      }

      break;
    }
  }

  if (!foundTitleArea) {
    console.error("[NaverSA] DIAGNOSTIC: No title area contains '다운로드 항목 선택'");
    console.error("[NaverSA] DIAGNOSTIC: All title area texts:", Array.from(titleAreas).map(a => a.textContent?.trim()));
  }

  if (!dropdownButton) {
    console.warn("[NaverSA] Dropdown button not found");
    return false;
  }

  // Click to open dropdown
  console.log("[NaverSA] Opening dropdown...");
  dropdownButton.click();
  await new Promise(resolve => setTimeout(resolve, 500));

  // Find and click the option "쇼핑검색 검색어 전환 상세 보고서"
  const dropdownItems = document.querySelectorAll('.dropdown-menu li, .dropdown-menu a, [role="option"]');

  for (const item of dropdownItems) {
    if (item.textContent?.includes("쇼핑검색 검색어 전환 상세 보고서")) {
      console.log("[NaverSA] Found target option, selecting...");
      (item as HTMLElement).click();
      showToast("보고서 유형 선택 완료", "success");
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    }
  }

  console.warn("[NaverSA] Report type option not found");
  return false;
}

/**
 * Step 3: Set date in calendar input
 */
async function setDate(dateString: string): Promise<boolean> {
  console.log("[NaverSA] Step 3: Setting date to", dateString);
  showToast(`날짜 설정 중: ${dateString}`, "loading");

  // Find the calendar input by looking for title-area "조회 일자 선택"
  const titleAreas = document.querySelectorAll('.title-area');
  console.log("[NaverSA] DEBUG: Found", titleAreas.length, "elements with class '.title-area'");

  let calendarInput: HTMLInputElement | null = null;
  let titleArea: Element | null = null;

  for (const area of titleAreas) {
    if (area.textContent?.includes("조회 일자 선택")) {
      titleArea = area;
      console.log("[NaverSA] DEBUG: Found matching title-area:", area.textContent);
      break;
    }
  }

  if (!titleArea) {
    console.warn("[NaverSA] Title area '조회 일자 선택' not found");
    return false;
  }

  // Strategy 1: Search in parent container with multiple selectors
  const parentContainer = titleArea.closest('div')?.parentElement;
  console.log("[NaverSA] DEBUG: Parent container HTML:", parentContainer?.innerHTML?.substring(0, 200));

  if (parentContainer) {
    // Try specific selector first
    calendarInput = parentContainer.querySelector('input[name="calendar-input-value"]') as HTMLInputElement;

    // Fallback to any date/calendar input
    if (!calendarInput) {
      calendarInput = parentContainer.querySelector('input[type="date"]') as HTMLInputElement;
    }
    if (!calendarInput) {
      calendarInput = parentContainer.querySelector('input[class*="calendar"]') as HTMLInputElement;
    }
    if (!calendarInput) {
      calendarInput = parentContainer.querySelector('input[class*="date"]') as HTMLInputElement;
    }
    if (!calendarInput) {
      // Try any input that might be a date input
      const inputs = parentContainer.querySelectorAll('input');
      console.log("[NaverSA] DEBUG: Found", inputs.length, "input elements in parent container");
      for (const input of inputs) {
        if (input.type === 'text' || input.type === 'date') {
          calendarInput = input as HTMLInputElement;
          console.log("[NaverSA] DEBUG: Using fallback input:", input.name, input.className);
          break;
        }
      }
    }
  }

  // Strategy 2: Search in siblings if not found in parent
  if (!calendarInput) {
    console.log("[NaverSA] DEBUG: Searching in siblings...");
    let sibling = titleArea.nextElementSibling;
    while (sibling && !calendarInput) {
      calendarInput = sibling.querySelector('input[name="calendar-input-value"], input[type="date"], input[class*="calendar"], input[class*="date"]') as HTMLInputElement;

      if (!calendarInput && sibling.tagName === 'INPUT') {
        calendarInput = sibling as HTMLInputElement;
      }

      sibling = sibling.nextElementSibling;
    }
  }

  if (!calendarInput) {
    console.warn("[NaverSA] Calendar input not found");
    return false;
  }

  // Set the value
  console.log("[NaverSA] Setting input value...");
  calendarInput.value = dateString;

  // Trigger change event
  const changeEvent = new Event('change', { bubbles: true });
  calendarInput.dispatchEvent(changeEvent);

  const inputEvent = new Event('input', { bubbles: true });
  calendarInput.dispatchEvent(inputEvent);

  showToast("날짜 설정 완료", "success");
  await new Promise(resolve => setTimeout(resolve, 500));
  return true;
}

/**
 * Step 4: Click "생성요청" button to create report
 */
async function clickCreateButton(): Promise<boolean> {
  console.log("[NaverSA] Step 4: Clicking '생성요청' button...");
  showToast("보고서 생성 요청 중...", "loading");

  // Find button with text "생성요청"
  const buttons = document.querySelectorAll('button');

  for (const button of buttons) {
    const span = button.querySelector('span');
    if (span?.textContent?.includes("생성요청")) {
      console.log("[NaverSA] Found create button, clicking...");
      button.click();
      showToast("생성 요청 완료", "success");
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    }
  }

  console.warn("[NaverSA] Create button not found");
  return false;
}

/**
 * Step 5: Refresh page after delay
 */
async function refreshPage(): Promise<void> {
  console.log(`[NaverSA] Step 5: Waiting ${REFRESH_DELAY}ms before refresh...`);
  showToast(`${REFRESH_DELAY/1000}초 후 새로고침...`, "loading");

  await new Promise(resolve => setTimeout(resolve, REFRESH_DELAY));

  // Mark that we're in polling phase BEFORE reload
  console.log("[NaverSA] Setting polling flag before page refresh...");
  sessionStorage.setItem("naversa_polling", "true");

  console.log("[NaverSA] Refreshing page...");
  showToast("페이지 새로고침 중...", "loading");
  window.location.reload();
}

/**
 * Step 6: Poll table for download link
 * Check first row, first cell for download link (not "-")
 */
async function pollForDownloadLink(): Promise<string | null> {
  console.log("[NaverSA] Step 6: Polling for download link...");
  showToast("다운로드 링크 확인 중...", "loading");

  pollAttempts++;
  console.log(`[NaverSA] Poll attempt ${pollAttempts}/${MAX_POLL_ATTEMPTS}`);

  // Find the table (there's only one on the page)
  const table = document.querySelector('table');
  if (!table) {
    console.warn("[NaverSA] Table not found");
    return null;
  }

  // Get first row (excluding header)
  const tbody = table.querySelector('tbody');
  if (!tbody) {
    console.warn("[NaverSA] Table body not found");
    return null;
  }

  const firstRow = tbody.querySelector('tr');
  if (!firstRow) {
    console.warn("[NaverSA] No rows in table");
    return null;
  }

  // Get first cell with data-value attribute
  const firstCell = firstRow.querySelector('td[data-value]') as HTMLTableCellElement;
  if (!firstCell) {
    console.warn("[NaverSA] First cell not found");
    return null;
  }

  const dataValue = firstCell.getAttribute('data-value');
  console.log("[NaverSA] First cell data-value:", dataValue);

  // Check if it's not "-" (which means report is ready)
  if (dataValue && dataValue !== "" && dataValue !== "-") {
    console.log("[NaverSA] ✅ Download link found!");
    showToast("다운로드 링크 발견!", "success");

    // Extract download URL - data-value might be a path or just an ID
    let fullUrl: string;
    if (dataValue.startsWith("/report-download")) {
      // Full path provided
      fullUrl = `https://manage.searchad.naver.com${dataValue}`;
    } else if (/^\d+$/.test(dataValue)) {
      // Just an ID (numeric) - construct the download URL
      fullUrl = `https://manage.searchad.naver.com/report-download/${dataValue}`;
      console.log("[NaverSA] Constructed download URL from ID:", fullUrl);
    } else if (dataValue.startsWith("http")) {
      // Already a full URL
      fullUrl = dataValue;
    } else {
      // Assume it's a relative path
      fullUrl = `https://manage.searchad.naver.com/${dataValue}`;
    }

    // Store the original URL in sessionStorage before any download happens
    // This is critical because Chrome converts it to a blob URL after clicking
    if (!fullUrl.startsWith('blob:')) {
      sessionStorage.setItem('naversa_original_download_url', fullUrl);
      console.log("[NaverSA] Stored original download URL from poll:", fullUrl);
    }

    return fullUrl;
  }

  // Not ready yet
  console.log("[NaverSA] Report not ready yet (value is '-' or empty)");

  if (pollAttempts < MAX_POLL_ATTEMPTS) {
    showToast(`보고서 생성 대기 중... (${pollAttempts}/${MAX_POLL_ATTEMPTS})`, "loading");
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    return await pollForDownloadLink();
  }

  console.error("[NaverSA] Max poll attempts reached");
  showToast("보고서 생성 시간 초과", "error");
  return null;
}

/**
 * Step 7: Download TSV file and fetch content immediately
 * New approach: Fetch content directly instead of relying on file download
 */
async function downloadTSV(url: string): Promise<boolean> {
  console.log("[NaverSA] Step 7: Fetching TSV content...");
  console.log("[NaverSA] DEBUG: URL parameter:", url);
  showToast("TSV 파일 가져오는 중...", "loading");

  try {
    // FIRST: Try to fetch the content directly using content script's session
    // This has the best chance of success because we have cookies
    console.log("[NaverSA] Attempting direct fetch with session cookies...");

    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'text/tab-separated-values, application/octet-stream, text/plain, */*',
          'Cache-Control': 'no-cache',
        }
      });

      if (response.ok) {
        const content = await response.text();

        // Quick validation
        if (content && content.includes('\t') && !content.trim().toLowerCase().startsWith('<!doctype')) {
          console.log("[NaverSA] ✅ Successfully fetched TSV content directly!");
          console.log("[NaverSA] Content length:", content.length, "characters");

          // Store for upload
          sessionStorage.setItem('naversa_tsv_content', content);
          showToast("TSV 파일 가져옴", "success");
          return true;
        } else {
          console.warn("[NaverSA] Direct fetch returned invalid content");
        }
      }
    } catch (fetchError) {
      console.warn("[NaverSA] Direct fetch failed:", fetchError);
    }

    // FALLBACK: If direct fetch fails, trigger browser download
    // Then user can run standalone script to upload
    console.log("[NaverSA] Direct fetch failed, triggering browser download...");
    showToast("브라우저 다운로드 시작...", "loading");

    // Find the table and first row
    const table = document.querySelector('table');
    console.log("[NaverSA] DEBUG: Table found:", !!table);

    const tbody = table?.querySelector('tbody');
    console.log("[NaverSA] DEBUG: Tbody found:", !!tbody);

    const firstRow = tbody?.querySelector('tr');
    console.log("[NaverSA] DEBUG: First row found:", !!firstRow);
    console.log("[NaverSA] DEBUG: First row HTML:", firstRow?.innerHTML?.substring(0, 300));

    if (!firstRow) {
      console.warn("[NaverSA] First row not found in table");
      return false;
    }

    // Strategy 1: Find link with "다운로드" text
    let downloadLink: HTMLElement | null = null;

    const allLinks = firstRow.querySelectorAll('a');
    console.log("[NaverSA] DEBUG: Found", allLinks.length, "links in first row");

    for (const link of allLinks) {
      const href = link.getAttribute('href');
      console.log("[NaverSA] DEBUG: Link text:", link.textContent?.trim(), "href:", href, "onclick:", link.getAttribute('onclick'));
      if (link.textContent?.includes("다운로드")) {
        downloadLink = link;
        console.log("[NaverSA] DEBUG: ✓ Found link with '다운로드' text, href:", href);
        break;
      }
    }

    // Strategy 2: Find link with href="#/"
    if (!downloadLink) {
      downloadLink = firstRow.querySelector('a[href="#/"]') as HTMLAnchorElement;
      if (downloadLink) {
        console.log("[NaverSA] DEBUG: Found link with href='#/'");
      }
    }

    // Strategy 3: Find any clickable element in first cell
    if (!downloadLink) {
      const firstCell = firstRow.querySelector('td');
      console.log("[NaverSA] DEBUG: First cell HTML:", firstCell?.innerHTML);

      // Check for button
      downloadLink = firstCell?.querySelector('button') as HTMLElement;
      if (downloadLink) {
        console.log("[NaverSA] DEBUG: Found button in first cell");
      }
    }

    // Strategy 4: Get the download URL from data-value attribute or link href
    let downloadUrl: string | null = null;

    // First, try to get the actual href from the download link
    if (downloadLink && downloadLink.tagName === 'A') {
      const href = (downloadLink as HTMLAnchorElement).getAttribute('href');
      const fullHref = (downloadLink as HTMLAnchorElement).href; // This resolves relative URLs
      console.log("[NaverSA] DEBUG: Link href attribute:", href, "resolved href:", fullHref);

      if (fullHref && !fullHref.startsWith('javascript:') && !fullHref.startsWith('blob:') && fullHref !== window.location.href) {
        downloadUrl = fullHref;
        console.log("[NaverSA] DEBUG: Found download URL from link.href:", downloadUrl);
      } else if (href && href !== "#/" && !href.startsWith('javascript:') && !href.startsWith('blob:')) {
        // Construct full URL if it's a relative path
        if (href.startsWith('/')) {
          downloadUrl = `https://manage.searchad.naver.com${href}`;
        } else if (href.startsWith('http')) {
          downloadUrl = href;
        }
        console.log("[NaverSA] DEBUG: Found download URL from link href attribute:", downloadUrl);
      }
    }

    // If no URL from link, try to construct from data-value (which might be an ID)
    if (!downloadUrl) {
      const dataValueElement = firstRow.querySelector('[data-value]') as HTMLElement;
      if (dataValueElement) {
        const dataValue = dataValueElement.getAttribute('data-value');
        console.log("[NaverSA] DEBUG: data-value:", dataValue);

        if (dataValue && dataValue !== "-") {
          // Get current page path to understand URL structure
          const currentPath = window.location.pathname;
          console.log("[NaverSA] DEBUG: Current page path:", currentPath);

          // If it's a full path, use it directly
          if (dataValue.startsWith('/')) {
            downloadUrl = `https://manage.searchad.naver.com${dataValue}`;
          }
          // If it's just an ID (numeric), try multiple URL patterns
          else if (/^\d+$/.test(dataValue)) {
            // Try different URL patterns based on current page structure
            // Pattern 1: /reports-download/download/{id}
            // Pattern 2: /api/reports/{id}/download
            // Pattern 3: /customers/{customerId}/reports-download/{id}
            // Pattern 4: /report-download/{id} (already tried, got 404)

            // Extract customer ID from current URL if possible
            const customerMatch = currentPath.match(/\/customers\/([^\/]+)/);
            const customerId = customerMatch ? customerMatch[1] : null;

            // Try pattern with customer ID first
            if (customerId) {
              downloadUrl = `https://manage.searchad.naver.com/customers/${customerId}/reports-download/download/${dataValue}`;
              console.log("[NaverSA] DEBUG: Trying URL pattern with customer ID:", downloadUrl);
            } else {
              // Try alternative patterns
              downloadUrl = `https://manage.searchad.naver.com/reports-download/download/${dataValue}`;
              console.log("[NaverSA] DEBUG: Trying alternative URL pattern:", downloadUrl);
            }
          }
          // Otherwise, assume it's already a full URL
          else {
            downloadUrl = dataValue;
          }
          console.log("[NaverSA] DEBUG: Final download URL from data-value:", downloadUrl);
        }
      }
    }

    // Store the original URL in sessionStorage before clicking
    // This is important because after clicking, Chrome converts it to a blob URL
    // which can't be fetched from different contexts
    if (downloadUrl && !downloadUrl.startsWith('blob:') && !downloadUrl.startsWith('javascript:')) {
      sessionStorage.setItem('naversa_original_download_url', downloadUrl);
      console.log("[NaverSA] DEBUG: Stored original download URL:", downloadUrl);
    }

    // If we have a download URL, fetch it directly instead of triggering browser download
    if (downloadUrl) {
      console.log("[NaverSA] Fetching TSV content directly from URL...");
      showToast("TSV 파일 가져오는 중...", "loading");

      try {
        // Fetch the TSV content directly with credentials
        // Try to mimic a browser download request as closely as possible
        const response = await fetch(downloadUrl, {
          method: 'GET',
          credentials: 'include', // Include cookies for authentication
          redirect: 'follow', // Follow redirects
          headers: {
            'Accept': 'text/tab-separated-values, text/plain, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            // Try to mimic browser behavior
            'Referer': window.location.href,
            'User-Agent': navigator.userAgent,
          }
        });

        // Check response status
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          console.error("[NaverSA] Fetch failed:", response.status, response.statusText);
          console.error("[NaverSA] Error response preview:", errorText.substring(0, 500));
          throw new Error(`Failed to fetch TSV: ${response.status} ${response.statusText}. The file may not be ready or authentication failed.`);
        }

        // Check content type to ensure we got TSV, not HTML
        const contentType = response.headers.get('content-type') || '';
        console.log("[NaverSA] Response content-type:", contentType);
        console.log("[NaverSA] Response URL:", response.url);
        console.log("[NaverSA] Response status:", response.status);

        // Warn if content-type suggests HTML
        if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
          console.warn("[NaverSA] ⚠️ Content-Type indicates HTML, not TSV!");
        }

        const tsvContent = await response.text();

        // Robust validation that we got TSV content, not HTML
        const trimmedContent = tsvContent.trim();
        const isHTML =
          trimmedContent.toLowerCase().startsWith('<!doctype') ||
          trimmedContent.toLowerCase().startsWith('<html') ||
          trimmedContent.toLowerCase().includes('<!doctype html') ||
          trimmedContent.toLowerCase().includes('<html lang') ||
          trimmedContent.toLowerCase().includes('<head>') ||
          trimmedContent.toLowerCase().includes('<body>') ||
          (trimmedContent.startsWith('<') && trimmedContent.includes('html'));

        if (isHTML) {
          console.error("[NaverSA] ❌ Received HTML instead of TSV");
          console.error("[NaverSA] Content preview:", tsvContent.substring(0, 500));
          throw new Error(
            "Received HTML page instead of TSV file. The download URL may require additional authentication or the file may not be ready yet."
          );
        }

        // Basic TSV validation - check for tab characters (TSV files must have tabs)
        if (!tsvContent.includes('\t')) {
          console.error("[NaverSA] ❌ Content doesn't contain tabs - not valid TSV");
          console.error("[NaverSA] Content preview:", tsvContent.substring(0, 500));
          throw new Error(
            "Downloaded content does not appear to be TSV format (no tab characters found). Please check the download URL."
          );
        }

        // Additional validation: Check if content looks like TSV (has multiple lines with tabs)
        const lines = tsvContent.split('\n').filter(line => line.trim().length > 0);
        const linesWithTabs = lines.filter(line => line.includes('\t')).length;
        if (linesWithTabs === 0) {
          console.error("[NaverSA] ❌ No lines contain tabs - not valid TSV");
          console.error("[NaverSA] Content preview:", tsvContent.substring(0, 500));
          throw new Error(
            "Downloaded content does not appear to be TSV format (no tab-separated lines found)."
          );
        }

        console.log("[NaverSA] ✅ TSV content validated, length:", tsvContent.length, "characters");
        console.log("[NaverSA] First line:", tsvContent.split('\n')[0]?.substring(0, 100));
        console.log("[NaverSA] Lines with tabs:", linesWithTabs, "out of", lines.length, "total lines");

        // Store the TSV content in session storage for the upload step
        sessionStorage.setItem('naversa_tsv_content', tsvContent);

        showToast("TSV 파일 가져옴", "success");
        return true;
      } catch (error) {
        console.error("[NaverSA] Direct fetch failed:", error);
        console.error("[NaverSA] Falling back to clicking download link...");

        // Fall through to the click-based download below
        downloadUrl = null;
      }
    }

    // Fallback: Strategy 5 - Try clicking any link
    if (!downloadLink && allLinks.length > 0) {
      downloadLink = allLinks[0] as HTMLElement;
      console.log("[NaverSA] DEBUG: Using first link as fallback (will trigger browser download)");
    }

    if (downloadLink) {
      console.log("[NaverSA] WARNING: Falling back to clicking download link");

      // Intercept the click to capture the actual download URL
      // The link might use JavaScript to construct the URL dynamically
      let actualDownloadUrl: string | null = null;

      // Set up an interceptor to capture the download URL
      const originalClick = downloadLink.click.bind(downloadLink);
      const interceptClick = () => {
        console.log("[NaverSA] Intercepting download link click...");

        // Try to get the URL from various sources
        if (downloadLink.tagName === 'A') {
          const href = (downloadLink as HTMLAnchorElement).href;
          if (href && !href.startsWith('javascript:') && !href.startsWith('blob:')) {
            actualDownloadUrl = href;
            console.log("[NaverSA] Captured URL from link.href:", actualDownloadUrl);
          }
        }

        // Check for data attributes that might contain the URL
        const dataAttrs = ['data-url', 'data-href', 'data-download-url', 'data-report-id'];
        for (const attr of dataAttrs) {
          const value = downloadLink.getAttribute(attr);
          if (value) {
            console.log(`[NaverSA] Found ${attr}:`, value);
            if (!actualDownloadUrl) {
              actualDownloadUrl = value.startsWith('http') ? value : `https://manage.searchad.naver.com${value.startsWith('/') ? value : '/' + value}`;
            }
          }
        }

        // Check onclick handler for URL patterns
        const onclick = downloadLink.getAttribute('onclick');
        if (onclick) {
          console.log("[NaverSA] Found onclick handler:", onclick);
          // Try to extract URL from onclick (common patterns)
          const urlMatch = onclick.match(/(https?:\/\/[^\s'"]+|\/[\w\/-]+)/);
          if (urlMatch) {
            actualDownloadUrl = urlMatch[1];
            console.log("[NaverSA] Extracted URL from onclick:", actualDownloadUrl);
          }
        }
      };

      // Intercept before clicking
      interceptClick();

      // If we have a download URL, try to fetch it immediately after clicking
      // The click might trigger authentication that makes the URL accessible
      if (downloadUrl || actualDownloadUrl) {
        const urlToTry = actualDownloadUrl || downloadUrl;
        console.log("[NaverSA] Attempting to fetch URL immediately after click...", urlToTry);

        // Click the link first
        downloadLink.click();

        // Wait a brief moment for the click to register
        await new Promise(resolve => setTimeout(resolve, 500));

        // Try fetching the URL immediately while browser session is active
        try {
          const urlToFetch = actualDownloadUrl || downloadUrl;
          if (!urlToFetch) {
            throw new Error("No download URL available to fetch");
          }
          console.log("[NaverSA] Fetching URL after click:", urlToFetch);
          const response = await fetch(urlToFetch, {
            method: 'GET',
            credentials: 'include',
            redirect: 'follow',
            headers: {
              'Accept': 'text/tab-separated-values, text/plain, */*',
              'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
              'Referer': window.location.href,
              'User-Agent': navigator.userAgent,
            }
          });

          if (response.ok) {
            const content = await response.text();

            // Validate it's TSV, not HTML
            const trimmedContent = content.trim();
            const isHTML =
              trimmedContent.toLowerCase().startsWith('<!doctype') ||
              trimmedContent.toLowerCase().startsWith('<html') ||
              trimmedContent.toLowerCase().includes('<!doctype html') ||
              trimmedContent.toLowerCase().includes('<html lang') ||
              trimmedContent.toLowerCase().includes('<head>') ||
              trimmedContent.toLowerCase().includes('<body>') ||
              (trimmedContent.startsWith('<') && trimmedContent.includes('html'));

            if (!isHTML && content.includes('\t')) {
              console.log("[NaverSA] ✅ Successfully fetched TSV after click!");
              sessionStorage.setItem('naversa_tsv_content', content);
              showToast("TSV 파일 가져옴", "success");
              return true;
            }
          }
        } catch (error) {
          console.log("[NaverSA] Immediate fetch after click failed, will wait for download:", error);
        }
      }

      // Fallback: Just click and wait for download
      // Clicking the link triggers browser download with proper session cookies
      console.log("[NaverSA] Clicking download link to trigger browser download...");
      showToast("다운로드 시작됨", "loading");

      // Simply click the link and let the browser download the file
      // The background script will detect the download and read the file content
      downloadLink.click();

      // Wait longer for download to start and complete
      // The browser needs time to authenticate and start the download
      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log("[NaverSA] Download link clicked, browser should be downloading file now");
      return true;
    }

    console.warn("[NaverSA] Download URL not found");
    console.warn("[NaverSA] DEBUG: First row content:", firstRow.textContent);
    return false;
  } catch (error) {
    console.error("[NaverSA] Download failed:", error);
    showToast("다운로드 실패", "error");
    return false;
  }
}

/**
 * Step 8: Trigger upload to Google Sheets
 * Handles both automatic upload (if content fetched) and manual upload guide
 */
async function triggerUpload(): Promise<void> {
  console.log("[NaverSA] Step 8: Preparing upload...");

  try {
    // Check if extension context is valid before proceeding
    if (!isExtensionContextValid()) {
      console.error("[NaverSA] Extension context invalidated - cannot communicate with background");
      showReloadPrompt();
      return;
    }

    // Get configured date from storage
    const result = await chrome.storage.local.get([STORAGE_KEYS.DATE_RANGE]);
    const dateRange = result[STORAGE_KEYS.DATE_RANGE];

    if (!dateRange) {
      showToast("날짜 범위 미설정", "error");
      return;
    }

    // Try to get TSV content from sessionStorage first (if direct fetch was used)
    console.log("[NaverSA] Checking for TSV content in session storage...");
    let tsvContent = sessionStorage.getItem('naversa_tsv_content');

    if (tsvContent) {
      console.log("[NaverSA] ✅ TSV content found in session storage, length:", tsvContent.length, "characters");

      // Validate content before using it (double-check it's not HTML)
      const trimmedContent = tsvContent.trim();
      const isHTML =
        trimmedContent.toLowerCase().startsWith('<!doctype') ||
        trimmedContent.toLowerCase().startsWith('<html') ||
        trimmedContent.toLowerCase().includes('<!doctype html') ||
        trimmedContent.toLowerCase().includes('<html lang') ||
        trimmedContent.toLowerCase().includes('<head>') ||
        trimmedContent.toLowerCase().includes('<body>') ||
        (trimmedContent.startsWith('<') && trimmedContent.includes('html'));

      if (isHTML) {
        console.error("[NaverSA] ❌ HTML content found in session storage - clearing and aborting");
        console.error("[NaverSA] Content preview:", tsvContent.substring(0, 500));
        sessionStorage.removeItem('naversa_tsv_content');
        throw new Error(
          "Invalid content detected (HTML instead of TSV). The download may have failed. Please try again."
        );
      }

      // Validate it's actually TSV (has tabs)
      if (!tsvContent.includes('\t')) {
        console.error("[NaverSA] ❌ Content in session storage is not TSV (no tabs found)");
        console.error("[NaverSA] Content preview:", tsvContent.substring(0, 500));
        sessionStorage.removeItem('naversa_tsv_content');
        throw new Error(
          "Invalid content detected (not TSV format). The download may have failed. Please try again."
        );
      }

      // Clear the session storage
      sessionStorage.removeItem('naversa_tsv_content');

      // STOP POINT: Verify file content before uploading (from sessionStorage)
      console.log("[NaverSA] ========================================");
      console.log("[NaverSA] 📄 FILE READ VERIFICATION (from sessionStorage)");
      console.log("[NaverSA] ========================================");
      console.log("[NaverSA] File size:", tsvContent.length, "characters");
      console.log("[NaverSA] File size:", (tsvContent.length / 1024).toFixed(2), "KB");

      // Show first few lines of content
      const lines = tsvContent.split('\n').slice(0, 5);
      console.log("[NaverSA] First 5 lines of content:");
      lines.forEach((line, index) => {
        console.log(`[NaverSA] Line ${index + 1}:`, line.substring(0, 100) + (line.length > 100 ? '...' : ''));
      });

      // Count rows and columns
      const allLines = tsvContent.split('\n').filter(line => line.trim().length > 0);
      const columnCount = allLines[0]?.split('\t').length || 0;
      console.log("[NaverSA] Total rows:", allLines.length);
      console.log("[NaverSA] Columns in first row:", columnCount);
      console.log("[NaverSA] Tab character count:", (tsvContent.match(/\t/g) || []).length);
      console.log("[NaverSA] ========================================");

      // File content validated and ready for upload
      console.log("[NaverSA] ✅ File content validated, proceeding to upload");
    } else {
      // Fallback: Try to read from downloaded file (if browser download was used)
      console.log("[NaverSA] TSV not in session storage, trying to read from downloaded file...");
      showToast("다운로드된 파일 읽는 중...", "loading");

      // Wait longer for download to complete (up to 30 seconds)
      // The download might take time, especially for large files
      let downloadComplete = false;
      let waitAttempts = 0;
      const maxWaitAttempts = 30;

      while (!downloadComplete && waitAttempts < maxWaitAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        waitAttempts++;

        // Check if download is complete
        const checkResponse = await new Promise<{success: boolean, content?: string, filename?: string, error?: string}>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "GET_TSV_FILE_CONTENT" },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(response || { success: false });
              }
            }
          );
        });

        if (checkResponse.success && checkResponse.content) {
          downloadComplete = true;
          console.log("[NaverSA] Download complete, file:", checkResponse.filename);
          // Content is already available, use it directly
          tsvContent = checkResponse.content;
          console.log("[NaverSA] ✅ File content received from background, length:", tsvContent.length, "characters");

          // STOP POINT: Verify file content before uploading (from download check)
          console.log("[NaverSA] ========================================");
          console.log("[NaverSA] 📄 FILE READ VERIFICATION (from download check)");
          console.log("[NaverSA] ========================================");
          console.log("[NaverSA] File:", checkResponse.filename);
          console.log("[NaverSA] File size:", tsvContent.length, "characters");
          console.log("[NaverSA] File size:", (tsvContent.length / 1024).toFixed(2), "KB");

          // Show first few lines of content
          const lines = tsvContent.split('\n').slice(0, 5);
          console.log("[NaverSA] First 5 lines of content:");
          lines.forEach((line, index) => {
            console.log(`[NaverSA] Line ${index + 1}:`, line.substring(0, 100) + (line.length > 100 ? '...' : ''));
          });

          // Count rows and columns
          const allLines = tsvContent.split('\n').filter(line => line.trim().length > 0);
          const columnCount = allLines[0]?.split('\t').length || 0;
          console.log("[NaverSA] Total rows:", allLines.length);
          console.log("[NaverSA] Columns in first row:", columnCount);
          console.log("[NaverSA] Tab character count:", (tsvContent.match(/\t/g) || []).length);
          console.log("[NaverSA] ========================================");

          break;
        } else if (checkResponse.error?.includes("still downloading")) {
          console.log(`[NaverSA] Download in progress, waiting... (${waitAttempts}/${maxWaitAttempts})`);
          showToast(`다운로드 대기 중... (${waitAttempts}/${maxWaitAttempts})`, "loading");
        }
      }

      if (!downloadComplete || !tsvContent) {
        console.warn("[NaverSA] Could not read TSV content automatically");
        console.log("[NaverSA] ========================================");
        console.log("[NaverSA] 📥 MANUAL UPLOAD REQUIRED");
        console.log("[NaverSA] ========================================");
        console.log("[NaverSA] The file has been downloaded to your Downloads folder.");
        console.log("[NaverSA] To upload it to Google Sheets, run this command in terminal:");
        console.log("[NaverSA] ");
        console.log("[NaverSA]   cd /Users/adrian-phan.team-mint.io/work-projects/naversa-automation-bot");
        console.log("[NaverSA]   npm run fetch-latest");
        console.log("[NaverSA] ");
        console.log("[NaverSA] This will automatically find the latest TSV file and upload it.");
        console.log("[NaverSA] ========================================");

        showToast("파일 다운로드 완료! 터미널에서 'npm run fetch-latest'를 실행하세요", "info");

        // Don't throw error - this is a valid state
        // The user can manually run the upload script
        return;
      }

      // If we already got content from the check, we're done
      if (tsvContent) {
        console.log("[NaverSA] ✅ Using content from download check");
        // Skip the second request since we already have the content
        // Continue to upload step
      } else {

        // Request file content from background (background will fetch it with proper auth)
        const fileResponse = await new Promise<{success: boolean, content?: string, filename?: string, error?: string}>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "GET_TSV_FILE_CONTENT" },
            (response) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(response || { success: false });
              }
            }
          );
        });

        if (!fileResponse.success || !fileResponse.content) {
          throw new Error(fileResponse.error || "Failed to get TSV file content. Both direct fetch and browser download failed.");
        }

        console.log("[NaverSA] Found downloaded TSV file:", fileResponse.filename);
        console.log("[NaverSA] Content length:", fileResponse.content.length, "characters");

        // Content is already validated by background script
        tsvContent = fileResponse.content;
        console.log("[NaverSA] ✅ File content received and ready for upload");
      }
    }

    // STOP POINT: Verify file content before uploading
    if (tsvContent) {
      console.log("[NaverSA] ========================================");
      console.log("[NaverSA] 📄 FILE READ VERIFICATION");
      console.log("[NaverSA] ========================================");
      console.log("[NaverSA] File size:", tsvContent.length, "characters");
      console.log("[NaverSA] File size:", (tsvContent.length / 1024).toFixed(2), "KB");

      // Show first few lines of content
      const lines = tsvContent.split('\n').slice(0, 5);
      console.log("[NaverSA] First 5 lines of content:");
      lines.forEach((line, index) => {
        console.log(`[NaverSA] Line ${index + 1}:`, line.substring(0, 100) + (line.length > 100 ? '...' : ''));
      });

      // Count rows and columns
      const allLines = tsvContent.split('\n').filter(line => line.trim().length > 0);
      const columnCount = allLines[0]?.split('\t').length || 0;
      console.log("[NaverSA] Total rows:", allLines.length);
      console.log("[NaverSA] Columns in first row:", columnCount);
      console.log("[NaverSA] Tab character count:", (tsvContent.match(/\t/g) || []).length);
      console.log("[NaverSA] ========================================");

      // File content validated and ready for upload
      console.log("[NaverSA] ✅ File content validated, proceeding to upload");
    }

    // Send file content to background for processing
    showToast("Google Sheets 업로드 중...", "loading");
    chrome.runtime.sendMessage(
      {
        type: "PROCESS_TSV_UPLOAD",
        tsvContent: tsvContent,
        dateRange: dateRange,
      },
      (response) => {
        // Check for extension context invalidation
        if (chrome.runtime.lastError) {
          console.error("[NaverSA] Message error:", chrome.runtime.lastError);

          // Specific handling for context invalidation
          if (chrome.runtime.lastError.message?.includes("Extension context invalidated")) {
            console.error("[NaverSA] Extension was reloaded - page refresh required");
            showReloadPrompt();
          } else {
            showToast("업로드 실패", "error");
          }
          return;
        }

        if (response?.success) {
          console.log("[NaverSA] Upload successful");
          showToast("업로드 완료!", "success");

          // Mark as completed and move to next date if applicable
          setTimeout(() => {
            if (!isWorkflowPaused) {
              // Auto-continue to next date or pause
              console.log("[NaverSA] Workflow continuing...");
            }
          }, 2000);
        } else {
          console.error("[NaverSA] Upload failed:", response?.error);
          showToast(`업로드 실패: ${response?.error || "Unknown error"}`, "error");
        }
      }
    );
  } catch (error) {
    console.error("[NaverSA] Upload trigger failed:", error);

    // Check if it's a context invalidation error
    if (error instanceof Error && error.message.includes("Extension context invalidated")) {
      showReloadPrompt();
    } else {
      showToast("업로드 실패", "error");
    }
  }
}

/**
 * Main workflow execution
 */
async function executeWorkflow(): Promise<void> {
  if (isWorkflowPaused) {
    console.log("[NaverSA] Workflow is paused");
    return;
  }

  console.log("[NaverSA] ========================================");
  console.log("[NaverSA] Starting Naver SearchAd automation workflow");
  console.log("[NaverSA] ========================================");

  try {
    // Get configured date
    const result = await chrome.storage.local.get([STORAGE_KEYS.DATE_RANGE]);
    const dateRange = result[STORAGE_KEYS.DATE_RANGE];

    if (!dateRange) {
      showToast("날짜 설정 필요", "error");
      console.error("[NaverSA] Date range not configured");
      return;
    }

    // Format date as YYYY-MM-DD
    const dateString = `${dateRange.startYear}-${String(dateRange.startMonth).padStart(2, '0')}-${String(dateRange.startDay).padStart(2, '0')}`;
    console.log("[NaverSA] Using date:", dateString);

    // Execute steps sequentially
    currentStep = "clicking_tab";
    if (!await clickReportTab()) {
      throw new Error("Failed to click report tab");
    }

    currentStep = "selecting_dropdown";
    if (!await selectReportType()) {
      throw new Error("Failed to select report type");
    }

    currentStep = "setting_date";
    if (!await setDate(dateString)) {
      throw new Error("Failed to set date");
    }

    currentStep = "creating_report";
    if (!await clickCreateButton()) {
      throw new Error("Failed to click create button");
    }

    currentStep = "waiting_refresh";
    await refreshPage();

  } catch (error) {
    console.error("[NaverSA] Workflow failed:", error);
    showToast(`오류: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    currentStep = "idle";
  }
}

/**
 * Continue workflow after page refresh (polling phase)
 */
async function continueWorkflowAfterRefresh(): Promise<void> {
  console.log("[NaverSA] Continuing workflow after refresh...");

  // Wait for page content to fully load
  console.log("[NaverSA] Waiting for page content to load...");
  showToast("페이지 로딩 대기 중...", "loading");
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    currentStep = "polling_table";
    const downloadUrl = await pollForDownloadLink();

    if (!downloadUrl) {
      throw new Error("Failed to get download link");
    }

    currentStep = "downloading";
    if (!await downloadTSV(downloadUrl)) {
      throw new Error("Failed to download TSV");
    }

    currentStep = "uploading";
    await triggerUpload();

    currentStep = "idle";
    console.log("[NaverSA] ========================================");
    console.log("[NaverSA] Workflow completed successfully!");
    console.log("[NaverSA] ========================================");

  } catch (error) {
    console.error("[NaverSA] Workflow continuation failed:", error);
    showToast(`오류: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    currentStep = "idle";
  }
}

/**
 * Inject UI elements (toast, buttons)
 */
function injectUI(): void {
  // Inject toast
  if (!document.getElementById("naversa-toast")) {
    const toast = document.createElement("div");
    toast.id = "naversa-toast";
    toast.className = "naversa-toast";
    toast.style.cssText = `
      position: fixed;
      bottom: 100px;
      right: 32px;
      z-index: 10000;
      background: white;
      border: 2px solid black;
      box-shadow: 0.2rem 0.2rem 0 0 black;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-width: 200px;
    `;
    document.body.appendChild(toast);
  }

  // Inject Resume/Pause buttons
  injectControlButtons();
}

/**
 * Inject control buttons (Resume/Pause)
 */
function injectControlButtons(): void {
  if (document.getElementById("naversa-pause-btn")) return;

  // Pause button
  const pauseBtn = document.createElement("button");
  pauseBtn.id = "naversa-pause-btn";
  pauseBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="6" y="6" width="12" height="12"></rect>
    </svg>
    <span>일시정지</span>
  `;
  pauseBtn.style.cssText = `
    position: fixed;
    bottom: 32px;
    right: 32px;
    width: 120px;
    height: 40px;
    z-index: 10000;
    background: red;
    color: white;
    border: 2px solid black;
    box-shadow: 0.2rem 0.2rem 0 0 black;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 600;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Resume button
  const resumeBtn = document.createElement("button");
  resumeBtn.id = "naversa-resume-btn";
  resumeBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
    <span>재개</span>
  `;
  resumeBtn.style.cssText = `
    position: fixed;
    bottom: 32px;
    right: 32px;
    width: 120px;
    height: 40px;
    z-index: 10000;
    background: #22c55e;
    color: white;
    border: 2px solid black;
    box-shadow: 0.2rem 0.2rem 0 0 black;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Event handlers
  pauseBtn.onclick = () => {
    isWorkflowPaused = true;
    chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_PAUSED]: true });
    updateControlButtons();
    showToast("워크플로우 일시정지됨", "info");
  };

  resumeBtn.onclick = () => {
    isWorkflowPaused = false;
    chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_PAUSED]: false });
    updateControlButtons();
    showToast("워크플로우 재개됨", "success");
    executeWorkflow();
  };

  document.body.appendChild(pauseBtn);
  document.body.appendChild(resumeBtn);

  updateControlButtons();
}

/**
 * Update button visibility based on paused state
 */
function updateControlButtons(): void {
  const pauseBtn = document.getElementById("naversa-pause-btn");
  const resumeBtn = document.getElementById("naversa-resume-btn");

  if (pauseBtn && resumeBtn) {
    if (isWorkflowPaused) {
      pauseBtn.style.display = "none";
      resumeBtn.style.display = "flex";
    } else {
      pauseBtn.style.display = "flex";
      resumeBtn.style.display = "none";
    }
  }
}

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle READ_DOWNLOADED_FILE request from background script
  // Reads the downloaded file content using File System Access API
  if (message.type === "READ_DOWNLOADED_FILE") {
    console.log("[NaverSA] Received READ_DOWNLOADED_FILE request, downloadId:", message.downloadId);

    // Use chrome.downloads API to get file info
    chrome.downloads.search({ id: message.downloadId }, async (downloads) => {
      if (!downloads || downloads.length === 0) {
        sendResponse({
          success: false,
          error: "Download not found"
        });
        return;
      }

      const download = downloads[0];
      console.log("[NaverSA] Download found:", download.filename);

      // The file is already downloaded. We need to read it.
      // Since Chrome extensions can't directly read files from disk,
      // we'll use chrome.downloads.show() to open the file, then read it from the page
      // Or use File System Access API (but requires user interaction)

      // Best approach: Open the file using chrome.downloads.show()
      // This will open it in a new tab if it's a text file
      // Then we can read it from there

      try {
        // Open the downloaded file
        chrome.downloads.show(download.id);

        // Wait a moment for the file to open
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try to read the file using File System Access API
        // This requires user interaction, so we'll need to prompt
        // Actually, let's try a different approach: use fetch with the blob URL
        // But blob URLs are only valid in the context where they were created

        // Alternative: Create a file input and try to read it
        // But we can't set the file path programmatically

        // Actually, the best solution is to use chrome.downloads API
        // to get the file and then read it via a content script injected into
        // the file:// URL, but that's blocked

        // For now, let's use the File System Access API
        // We'll need to show a file picker, but we can make it default to the downloads folder
        if ('showOpenFilePicker' in window) {
          try {
            // @ts-ignore - File System Access API
            const [fileHandle] = await window.showOpenFilePicker({
              suggestedName: download.filename,
              types: [{
                description: 'TSV files',
                accept: { 'text/tab-separated-values': ['.tsv'] }
              }]
            });

            const file = await fileHandle.getFile();
            const content = await file.text();

            console.log("[NaverSA] ✅ Successfully read file content, length:", content.length);
            sendResponse({
              success: true,
              content: content
            });
          } catch (pickerError) {
            console.error("[NaverSA] File picker error:", pickerError);
            // User cancelled or error
            sendResponse({
              success: false,
              error: "File picker was cancelled or failed. Please try again."
            });
          }
        } else {
          // Fallback: File System Access API not available
          // We'll need to ask the user to manually select the file
          sendResponse({
            success: false,
            error: "File System Access API not available. Please manually select the downloaded TSV file."
          });
        }
      } catch (error) {
        console.error("[NaverSA] Error reading file:", error);
        sendResponse({
          success: false,
          error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    });

    return true; // Keep message channel open for async response
  }

  // Handle FETCH_TSV_URL request from background script (legacy, may not be needed)
  // This allows background to use content script's session cookies
  if (message.type === "FETCH_TSV_URL") {
    // Get the URL to fetch - use stored original URL if blob URL was provided
    let urlToFetch = message.url;

    if (message.useStoredUrl || !urlToFetch || urlToFetch.startsWith('blob:')) {
      // If it's a blob URL or we're told to use stored URL, get the original URL from sessionStorage
      let storedUrl = sessionStorage.getItem('naversa_original_download_url');

      // Fallback: Try to extract URL from the page if stored URL is missing
      if (!storedUrl) {
        console.log("[NaverSA] Stored URL not found, trying to extract from page...");
        const table = document.querySelector('table');
        const tbody = table?.querySelector('tbody');
        const firstRow = tbody?.querySelector('tr');
        if (firstRow) {
          // First try to get href from download link
          const downloadLink = firstRow.querySelector('a[href]') as HTMLAnchorElement;
          if (downloadLink) {
            const href = downloadLink.getAttribute('href');
            if (href && href !== "#/" && !href.startsWith('javascript:') && !href.startsWith('blob:')) {
              storedUrl = href.startsWith('/')
                ? `https://manage.searchad.naver.com${href}`
                : href.startsWith('http') ? href : `https://manage.searchad.naver.com/${href}`;
              console.log("[NaverSA] Extracted URL from link href:", storedUrl);
            }
          }

          // If no URL from link, try data-value
          if (!storedUrl) {
            const dataValueElement = firstRow.querySelector('[data-value]') as HTMLElement;
            if (dataValueElement) {
              const dataValue = dataValueElement.getAttribute('data-value');
              if (dataValue && dataValue !== "-") {
                // Construct URL from data-value (might be ID or path)
                if (dataValue.startsWith('/')) {
                  storedUrl = `https://manage.searchad.naver.com${dataValue}`;
                } else if (/^\d+$/.test(dataValue)) {
                  // Numeric ID - construct download URL
                  storedUrl = `https://manage.searchad.naver.com/report-download/${dataValue}`;
                  console.log("[NaverSA] Constructed URL from ID:", storedUrl);
                } else if (dataValue.startsWith('http')) {
                  storedUrl = dataValue;
                } else {
                  storedUrl = `https://manage.searchad.naver.com/${dataValue}`;
                }
                console.log("[NaverSA] Extracted URL from data-value:", storedUrl);
              }
            }
          }

          // Store it for future use
          if (storedUrl && !storedUrl.startsWith('blob:')) {
            sessionStorage.setItem('naversa_original_download_url', storedUrl);
            console.log("[NaverSA] Extracted and stored URL from page:", storedUrl);
          }
        }
      }

      if (storedUrl && !storedUrl.startsWith('blob:')) {
        urlToFetch = storedUrl;
        console.log("[NaverSA] Using stored/extracted original URL instead of blob URL:", urlToFetch);
      } else {
        console.error("[NaverSA] No valid original URL found and blob URL provided");
        sendResponse({
          success: false,
          error: "No original download URL available. The download link may have expired. Please try downloading again."
        });
        return true;
      }
    }

    console.log("[NaverSA] Received FETCH_TSV_URL request from background, URL:", urlToFetch);

    // Fetch the URL with content script's session context
    fetch(urlToFetch, {
      method: 'GET',
      credentials: 'include', // Include cookies for authentication
      redirect: 'follow',
      headers: {
        'Accept': 'text/tab-separated-values, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': window.location.href,
        'User-Agent': navigator.userAgent,
      }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }

        const content = await response.text();

        // Validate it's TSV, not HTML
        const trimmedContent = content.trim();
        const isHTML =
          trimmedContent.toLowerCase().startsWith('<!doctype') ||
          trimmedContent.toLowerCase().startsWith('<html') ||
          trimmedContent.toLowerCase().includes('<!doctype html') ||
          trimmedContent.toLowerCase().includes('<html lang') ||
          trimmedContent.toLowerCase().includes('<head>') ||
          trimmedContent.toLowerCase().includes('<body>') ||
          (trimmedContent.startsWith('<') && trimmedContent.includes('html'));

        if (isHTML) {
          console.error("[NaverSA] ❌ Received HTML instead of TSV from URL fetch");
          sendResponse({
            success: false,
            error: "Received HTML page instead of TSV file. The download URL may require additional authentication."
          });
          return;
        }

        // Validate TSV format
        if (!content.includes('\t')) {
          console.error("[NaverSA] ❌ Content doesn't contain tabs - not valid TSV");
          sendResponse({
            success: false,
            error: "Content does not appear to be TSV format (no tab characters found)."
          });
          return;
        }

        console.log("[NaverSA] ✅ Successfully fetched TSV content via content script, length:", content.length);
        sendResponse({
          success: true,
          content: content
        });
      })
      .catch((error) => {
        console.error("[NaverSA] Failed to fetch TSV URL:", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      });

    return true; // Keep message channel open for async response
  }
});

/**
 * Initialize content script
 */
async function initialize(): Promise<void> {
  // Check if we're on the correct page
  if (!window.location.href.includes("manage.searchad.naver.com") ||
      !window.location.href.includes("reports-download")) {
    console.log("[NaverSA] Not on reports download page");
    return;
  }

  console.log("[NaverSA] Initializing on Naver SearchAd reports page");

  // Restore paused state
  const result = await chrome.storage.local.get([STORAGE_KEYS.WORKFLOW_PAUSED]);
  isWorkflowPaused = result[STORAGE_KEYS.WORKFLOW_PAUSED] !== false; // Default to paused

  // Inject UI
  injectUI();

  // Check if this is a page refresh (part of workflow)
  const wasPolling = sessionStorage.getItem("naversa_polling") === "true";

  if (wasPolling) {
    console.log("[NaverSA] Detected page refresh, continuing workflow...");
    sessionStorage.removeItem("naversa_polling");
    await continueWorkflowAfterRefresh();
  } else {
    console.log("[NaverSA] Fresh page load, workflow paused by default");
  }
}

// Run initialization when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

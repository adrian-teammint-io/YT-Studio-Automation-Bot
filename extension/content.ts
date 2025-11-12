/**
 * Content script for Naver SearchAd report automation
 * Runs on Naver SearchAd report download page and automates:
 * 1. Click "대용량 보고서 다운로드" tab
 * 2. Select report type dropdown
 * 3. Configure date range
 * 4. Create report
 * 5. Wait and refresh
 * 6. Download TSV file
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
function showToast(message: string, type: "info" | "success" | "error" | "loading" = "info", duration: number = 3000): void {
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

  // Auto-hide after specified duration for success/error
  if (type === "success" || type === "error") {
    setTimeout(() => {
      toast.style.display = "none";
    }, duration);
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
 * Step 7: Click download link to trigger browser download
 */
async function downloadTSV(url: string): Promise<boolean> {
  console.log("[NaverSA] Step 7: Clicking download link...");
  showToast("다운로드 시작 중...", "loading");

  try {
    // Find the table and first row
    const table = document.querySelector('table');
    const tbody = table?.querySelector('tbody');
    const firstRow = tbody?.querySelector('tr');

    if (!firstRow) {
      console.warn("[NaverSA] First row not found in table");
      return false;
    }

    // Find download link
    let downloadLink: HTMLElement | null = null;
    const allLinks = firstRow.querySelectorAll('a');

    for (const link of allLinks) {
      if (link.textContent?.includes("다운로드")) {
        downloadLink = link;
        break;
      }
    }

    // Fallback strategies
    if (!downloadLink) {
      downloadLink = firstRow.querySelector('a[href="#/"]') as HTMLAnchorElement;
    }

    if (!downloadLink) {
      const firstCell = firstRow.querySelector('td');
      downloadLink = firstCell?.querySelector('button') as HTMLElement;
    }

    if (!downloadLink && allLinks.length > 0) {
      downloadLink = allLinks[0] as HTMLElement;
    }

    if (downloadLink) {
      console.log("[NaverSA] Clicking download link...");
      downloadLink.click();
      showToast("다운로드 시작됨", "success");

      // Wait a moment for download to start
      console.log("[NaverSA] Waiting for download to start...");
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get the downloaded file info from background script
      // Background script will poll for completion (up to 15 seconds)
      showToast("다운로드 파일 확인 중... (최대 15초)", "loading");
      console.log("[NaverSA] 🔍 Searching for latest downloaded TSV file...");
      console.log("[NaverSA] Background script will poll for download completion...");

      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_TSV_FILE_CONTENT"
        });

        if (!response) {
          console.warn("[NaverSA] ⚠️  No response from background script");
          showToast("백그라운드 스크립트 응답 없음", "error");
          return false;
        }

        if (response.success) {
          const filename = response.filename;
          const contentLength = response.content?.length || 0;
          const rows = response.content?.split('\n').filter((l: string) => l.trim()).length || 0;

          console.log("[NaverSA] ========================================");
          console.log("[NaverSA] 🎯 FOUND DOWNLOADED FILE:");
          console.log(`[NaverSA]    📄 Filename: ${filename}`);
          console.log(`[NaverSA]    📊 Size: ${contentLength} characters`);
          console.log(`[NaverSA]    📏 Rows: ${rows} rows`);
          console.log("[NaverSA] ========================================");
          console.log(`[NaverSA] ✅ Successfully retrieved latest download`);
          console.log("[NaverSA] ========================================");

          // Show toast for 5 seconds with file details
          showToast(`✅ 파일 발견: ${filename} (${rows}행, ${contentLength}자)`, "success", 5000);

          // Upload to Google Sheets
          if (response.content) {
            currentStep = "uploading";
            await uploadToGoogleSheets(response.content);
          }
        } else {
          const errorMsg = response.error || "Unknown error";
          console.warn("[NaverSA] ⚠️  Could not retrieve file info:", errorMsg);
          showToast(`파일 확인 실패: ${errorMsg}`, "error", 5000);
        }
      } catch (error) {
        console.error("[NaverSA] ❌ Failed to get file info:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        showToast(`파일 정보 조회 오류: ${errorMessage}`, "error", 5000);
      }

      return true;
    }

    console.warn("[NaverSA] Download link not found");
    return false;
  } catch (error) {
    console.error("[NaverSA] Download failed:", error);
    showToast("다운로드 실패", "error");
    return false;
  }
}

/**
 * Step 8: Upload downloaded TSV file to Google Sheets
 */
async function uploadToGoogleSheets(tsvContent: string): Promise<boolean> {
  console.log("[NaverSA] Step 8: Uploading to Google Sheets...");
  showToast("Google Sheets 업로드 중...", "loading");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "UPLOAD_DOWNLOADED_TSV",
      tsvContent: tsvContent
    });

    if (!response) {
      console.warn("[NaverSA] ⚠️  No response from background script");
      showToast("업로드 응답 없음", "error");
      return false;
    }

    if (response.success) {
      const updatedRows = response.updatedRows || 0;
      const updatedRange = response.updatedRange || "N/A";

      console.log("[NaverSA] ========================================");
      console.log("[NaverSA] ✅ UPLOAD SUCCESSFUL!");
      console.log(`[NaverSA]    📊 Rows added: ${updatedRows}`);
      console.log(`[NaverSA]    📍 Range: ${updatedRange}`);
      console.log("[NaverSA] ========================================");

      // Parse the range to extract row numbers for user guidance
      const rangeMatch = updatedRange.match(/(\d+):(\w+)(\d+)/);
      if (rangeMatch) {
        const startRow = rangeMatch[1];
        const endRow = rangeMatch[3];
        showToast(`✅ 업로드 완료: ${updatedRows}행 추가됨 (행 ${startRow}-${endRow})`, "success", 5000);
        console.log(`[NaverSA] 📌 IMPORTANT: Scroll down to row ${startRow} in your Google Sheet to see the uploaded data!`);
      } else {
        showToast(`✅ 업로드 완료: ${updatedRows}행 추가됨`, "success", 5000);
      }

      return true;
    } else {
      const errorMsg = response.error || "Unknown error";
      console.error("[NaverSA] ❌ Upload failed:", errorMsg);
      showToast(`업로드 실패: ${errorMsg}`, "error", 5000);
      return false;
    }
  } catch (error) {
    console.error("[NaverSA] ❌ Failed to upload:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    showToast(`업로드 오류: ${errorMessage}`, "error", 5000);
    return false;
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
 * (File reading handlers removed - automation now only clicks download link)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Reserved for future message handling
  console.log("[NaverSA] Received message:", message.type);
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

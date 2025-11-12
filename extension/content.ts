/**
 * Content script for YT Studio report automation
 * Runs on YT Studio report download page and automates:
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
let isUploadInProgress = false; // Flag to prevent duplicate uploads

/**
 * Show toast notification at bottom of page
 */
function showToast(message: string, type: "info" | "success" | "error" | "loading" = "info", duration: number = 3000): void {
  const toast = document.getElementById("ytstudio-toast");
  if (!toast) return;

  const icons = {
    info: "ℹ️",
    success: "✅",
    error: "❌",
    loading: "⏳"
  };

  toast.textContent = `${icons[type]} ${message}`;
  toast.className = `ytstudio-toast ytstudio-toast-${type}`;
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
  const existingButton = document.getElementById("ytstudio-reload-btn");
  if (existingButton) return;

  const reloadBtn = document.createElement("button");
  reloadBtn.id = "ytstudio-reload-btn";
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
  console.log("[YTStudio] Step 1: Clicking '대용량 보고서 다운로드' tab...");
  showToast("'대용량 보고서 다운로드' 탭 클릭 중...", "loading");

  // Strategy: Find tab/button with text "대용량 보고서 다운로드"
  const tabs = document.querySelectorAll('button, a, [role="tab"]');

  for (const tab of tabs) {
    if (tab.textContent?.includes("대용량 보고서 다운로드")) {
      console.log("[YTStudio] Found report tab, clicking...");
      (tab as HTMLElement).click();
      showToast("탭 클릭 완료", "success");
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for tab content to load
      return true;
    }
  }

  console.warn("[YTStudio] Report tab not found");
  return false;
}

/**
 * Step 2: Select "쇼핑검색 검색어 전환 상세 보고서" from dropdown
 */
async function selectReportType(): Promise<boolean> {
  console.log("[YTStudio] Step 2: Selecting report type...");
  showToast("보고서 유형 선택 중...", "loading");

  // === DIAGNOSTIC LOGGING: Layer 1 - Find title areas ===
  const titleAreas = document.querySelectorAll('.title-area');
  console.log("[YTStudio] DEBUG: Found", titleAreas.length, "elements with class '.title-area'");

  if (titleAreas.length === 0) {
    console.error("[YTStudio] DIAGNOSTIC: No .title-area elements found on page");
    console.error("[YTStudio] DIAGNOSTIC: Available classes on page:", Array.from(new Set(Array.from(document.querySelectorAll('[class]')).map(el => el.className))).slice(0, 20));
    return false;
  }

  // === DIAGNOSTIC LOGGING: Layer 2 - Check text content ===
  console.log("[YTStudio] DEBUG: Checking title areas for text '다운로드 항목 선택'");
  titleAreas.forEach((area, idx) => {
    console.log(`[YTStudio] DEBUG: titleArea[${idx}] text:`, area.textContent?.trim().substring(0, 50));
  });

  let dropdownButton: HTMLElement | null = null;
  let foundTitleArea = false;

  for (const titleArea of titleAreas) {
    if (titleArea.textContent?.includes("다운로드 항목 선택")) {
      foundTitleArea = true;
      console.log("[YTStudio] DEBUG: ✓ Found title area with matching text");

      // === FIX: Expand search scope - try multiple strategies ===

      // Strategy 1: Search in parent container (go up more levels)
      const parentContainer = titleArea.closest('div')?.parentElement;
      console.log("[YTStudio] DEBUG: Trying parent container...");

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
            console.log("[YTStudio] DEBUG: Found button by fallback strategy");
          }
        }
      }

      // Strategy 2: Search in next sibling
      if (!dropdownButton) {
        console.log("[YTStudio] DEBUG: Trying sibling elements...");
        let sibling = titleArea.nextElementSibling;
        while (sibling && !dropdownButton) {
          dropdownButton = sibling.querySelector('.dropdown-toggle, button, select') as HTMLElement;
          if (!dropdownButton && (sibling.tagName === 'BUTTON' || sibling.tagName === 'SELECT')) {
            dropdownButton = sibling as HTMLElement;
          }
          sibling = sibling.nextElementSibling;
        }
      }

      console.log("[YTStudio] DEBUG: Final dropdown button found:", dropdownButton !== null);
      if (dropdownButton) {
        console.log("[YTStudio] DEBUG: Dropdown element tag:", dropdownButton.tagName);
        console.log("[YTStudio] DEBUG: Dropdown element classes:", dropdownButton.className);
      }

      break;
    }
  }

  if (!foundTitleArea) {
    console.error("[YTStudio] DIAGNOSTIC: No title area contains '다운로드 항목 선택'");
    console.error("[YTStudio] DIAGNOSTIC: All title area texts:", Array.from(titleAreas).map(a => a.textContent?.trim()));
  }

  if (!dropdownButton) {
    console.warn("[YTStudio] Dropdown button not found");
    return false;
  }

  // Click to open dropdown
  console.log("[YTStudio] Opening dropdown...");
  dropdownButton.click();
  await new Promise(resolve => setTimeout(resolve, 500));

  // Find and click the option "쇼핑검색 검색어 전환 상세 보고서"
  const dropdownItems = document.querySelectorAll('.dropdown-menu li, .dropdown-menu a, [role="option"]');

  for (const item of dropdownItems) {
    if (item.textContent?.includes("쇼핑검색 검색어 전환 상세 보고서")) {
      console.log("[YTStudio] Found target option, selecting...");
      (item as HTMLElement).click();
      showToast("보고서 유형 선택 완료", "success");
      await new Promise(resolve => setTimeout(resolve, 500));
      return true;
    }
  }

  console.warn("[YTStudio] Report type option not found");
  return false;
}

/**
 * Step 3: Set date in calendar input
 */
async function setDate(dateString: string): Promise<boolean> {
  console.log("[YTStudio] Step 3: Setting date to", dateString);
  showToast(`날짜 설정 중: ${dateString}`, "loading");

  // Find the calendar input by looking for title-area "조회 일자 선택"
  const titleAreas = document.querySelectorAll('.title-area');
  console.log("[YTStudio] DEBUG: Found", titleAreas.length, "elements with class '.title-area'");

  let calendarInput: HTMLInputElement | null = null;
  let titleArea: Element | null = null;

  for (const area of titleAreas) {
    if (area.textContent?.includes("조회 일자 선택")) {
      titleArea = area;
      console.log("[YTStudio] DEBUG: Found matching title-area:", area.textContent);
      break;
    }
  }

  if (!titleArea) {
    console.warn("[YTStudio] Title area '조회 일자 선택' not found");
    return false;
  }

  // Strategy 1: Search in parent container with multiple selectors
  const parentContainer = titleArea.closest('div')?.parentElement;
  console.log("[YTStudio] DEBUG: Parent container HTML:", parentContainer?.innerHTML?.substring(0, 200));

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
      console.log("[YTStudio] DEBUG: Found", inputs.length, "input elements in parent container");
      for (const input of inputs) {
        if (input.type === 'text' || input.type === 'date') {
          calendarInput = input as HTMLInputElement;
          console.log("[YTStudio] DEBUG: Using fallback input:", input.name, input.className);
          break;
        }
      }
    }
  }

  // Strategy 2: Search in siblings if not found in parent
  if (!calendarInput) {
    console.log("[YTStudio] DEBUG: Searching in siblings...");
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
    console.warn("[YTStudio] Calendar input not found");
    return false;
  }

  // Set the value
  console.log("[YTStudio] Setting input value...");
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
  console.log("[YTStudio] Step 4: Clicking '생성요청' button...");
  showToast("보고서 생성 요청 중...", "loading");

  // Find button with text "생성요청"
  const buttons = document.querySelectorAll('button');

  for (const button of buttons) {
    const span = button.querySelector('span');
    if (span?.textContent?.includes("생성요청")) {
      console.log("[YTStudio] Found create button, clicking...");
      button.click();
      showToast("생성 요청 완료", "success");
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    }
  }

  console.warn("[YTStudio] Create button not found");
  return false;
}

/**
 * Step 5: Refresh page after delay
 */
async function refreshPage(): Promise<void> {
  console.log(`[YTStudio] Step 5: Waiting ${REFRESH_DELAY}ms before refresh...`);
  showToast(`${REFRESH_DELAY/1000}초 후 새로고침...`, "loading");

  await new Promise(resolve => setTimeout(resolve, REFRESH_DELAY));

  // Mark that we're in polling phase BEFORE reload
  console.log("[YTStudio] Setting polling flag before page refresh...");
  sessionStorage.setItem("ytstudio_polling", "true");

  console.log("[YTStudio] Refreshing page...");
  showToast("페이지 새로고침 중...", "loading");
  window.location.reload();
}

/**
 * Step 6: Poll table for download link
 * Check first row, first cell for download link (not "-")
 */
async function pollForDownloadLink(): Promise<string | null> {
  console.log("[YTStudio] Step 6: Polling for download link...");
  showToast("다운로드 링크 확인 중...", "loading");

  pollAttempts++;
  console.log(`[YTStudio] Poll attempt ${pollAttempts}/${MAX_POLL_ATTEMPTS}`);

  // Find the table (there's only one on the page)
  const table = document.querySelector('table');
  if (!table) {
    console.warn("[YTStudio] Table not found");
    return null;
  }

  // Get first row (excluding header)
  const tbody = table.querySelector('tbody');
  if (!tbody) {
    console.warn("[YTStudio] Table body not found");
    return null;
  }

  const firstRow = tbody.querySelector('tr');
  if (!firstRow) {
    console.warn("[YTStudio] No rows in table");
    return null;
  }

  // Get first cell with data-value attribute
  const firstCell = firstRow.querySelector('td[data-value]') as HTMLTableCellElement;
  if (!firstCell) {
    console.warn("[YTStudio] First cell not found");
    return null;
  }

  const dataValue = firstCell.getAttribute('data-value');
  console.log("[YTStudio] First cell data-value:", dataValue);

  // Check if it's not "-" (which means report is ready)
  if (dataValue && dataValue !== "" && dataValue !== "-") {
    console.log("[YTStudio] ✅ Download link found!");
    showToast("다운로드 링크 발견!", "success");

    // Extract download URL - data-value might be a path or just an ID
    let fullUrl: string;
    if (dataValue.startsWith("/report-download")) {
      // Full path provided
      fullUrl = `https://manage.searchad.naver.com${dataValue}`;
    } else if (/^\d+$/.test(dataValue)) {
      // Just an ID (numeric) - construct the download URL
      fullUrl = `https://manage.searchad.naver.com/report-download/${dataValue}`;
      console.log("[YTStudio] Constructed download URL from ID:", fullUrl);
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
      sessionStorage.setItem('ytstudio_original_download_url', fullUrl);
      console.log("[YTStudio] Stored original download URL from poll:", fullUrl);
    }

    return fullUrl;
  }

  // Not ready yet
  console.log("[YTStudio] Report not ready yet (value is '-' or empty)");

  if (pollAttempts < MAX_POLL_ATTEMPTS) {
    showToast(`보고서 생성 대기 중... (${pollAttempts}/${MAX_POLL_ATTEMPTS})`, "loading");
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    return await pollForDownloadLink();
  }

  console.error("[YTStudio] Max poll attempts reached");
  showToast("보고서 생성 시간 초과", "error");
  return null;
}

/**
 * Step 7: Click download link to trigger browser download
 */
async function downloadTSV(url: string): Promise<boolean> {
  console.log("[YTStudio] Step 7: Clicking download link...");
  showToast("다운로드 시작 중...", "loading");

  try {
    // Find the table and first row
    const table = document.querySelector('table');
    const tbody = table?.querySelector('tbody');
    const firstRow = tbody?.querySelector('tr');

    if (!firstRow) {
      console.warn("[YTStudio] First row not found in table");
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
      console.log("[YTStudio] Clicking download link...");
      downloadLink.click();
      showToast("다운로드 시작됨", "success");

      // Wait a moment for download to start
      console.log("[YTStudio] Waiting for download to start...");
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get the downloaded file info from background script
      // Background script will poll for completion (up to 15 seconds)
      showToast("다운로드 파일 확인 중... (최대 15초)", "loading");
      console.log("[YTStudio] 🔍 Searching for latest downloaded TSV file...");
      console.log("[YTStudio] Background script will poll for download completion...");

      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_TSV_FILE_CONTENT"
        });

        if (!response) {
          console.warn("[YTStudio] ⚠️  No response from background script");
          showToast("백그라운드 스크립트 응답 없음", "error");
          return false;
        }

        if (response.success) {
          const filename = response.filename;
          const contentLength = response.content?.length || 0;
          const rows = response.content?.split('\n').filter((l: string) => l.trim()).length || 0;

          console.log("[YTStudio] ========================================");
          console.log("[YTStudio] 🎯 FOUND DOWNLOADED FILE:");
          console.log(`[YTStudio]    📄 Filename: ${filename}`);
          console.log(`[YTStudio]    📊 Size: ${contentLength} characters`);
          console.log(`[YTStudio]    📏 Rows: ${rows} rows`);
          console.log("[YTStudio] ========================================");
          console.log(`[YTStudio] ✅ Successfully retrieved latest download`);
          console.log("[YTStudio] ========================================");

          // Show toast for 5 seconds with file details
          showToast(`✅ 파일 발견: ${filename} (${rows}행, ${contentLength}자)`, "success", 5000);

          // Upload to Google Sheets (only if not already uploading)
          if (response.content && !isUploadInProgress) {
            currentStep = "uploading";
            await uploadToGoogleSheets(response.content);
          } else if (isUploadInProgress) {
            console.log("[YTStudio] ⚠️  Upload already in progress, skipping duplicate upload");
            showToast("업로드가 이미 진행 중입니다", "info", 3000);
          }
        } else {
          const errorMsg = response.error || "Unknown error";
          console.warn("[YTStudio] ⚠️  Could not retrieve file info:", errorMsg);
          showToast(`파일 확인 실패: ${errorMsg}`, "error", 5000);
        }
      } catch (error) {
        console.error("[YTStudio] ❌ Failed to get file info:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        showToast(`파일 정보 조회 오류: ${errorMessage}`, "error", 5000);
      }

      return true;
    }

    console.warn("[YTStudio] Download link not found");
    return false;
  } catch (error) {
    console.error("[YTStudio] Download failed:", error);
    showToast("다운로드 실패", "error");
    return false;
  }
}

/**
 * Step 8: Upload downloaded TSV file to Google Sheets
 */
async function uploadToGoogleSheets(tsvContent: string): Promise<boolean> {
  // Prevent duplicate uploads
  if (isUploadInProgress) {
    console.log("[YTStudio] ⚠️  Upload already in progress, skipping duplicate upload");
    showToast("업로드가 이미 진행 중입니다", "info", 3000);
    return false;
  }

  isUploadInProgress = true;
  console.log("[YTStudio] Step 8: Uploading to Google Sheets...");
  showToast("Google Sheets 업로드 중...", "loading");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "UPLOAD_DOWNLOADED_TSV",
      tsvContent: tsvContent
    });

    if (!response) {
      console.warn("[YTStudio] ⚠️  No response from background script");
      showToast("업로드 응답 없음", "error");
      return false;
    }

    if (response.success) {
      const updatedRows = response.updatedRows || 0;
      const updatedRange = response.updatedRange || "N/A";

      console.log("[YTStudio] ========================================");
      console.log("[YTStudio] ✅ UPLOAD SUCCESSFUL!");
      console.log(`[YTStudio]    📊 Rows added: ${updatedRows}`);
      console.log(`[YTStudio]    📍 Range: ${updatedRange}`);
      console.log("[YTStudio] ========================================");

      // Parse the range to extract row numbers for user guidance
      const rangeMatch = updatedRange.match(/(\d+):(\w+)(\d+)/);
      if (rangeMatch) {
        const startRow = rangeMatch[1];
        const endRow = rangeMatch[3];
        showToast(`✅ 업로드 완료: ${updatedRows}행 추가됨 (행 ${startRow}-${endRow})`, "success", 5000);
        console.log(`[YTStudio] 📌 IMPORTANT: Scroll down to row ${startRow} in your Google Sheet to see the uploaded data!`);
      } else {
        showToast(`✅ 업로드 완료: ${updatedRows}행 추가됨`, "success", 5000);
      }

      isUploadInProgress = false;
      return true;
    } else {
      const errorMsg = response.error || "Unknown error";
      console.error("[YTStudio] ❌ Upload failed:", errorMsg);
      showToast(`업로드 실패: ${errorMsg}`, "error", 5000);
      isUploadInProgress = false;
      return false;
    }
  } catch (error) {
    console.error("[YTStudio] ❌ Failed to upload:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    showToast(`업로드 오류: ${errorMessage}`, "error", 5000);
    isUploadInProgress = false;
    return false;
  }
}

/**
 * Generate array of dates between start and end date (inclusive)
 */
function generateDateQueue(startYear: number, startMonth: number, startDay: number, endYear: number, endMonth: number, endDay: number): string[] {
  const dates: string[] = [];
  const startDate = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);

  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    console.error("[YTStudio] Invalid date range");
    return [];
  }

  // Ensure start is before end
  if (startDate > endDate) {
    console.error("[YTStudio] Start date is after end date");
    return [];
  }

  // Generate all dates between start and end (inclusive)
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

/**
 * Get current date from queue or initialize queue
 */
async function getCurrentDate(): Promise<string | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.DATE_RANGE,
    STORAGE_KEYS.DATE_QUEUE,
    STORAGE_KEYS.CURRENT_DATE_INDEX
  ]);

  const dateRange = result[STORAGE_KEYS.DATE_RANGE];
  if (!dateRange) {
    return null;
  }

  let dateQueue: string[] = result[STORAGE_KEYS.DATE_QUEUE] || [];
  let currentDateIndex: number = result[STORAGE_KEYS.CURRENT_DATE_INDEX] || 0;

  // Initialize or regenerate queue if needed
  if (dateQueue.length === 0 || currentDateIndex >= dateQueue.length) {
    dateQueue = generateDateQueue(
      dateRange.startYear,
      dateRange.startMonth,
      dateRange.startDay,
      dateRange.endYear,
      dateRange.endMonth,
      dateRange.endDay
    );

    if (dateQueue.length === 0) {
      return null;
    }

    currentDateIndex = 0;
    await chrome.storage.local.set({
      [STORAGE_KEYS.DATE_QUEUE]: dateQueue,
      [STORAGE_KEYS.CURRENT_DATE_INDEX]: currentDateIndex
    });
  }

  return dateQueue[currentDateIndex] || null;
}

/**
 * Move to next date in queue
 */
async function moveToNextDate(): Promise<string | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.DATE_QUEUE,
    STORAGE_KEYS.CURRENT_DATE_INDEX
  ]);

  const dateQueue: string[] = result[STORAGE_KEYS.DATE_QUEUE] || [];
  let currentDateIndex: number = result[STORAGE_KEYS.CURRENT_DATE_INDEX] || 0;

  currentDateIndex++;

  if (currentDateIndex >= dateQueue.length) {
    // All dates completed
    await chrome.storage.local.set({
      [STORAGE_KEYS.CURRENT_DATE_INDEX]: currentDateIndex
    });
    return null;
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.CURRENT_DATE_INDEX]: currentDateIndex
  });

  return dateQueue[currentDateIndex] || null;
}

/**
 * Main workflow execution
 */
async function executeWorkflow(): Promise<void> {
  if (isWorkflowPaused) {
    console.log("[YTStudio] Workflow is paused");
    return;
  }

  console.log("[YTStudio] ========================================");
  console.log("[YTStudio] Starting YT Studio automation workflow");
  console.log("[YTStudio] ========================================");

  try {
    // Get current date from queue
    const dateString = await getCurrentDate();

    if (!dateString) {
      showToast("날짜 설정 필요 또는 모든 날짜 완료", "error");
      console.error("[YTStudio] No date available or all dates completed");
      return;
    }

    // Get date queue info for progress display
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.DATE_QUEUE,
      STORAGE_KEYS.CURRENT_DATE_INDEX
    ]);
    const dateQueue: string[] = result[STORAGE_KEYS.DATE_QUEUE] || [];
    const currentDateIndex: number = result[STORAGE_KEYS.CURRENT_DATE_INDEX] || 0;
    const totalDates = dateQueue.length;
    const currentDateNumber = currentDateIndex + 1;

    console.log("[YTStudio] Using date:", dateString, `(${currentDateNumber}/${totalDates})`);
    showToast(`날짜 처리 중: ${dateString} (${currentDateNumber}/${totalDates})`, "loading");

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
    console.error("[YTStudio] Workflow failed:", error);
    showToast(`오류: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    currentStep = "idle";
    isUploadInProgress = false; // Reset upload flag on error
  }
}

/**
 * Continue workflow after page refresh (polling phase)
 */
async function continueWorkflowAfterRefresh(): Promise<void> {
  console.log("[YTStudio] Continuing workflow after refresh...");

  // Wait for page content to fully load
  console.log("[YTStudio] Waiting for page content to load...");
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

    // Get current date info before moving to next
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.DATE_QUEUE,
      STORAGE_KEYS.CURRENT_DATE_INDEX,
      STORAGE_KEYS.COMPLETED_DATES
    ]);
    const dateQueue: string[] = result[STORAGE_KEYS.DATE_QUEUE] || [];
    const currentDateIndex: number = result[STORAGE_KEYS.CURRENT_DATE_INDEX] || 0;
    const totalDates = dateQueue.length;
    const currentDateNumber = currentDateIndex + 1;
    const currentDate = dateQueue[currentDateIndex];

    console.log("[YTStudio] ========================================");
    console.log("[YTStudio] Date workflow completed:", currentDate, `(${currentDateNumber}/${totalDates})`);
    console.log("[YTStudio] ========================================");

    // Mark current date as completed with timestamp
    if (currentDate) {
      const completedDates: Array<{ date: string; completedAt: string }> = result[STORAGE_KEYS.COMPLETED_DATES] || [];
      const existingIndex = completedDates.findIndex(item => item.date === currentDate);

      if (existingIndex === -1) {
        // Add new completed date with timestamp
        completedDates.push({
          date: currentDate,
          completedAt: new Date().toISOString()
        });
        await chrome.storage.local.set({
          [STORAGE_KEYS.COMPLETED_DATES]: completedDates
        });
        console.log("[YTStudio] Marked date as completed:", currentDate);
      }
    }

    // Move to next date
    const nextDate = await moveToNextDate();

    if (nextDate) {
      // More dates to process - continue with next date
      const nextDateIndex = currentDateIndex + 1;
      console.log("[YTStudio] Moving to next date:", nextDate, `(${nextDateIndex + 1}/${totalDates})`);
      showToast(`날짜 완료: ${currentDate} (${currentDateNumber}/${totalDates}). 다음 날짜로 이동...`, "success", 2000);

      // Wait a bit before starting next date
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Execute workflow for next date
      currentStep = "idle";
      isUploadInProgress = false; // Reset upload flag for next date
      await executeWorkflow();
    } else {
      // All dates completed
      currentStep = "idle";
      isUploadInProgress = false; // Reset upload flag when all dates completed
      console.log("[YTStudio] ========================================");
      console.log("[YTStudio] All dates workflow completed successfully!");
      console.log("[YTStudio] ========================================");

      // Pause workflow after successful completion
      isWorkflowPaused = true;
      chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_PAUSED]: true });
      updateControlButtons();
      showToast(`모든 날짜 완료! (총 ${totalDates}개 날짜 처리됨)`, "success", 5000);
    }

  } catch (error) {
    console.error("[YTStudio] Workflow continuation failed:", error);
    showToast(`오류: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    currentStep = "idle";
    isUploadInProgress = false; // Reset upload flag on error
  }
}

/**
 * Inject UI elements (toast, buttons)
 */
function injectUI(): void {
  // Inject toast
  if (!document.getElementById("ytstudio-toast")) {
    const toast = document.createElement("div");
    toast.id = "ytstudio-toast";
    toast.className = "ytstudio-toast";
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
  if (document.getElementById("ytstudio-pause-btn")) return;

  // Pause button
  const pauseBtn = document.createElement("button");
  pauseBtn.id = "ytstudio-pause-btn";
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
  resumeBtn.id = "ytstudio-resume-btn";
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
  const pauseBtn = document.getElementById("ytstudio-pause-btn");
  const resumeBtn = document.getElementById("ytstudio-resume-btn");

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
  console.log("[YTStudio] Received message:", message.type);
});

/**
 * Initialize content script
 */
async function initialize(): Promise<void> {
  // Check if we're on the correct page
  if (!window.location.href.includes("manage.searchad.naver.com") ||
      !window.location.href.includes("reports-download")) {
    console.log("[YTStudio] Not on reports download page");
    return;
  }

  console.log("[YTStudio] Initializing on YT Studio reports page");

  // Inject UI first
  injectUI();

  // Wait a moment for storage to sync (in case popup just set it)
  await new Promise(resolve => setTimeout(resolve, 500));

  // Restore paused state
  const result = await chrome.storage.local.get([STORAGE_KEYS.WORKFLOW_PAUSED]);
  isWorkflowPaused = result[STORAGE_KEYS.WORKFLOW_PAUSED] !== false; // Default to paused
  updateControlButtons();

  // Listen for storage changes to sync button state and execute workflow
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      // Handle workflow paused state changes
      if (changes[STORAGE_KEYS.WORKFLOW_PAUSED]) {
        const wasPaused = isWorkflowPaused;
        isWorkflowPaused = changes[STORAGE_KEYS.WORKFLOW_PAUSED].newValue !== false;
        updateControlButtons();
        console.log("[YTStudio] Workflow paused state synced:", isWorkflowPaused);

        // If workflow changed from paused to unpaused, execute it
        if (wasPaused && !isWorkflowPaused && currentStep === "idle") {
          console.log("[YTStudio] Workflow resumed, executing automatically...");
          // Small delay to ensure page is ready
          setTimeout(() => {
            executeWorkflow();
          }, 1000);
        }
      }

      // Reset date queue when date range changes
      if (changes[STORAGE_KEYS.DATE_RANGE]) {
        console.log("[YTStudio] Date range changed, resetting date queue...");
        chrome.storage.local.set({
          [STORAGE_KEYS.DATE_QUEUE]: [],
          [STORAGE_KEYS.CURRENT_DATE_INDEX]: 0,
          [STORAGE_KEYS.COMPLETED_DATES]: []
        });
      }
    }
  });

  // Check if this is a page refresh (part of workflow)
  const wasPolling = sessionStorage.getItem("ytstudio_polling") === "true";

  if (wasPolling) {
    console.log("[YTStudio] Detected page refresh, continuing workflow...");
    sessionStorage.removeItem("ytstudio_polling");
    await continueWorkflowAfterRefresh();
  } else {
    // If workflow is not paused, execute it automatically after a short delay
    if (!isWorkflowPaused) {
      console.log("[YTStudio] Workflow not paused, executing automatically...");
      // Wait a bit for page to fully load
      await new Promise(resolve => setTimeout(resolve, 2000));
      await executeWorkflow();
    } else {
      console.log("[YTStudio] Fresh page load, workflow paused");
    }
  }
}

// Run initialization when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

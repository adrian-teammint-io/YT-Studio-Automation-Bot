/**
 * Content script for YouTube Studio Analytics automation
 * Automates:
 * 1. Check "Total" checkbox
 * 2. Check "YouTube advertising" checkbox
 * 3. Extract line graph data on hover (nearest midnight for specified date)
 */

import { STORAGE_KEYS } from "./constants/storage";

interface DataPoint {
  date: string;
  time: string;
  timestamp: number;
  totalViews: number;
  advertisingViews: number;
  xPosition: number;
  yPosition: number;
}

interface DailyStats {
  date: string;
  totalViews: number;
  advertisingViews: number;
  selectedTime: string;
}

let collectedData: DataPoint[] = [];
let isCollecting = false;
let chartSvg: SVGElement | null = null;
let targetDate: string = ""; // Format: "YYYY-MM-DD" or "Nov 11" (month day)

/**
 * Load target date from chrome storage (uses start date from DATE_RANGE)
 */
async function loadTargetDate(): Promise<string> {
  try {
    console.log("[YT Analytics] Loading target date from storage...");
    const result = await chrome.storage.local.get([STORAGE_KEYS.DATE_RANGE]);
    const dateRange = result[STORAGE_KEYS.DATE_RANGE];

    console.log("[YT Analytics] Loaded date range:", dateRange);

    if (dateRange && dateRange.startYear > 0 && dateRange.startMonth > 0 && dateRange.startDay > 0) {
      // Use start date from date range
      // Convert to "Nov 11" format for comparison
      const date = new Date(dateRange.startYear, dateRange.startMonth - 1, dateRange.startDay);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const formattedDate = `${monthNames[date.getMonth()]} ${date.getDate()}`;
      console.log("[YT Analytics] Formatted target date:", formattedDate);
      return formattedDate;
    }

    console.warn("[YT Analytics] No valid date range found in storage");
    return "";
  } catch (error) {
    console.error("[YT Analytics] Failed to load target date:", error);
    return "";
  }
}

/**
 * Show toast notification at bottom of page
 */
function showToast(message: string, type: "info" | "success" | "error" | "loading" = "info", duration: number = 3000): void {
  const toast = document.getElementById("ytstudio-analytics-toast");
  if (!toast) return;

  const icons = {
    info: "ℹ️",
    success: "✅",
    error: "❌",
    loading: "⏳"
  };

  toast.textContent = `${icons[type]} ${message}`;
  toast.className = `ytstudio-analytics-toast ytstudio-analytics-toast-${type}`;
  toast.style.display = "block";

  // Auto-hide after specified duration for success/error
  if (type === "success" || type === "error") {
    setTimeout(() => {
      toast.style.display = "none";
    }, duration);
  }
}

/**
 * Step 1: Check the "Total" checkbox
 */
async function checkTotalCheckbox(): Promise<boolean> {
  console.log("[YT Analytics] Step 1: Checking 'Total' checkbox...");
  showToast("총계 체크박스 선택 중...", "loading");

  try {
    // Find checkbox by aria-label attribute
    const checkboxElement = document.querySelector('ytcp-checkbox-lit[aria-label*="Total"]');

    if (checkboxElement) {
      const checkbox = checkboxElement.querySelector('#checkbox[role="checkbox"]') as HTMLElement;

      if (checkbox) {
        const ariaChecked = checkbox.getAttribute('aria-checked');

        if (ariaChecked !== 'true') {
          console.log("[YT Analytics] Found unchecked 'Total' checkbox, clicking...");
          checkbox.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          showToast("총계 체크박스 선택 완료", "success");
          return true;
        } else {
          console.log("[YT Analytics] 'Total' checkbox already checked");
          showToast("총계 체크박스 이미 선택됨", "info");
          return true;
        }
      }
    }

    console.warn("[YT Analytics] 'Total' checkbox not found");
    console.warn("[YT Analytics] Available checkboxes:", Array.from(document.querySelectorAll('ytcp-checkbox-lit')).map(el => el.getAttribute('aria-label')));
    showToast("총계 체크박스를 찾을 수 없습니다", "error");
    return false;
  } catch (error) {
    console.error("[YT Analytics] Error checking 'Total' checkbox:", error);
    showToast("총계 체크박스 선택 실패", "error");
    return false;
  }
}

/**
 * Step 2: Check the "YouTube advertising" checkbox
 */
async function checkAdvertisingCheckbox(): Promise<boolean> {
  console.log("[YT Analytics] Step 2: Checking 'YouTube advertising' checkbox...");
  showToast("YouTube 광고 체크박스 선택 중...", "loading");

  try {
    // Find checkbox by aria-label attribute
    const checkboxElement = document.querySelector('ytcp-checkbox-lit[aria-label*="YouTube advertising"]');

    if (checkboxElement) {
      const checkbox = checkboxElement.querySelector('#checkbox[role="checkbox"]') as HTMLElement;

      if (checkbox) {
        const ariaChecked = checkbox.getAttribute('aria-checked');

        if (ariaChecked !== 'true') {
          console.log("[YT Analytics] Found unchecked 'YouTube advertising' checkbox, clicking...");
          checkbox.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          showToast("YouTube 광고 체크박스 선택 완료", "success");
          return true;
        } else {
          console.log("[YT Analytics] 'YouTube advertising' checkbox already checked");
          showToast("YouTube 광고 체크박스 이미 선택됨", "info");
          return true;
        }
      }
    }

    console.warn("[YT Analytics] 'YouTube advertising' checkbox not found");
    console.warn("[YT Analytics] Available checkboxes:", Array.from(document.querySelectorAll('ytcp-checkbox-lit')).map(el => el.getAttribute('aria-label')));
    showToast("YouTube 광고 체크박스를 찾을 수 없습니다", "error");
    return false;
  } catch (error) {
    console.error("[YT Analytics] Error checking 'YouTube advertising' checkbox:", error);
    showToast("YouTube 광고 체크박스 선택 실패", "error");
    return false;
  }
}

/**
 * Step 3: Find the line chart SVG element
 */
function findChartSvg(): SVGElement | null {
  console.log("[YT Analytics] Step 3: Finding chart SVG element...");

  // Look for the SVG with the specific structure
  const svgs = document.querySelectorAll('svg.style-scope.yta-line-chart-base');

  for (const svg of svgs) {
    // Check if it has the expected structure (seriesGroups)
    const seriesGroups = svg.querySelector('.seriesGroups');
    if (seriesGroups) {
      console.log("[YT Analytics] Found chart SVG element");
      return svg as SVGElement;
    }
  }

  console.warn("[YT Analytics] Chart SVG not found");
  return null;
}

/**
 * Parse path data to extract coordinates
 * Path format: "M0,158L3,158L6,156L9,148..."
 */
function parsePathData(pathData: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  // Remove "M" at start and split by "L"
  const segments = pathData.substring(1).split('L');

  for (const segment of segments) {
    const [x, y] = segment.split(',').map(parseFloat);
    if (!isNaN(x) && !isNaN(y)) {
      points.push({ x, y });
    }
  }

  return points;
}

/**
 * Extract data from line chart by analyzing path elements
 */
function extractChartData(): DataPoint[] {
  if (!chartSvg) {
    console.warn("[YT Analytics] Chart SVG not available");
    return [];
  }

  const dataPoints: DataPoint[] = [];

  try {
    // Find both series (Total and Advertising)
    const seriesGroups = chartSvg.querySelectorAll('.seriesGroups > g');

    if (seriesGroups.length < 2) {
      console.warn("[YT Analytics] Expected 2 series groups, found:", seriesGroups.length);
      return [];
    }

    // First series is Advertising (ADVERTISING_main)
    const advertisingSeries = seriesGroups[0];
    const advertisingPath = advertisingSeries.querySelector('.line-series') as SVGPathElement;

    // Second series is Total (MAIN_METRIC_SERIES_NAME)
    const totalSeries = seriesGroups[1];
    const totalPath = totalSeries.querySelector('.line-series') as SVGPathElement;

    if (!advertisingPath || !totalPath) {
      console.warn("[YT Analytics] Could not find path elements");
      return [];
    }

    // Parse path data
    const advertisingPoints = parsePathData(advertisingPath.getAttribute('d') || '');
    const totalPoints = parsePathData(totalPath.getAttribute('d') || '');

    console.log("[YT Analytics] Parsed points:", {
      advertising: advertisingPoints.length,
      total: totalPoints.length
    });

    // Get X-axis labels to map coordinates to dates/times
    const xAxisTicks = chartSvg.querySelectorAll('.x.axis .tick');
    const timeLabels: { x: number; label: string }[] = [];

    xAxisTicks.forEach((tick) => {
      const transform = tick.getAttribute('transform');
      const label = tick.querySelector('.label tspan')?.textContent?.trim();

      if (transform && label) {
        const match = transform.match(/translate\(([\d.]+),/);
        if (match) {
          const x = parseFloat(match[1]);
          timeLabels.push({ x, label });
        }
      }
    });

    console.log("[YT Analytics] Time labels:", timeLabels);

    // Convert Y coordinates to actual values
    // Y-axis: 0 = 150K, 158 = 0
    const yMax = 150000; // 150.0K
    const yMin = 0;
    const chartHeight = 158;

    const yToValue = (y: number): number => {
      return Math.round(yMax - (y / chartHeight) * (yMax - yMin));
    };

    // Map data points (assume both arrays have same length)
    const minLength = Math.min(advertisingPoints.length, totalPoints.length);

    for (let i = 0; i < minLength; i++) {
      const advPoint = advertisingPoints[i];
      const totalPoint = totalPoints[i];

      // Estimate time based on x position
      // For now, we'll use a placeholder timestamp
      // In real implementation, we'd need to correlate with hover events

      dataPoints.push({
        date: '', // Will be filled when hovering
        time: '', // Will be filled when hovering
        timestamp: Date.now() + i * 1000, // Placeholder
        totalViews: yToValue(totalPoint.y),
        advertisingViews: yToValue(advPoint.y),
        xPosition: totalPoint.x,
        yPosition: totalPoint.y
      });
    }

    console.log("[YT Analytics] Extracted", dataPoints.length, "data points");
    return dataPoints;

  } catch (error) {
    console.error("[YT Analytics] Error extracting chart data:", error);
    return [];
  }
}

/**
 * Step 4: Simulate hover over chart to trigger data tooltips
 * and extract date/time information
 */
async function collectDataByHovering(): Promise<void> {
  console.log("[YT Analytics] Step 4: Collecting data by hovering...");
  showToast("차트 데이터 수집 중...", "loading");

  if (!chartSvg) {
    showToast("차트를 찾을 수 없습니다", "error");
    return;
  }

  isCollecting = true;
  collectedData = [];

  try {
    // Find the mouse capture pane for hover events
    const mousePane = chartSvg.querySelector('.mouseCapturePane') as SVGRectElement;

    if (!mousePane) {
      console.warn("[YT Analytics] Mouse capture pane not found");
      showToast("차트 인터랙션 영역을 찾을 수 없습니다", "error");
      return;
    }

    // Get chart dimensions
    const chartWidth = parseFloat(mousePane.getAttribute('width') || '978');
    const chartHeight = parseFloat(mousePane.getAttribute('height') || '158');
    const rect = mousePane.getBoundingClientRect();

    console.log("[YT Analytics] Chart dimensions:", { chartWidth, chartHeight });
    console.log("[YT Analytics] Chart position:", rect);

    // Hover at regular intervals across the chart
    const numPoints = 100; // Sample 100 points across the chart
    const step = chartWidth / numPoints;

    for (let i = 0; i < numPoints; i++) {
      const x = i * step;
      const y = chartHeight / 2; // Hover at middle height

      // Create and dispatch mouse events
      const clientX = rect.left + x;
      const clientY = rect.top + y;

      const mouseEnterEvent = new MouseEvent('mouseenter', {
        bubbles: true,
        clientX,
        clientY
      });

      const mouseMoveEvent = new MouseEvent('mousemove', {
        bubbles: true,
        clientX,
        clientY
      });

      mousePane.dispatchEvent(mouseEnterEvent);
      mousePane.dispatchEvent(mouseMoveEvent);

      // Wait for tooltip to appear
      await new Promise(resolve => setTimeout(resolve, 50));

      // Extract tooltip data
      await extractTooltipData(x);
    }

    // Dispatch mouse leave event
    const mouseLeaveEvent = new MouseEvent('mouseleave', {
      bubbles: true
    });
    mousePane.dispatchEvent(mouseLeaveEvent);

    console.log("[YT Analytics] Collected", collectedData.length, "data points");
    showToast(`${collectedData.length}개 데이터 포인트 수집 완료`, "success");

    // Process collected data to select nearest midnight per day
    const dailyStats = processDailyStats(collectedData);
    console.log("[YT Analytics] Daily stats:", dailyStats);

    // Copy to clipboard
    await copyToClipboard(dailyStats);

  } catch (error) {
    console.error("[YT Analytics] Error collecting data:", error);
    showToast("데이터 수집 실패", "error");
  } finally {
    isCollecting = false;
  }
}

/**
 * Extract tooltip data when hovering
 */
async function extractTooltipData(xPosition: number): Promise<void> {
  // Look for tooltip/hover elements
  // This is a placeholder - actual implementation depends on YouTube's tooltip structure
  const tooltip = document.querySelector('.yta-hover-card, .tooltip, [role="tooltip"]');

  if (tooltip) {
    // Extract date, time, and values from tooltip
    const text = tooltip.textContent || '';

    // Parse tooltip text (format may vary)
    // Example: "Nov 5, 12:10 AM\nTotal: 142K\nAdvertising: 138K"
    const lines = text.split('\n').map(l => l.trim());

    if (lines.length >= 3) {
      const dateTime = lines[0]; // "Nov 5, 12:10 AM"
      const date = dateTime.split(',')[0].trim(); // "Nov 5"

      // Filter: only collect data for the target date
      if (targetDate && date !== targetDate) {
        return; // Skip this data point if it's not the target date
      }

      const totalMatch = lines[1].match(/[\d,.]+K?/);
      const advertisingMatch = lines[2].match(/[\d,.]+K?/);

      if (dateTime && totalMatch && advertisingMatch) {
        // Parse values (K = 1000)
        const parseValue = (str: string): number => {
          const value = parseFloat(str.replace(/,/g, ''));
          return str.includes('K') ? value * 1000 : value;
        };

        collectedData.push({
          date: date,
          time: dateTime.split(',')[1]?.trim() || '', // "12:10 AM"
          timestamp: parseDateTime(dateTime),
          totalViews: parseValue(totalMatch[0]),
          advertisingViews: parseValue(advertisingMatch[0]),
          xPosition,
          yPosition: 0 // Not used in this approach
        });
      }
    }
  }
}

/**
 * Parse date/time string to timestamp
 */
function parseDateTime(dateTimeStr: string): number {
  try {
    // Example: "Nov 5, 12:10 AM"
    const year = new Date().getFullYear();
    const fullDateStr = `${dateTimeStr} ${year}`;
    return new Date(fullDateStr).getTime();
  } catch (error) {
    return Date.now();
  }
}

/**
 * Process collected data to select nearest midnight point for target date
 */
function processDailyStats(data: DataPoint[]): DailyStats[] {
  if (data.length === 0) {
    console.warn("[YT Analytics] No data collected for target date:", targetDate);
    return [];
  }

  // All collected data should be for the target date (due to filtering in extractTooltipData)
  // Find the point closest to midnight (12:00 AM)
  let closestPoint = data[0];
  let minTimeDiff = Infinity;

  for (const point of data) {
    // Calculate time difference from midnight (00:00)
    const time = point.time.toLowerCase();
    const hourMatch = time.match(/(\d+):(\d+)\s*(am|pm)/i);

    if (hourMatch) {
      let hour = parseInt(hourMatch[1]);
      const minute = parseInt(hourMatch[2]);
      const period = hourMatch[3].toLowerCase();

      // Convert to 24-hour format
      if (period === 'am' && hour === 12) hour = 0;
      if (period === 'pm' && hour !== 12) hour += 12;

      // Calculate minutes from midnight
      const minutesFromMidnight = hour * 60 + minute;

      if (minutesFromMidnight < minTimeDiff) {
        minTimeDiff = minutesFromMidnight;
        closestPoint = point;
      }
    }
  }

  const dailyStats: DailyStats[] = [{
    date: closestPoint.date,
    totalViews: closestPoint.totalViews,
    advertisingViews: closestPoint.advertisingViews,
    selectedTime: closestPoint.time
  }];

  console.log("[YT Analytics] Selected nearest midnight time:", closestPoint.time, "for date:", targetDate);
  return dailyStats;
}

/**
 * Copy data to clipboard
 */
async function copyToClipboard(dailyStats: DailyStats[]): Promise<void> {
  try {
    // Format as TSV
    const header = "Date\tSelected Time\tTotal Views\tAdvertising Views";
    const rows = dailyStats.map(stat =>
      `${stat.date}\t${stat.selectedTime}\t${stat.totalViews}\t${stat.advertisingViews}`
    );
    const tsv = [header, ...rows].join('\n');

    // Copy to clipboard
    await navigator.clipboard.writeText(tsv);

    console.log("[YT Analytics] Data copied to clipboard");
    showToast("데이터가 클립보드에 복사되었습니다", "success", 5000);

    // Also log to console for easy access
    console.log("[YT Analytics] Daily Stats:");
    console.table(dailyStats);
  } catch (error) {
    console.error("[YT Analytics] Failed to copy to clipboard:", error);
    showToast("클립보드 복사 실패", "error");
  }
}

/**
 * Main workflow execution
 */
async function executeWorkflow(): Promise<void> {
  console.log("[YT Analytics] ========================================");
  console.log("[YT Analytics] Starting YT Studio Analytics automation");
  console.log("[YT Analytics] ========================================");

  try {
    // Step 0: Load target date from storage
    targetDate = await loadTargetDate();

    if (!targetDate) {
      showToast("대상 날짜를 먼저 설정하세요 (팝업에서 설정)", "error", 5000);
      throw new Error("Target date not configured. Please set it in the popup first.");
    }

    console.log("[YT Analytics] Target date:", targetDate);
    showToast(`대상 날짜: ${targetDate}`, "info", 3000);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 1: Check "Total" checkbox
    await checkTotalCheckbox();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Check "YouTube advertising" checkbox
    await checkAdvertisingCheckbox();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 3: Find chart
    chartSvg = findChartSvg();

    if (!chartSvg) {
      throw new Error("Chart not found");
    }

    // Step 4: Collect data by hovering
    await collectDataByHovering();

    console.log("[YT Analytics] ========================================");
    console.log("[YT Analytics] Workflow completed successfully!");
    console.log("[YT Analytics] ========================================");

  } catch (error) {
    console.error("[YT Analytics] Workflow failed:", error);
    showToast(`오류: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
  }
}

/**
 * Inject UI elements
 */
async function injectUI(): Promise<void> {
  // Inject toast
  if (!document.getElementById("ytstudio-analytics-toast")) {
    const toast = document.createElement("div");
    toast.id = "ytstudio-analytics-toast";
    toast.className = "ytstudio-analytics-toast";
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

  // Inject date status indicator
  if (!document.getElementById("ytstudio-analytics-date-status")) {
    const dateStatus = document.createElement("div");
    dateStatus.id = "ytstudio-analytics-date-status";
    dateStatus.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 32px;
      z-index: 10000;
      background: #f3f4f6;
      border: 2px solid black;
      box-shadow: 0.2rem 0.2rem 0 0 black;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-width: 160px;
      text-align: center;
    `;

    // Load and display configured date
    const loadedDate = await loadTargetDate();
    if (loadedDate) {
      dateStatus.textContent = `📅 Target: ${loadedDate}`;
      dateStatus.style.background = '#d1fae5';
      dateStatus.style.color = '#065f46';
    } else {
      dateStatus.textContent = `⚠️ No date configured`;
      dateStatus.style.background = '#fee2e2';
      dateStatus.style.color = '#991b1b';
    }

    document.body.appendChild(dateStatus);
  }

  // Inject start button
  if (!document.getElementById("ytstudio-analytics-start-btn")) {
    const startBtn = document.createElement("button");
    startBtn.id = "ytstudio-analytics-start-btn";
    startBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      <span>데이터 수집 시작</span>
    `;
    startBtn.style.cssText = `
      position: fixed;
      bottom: 32px;
      right: 32px;
      width: 160px;
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

    startBtn.onclick = () => {
      startBtn.disabled = true;
      startBtn.style.opacity = '0.5';
      startBtn.style.cursor = 'not-allowed';
      executeWorkflow().finally(() => {
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
      });
    };

    document.body.appendChild(startBtn);
  }
}

/**
 * Initialize content script
 */
async function initialize(): Promise<void> {
  // Check if we're on the YouTube Studio analytics page
  if (!window.location.href.includes("studio.youtube.com/video") ||
      !window.location.href.includes("analytics")) {
    console.log("[YT Analytics] Not on YouTube Studio analytics page");
    return;
  }

  console.log("[YT Analytics] Initializing on YouTube Studio analytics page");

  // Wait for page to fully load
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Inject UI (now async to load date)
  await injectUI();

  console.log("[YT Analytics] Ready! Click 'Start Data Collection' button to begin.");

  // Show initial date status
  const currentTargetDate = await loadTargetDate();
  if (currentTargetDate) {
    console.log("[YT Analytics] ✓ Target date configured:", currentTargetDate);
  } else {
    console.warn("[YT Analytics] ⚠️  No target date configured. Please set it in the extension popup.");
  }
}

// Run initialization when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

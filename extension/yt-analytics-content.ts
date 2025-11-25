/**
 * Content script for YouTube Studio Analytics automation
 * Automates:
 * 1. Check "Total" checkbox
 * 2. Check "YouTube advertising" checkbox
 * 3. Extract line graph data on hover (nearest midnight for specified date)
 */

import { STORAGE_KEYS } from "./constants/storage";

interface TrafficSource {
  title: string;
  value: number;
}

interface DataPoint {
  date: string;
  time: string;
  timestamp: number;
  totalViews: number;
  advertisingViews: number;
  engagedViews?: number; // Optional: collected in second pass
  trafficSources: TrafficSource[]; // All traffic source stats from tooltip
  xPosition: number;
  yPosition: number;
}

interface DailyStats {
  date: string;
  totalViews: number;
  advertisingViews: number;
  engagedViews?: number; // Optional: collected in second pass
  trafficSources: TrafficSource[]; // All traffic source stats
  selectedTime: string;
}

let collectedData: DataPoint[] = [];
let collectedDataSet = new Set<string>(); // Track unique data points by "date:time" key
let engagedViewsData: DataPoint[] = []; // Second pass: engaged views data
let engagedViewsDataSet = new Set<string>(); // Track unique engaged views data points
let isCollecting = false;
let chartSvg: SVGElement | null = null;
let targetDates: string[] = []; // Format: array of "Nov 11" (month day)

/**
 * Convert date string like "Nov 8" back to previous day "Nov 7"
 * This is used to store the original requested date when extracting from next day's 12:10 AM
 */
function convertToOriginalDate(dateStr: string): string {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = dateStr.match(/([A-Z][a-z]{2})\s+(\d{1,2})/);
  if (!parts) return dateStr;

  const monthName = parts[1];
  const day = parseInt(parts[2]);
  const monthIndex = monthNames.indexOf(monthName);

  if (monthIndex === -1) return dateStr;

  const year = new Date().getFullYear();
  const date = new Date(year, monthIndex, day);
  date.setDate(date.getDate() - 1); // Subtract 1 day

  return `${monthNames[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Load target dates from chrome storage (uses DATE_RANGE from popup)
 * Returns array of dates (next day after each configured date) for stats collection
 *
 * INTERNAL LOGIC (not shown to users):
 * - If user configures "Nov 10 - Nov 13", this returns ["Nov 11", "Nov 12", "Nov 14"]
 * - Stats are collected at time closest to 12:10 AM on each next day
 * - This is because YouTube shows stats at the start of the next day
 *
 * e.g., user sets "Nov 10 - Nov 12" → function returns ["Nov 11", "Nov 12", "Nov 13"]
 */
async function loadTargetDates(): Promise<string[]> {
  try {
    // console.log("[YT Analytics] Loading target dates from storage...");
    const result = await chrome.storage.local.get([STORAGE_KEYS.DATE_RANGE]);
    const dateRange = result[STORAGE_KEYS.DATE_RANGE];

    // console.log("[YT Analytics] Loaded date range:", dateRange);

    if (dateRange && dateRange.startYear > 0 && dateRange.startMonth > 0 && dateRange.startDay > 0) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const dates: string[] = [];

      // Create start date
      const startDate = new Date(dateRange.startYear, dateRange.startMonth - 1, dateRange.startDay);

      // Create end date (if not specified, use start date)
      let endDate: Date;
      if (dateRange.endYear > 0 && dateRange.endMonth > 0 && dateRange.endDay > 0) {
        endDate = new Date(dateRange.endYear, dateRange.endMonth - 1, dateRange.endDay);
      } else {
        endDate = new Date(startDate);
      }

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        // console.error("[YT Analytics] Invalid date range:", dateRange);
        return [];
      }

      // Generate all dates in range (inclusive), adding 1 day to each
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        // Add 1 day to get the next day's stats (at ~12:10 AM)
        const nextDay = new Date(currentDate);
        nextDay.setDate(nextDay.getDate() + 1);

        const formattedDate = `${monthNames[nextDay.getMonth()]} ${nextDay.getDate()}`;
        dates.push(formattedDate);

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // console.log("[YT Analytics] User configured date range:",
      //   `${monthNames[startDate.getMonth()]} ${startDate.getDate()} - ${monthNames[endDate.getMonth()]} ${endDate.getDate()}`);
      // console.log("[YT Analytics] Target dates for stats (next days at ~12:10 AM):", dates);
      return dates;
    }

    // console.warn("[YT Analytics] No valid date range found in storage");
    return [];
  } catch (error) {
    // console.error("[YT Analytics] Failed to load target dates:", error);
    return [];
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
  toast.style.color = "black"; // Ensure text color is always black

  // Auto-hide after specified duration for success/error
  if (type === "success" || type === "error") {
    setTimeout(() => {
      toast.style.display = "none";
    }, duration);
  }
}

/**
 * Generic helper function to check a checkbox by selector
 */
async function checkCheckbox(
  selector: string,
  toastMessages: {
    loading: string;
    success: string;
    info: string;
    error: string;
    notFound: string;
  },
  checkboxName: string
): Promise<boolean> {
  showToast(toastMessages.loading, "loading");

  try {
    const checkboxElement = document.querySelector(selector);

    if (checkboxElement) {
      const checkbox = checkboxElement.querySelector('#checkbox[role="checkbox"]') as HTMLElement;

      if (checkbox) {
        const ariaChecked = checkbox.getAttribute('aria-checked');

        if (ariaChecked !== 'true') {
          // console.log(`[YT Analytics] Found unchecked '${checkboxName}' checkbox, clicking...`);
          checkbox.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          showToast(toastMessages.success, "success");
          return true;
        } else {
          // console.log(`[YT Analytics] '${checkboxName}' checkbox already checked`);
          showToast(toastMessages.info, "info");
          return true;
        }
      }
    }

    // console.warn(`[YT Analytics] '${checkboxName}' checkbox not found`);
    // console.warn("[YT Analytics] Available checkboxes:", Array.from(document.querySelectorAll('ytcp-checkbox-lit')).map(el => el.getAttribute('aria-label')));
    showToast(toastMessages.notFound, "error");
    return false;
  } catch (error) {
    // console.error(`[YT Analytics] Error checking '${checkboxName}' checkbox:`, error);
    showToast(toastMessages.error, "error");
    return false;
  }
}

/**
 * Step 1: Check the "Total" checkbox
 */
async function checkTotalCheckbox(): Promise<boolean> {
  return checkCheckbox(
    'ytcp-checkbox-lit[aria-label*="Total"]',
    {
      loading: "총계 체크박스 선택 중...",
      success: "총계 체크박스 선택 완료",
      info: "총계 체크박스 이미 선택됨",
      error: "총계 체크박스 선택 실패",
      notFound: "총계 체크박스를 찾을 수 없습니다"
    },
    "Total"
  );
}

/**
 * Step 2: Check the "YouTube advertising" checkbox
 */
async function checkAdvertisingCheckbox(): Promise<boolean> {
  return checkCheckbox(
    'ytcp-checkbox-lit[aria-label*="YouTube advertising"]',
    {
      loading: "YouTube 광고 체크박스 선택 중...",
      success: "YouTube 광고 체크박스 선택 완료",
      info: "YouTube 광고 체크박스 이미 선택됨",
      error: "YouTube 광고 체크박스 선택 실패",
      notFound: "YouTube 광고 체크박스를 찾을 수 없습니다"
    },
    "YouTube advertising"
  );
}

/**
 * Step 3: Find the line chart SVG element
 */
function findChartSvg(): SVGElement | null {
  // console.log("[YT Analytics] Step 3: Finding chart SVG element...");

  // Look for the SVG with the specific structure
  const svgs = document.querySelectorAll('svg.style-scope.yta-line-chart-base');

  for (const svg of svgs) {
    // Check if it has the expected structure (seriesGroups)
    const seriesGroups = svg.querySelector('.seriesGroups');
    if (seriesGroups) {
      // console.log("[YT Analytics] Found chart SVG element");
      return svg as SVGElement;
    }
  }

  // console.warn("[YT Analytics] Chart SVG not found");
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
    // console.warn("[YT Analytics] Chart SVG not available");
    return [];
  }

  const dataPoints: DataPoint[] = [];

  try {
    // Find both series (Total and Advertising)
    const seriesGroups = chartSvg.querySelectorAll('.seriesGroups > g');

    if (seriesGroups.length < 2) {
      // console.warn("[YT Analytics] Expected 2 series groups, found:", seriesGroups.length);
      return [];
    }

    // First series is Advertising (ADVERTISING_main)
    const advertisingSeries = seriesGroups[0];
    const advertisingPath = advertisingSeries.querySelector('.line-series') as SVGPathElement;

    // Second series is Total (MAIN_METRIC_SERIES_NAME)
    const totalSeries = seriesGroups[1];
    const totalPath = totalSeries.querySelector('.line-series') as SVGPathElement;

    if (!advertisingPath || !totalPath) {
      // console.warn("[YT Analytics] Could not find path elements");
      return [];
    }

    // Parse path data
    const advertisingPoints = parsePathData(advertisingPath.getAttribute('d') || '');
    const totalPoints = parsePathData(totalPath.getAttribute('d') || '');

    // console.log("[YT Analytics] Parsed points:", {
    //   advertising: advertisingPoints.length,
    //   total: totalPoints.length
    // });

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

    // console.log("[YT Analytics] Time labels:", timeLabels);

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
        trafficSources: [], // Will be filled when hovering
        xPosition: totalPoint.x,
        yPosition: totalPoint.y
      });
    }

    // console.log("[YT Analytics] Extracted", dataPoints.length, "data points");
    return dataPoints;

  } catch (error) {
    // console.error("[YT Analytics] Error extracting chart data:", error);
    return [];
  }
}

/**
 * Step 4: Simulate hover over chart to trigger data tooltips
 * and extract date/time information
 */
async function collectDataByHovering(): Promise<void> {
  // console.log("[YT Analytics] Step 4: Collecting data by hovering...");
  showToast("차트 데이터 수집 중...", "loading");

  if (!chartSvg) {
    showToast("차트를 찾을 수 없습니다", "error");
    return;
  }

  isCollecting = true;
  collectedData = [];
  collectedDataSet.clear(); // Clear the Set to start fresh

  try {
    // Find the mouse capture pane for hover events
    const mousePane = chartSvg.querySelector('.mouseCapturePane') as SVGRectElement;

    if (!mousePane) {
      // console.warn("[YT Analytics] Mouse capture pane not found");
      showToast("차트 인터랙션 영역을 찾을 수 없습니다", "error");
      return;
    }

    // Get chart dimensions
    const chartWidth = parseFloat(mousePane.getAttribute('width') || '978');
    const chartHeight = parseFloat(mousePane.getAttribute('height') || '158');
    const rect = mousePane.getBoundingClientRect();

    // console.log("[YT Analytics] Chart dimensions:", { chartWidth, chartHeight });
    // console.log("[YT Analytics] Chart position:", rect);

    // Scan the line graph once with consistent 100ms delay per point
    const numScans = 1;
    const numPoints = 200; // Increased from 100 to 200 for better coverage of 12:10 AM points
    const step = chartWidth / numPoints;

    // console.log(`[YT Analytics] Starting ${numScans} scans of the line graph...`);

    for (let scan = 0; scan < numScans; scan++) {
      // console.log(`[YT Analytics] ============================================`);
      // console.log(`[YT Analytics] Scan ${scan + 1}/${numScans} starting...`);
      showToast(`차트 스캔 중... (${scan + 1}/${numScans})`, "loading");

      // Hover at regular intervals across the chart
      for (let i = 0; i < numPoints; i++) {
        const x = i * step;
        const y = chartHeight / 2; // Hover at middle height

        // Add slight randomization to x position to capture slightly different points
        const xOffset = (Math.random() - 0.5) * (step * 0.1); // ±5% of step size
        const adjustedX = Math.max(0, Math.min(chartWidth, x + xOffset));

        // Create and dispatch mouse events
        const clientX = rect.left + adjustedX;
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

        // Wait for tooltip with consistent 50ms delay per point (faster scanning)
        await new Promise(resolve => setTimeout(resolve, 50));

        // Check if tooltip is visible
        const visibleTooltip = findVisibleHovercard();
        if (visibleTooltip) {
          // Extract tooltip data
          await extractTooltipData(adjustedX);
        } else {
          // Only log every 10th failure to reduce console noise
          // if (i % 10 === 0) {
          //   console.log(`[YT Analytics] ⚠️ Scan ${scan + 1}: No visible tooltip at x=${adjustedX} after retries`);
          // }
        }
      }

      // Dispatch mouse leave event after each scan
      const mouseLeaveEvent = new MouseEvent('mouseleave', {
        bubbles: true
      });
      mousePane.dispatchEvent(mouseLeaveEvent);

      // console.log(`[YT Analytics] Scan ${scan + 1}/${numScans} complete. Total data points collected: ${collectedData.length}`);

      // Delay between scans to allow UI to settle
      if (scan < numScans - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // console.log("[YT Analytics] ============================================");
    // console.log(`[YT Analytics] All ${numScans} scans complete`);
    // console.log(`[YT Analytics] Total data points collected: ${collectedData.length}`);
    // console.log("[YT Analytics] ============================================");

    // Auto-scan: Check for missing dates and perform additional scans if needed
    const maxAutoScanAttempts = 5; // Increased from 3 to 5
    let autoScanAttempt = 0;
    let missingDates: string[] = [];

    // console.log("[YT Analytics] ============================================");
    // console.log("[YT Analytics] Starting auto-scan for missing dates...");
    // console.log("[YT Analytics] Target dates:", targetDates);
    // console.log("[YT Analytics] ============================================");

    while (autoScanAttempt < maxAutoScanAttempts) {
      // Group collected data by date
      const dataByDate = new Map<string, DataPoint[]>();
      for (const point of collectedData) {
        if (point.date && !dataByDate.has(point.date)) {
          dataByDate.set(point.date, []);
        }
        if (point.date) {
          dataByDate.get(point.date)!.push(point);
        }
      }

      // Log what dates we have found
      const foundDates = Array.from(dataByDate.keys());
      // console.log(`[YT Analytics] Found dates: [${foundDates.join(', ')}]`);
      // console.log(`[YT Analytics] Expected dates: [${targetDates.join(', ')}]`);

      // Check which target dates are completely missing
      missingDates = targetDates.filter(date => {
        const hasDate = dataByDate.has(date);
        const hasData = hasDate && dataByDate.get(date)!.length > 0;
        // if (!hasData) {
        //   console.log(`[YT Analytics] ❌ Missing date: ${date} (hasDate: ${hasDate}, hasData: ${hasData})`);
        // }
        return !hasData;
      });

      if (missingDates.length === 0) {
        // console.log("[YT Analytics] ✅ All target dates found!");
        break;
      }

      autoScanAttempt++;
      // console.log(`[YT Analytics] ⚠️ Missing ${missingDates.length} date(s): ${missingDates.join(', ')}`);
      // console.log(`[YT Analytics] Auto-scan attempt ${autoScanAttempt}/${maxAutoScanAttempts}...`);
      showToast(`누락된 날짜 검색 중... (${autoScanAttempt}/${maxAutoScanAttempts})`, "loading");

      // Perform additional scan with higher density, focusing on finding missing dates
      // Increase density even more for missing dates
      const fineGrainedPoints = 400; // Increased from 300 to 400 for better coverage
      const fineStep = chartWidth / fineGrainedPoints;

      // console.log(`[YT Analytics] Scanning ${fineGrainedPoints} points to find missing dates: ${missingDates.join(', ')}`);

      for (let i = 0; i < fineGrainedPoints; i++) {
        const x = i * fineStep;
        const y = chartHeight / 2;

        // Add slight randomization to capture slightly different points
        const xOffset = (Math.random() - 0.5) * (fineStep * 0.15); // Increased randomization
        const adjustedX = Math.max(0, Math.min(chartWidth, x + xOffset));

        const clientX = rect.left + adjustedX;
        const clientY = rect.top + y;

        const mouseMoveEvent = new MouseEvent('mousemove', {
          bubbles: true,
          clientX,
          clientY
        });

        mousePane.dispatchEvent(mouseMoveEvent);

        // Wait for tooltip with consistent 50ms delay per point (faster scanning)
        await new Promise(resolve => setTimeout(resolve, 50));

        const visibleTooltip = findVisibleHovercard();
        if (visibleTooltip) {
          const beforeCount = collectedData.length;
          await extractTooltipData(adjustedX);
          const afterCount = collectedData.length;

          // Log if we collected new data
          // if (afterCount > beforeCount) {
          //   const newPoint = collectedData[collectedData.length - 1];
          //   if (missingDates.includes(newPoint.date)) {
          //     console.log(`[YT Analytics] ✅ Found data for missing date: ${newPoint.date} at ${newPoint.time}`);
          //   }
          // }

          // Check if we've found all missing dates (check every 50 points to avoid overhead)
          if (i % 50 === 0) {
            const currentDataByDate = new Map<string, DataPoint[]>();
            for (const point of collectedData) {
              if (point.date && !currentDataByDate.has(point.date)) {
                currentDataByDate.set(point.date, []);
              }
              if (point.date) {
                currentDataByDate.get(point.date)!.push(point);
              }
            }

            const stillMissing = targetDates.filter(date => !currentDataByDate.has(date) || currentDataByDate.get(date)!.length === 0);

            if (stillMissing.length === 0) {
              // console.log("[YT Analytics] ✅ Found all missing dates, stopping auto-scan early");
              break;
            } else if (stillMissing.length < missingDates.length) {
              // console.log(`[YT Analytics] Progress: Found ${missingDates.length - stillMissing.length} of ${missingDates.length} missing dates. Still missing: ${stillMissing.join(', ')}`);
              missingDates = stillMissing; // Update missing dates list
            }
          }
        }
      }

      // console.log(`[YT Analytics] Auto-scan attempt ${autoScanAttempt} complete. Total data points: ${collectedData.length}`);

      // Delay before next auto-scan attempt to allow UI to settle
      if (autoScanAttempt < maxAutoScanAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Final check after auto-scans
    const finalDataByDate = new Map<string, DataPoint[]>();
    for (const point of collectedData) {
      if (point.date && !finalDataByDate.has(point.date)) {
        finalDataByDate.set(point.date, []);
      }
      if (point.date) {
        finalDataByDate.get(point.date)!.push(point);
      }
    }

    const finalMissingDates = targetDates.filter(date => !finalDataByDate.has(date) || finalDataByDate.get(date)!.length === 0);
    const finalFoundDates = Array.from(finalDataByDate.keys());

    // console.log("[YT Analytics] ============================================");
    // console.log(`[YT Analytics] Final data collection summary:`);
    // console.log(`[YT Analytics] Expected dates (${targetDates.length}): [${targetDates.join(', ')}]`);
    // console.log(`[YT Analytics] Found dates (${finalFoundDates.length}): [${finalFoundDates.join(', ')}]`);

    if (finalMissingDates.length > 0) {
      // console.error(`[YT Analytics] ❌ WARNING: Still missing ${finalMissingDates.length} date(s) after ${autoScanAttempt} auto-scan attempts: [${finalMissingDates.join(', ')}]`);
      // console.error(`[YT Analytics] Missing dates detail:`, finalMissingDates.map(date => {
      //   const hasDate = finalDataByDate.has(date);
      //   const dataCount = hasDate ? finalDataByDate.get(date)!.length : 0;
      //   return `${date} (hasDate: ${hasDate}, dataPoints: ${dataCount})`;
      // }));
      showToast(`경고: ${finalMissingDates.length}개 날짜 누락됨 (${finalMissingDates.join(', ')})`, "error", 5000);
    } else {
      // console.log("[YT Analytics] ✅ All target dates found after auto-scans!");
      showToast("모든 날짜 데이터 수집 완료", "success", 3000);
    }

    // console.log(`[YT Analytics] Total data points collected: ${collectedData.length}`);
    // console.log("[YT Analytics] ============================================");

    // Targeted collection: Specifically search for 12:10 AM data points
    // Use finalDataByDate that we already created
    const dataByDate = finalDataByDate;

    // Check which dates are missing 12:10 AM and do targeted search
    const datesMissing1210AM: string[] = [];
    for (const [date, points] of dataByDate.entries()) {
      let has1210AM = false;
      for (const point of points) {
        const minutes = timeToMinutes(point.time);
        if (minutes >= 9 && minutes <= 11) {
          has1210AM = true;
          break;
        }
      }
      if (!has1210AM && date) {
        datesMissing1210AM.push(date);
      }
    }

    // If dates are missing 12:10 AM, do a targeted fine-grained search across the entire chart
    // with higher density to ensure we capture 12:10 AM for all dates
    if (datesMissing1210AM.length > 0) {
      // console.log(`[YT Analytics] ⚠️ Missing 12:10 AM data for dates: ${datesMissing1210AM.join(', ')}`);
      // console.log("[YT Analytics] Performing targeted 12:10 AM search with increased density...");
      showToast("12:10 AM 데이터 재검색 중...", "loading");

      // Do fine-grained hover across the entire chart with higher density
      // Use 200 points instead of 100 for better coverage
      const fineGrainedPoints = 200;
      const fineStep = chartWidth / fineGrainedPoints;

      for (let i = 0; i < fineGrainedPoints; i++) {
        const x = i * fineStep;
        const y = chartHeight / 2;

        const clientX = rect.left + x;
        const clientY = rect.top + y;

        const mouseMoveEvent = new MouseEvent('mousemove', {
          bubbles: true,
          clientX,
          clientY
        });

        mousePane.dispatchEvent(mouseMoveEvent);

        // Wait for tooltip with consistent 50ms delay per point (faster scanning)
        await new Promise(resolve => setTimeout(resolve, 50));

        const visibleTooltip = findVisibleHovercard();
        if (visibleTooltip) {
          await extractTooltipData(x);

          // Check if we've found 12:10 AM for all missing dates
          const currentDataByDate = new Map<string, DataPoint[]>();
          for (const point of collectedData) {
            if (!currentDataByDate.has(point.date)) {
              currentDataByDate.set(point.date, []);
            }
            currentDataByDate.get(point.date)!.push(point);
          }

          let allFound = true;
          for (const date of datesMissing1210AM) {
            const points = currentDataByDate.get(date) || [];
            let has1210AM = false;
            for (const point of points) {
              const minutes = timeToMinutes(point.time);
              if (minutes >= 9 && minutes <= 11) {
                has1210AM = true;
                break;
              }
            }
            if (!has1210AM) {
              allFound = false;
              break;
            }
          }

          // If we found 12:10 AM for all missing dates, we can stop early
          if (allFound) {
            // console.log("[YT Analytics] ✅ Found 12:10 AM for all missing dates, stopping targeted search early");
            break;
          }
        }
      }

      // console.log(`[YT Analytics] Targeted search complete. Total data points now: ${collectedData.length}`);
    }

    // console.log("[YT Analytics] ============================================");
    // console.log("[YT Analytics] Final collection complete");
    // console.log("[YT Analytics] Total data points collected:", collectedData.length);
    // console.log("[YT Analytics] Configured date filter:", targetDates);
    // console.log("[YT Analytics] All collected tooltip data:");
    // console.table(collectedData);
    // console.log("[YT Analytics] ============================================");

    console.log(`[YT Analytics] Collected ${collectedData.length} data points for dates: ${targetDates.join(', ')}`);
    console.table(collectedData);

    showToast(`${collectedData.length}개 데이터 포인트 수집 완료`, "success");

    // Process collected data to select 12:10 AM for each date
    const dailyStats = processDailyStats(collectedData);
    // console.log("[YT Analytics] Processed daily stats (nearest midnight):");
    // console.table(dailyStats);

    // Store extracted data in array format
    // Convert tooltip date (e.g., "Nov 8") back to original requested date (e.g., "Nov 7")
    // processDailyStats already selected the closest point to 12:10 AM for each date
    const result = await chrome.storage.local.get([STORAGE_KEYS.EXTRACTED_DATA]);
    const extractedData: Array<{
      date: string;
      normal_total_views: number;
      normal_ads_views: number;
      ads_true_views?: number;
    }> = result[STORAGE_KEYS.EXTRACTED_DATA] || [];

    for (const stat of dailyStats) {
      // Convert tooltip date (e.g., "Nov 8") back to original requested date (e.g., "Nov 7")
      const originalDate = convertToOriginalDate(stat.date);

      const extractedEntry = {
        date: originalDate, // Store as original requested date (e.g., "Nov 7")
        normal_total_views: stat.totalViews,
        normal_ads_views: stat.advertisingViews,
        // ads_true_views will be added later
      };

      // Check if entry for this original date already exists
      const existingIndex = extractedData.findIndex(entry => entry.date === originalDate);
      if (existingIndex >= 0) {
        // Update existing entry
        extractedData[existingIndex] = extractedEntry;
      } else {
        // Add new entry
        extractedData.push(extractedEntry);
      }

      // console.log(`[YT Analytics] Stored extracted data for original date ${originalDate} (extracted from ${stat.date} at ${stat.selectedTime}):`, extractedEntry);
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTRACTED_DATA]: extractedData
    });

  } catch (error) {
    // console.error("[YT Analytics] Error collecting data:", error);
    showToast("데이터 수집 실패", "error");
  } finally {
    isCollecting = false;
  }
}

/**
 * Step 9: Collect engaged views data by hovering (second pass)
 * Similar to collectDataByHovering but stores in engagedViewsData
 */
async function collectEngagedViewsData(): Promise<void> {
  showToast("Engaged views 데이터 수집 중...", "loading");

  if (!chartSvg) {
    showToast("차트를 찾을 수 없습니다", "error");
    return;
  }

  isCollecting = true;
  engagedViewsData = [];
  engagedViewsDataSet.clear();

  try {
    const mousePane = chartSvg.querySelector('.mouseCapturePane') as SVGRectElement;

    if (!mousePane) {
      showToast("차트 인터랙션 영역을 찾을 수 없습니다", "error");
      return;
    }

    const chartWidth = parseFloat(mousePane.getAttribute('width') || '978');
    const chartHeight = parseFloat(mousePane.getAttribute('height') || '158');
    const rect = mousePane.getBoundingClientRect();

    const numPoints = 200;
    const step = chartWidth / numPoints;

    showToast("Engaged views 스캔 중...", "loading");

    for (let i = 0; i < numPoints; i++) {
      const x = i * step;
      const y = chartHeight / 2;

      const xOffset = (Math.random() - 0.5) * (step * 0.1);
      const adjustedX = Math.max(0, Math.min(chartWidth, x + xOffset));

      const clientX = rect.left + adjustedX;
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

      await new Promise(resolve => setTimeout(resolve, 50));

      const visibleTooltip = findVisibleHovercard();
      if (visibleTooltip) {
        await extractEngagedViewsTooltipData(adjustedX);
      }
    }

    const mouseLeaveEvent = new MouseEvent('mouseleave', {
      bubbles: true
    });
    mousePane.dispatchEvent(mouseLeaveEvent);

    console.log(`[YT Analytics] Collected ${engagedViewsData.length} engaged views data points for dates: ${targetDates.join(', ')}`);
    console.table(engagedViewsData);

    showToast(`${engagedViewsData.length}개 Engaged views 데이터 수집 완료`, "success");

    // Merge engaged views data into extracted data
    await mergeEngagedViewsIntoStorage();

  } catch (error) {
    showToast("Engaged views 데이터 수집 실패", "error");
  } finally {
    isCollecting = false;
  }
}

/**
 * Extract engaged views from tooltip data (second pass)
 */
async function extractEngagedViewsTooltipData(xPosition: number): Promise<void> {
  const tooltip = findVisibleHovercard();

  if (tooltip) {
    const dateEl = tooltip.querySelector('.date.style-scope.yta-deep-dive-hovercard');
    const rowEls = tooltip.querySelectorAll('.row.style-scope.yta-deep-dive-hovercard');

    if (dateEl && rowEls.length >= 1) {
      const dateTimeText = dateEl.textContent?.trim() || '';

      const dateParts = dateTimeText.match(/([A-Z][a-z]{2}),?\\s+([A-Z][a-z]{2})\\s+(\\d{1,2}),?\\s+(\\d{1,2}:\\d{2}\\s+[AP]M)/i);
      if (!dateParts) return;

      const month = dateParts[2];
      const day = dateParts[3];
      const time = dateParts[4];
      const date = `${month} ${day}`.trim();

      const normalizedDate = date.trim();
      const isInTargetDates = targetDates.length === 0 || targetDates.some(targetDate => targetDate.trim() === normalizedDate);

      if (!isInTargetDates) return;

      const minutesFromMidnight = timeToMinutes(time);
      const is1210AM = minutesFromMidnight >= 9 && minutesFromMidnight <= 11;

      if (!is1210AM) return;

      console.log(`found engaged views for ${normalizedDate.toLowerCase()} at ${time}`);

      const parseValue = (str: string): number => {
        return parseInt(str.replace(/,/g, ''), 10) || 0;
      };

      let engagedViews = 0;

      // Get the first row value (should be Engaged views)
      const firstRow = rowEls[0];
      const valueEl = firstRow.querySelector('.value.style-scope.yta-deep-dive-hovercard');
      if (valueEl) {
        const valueText = valueEl.textContent?.trim() || '0';
        engagedViews = parseValue(valueText);
      }

      const dataPointKey = `${date}:${time}`;

      if (!engagedViewsDataSet.has(dataPointKey)) {
        const dataPoint: DataPoint = {
          date: date,
          time: time,
          timestamp: parseDateTime(dateTimeText),
          totalViews: 0,
          advertisingViews: 0,
          engagedViews: engagedViews,
          trafficSources: [],
          xPosition,
          yPosition: 0
        };

        engagedViewsData.push(dataPoint);
        engagedViewsDataSet.add(dataPointKey);
      }
    }
  }
}

/**
 * Merge engaged views data into storage (ads_true_views field)
 */
async function mergeEngagedViewsIntoStorage(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.EXTRACTED_DATA]);
    const extractedData: Array<{
      date: string;
      normal_total_views: number;
      normal_ads_views: number;
      ads_true_views?: number;
    }> = result[STORAGE_KEYS.EXTRACTED_DATA] || [];

    // Group engaged views by date
    const engagedViewsByDate = new Map<string, number>();
    for (const point of engagedViewsData) {
      const originalDate = convertToOriginalDate(point.date);
      if (point.engagedViews !== undefined) {
        engagedViewsByDate.set(originalDate, point.engagedViews);
      }
    }

    // Update extracted data with ads_true_views
    for (const entry of extractedData) {
      const engagedViews = engagedViewsByDate.get(entry.date);
      if (engagedViews !== undefined) {
        entry.ads_true_views = engagedViews;
        console.log(`[YT Analytics] Updated ${entry.date} with ads_true_views: ${engagedViews}`);
      }
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTRACTED_DATA]: extractedData
    });

    showToast("Engaged views 데이터 저장 완료", "success");
  } catch (error) {
    console.error("[YT Analytics] Failed to merge engaged views:", error);
    showToast("Engaged views 저장 실패", "error");
  }
}

/**
 * Find visible yta-deep-dive-hovercard element
 * The hovercard can be hidden with opacity: 0 or visibility: hidden, so we need to check
 */
function findVisibleHovercard(): Element | null {
  // First, try to find the specific yta-deep-dive-hovercard element
  const hovercards = document.querySelectorAll('yta-deep-dive-hovercard');

  for (const hovercard of hovercards) {
    const style = window.getComputedStyle(hovercard as HTMLElement);
    const parent = hovercard.parentElement;
    const parentStyle = parent ? window.getComputedStyle(parent) : null;

    // Check if this hovercard is visible
    // It should have opacity > 0 and visibility: visible
    const isVisible =
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity) > 0 &&
      (!parentStyle || (
        parentStyle.display !== 'none' &&
        parentStyle.visibility !== 'hidden' &&
        parseFloat(parentStyle.opacity) > 0
      ));

    if (isVisible) {
      // console.log("[YT Analytics] ✅ Found VISIBLE yta-deep-dive-hovercard");
      // console.log("[YT Analytics] Hovercard opacity:", style.opacity);
      // console.log("[YT Analytics] Hovercard visibility:", style.visibility);
      // if (parentStyle) {
      //   console.log("[YT Analytics] Parent opacity:", parentStyle.opacity);
      //   console.log("[YT Analytics] Parent visibility:", parentStyle.visibility);
      // }
      return hovercard;
    } else {
      // console.log("[YT Analytics] ⚠️ Found yta-deep-dive-hovercard but it's HIDDEN");
      // console.log("[YT Analytics] Hovercard opacity:", style.opacity);
      // console.log("[YT Analytics] Hovercard visibility:", style.visibility);
    }
  }

  return null;
}

/**
 * Extract tooltip data when hovering
 */
async function extractTooltipData(xPosition: number): Promise<void> {
  // Look for visible yta-deep-dive-hovercard element
  const tooltip = findVisibleHovercard();

  if (tooltip) {
    // Log tooltip structure
    // console.log("[YT Analytics] 📊 Tooltip found at x:", xPosition);
    // console.log("[YT Analytics] Tooltip element tag:", tooltip.tagName);
    // console.log("[YT Analytics] Tooltip classes:", tooltip.className);
    // console.log("[YT Analytics] Tooltip innerHTML (first 500 chars):", tooltip.innerHTML?.substring(0, 500));

    // Try multiple selector patterns to find value elements
    const selectors = [
      '.value.style-scope.yta-deep-dive-hovercard',
      '.value',
      '[class*="value"]',
      'div.value',
      '.yta-deep-dive-hovercard .value'
    ];

    let valueElements: NodeListOf<Element> | null = null;
    for (const selector of selectors) {
      const found = tooltip.querySelectorAll(selector);
      if (found.length > 0) {
        // console.log(`[YT Analytics] Found ${found.length} elements with selector: "${selector}"`);
        valueElements = found;
        break;
      }
    }

    // if (valueElements && valueElements.length > 0) {
    //   console.log("[YT Analytics] ✅ Value elements found:", valueElements.length);
    //   valueElements.forEach((el, idx) => {
    //     console.log(`[YT Analytics] Value element ${idx}:`, {
    //       textContent: el.textContent,
    //       className: el.className,
    //       tagName: el.tagName
    //     });
    //   });
    // } else {
    //   console.log("[YT Analytics] ⚠️  No value elements found with any selector");
    // }

    // Extract date, time, and values from tooltip
    const text = tooltip.textContent || '';

    // console.log("[YT Analytics] Raw tooltip text:", text);

    // Check if tooltip contains "First"
    // if (text.includes('First') || text.includes('first')) {
    //   console.log("[YT Analytics] ⚠️  WARNING: Tooltip contains 'First' keyword!");
    //   console.log("[YT Analytics] Full text with 'First':", text);
    // }

    // Try to parse using the actual YouTube tooltip structure
    // Structure: date element, subtitle (with "First X days"), then rows with title/value pairs
    const dateEl = tooltip.querySelector('.date.style-scope.yta-deep-dive-hovercard');
    const subtitleEl = tooltip.querySelector('.subtitle.style-scope.yta-deep-dive-hovercard');

    // Extract ALL rows (traffic sources)
    const rowEls = tooltip.querySelectorAll('.row.style-scope.yta-deep-dive-hovercard');

    if (dateEl && rowEls.length >= 2) {
      const dateTimeText = dateEl.textContent?.trim() || '';
      const subtitleText = subtitleEl?.textContent?.trim() || '';

      // console.log("[YT Analytics] Date element:", dateTimeText);
      // console.log("[YT Analytics] Subtitle:", subtitleText);
      // console.log("[YT Analytics] Found", rowEls.length, "traffic source rows");

      // if (subtitleText.includes('First') || subtitleText.includes('first')) {
      //   console.log("[YT Analytics] ⚠️  Subtitle contains 'First':", subtitleText);
      // }

      // Parse date from "Sat, Nov 8, 1:10 AM" → "Nov 8"
      const dateParts = dateTimeText.match(/([A-Z][a-z]{2}),?\s+([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(\d{1,2}:\d{2}\s+[AP]M)/i);
      if (!dateParts) {
        // console.log("[YT Analytics] ⚠️  Could not parse date from:", dateTimeText);
        return;
      }

      const month = dateParts[2]; // "Nov"
      const day = dateParts[3];   // "8"
      const time = dateParts[4];  // "1:10 AM"
      const date = `${month} ${day}`.trim(); // "Nov 8" (trimmed)

      // Filter: only collect data for dates in the target dates array
      // Use normalized comparison (trim and compare)
      const normalizedDate = date.trim();
      const isInTargetDates = targetDates.length === 0 || targetDates.some(targetDate => targetDate.trim() === normalizedDate);

      if (!isInTargetDates) {
        // Skip dates not in target range
        return;
      }

      // CRITICAL: Only collect data when time is exactly 12:10 AM (within 1 minute tolerance: 12:09 AM - 12:11 AM)
      const minutesFromMidnight = timeToMinutes(time);
      const is1210AM = minutesFromMidnight >= 9 && minutesFromMidnight <= 11;

      if (!is1210AM) {
        // Skip all times that are not 12:10 AM - only collect 12:10 AM data
        return;
      }

      // Log when we successfully collect 12:10 AM data
      console.log(`found ${normalizedDate.toLowerCase()} at ${time}`);

      // Parse values - remove commas and convert to number
      const parseValue = (str: string): number => {
        return parseInt(str.replace(/,/g, ''), 10) || 0;
      };

      // Extract ALL traffic sources from rows
      const trafficSources: TrafficSource[] = [];
      let totalViews = 0;
      let advertisingViews = 0;

      rowEls.forEach((row, index) => {
        const titleEl = row.querySelector('.title.style-scope.yta-deep-dive-hovercard');
        const valueEl = row.querySelector('.value.style-scope.yta-deep-dive-hovercard');

        if (titleEl && valueEl) {
          const title = titleEl.textContent?.trim() || '';
          const valueText = valueEl.textContent?.trim() || '0';
          const value = parseValue(valueText);

          trafficSources.push({ title, value });

          // console.log(`[YT Analytics] Row ${index}: ${title} = ${value}`);

          // Capture specific values for backward compatibility
          if (index === 0) {
            totalViews = value; // First row is typically "Total" or most significant metric
          }
          if (title.toLowerCase().includes('youtube advertising')) {
            advertisingViews = value;
          }
        }
      });

      // console.log("[YT Analytics] Extracted traffic sources:", trafficSources);

      // Create a unique key for this data point using date and time
      const dataPointKey = `${date}:${time}`;

      // Only add if not already collected (deduplicate using Set)
      if (!collectedDataSet.has(dataPointKey)) {
        const dataPoint = {
          date: date,
          time: time,
          timestamp: parseDateTime(dateTimeText),
          totalViews,
          advertisingViews,
          trafficSources,
          xPosition,
          yPosition: 0
        };

        collectedData.push(dataPoint);
        collectedDataSet.add(dataPointKey); // Track this data point
        // console.log("[YT Analytics] ✅ Data point collected:", dataPoint);
      } else {
        // console.log(`[YT Analytics] ⚠️ Duplicate data point skipped: ${dataPointKey}`);
      }

      // Save immediately to ytstudio_extracted_data storage
      try {
        const result = await chrome.storage.local.get([STORAGE_KEYS.EXTRACTED_DATA]);
        const extractedData: Array<{
          date: string;
          normal_total_views: number;
          normal_ads_views: number;
          ads_true_views?: number;
        }> = result[STORAGE_KEYS.EXTRACTED_DATA] || [];

        // Convert tooltip date (e.g., "Nov 8") back to original requested date (e.g., "Nov 7")
        const originalDate = convertToOriginalDate(date);

        const extractedEntry = {
          date: originalDate, // Store as original requested date (e.g., "Nov 7")
          normal_total_views: totalViews,
          normal_ads_views: advertisingViews,
          // ads_true_views will be added later
        };

        // Check if entry for this original date already exists
        const existingIndex = extractedData.findIndex(entry => entry.date === originalDate);
        if (existingIndex >= 0) {
          // Update existing entry
          extractedData[existingIndex] = extractedEntry;
        } else {
          // Add new entry
          extractedData.push(extractedEntry);
        }

        await chrome.storage.local.set({
          [STORAGE_KEYS.EXTRACTED_DATA]: extractedData
        });
      } catch (error) {
        // console.error("[YT Analytics] Failed to save extracted data immediately:", error);
      }
    } else {
      // console.log("[YT Analytics] ⚠️  Could not find required elements in yta-deep-dive-hovercard");
      // console.log("[YT Analytics] Date element found:", !!dateEl);
      // console.log("[YT Analytics] Row elements count:", rowEls.length);
      // console.log("[YT Analytics] Expected at least 2 rows with .row.style-scope.yta-deep-dive-hovercard");
      // console.log("[YT Analytics] Tooltip HTML structure:", tooltip.innerHTML?.substring(0, 1000));
    }
  } else {
    // Only log every 20th miss to avoid console spam
    // if (Math.random() < 0.05) {
    //   console.log("[YT Analytics] ⚠️ No visible yta-deep-dive-hovercard found at x:", xPosition);
    //   const allHovercards = document.querySelectorAll('yta-deep-dive-hovercard');
    //   console.log("[YT Analytics] Total hovercards in DOM:", allHovercards.length);
    // }
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
 * Helper function to convert time string to minutes from midnight
 */
function timeToMinutes(timeStr: string): number {
  const time = timeStr.toLowerCase();
  const hourMatch = time.match(/(\d+):(\d+)\s*(am|pm)/i);

  if (!hourMatch) return Infinity; // Invalid time, sort to end

  let hour = parseInt(hourMatch[1]);
  const minute = parseInt(hourMatch[2]);
  const period = hourMatch[3].toLowerCase();

  // Convert to 24-hour format
  if (period === 'am' && hour === 12) hour = 0;
  if (period === 'pm' && hour !== 12) hour += 12;

  return hour * 60 + minute;
}

/**
 * Process collected data to select nearest 12:10 AM point for EACH date
 */
function processDailyStats(data: DataPoint[]): DailyStats[] {
  if (data.length === 0) {
    // console.warn("[YT Analytics] No data collected for target dates:", targetDates);
    return [];
  }

  // Group data by date
  const dataByDate = new Map<string, DataPoint[]>();
  for (const point of data) {
    if (!dataByDate.has(point.date)) {
      dataByDate.set(point.date, []);
    }
    dataByDate.get(point.date)!.push(point);
  }

  // console.log("[YT Analytics] Collected data for", dataByDate.size, "dates:", Array.from(dataByDate.keys()));

  // Find the point at exactly 12:10 AM (00:10) for each date
  const targetHour = 0;  // 12 AM in 24-hour format
  const targetMinute = 10;
  const targetMinutesFromMidnight = targetHour * 60 + targetMinute; // 10 minutes

  const dailyStats: DailyStats[] = [];

  // Process each date
  for (const [date, points] of dataByDate.entries()) {
    // console.log(`[YT Analytics] Processing ${points.length} data points for date: ${date}`);
    // console.table(points.map(p => ({ time: p.time, totalViews: p.totalViews })));

    // Sort points by time (ascending) so 12:10 AM (00:10) will be first
    const sortedPoints = [...points].sort((a, b) => {
      const minutesA = timeToMinutes(a.time);
      const minutesB = timeToMinutes(b.time);
      return minutesA - minutesB;
    });

    // console.log(`[YT Analytics] Sorted points by time:`, sortedPoints.map(p => p.time));

    let selectedPoint: DataPoint | null = null;

    // Look for exact 12:10 AM match (within 1 minute tolerance: 12:09 AM - 12:11 AM)
    for (const point of sortedPoints) {
      const minutesFromMidnight = timeToMinutes(point.time);

      // Check if it's exactly 12:10 AM (within 1 minute tolerance: 12:09 AM - 12:11 AM)
      // This ensures we only select times very close to 12:10 AM
      if (minutesFromMidnight >= 9 && minutesFromMidnight <= 11) {
        selectedPoint = point;
        // Data was already logged during collection, no need to log again
        break; // Found match, stop searching
      }
    }

    // STRICT: Only accept 12:10 AM - skip date if not found
    if (!selectedPoint) {
      // console.error(`[YT Analytics] ❌ ERROR: No 12:10 AM data found for ${date}. Available times:`, sortedPoints.map(p => p.time));
      // console.error(`[YT Analytics] ⚠️ Skipping ${date} - will not be included in results. Data collection may need to retry or increase sampling.`);
      // Skip this date - don't add to dailyStats
      continue;
    }

    dailyStats.push({
      date: selectedPoint.date,
      totalViews: selectedPoint.totalViews,
      advertisingViews: selectedPoint.advertisingViews,
      trafficSources: selectedPoint.trafficSources,
      selectedTime: selectedPoint.time
    });

    // console.log(`[YT Analytics] Selected time for ${date}:`, selectedPoint.time);
    // console.log(`[YT Analytics] Traffic sources:`, selectedPoint.trafficSources);
  }

  // console.log("[YT Analytics] Total daily stats processed:", dailyStats.length);
  return dailyStats;
}

/**
 * Step 5: Click "Add metric to table" button to open metric picker
 */
async function clickAddMetricButton(): Promise<boolean> {
  showToast("메트릭 추가 버튼 클릭 중...", "loading");

  try {
    // Find the add metric button by ID and aria-label
    const addMetricButton = document.querySelector('ytcp-icon-button#add-metric-icon[aria-label="Add metric to table"]') as HTMLElement;

    if (addMetricButton) {
      console.log("[YT Analytics] Found 'Add metric' button, clicking...");
      addMetricButton.click();
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s for dialog to open
      showToast("메트릭 선택 메뉴 열림", "success");
      return true;
    }

    console.warn("[YT Analytics] 'Add metric' button not found");
    showToast("메트릭 추가 버튼을 찾을 수 없습니다", "error");
    return false;
  } catch (error) {
    console.error("[YT Analytics] Error clicking 'Add metric' button:", error);
    showToast("메트릭 추가 버튼 클릭 실패", "error");
    return false;
  }
}

/**
 * Step 6: Check "Engaged views" checkbox in the metric picker dialog
 */
async function checkEngagedViewsCheckbox(): Promise<boolean> {
  return checkCheckbox(
    'ytcp-checkbox-lit#ENGAGED_VIEWS',
    {
      loading: "Engaged views 체크박스 선택 중...",
      success: "Engaged views 체크박스 선택 완료",
      info: "Engaged views 체크박스 이미 선택됨",
      error: "Engaged views 체크박스 선택 실패",
      notFound: "Engaged views 체크박스를 찾을 수 없습니다"
    },
    "Engaged views"
  );
}

/**
 * Step 6.5: Click "Apply" button in the metric picker dialog
 */
async function clickApplyButton(): Promise<boolean> {
  showToast("Apply 버튼 클릭 중...", "loading");

  try {
    // Find Apply button by ID
    const applyButton = document.querySelector('ytcp-button#apply-button[aria-label="Apply"]') as HTMLElement;

    if (applyButton) {
      // The actual button is inside ytcp-button-shape
      const buttonElement = applyButton.querySelector('button[aria-label="Apply"]') as HTMLElement;

      if (buttonElement) {
        console.log("[YT Analytics] Found 'Apply' button, clicking...");
        buttonElement.click();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for changes to apply
        showToast("Apply 버튼 클릭 완료", "success");
        return true;
      } else {
        // Fallback: click the ytcp-button element itself
        console.log("[YT Analytics] Button element not found, clicking ytcp-button directly...");
        applyButton.click();
        await new Promise(resolve => setTimeout(resolve, 1000));
        showToast("Apply 버튼 클릭 완료", "success");
        return true;
      }
    }

    console.warn("[YT Analytics] 'Apply' button not found");
    showToast("Apply 버튼을 찾을 수 없습니다", "error");
    return false;
  } catch (error) {
    console.error("[YT Analytics] Error clicking 'Apply' button:", error);
    showToast("Apply 버튼 클릭 실패", "error");
    return false;
  }
}

/**
 * Step 7: Close the metric picker dialog
 */
async function closeMetricPickerDialog(): Promise<boolean> {
  showToast("메트릭 선택 메뉴 닫기 중...", "loading");

  try {
    // Find close button in the header by looking for it within the header element
    // The close button should be: ytcp-icon-button#close-button with slot="secondary-header" inside .header.style-scope.ytcp-dialog
    const header = document.querySelector('.header.style-scope.ytcp-dialog');
    const closeButton = header
      ? header.querySelector('ytcp-icon-button#close-button[aria-label="Close"][slot="secondary-header"]') as HTMLElement
      : null;

    if (closeButton) {
      console.log("[YT Analytics] Found close button in header, clicking...");
      closeButton.click();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for dialog to close
      showToast("메트릭 선택 메뉴 닫힘", "success");
      return true;
    }

    console.warn("[YT Analytics] Close button not found in header");
    showToast("닫기 버튼을 찾을 수 없습니다", "error");
    return false;
  } catch (error) {
    console.error("[YT Analytics] Error closing metric picker dialog:", error);
    showToast("메뉴 닫기 실패", "error");
    return false;
  }
}

/**
 * Step 8: Uncheck "Total" checkbox in the table
 */
async function uncheckTotalCheckbox(): Promise<boolean> {
  showToast("총계 체크박스 해제 중...", "loading");

  try {
    // Find the checkbox in the table row with aria-label "Select row for Total"
    const checkboxElement = document.querySelector('ytcp-checkbox-lit[aria-label="Select row for Total"]');

    if (checkboxElement) {
      const checkbox = checkboxElement.querySelector('div[role="checkbox"]') as HTMLElement;

      if (checkbox) {
        const ariaChecked = checkbox.getAttribute('aria-checked');

        if (ariaChecked === 'true') {
          console.log("[YT Analytics] Found checked 'Total' checkbox, unchecking...");
          checkbox.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          showToast("총계 체크박스 해제 완료", "success");
          return true;
        } else {
          console.log("[YT Analytics] 'Total' checkbox already unchecked");
          showToast("총계 체크박스 이미 해제됨", "info");
          return true;
        }
      }
    }

    console.warn("[YT Analytics] 'Total' checkbox in table not found");
    showToast("총계 체크박스를 찾을 수 없습니다", "error");
    return false;
  } catch (error) {
    console.error("[YT Analytics] Error unchecking 'Total' checkbox:", error);
    showToast("총계 체크박스 해제 실패", "error");
    return false;
  }
}

async function executeWorkflow(): Promise<void> {
  // console.log("[YT Analytics] ========================================");
  // console.log("[YT Analytics] Starting YT Studio Analytics automation");
  // console.log("[YT Analytics] ========================================");

  try {
    // Step 0: Load target dates from storage
    targetDates = await loadTargetDates();

    if (targetDates.length === 0) {
      showToast("대상 날짜를 먼저 설정하세요 (팝업에서 설정)", "error", 5000);
      throw new Error("Target dates not configured. Please set date range in the popup first.");
    }

    // console.log("[YT Analytics] Target dates:", targetDates);
    const dateRangeMsg = targetDates.length === 1
      ? `${targetDates[0]}`
      : `${targetDates[0]} - ${targetDates[targetDates.length - 1]}`;
    showToast(`수집 날짜: ${dateRangeMsg} (~12:10 AM)`, "info", 3000);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ============================================================
    // FIRST PASS: Collect Total + YouTube advertising data
    // ============================================================

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

    // Step 4: Collect data by hovering (first pass)
    await collectDataByHovering();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ============================================================
    // SECOND PASS: Collect Engaged views data
    // ============================================================

    showToast("두 번째 수집 시작: Engaged views", "info", 3000);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 5: Click "Add metric to table" button
    const addMetricSuccess = await clickAddMetricButton();
    if (!addMetricSuccess) {
      throw new Error("Failed to click 'Add metric' button");
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 6: Check "Engaged views" checkbox
    const engagedViewsSuccess = await checkEngagedViewsCheckbox();
    if (!engagedViewsSuccess) {
      throw new Error("Failed to check 'Engaged views' checkbox");
    }

    // Workflow stops here - menu remains open for manual verification
    return;

  } catch (error) {
    // console.error("[YT Analytics] Workflow failed:", error);
    showToast(`오류: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
  }
}

/**
 * Update date status display with current date range from storage
 */
async function updateDateStatusDisplay(showLoading: boolean = false): Promise<void> {
  const dateStatus = document.getElementById("ytstudio-analytics-date-status");
  if (!dateStatus) return;

  // Show loading state if requested
  if (showLoading) {
    dateStatus.innerHTML = `
      <svg class="loading-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite; display: inline-block; vertical-align: middle; margin-right: 6px;">
        <circle cx="12" cy="12" r="10" opacity="0.25"></circle>
        <path d="M12 2 A10 10 0 0 1 22 12" opacity="0.75"></path>
      </svg>
      <span style="vertical-align: middle;">Syncing...</span>
    `;
    dateStatus.style.background = '#fef3c7';
    dateStatus.style.color = '#92400e';

    // Add spin animation if not already added
    if (!document.getElementById('date-sync-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'date-sync-spinner-style';
      style.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.DATE_RANGE]);
    const dateRange = result[STORAGE_KEYS.DATE_RANGE];

    if (dateRange && dateRange.startYear > 0 && dateRange.startMonth > 0 && dateRange.startDay > 0) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      const startDate = new Date(dateRange.startYear, dateRange.startMonth - 1, dateRange.startDay);
      const startFormatted = `${monthNames[startDate.getMonth()]} ${startDate.getDate()}`;

      // Check if there's an end date and it's different from start date
      if (dateRange.endYear > 0 && dateRange.endMonth > 0 && dateRange.endDay > 0) {
        const endDate = new Date(dateRange.endYear, dateRange.endMonth - 1, dateRange.endDay);

        // Compare dates
        if (startDate.getTime() !== endDate.getTime()) {
          // Show range: "Nov 6 -> Nov 11"
          const endFormatted = `${monthNames[endDate.getMonth()]} ${endDate.getDate()}`;
          dateStatus.textContent = `${startFormatted} → ${endFormatted}`;
        } else {
          // Single date: "Nov 6"
          dateStatus.textContent = `${startFormatted}`;
        }
      } else {
        // Only start date configured
        dateStatus.textContent = `${startFormatted}`;
      }

      dateStatus.style.background = '#d1fae5';
      dateStatus.style.color = '#065f46';
    } else {
      dateStatus.textContent = `⚠️ Set date in popup`;
      dateStatus.style.background = '#fee2e2';
      dateStatus.style.color = '#991b1b';
    }
  } catch (error) {
    // console.error("[YT Analytics] Failed to load date range for display:", error);
    dateStatus.textContent = `⚠️ Set date in popup`;
    dateStatus.style.background = '#fee2e2';
    dateStatus.style.color = '#991b1b';
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
      bottom: 32px;
      left: 32px;
      z-index: 10001;
      background: white;
      color: black;
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

    document.body.appendChild(dateStatus);

    // Load and display initial date range
    await updateDateStatusDisplay();
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
    // console.log("[YT Analytics] Not on YouTube Studio analytics page");
    return;
  }

  // console.log("[YT Analytics] Initializing on YouTube Studio analytics page");

  // Wait for page to fully load
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Inject UI (now async to load date)
  await injectUI();

  // console.log("[YT Analytics] Ready! Click 'Start Data Collection' button to begin.");

  // Show initial date status
  const currentTargetDates = await loadTargetDates();
  // if (currentTargetDates.length > 0) {
  //   const dateRangeMsg = currentTargetDates.length === 1
  //     ? currentTargetDates[0]
  //     : `${currentTargetDates[0]} - ${currentTargetDates[currentTargetDates.length - 1]}`;
  //   console.log("[YT Analytics] ✓ Target dates configured:", dateRangeMsg);
  // } else {
  //   console.warn("[YT Analytics] ⚠️  No target dates configured. Please set date range in the extension popup.");
  // }

  // Listen for date range changes in storage and update display instantly
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEYS.DATE_RANGE]) {
      // console.log("[YT Analytics] Date range changed, updating display...");
      updateDateStatusDisplay(true); // Show loading indicator during sync
      // Clear extracted data when date range changes
      chrome.storage.local.set({ [STORAGE_KEYS.EXTRACTED_DATA]: [] });
    }
  });
}

// Run initialization when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

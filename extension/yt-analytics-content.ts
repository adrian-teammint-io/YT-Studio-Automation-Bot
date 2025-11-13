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
  trafficSources: TrafficSource[]; // All traffic source stats from tooltip
  xPosition: number;
  yPosition: number;
}

interface DailyStats {
  date: string;
  totalViews: number;
  advertisingViews: number;
  trafficSources: TrafficSource[]; // All traffic source stats
  selectedTime: string;
}

let collectedData: DataPoint[] = [];
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
    console.log("[YT Analytics] Loading target dates from storage...");
    const result = await chrome.storage.local.get([STORAGE_KEYS.DATE_RANGE]);
    const dateRange = result[STORAGE_KEYS.DATE_RANGE];

    console.log("[YT Analytics] Loaded date range:", dateRange);

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
        console.error("[YT Analytics] Invalid date range:", dateRange);
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

      console.log("[YT Analytics] User configured date range:",
        `${monthNames[startDate.getMonth()]} ${startDate.getDate()} - ${monthNames[endDate.getMonth()]} ${endDate.getDate()}`);
      console.log("[YT Analytics] Target dates for stats (next days at ~12:10 AM):", dates);
      return dates;
    }

    console.warn("[YT Analytics] No valid date range found in storage");
    return [];
  } catch (error) {
    console.error("[YT Analytics] Failed to load target dates:", error);
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
        trafficSources: [], // Will be filled when hovering
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

      // Wait for tooltip to appear and become visible (retry up to 5 times)
      let tooltipFound = false;
      for (let retry = 0; retry < 5; retry++) {
        await new Promise(resolve => setTimeout(resolve, 50));

        // Check if tooltip is visible
        const visibleTooltip = findVisibleHovercard();
        if (visibleTooltip) {
          tooltipFound = true;
          break;
        }
      }

      if (tooltipFound) {
        // Extract tooltip data
        await extractTooltipData(x);
      } else {
        // Only log every 10th failure to reduce console noise
        if (i % 10 === 0) {
          console.log(`[YT Analytics] ⚠️ No visible tooltip at x=${x} after retries`);
        }
      }
    }

    // Dispatch mouse leave event
    const mouseLeaveEvent = new MouseEvent('mouseleave', {
      bubbles: true
    });
    mousePane.dispatchEvent(mouseLeaveEvent);

    console.log("[YT Analytics] ============================================");
    console.log("[YT Analytics] Hover collection complete");
    console.log("[YT Analytics] ============================================");
    console.log("[YT Analytics] Total data points collected:", collectedData.length);
    console.log("[YT Analytics] Configured date filter:", targetDates);
    console.log("[YT Analytics] All collected tooltip data:");
    console.table(collectedData);
    console.log("[YT Analytics] ============================================");

    showToast(`${collectedData.length}개 데이터 포인트 수집 완료`, "success");

    // Process collected data to select nearest midnight per day
    const dailyStats = processDailyStats(collectedData);
    console.log("[YT Analytics] Processed daily stats (nearest midnight):");
    console.table(dailyStats);

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

      console.log(`[YT Analytics] Stored extracted data for original date ${originalDate} (extracted from ${stat.date} at ${stat.selectedTime}):`, extractedEntry);
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.EXTRACTED_DATA]: extractedData
    });

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
      console.log("[YT Analytics] ✅ Found VISIBLE yta-deep-dive-hovercard");
      console.log("[YT Analytics] Hovercard opacity:", style.opacity);
      console.log("[YT Analytics] Hovercard visibility:", style.visibility);
      if (parentStyle) {
        console.log("[YT Analytics] Parent opacity:", parentStyle.opacity);
        console.log("[YT Analytics] Parent visibility:", parentStyle.visibility);
      }
      return hovercard;
    } else {
      console.log("[YT Analytics] ⚠️ Found yta-deep-dive-hovercard but it's HIDDEN");
      console.log("[YT Analytics] Hovercard opacity:", style.opacity);
      console.log("[YT Analytics] Hovercard visibility:", style.visibility);
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
    console.log("[YT Analytics] 📊 Tooltip found at x:", xPosition);
    console.log("[YT Analytics] Tooltip element tag:", tooltip.tagName);
    console.log("[YT Analytics] Tooltip classes:", tooltip.className);
    console.log("[YT Analytics] Tooltip innerHTML (first 500 chars):", tooltip.innerHTML?.substring(0, 500));

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
        console.log(`[YT Analytics] Found ${found.length} elements with selector: "${selector}"`);
        valueElements = found;
        break;
      }
    }

    if (valueElements && valueElements.length > 0) {
      console.log("[YT Analytics] ✅ Value elements found:", valueElements.length);
      valueElements.forEach((el, idx) => {
        console.log(`[YT Analytics] Value element ${idx}:`, {
          textContent: el.textContent,
          className: el.className,
          tagName: el.tagName
        });
      });
    } else {
      console.log("[YT Analytics] ⚠️  No value elements found with any selector");
    }

    // Extract date, time, and values from tooltip
    const text = tooltip.textContent || '';

    console.log("[YT Analytics] Raw tooltip text:", text);

    // Check if tooltip contains "First"
    if (text.includes('First') || text.includes('first')) {
      console.log("[YT Analytics] ⚠️  WARNING: Tooltip contains 'First' keyword!");
      console.log("[YT Analytics] Full text with 'First':", text);
    }

    // Try to parse using the actual YouTube tooltip structure
    // Structure: date element, subtitle (with "First X days"), then rows with title/value pairs
    const dateEl = tooltip.querySelector('.date.style-scope.yta-deep-dive-hovercard');
    const subtitleEl = tooltip.querySelector('.subtitle.style-scope.yta-deep-dive-hovercard');

    // Extract ALL rows (traffic sources)
    const rowEls = tooltip.querySelectorAll('.row.style-scope.yta-deep-dive-hovercard');

    if (dateEl && rowEls.length >= 2) {
      const dateTimeText = dateEl.textContent?.trim() || '';
      const subtitleText = subtitleEl?.textContent?.trim() || '';

      console.log("[YT Analytics] Date element:", dateTimeText);
      console.log("[YT Analytics] Subtitle:", subtitleText);
      console.log("[YT Analytics] Found", rowEls.length, "traffic source rows");

      if (subtitleText.includes('First') || subtitleText.includes('first')) {
        console.log("[YT Analytics] ⚠️  Subtitle contains 'First':", subtitleText);
      }

      // Parse date from "Sat, Nov 8, 1:10 AM" → "Nov 8"
      const dateParts = dateTimeText.match(/([A-Z][a-z]{2}),?\s+([A-Z][a-z]{2})\s+(\d{1,2}),?\s+(\d{1,2}:\d{2}\s+[AP]M)/i);
      if (!dateParts) {
        console.log("[YT Analytics] ⚠️  Could not parse date from:", dateTimeText);
        return;
      }

      const month = dateParts[2]; // "Nov"
      const day = dateParts[3];   // "8"
      const time = dateParts[4];  // "1:10 AM"
      const date = `${month} ${day}`; // "Nov 8"

      console.log("[YT Analytics] Parsed date:", date);
      console.log("[YT Analytics] Parsed time:", time);
      console.log("[YT Analytics] Target dates:", targetDates);

      // Filter: only collect data for dates in the target dates array
      if (targetDates.length > 0 && !targetDates.includes(date)) {
        console.log("[YT Analytics] ❌ Skipped - date not in target range");
        return;
      }

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

          console.log(`[YT Analytics] Row ${index}: ${title} = ${value}`);

          // Capture specific values for backward compatibility
          if (index === 0) {
            totalViews = value; // First row is typically "Total" or most significant metric
          }
          if (title.toLowerCase().includes('youtube advertising')) {
            advertisingViews = value;
          }
        }
      });

      console.log("[YT Analytics] Extracted traffic sources:", trafficSources);

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
      console.log("[YT Analytics] ✅ Data point collected:", dataPoint);
    } else {
      console.log("[YT Analytics] ⚠️  Could not find required elements in yta-deep-dive-hovercard");
      console.log("[YT Analytics] Date element found:", !!dateEl);
      console.log("[YT Analytics] Row elements count:", rowEls.length);
      console.log("[YT Analytics] Expected at least 2 rows with .row.style-scope.yta-deep-dive-hovercard");
      console.log("[YT Analytics] Tooltip HTML structure:", tooltip.innerHTML?.substring(0, 1000));
    }
  } else {
    // Only log every 20th miss to avoid console spam
    if (Math.random() < 0.05) {
      console.log("[YT Analytics] ⚠️ No visible yta-deep-dive-hovercard found at x:", xPosition);
      const allHovercards = document.querySelectorAll('yta-deep-dive-hovercard');
      console.log("[YT Analytics] Total hovercards in DOM:", allHovercards.length);
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
 * Process collected data to select nearest 12:10 AM point for EACH date
 */
function processDailyStats(data: DataPoint[]): DailyStats[] {
  if (data.length === 0) {
    console.warn("[YT Analytics] No data collected for target dates:", targetDates);
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

  console.log("[YT Analytics] Collected data for", dataByDate.size, "dates:", Array.from(dataByDate.keys()));

  // Find the point closest to 12:10 AM (00:10) for each date
  const targetHour = 0;  // 12 AM in 24-hour format
  const targetMinute = 10;
  const targetMinutesFromMidnight = targetHour * 60 + targetMinute; // 10 minutes

  const dailyStats: DailyStats[] = [];

  // Process each date
  for (const [date, points] of dataByDate.entries()) {
    console.log(`[YT Analytics] Processing ${points.length} data points for date: ${date}`);
    console.table(points.map(p => ({ time: p.time, totalViews: p.totalViews })));

    let closestPoint = points[0];
    let minTimeDiff = Infinity;
    let exactMatchFound = false;

    // First pass: Look for exact 12:10 AM match (within 5 minute tolerance)
    for (const point of points) {
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

        // Check if it's exactly 12:10 AM (within 5 minute tolerance: 12:05 AM - 12:15 AM)
        if (hour === 0 && minutesFromMidnight >= 5 && minutesFromMidnight <= 15) {
          exactMatchFound = true;
          closestPoint = point;
          minTimeDiff = Math.abs(minutesFromMidnight - targetMinutesFromMidnight);
          console.log(`[YT Analytics] Found exact 12:10 AM match for ${date}: ${point.time}`);
          break; // Found exact match, stop searching
        }
      }
    }

    // Second pass: If no exact match, find closest to 12:10 AM
    if (!exactMatchFound) {
      console.log(`[YT Analytics] No exact 12:10 AM match for ${date}, finding closest...`);
      for (const point of points) {
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

          // Calculate absolute difference from 12:10 AM
          const timeDiff = Math.abs(minutesFromMidnight - targetMinutesFromMidnight);

          if (timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff;
            closestPoint = point;
          }
        }
      }
    }

    dailyStats.push({
      date: closestPoint.date,
      totalViews: closestPoint.totalViews,
      advertisingViews: closestPoint.advertisingViews,
      trafficSources: closestPoint.trafficSources,
      selectedTime: closestPoint.time
    });

    console.log(`[YT Analytics] Selected time for ${date}:`, closestPoint.time, "(diff:", minTimeDiff, "minutes)");
    console.log(`[YT Analytics] Traffic sources:`, closestPoint.trafficSources);
  }

  console.log("[YT Analytics] Total daily stats processed:", dailyStats.length);
  return dailyStats;
}

/**
 * Copy data to clipboard
 */
async function copyToClipboard(dailyStats: DailyStats[]): Promise<void> {
  try {
    // Get all unique traffic source titles from all stats
    const allSourceTitles = new Set<string>();
    dailyStats.forEach(stat => {
      stat.trafficSources.forEach(source => {
        allSourceTitles.add(source.title);
      });
    });
    const sourceColumns = Array.from(allSourceTitles);

    // Format as TSV with dynamic columns for each traffic source
    const header = ["Date", "Selected Time", "Total Views", "Advertising Views", ...sourceColumns].join('\t');

    const rows = dailyStats.map(stat => {
      // Create a map of traffic source values for quick lookup
      const sourceMap = new Map(stat.trafficSources.map(s => [s.title, s.value]));

      // Build row with all columns
      const columns = [
        stat.date,
        stat.selectedTime,
        stat.totalViews.toString(),
        stat.advertisingViews.toString(),
        ...sourceColumns.map(title => (sourceMap.get(title) || 0).toString())
      ];

      return columns.join('\t');
    });

    const tsv = [header, ...rows].join('\n');

    // Log what's being copied within the configured dates
    console.log("[YT Analytics] ============================================");
    console.log("[YT Analytics] Copying comprehensive analytics data");
    console.log("[YT Analytics] ============================================");
    console.log("[YT Analytics] Configured date range:", targetDates.length > 0 ? `${targetDates[0]} to ${targetDates[targetDates.length - 1]}` : "Not set");
    console.log("[YT Analytics] Number of dates:", targetDates.length);
    console.log("[YT Analytics] Number of data rows copied:", dailyStats.length);
    console.log("[YT Analytics] Traffic source columns:", sourceColumns);
    console.log("[YT Analytics] Raw TSV format:");
    console.log(tsv);
    console.log("[YT Analytics] Parsed data structure:");
    console.table(dailyStats);
    console.log("[YT Analytics] Traffic sources detail:");
    dailyStats.forEach(stat => {
      console.table(stat.trafficSources);
    });
    console.log("[YT Analytics] ============================================");

    // Copy to clipboard
    await navigator.clipboard.writeText(tsv);

    console.log("[YT Analytics] Data copied to clipboard");
    showToast("데이터가 클립보드에 복사되었습니다 (모든 트래픽 소스 포함)", "success", 5000);
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
    // Step 0: Load target dates from storage
    targetDates = await loadTargetDates();

    if (targetDates.length === 0) {
      showToast("대상 날짜를 먼저 설정하세요 (팝업에서 설정)", "error", 5000);
      throw new Error("Target dates not configured. Please set date range in the popup first.");
    }

    console.log("[YT Analytics] Target dates:", targetDates);
    const dateRangeMsg = targetDates.length === 1
      ? `${targetDates[0]}`
      : `${targetDates[0]} - ${targetDates[targetDates.length - 1]}`;
    showToast(`수집 날짜: ${dateRangeMsg} (~12:10 AM)`, "info", 3000);
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
    console.error("[YT Analytics] Failed to load date range for display:", error);
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
  const currentTargetDates = await loadTargetDates();
  if (currentTargetDates.length > 0) {
    const dateRangeMsg = currentTargetDates.length === 1
      ? currentTargetDates[0]
      : `${currentTargetDates[0]} - ${currentTargetDates[currentTargetDates.length - 1]}`;
    console.log("[YT Analytics] ✓ Target dates configured:", dateRangeMsg);
  } else {
    console.warn("[YT Analytics] ⚠️  No target dates configured. Please set date range in the extension popup.");
  }

  // Listen for date range changes in storage and update display instantly
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEYS.DATE_RANGE]) {
      console.log("[YT Analytics] Date range changed, updating display...");
      updateDateStatusDisplay(true); // Show loading indicator during sync
    }
  });
}

// Run initialization when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}

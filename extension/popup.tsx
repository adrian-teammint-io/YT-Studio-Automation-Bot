"use client";

import * as React from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { POPUP_WIDTH } from "./constants/ui";
import { STORAGE_KEYS } from "./constants/storage";
import { YTStudioList } from "./components/YTStudioList";
import { SettingsView } from "./components/SettingsView";
import { NAVER_SEARCHAD_REPORTS_DOWNLOAD_URL } from "./constants/urls";

export default function URLReplacerPopup() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSettingsView, setIsSettingsView] = React.useState(false);
  const [version, setVersion] = React.useState<string>("");
  const [isRefetching, setIsRefetching] = React.useState(false);
  const [buttonsVisible, setButtonsVisible] = React.useState(true);
  const [completedDates, setCompletedDates] = React.useState<Array<{ date: string; completedAt: string }>>([]);

  // Date range state - initialized to empty (0) values
  const [startYear, setStartYear] = React.useState(0);
  const [startMonth, setStartMonth] = React.useState(0);
  const [startDay, setStartDay] = React.useState(0);
  const [endYear, setEndYear] = React.useState(0);
  const [endMonth, setEndMonth] = React.useState(0);
  const [endDay, setEndDay] = React.useState(0);

  // Load version from manifest on mount
  React.useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
      const manifest = chrome.runtime.getManifest();
      setVersion(manifest.version);
    }
  }, []);

  // Load stored data on mount
  React.useEffect(() => {
    const loadStoredData = async () => {
      try {
        // Load buttons visible state from chrome.storage.local
        if (typeof chrome !== "undefined" && chrome.storage) {
          const buttonVisResult = await chrome.storage.local.get([STORAGE_KEYS.BUTTONS_VISIBLE]);
          const isButtonsVisible = buttonVisResult[STORAGE_KEYS.BUTTONS_VISIBLE];
          if (isButtonsVisible !== undefined) {
            setButtonsVisible(isButtonsVisible);
          }
        }

        // Load date range from chrome.storage.local or fallback to localStorage
        if (typeof chrome !== "undefined" && chrome.storage) {
          const result = await chrome.storage.local.get([STORAGE_KEYS.DATE_RANGE]);
          const dateRange = result[STORAGE_KEYS.DATE_RANGE];

          if (dateRange && dateRange.startYear > 0 && dateRange.endYear > 0) {
            setStartYear(dateRange.startYear);
            setStartMonth(dateRange.startMonth);
            setStartDay(dateRange.startDay);
            setEndYear(dateRange.endYear);
            setEndMonth(dateRange.endMonth);
            setEndDay(dateRange.endDay);
          } else {
            const storedDateRange = localStorage.getItem(STORAGE_KEYS.DATE_RANGE);
            if (storedDateRange) {
              const dateRange = JSON.parse(storedDateRange);
              if (dateRange.startYear > 0 && dateRange.endYear > 0) {
                setStartYear(dateRange.startYear);
                setStartMonth(dateRange.startMonth);
                setStartDay(dateRange.startDay);
                setEndYear(dateRange.endYear);
                setEndMonth(dateRange.endMonth);
                setEndDay(dateRange.endDay);
                chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
              }
            }
          }

          // Load completed dates (handle migration from old string[] format)
          chrome.storage.local.get([STORAGE_KEYS.COMPLETED_DATES], (result) => {
            const dates = result[STORAGE_KEYS.COMPLETED_DATES] || [];
            if (Array.isArray(dates) && dates.length > 0) {
              // Migrate old format (string[]) to new format (Array<{date, completedAt}>)
              const migratedDates = dates.map((item: any) => {
                if (typeof item === 'string') {
                  // Old format: just a date string
                  return {
                    date: item,
                    completedAt: new Date().toISOString() // Use current time as fallback
                  };
                }
                // New format: already an object
                return item;
              });
              setCompletedDates(migratedDates);
              // Save migrated format back to storage
              chrome.storage.local.set({ [STORAGE_KEYS.COMPLETED_DATES]: migratedDates });
            }
          });
        } else {
          const storedDateRange = localStorage.getItem(STORAGE_KEYS.DATE_RANGE);
          if (storedDateRange) {
            const dateRange = JSON.parse(storedDateRange);
            if (dateRange.startYear > 0 && dateRange.endYear > 0) {
              setStartYear(dateRange.startYear);
              setStartMonth(dateRange.startMonth);
              setStartDay(dateRange.startDay);
              setEndYear(dateRange.endYear);
              setEndMonth(dateRange.endMonth);
              setEndDay(dateRange.endDay);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load stored data:", error);
      }
    };

    loadStoredData();
  }, []);

  // Listen for completed dates updates
  React.useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === "local" && changes[STORAGE_KEYS.COMPLETED_DATES]) {
        const dates = changes[STORAGE_KEYS.COMPLETED_DATES].newValue || [];
        if (Array.isArray(dates)) {
          // Migrate old format if needed
          const migratedDates = dates.map((item: any) => {
            if (typeof item === 'string') {
              return {
                date: item,
                completedAt: new Date().toISOString()
              };
            }
            return item;
          });
          setCompletedDates(migratedDates);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  // Auto-save date range when it changes (debounced)
  React.useEffect(() => {
    const timer = setTimeout(() => {
      // Only save if at least start date is configured (not all zeros)
      // This prevents saving invalid date range on initial mount
      if (startYear > 0 || startMonth > 0 || startDay > 0 || endYear > 0 || endMonth > 0 || endDay > 0) {
        const dateRange = {
          startYear,
          startMonth,
          startDay,
          endYear,
          endMonth,
          endDay,
        };

        localStorage.setItem(STORAGE_KEYS.DATE_RANGE, JSON.stringify(dateRange));

        if (typeof chrome !== "undefined" && chrome.storage) {
          // Clear extracted data when starting with a new date configuration
          chrome.storage.local.set({
            [STORAGE_KEYS.DATE_RANGE]: dateRange,
            [STORAGE_KEYS.EXTRACTED_DATA]: []
          });
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [startYear, startMonth, startDay, endYear, endMonth, endDay]);

  const clearAllData = async () => {
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });

      if (typeof chrome !== "undefined" && chrome.storage) {
        await chrome.storage.local.clear();
      }

      // Reset dates to empty
      setStartYear(0);
      setStartMonth(0);
      setStartDay(0);
      setEndYear(0);
      setEndMonth(0);
      setEndDay(0);

      // Reset completed dates
      setCompletedDates([]);

      toast.success("All data cleared successfully");
    } catch (error) {
      console.error("Failed to clear data:", error);
      toast.error("Failed to clear all data");
    }
  };

  const handleToggleButtons = async () => {
    try {
      const newVisibility = !buttonsVisible;
      setButtonsVisible(newVisibility);

      // Save to chrome.storage.local
      if (typeof chrome !== "undefined" && chrome.storage) {
        await chrome.storage.local.set({ [STORAGE_KEYS.BUTTONS_VISIBLE]: newVisibility });
      }

      // Send message to content script to update button visibility
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "TOGGLE_BUTTONS_VISIBILITY",
            visible: newVisibility,
          });
        }
      });

      toast.success(newVisibility ? "버튼이 표시됩니다" : "버튼이 숨겨집니다");
    } catch (error) {
      console.error("Failed to toggle buttons:", error);
      toast.error("Failed to toggle buttons visibility");
    }
  };

  const handleRefetch = async () => {
    if (isRefetching) return;

    setIsRefetching(true);
    const loadingToast = toast.loading("Refreshing...");

    try {
      // Refresh completed dates
      if (typeof chrome !== "undefined" && chrome.storage) {
        const result = await chrome.storage.local.get([STORAGE_KEYS.COMPLETED_DATES]);
        const dates = result[STORAGE_KEYS.COMPLETED_DATES] || [];
        if (Array.isArray(dates)) {
          // Migrate old format if needed
          const migratedDates = dates.map((item: any) => {
            if (typeof item === 'string') {
              return {
                date: item,
                completedAt: new Date().toISOString()
              };
            }
            return item;
          });
          setCompletedDates(migratedDates);
        }
      }

      toast.dismiss(loadingToast);
      toast.success("Data refreshed!");
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(`Failed to refetch: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsRefetching(false);
    }
  };

  const setToday = () => {
    const now = new Date();
    const dateRange = {
      startYear: now.getFullYear(),
      startMonth: now.getMonth() + 1,
      startDay: now.getDate(),
      endYear: now.getFullYear(),
      endMonth: now.getMonth() + 1,
      endDay: now.getDate(),
    };

    setStartYear(dateRange.startYear);
    setStartMonth(dateRange.startMonth);
    setStartDay(dateRange.startDay);
    setEndYear(dateRange.endYear);
    setEndMonth(dateRange.endMonth);
    setEndDay(dateRange.endDay);

    // Immediately save to storage
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
    }

    toast.success("Date set to today");
  };

  const setYesterday = () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateRange = {
      startYear: yesterday.getFullYear(),
      startMonth: yesterday.getMonth() + 1,
      startDay: yesterday.getDate(),
      endYear: yesterday.getFullYear(),
      endMonth: yesterday.getMonth() + 1,
      endDay: yesterday.getDate(),
    };

    setStartYear(dateRange.startYear);
    setStartMonth(dateRange.startMonth);
    setStartDay(dateRange.startDay);
    setEndYear(dateRange.endYear);
    setEndMonth(dateRange.endMonth);
    setEndDay(dateRange.endDay);

    // Immediately save to storage
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
    }

    toast.success("Date set to yesterday");
  };

  const setLast7Days = () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateRange = {
      startYear: sevenDaysAgo.getFullYear(),
      startMonth: sevenDaysAgo.getMonth() + 1,
      startDay: sevenDaysAgo.getDate(),
      endYear: now.getFullYear(),
      endMonth: now.getMonth() + 1,
      endDay: now.getDate(),
    };

    setStartYear(dateRange.startYear);
    setStartMonth(dateRange.startMonth);
    setStartDay(dateRange.startDay);
    setEndYear(dateRange.endYear);
    setEndMonth(dateRange.endMonth);
    setEndDay(dateRange.endDay);

    // Immediately save to storage
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
    }

    toast.success("Date set to last 7 days");
  };

  const setLast30Days = () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dateRange = {
      startYear: thirtyDaysAgo.getFullYear(),
      startMonth: thirtyDaysAgo.getMonth() + 1,
      startDay: thirtyDaysAgo.getDate(),
      endYear: now.getFullYear(),
      endMonth: now.getMonth() + 1,
      endDay: now.getDate(),
    };

    setStartYear(dateRange.startYear);
    setStartMonth(dateRange.startMonth);
    setStartDay(dateRange.startDay);
    setEndYear(dateRange.endYear);
    setEndMonth(dateRange.endMonth);
    setEndDay(dateRange.endDay);

    // Immediately save to storage
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
    }

    toast.success("Date set to last 30 days");
  };

  const handleStartWorkflow = async () => {
    try {
      // Check if dates are configured
      const areDatesConfigured = (
        startYear > 0 &&
        startMonth > 0 &&
        startMonth <= 12 &&
        startDay > 0 &&
        startDay <= 31 &&
        endYear > 0 &&
        endMonth > 0 &&
        endMonth <= 12 &&
        endDay > 0 &&
        endDay <= 31
      );

      if (!areDatesConfigured) {
        toast.error("Please configure dates first");
        return;
      }

      // Un-pause workflow and open reports download page
      chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_PAUSED]: false });

      // Open reports download page in new tab
      if (typeof chrome !== "undefined" && chrome.tabs) {
        await chrome.tabs.create({ url: NAVER_SEARCHAD_REPORTS_DOWNLOAD_URL });
        toast.success("Opening reports download page...");
      }
    } catch (error) {
      console.error("Failed to start workflow:", error);
      toast.error("Failed to start workflow");
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("Clipboard is empty");
        return;
      }

      // Try to extract dates from pasted text
      const lines = text.split("\n").filter(line => line.trim());
      if (lines.length > 0) {
        const parts = lines[0].trim().split(/\s{2,}|\t+/);
        const startDateStr = parts[2]?.trim();
        const endDateStr = parts[3]?.trim();

        // Parse dates and update date range state
        if (startDateStr && endDateStr) {
          try {
            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);

            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
              setStartYear(startDate.getFullYear());
              setStartMonth(startDate.getMonth() + 1);
              setStartDay(startDate.getDate());
              setEndYear(endDate.getFullYear());
              setEndMonth(endDate.getMonth() + 1);
              setEndDay(endDate.getDate());
              toast.success("Dates extracted from clipboard");
            }
          } catch (e) {
            console.error("Failed to parse dates from clipboard:", e);
          }
        }
      }
    } catch (error) {
      console.error("Failed to read clipboard:", error);
      toast.error("Failed to paste from clipboard. Please grant clipboard permissions.");
    }
  };

  return (
    <div className="bg-white" style={{ width: POPUP_WIDTH, height: "300px" }}>
      <Toaster duration={1500} position="top-center" />
      <div className="flex flex-col p-4 space-y-4 overflow-y-auto">
        {isSettingsView ? (
          <SettingsView
            startYear={startYear}
            startMonth={startMonth}
            startDay={startDay}
            endYear={endYear}
            endMonth={endMonth}
            endDay={endDay}
            isLoading={isLoading}
            buttonsVisible={buttonsVisible}
            onStartYearChange={setStartYear}
            onStartMonthChange={setStartMonth}
            onStartDayChange={setStartDay}
            onEndYearChange={setEndYear}
            onEndMonthChange={setEndMonth}
            onEndDayChange={setEndDay}
            onSetToday={setToday}
            onSetYesterday={setYesterday}
            onSetLast7Days={setLast7Days}
            onSetLast30Days={setLast30Days}
            onClearAllData={clearAllData}
            onBack={() => setIsSettingsView(false)}
            onToggleButtons={handleToggleButtons}
          />
        ) : (
          <YTStudioList
            version={version}
            isLoading={isLoading}
            isRefetching={isRefetching}
            onRefetch={handleRefetch}
            onOpenSettings={() => setIsSettingsView(true)}
            onStartWorkflow={handleStartWorkflow}
            onPasteFromClipboard={handlePasteFromClipboard}
            onClearAllData={clearAllData}
            startYear={startYear}
            startMonth={startMonth}
            startDay={startDay}
            endYear={endYear}
            endMonth={endMonth}
            endDay={endDay}
            onStartYearChange={setStartYear}
            onStartMonthChange={setStartMonth}
            onStartDayChange={setStartDay}
            onEndYearChange={setEndYear}
            onEndMonthChange={setEndMonth}
            onEndDayChange={setEndDay}
            onSetToday={setToday}
            onSetYesterday={setYesterday}
            onSetLast7Days={setLast7Days}
            onSetLast30Days={setLast30Days}
            completedDates={completedDates}
          />
        )}
      </div>
    </div>
  );
}

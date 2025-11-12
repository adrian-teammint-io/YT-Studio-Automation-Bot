"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, RefreshCw, Play, Pause, Clipboard, Trash2, PawPrintIcon } from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";
import { STORAGE_KEYS } from "../constants/storage";
import { cn } from "@/lib/utils";

interface NaverSAListProps {
  version: string;
  isLoading: boolean;
  isRefetching: boolean;
  onRefetch: () => void;
  onOpenSettings: () => void;
  onStartWorkflow?: () => void;
  onPasteFromClipboard?: () => void;
  onClearAllData?: () => void;
  startYear: number;
  startMonth: number;
  startDay: number;
  endYear: number;
  endMonth: number;
  endDay: number;
  onStartYearChange: (value: number) => void;
  onStartMonthChange: (value: number) => void;
  onStartDayChange: (value: number) => void;
  onEndYearChange: (value: number) => void;
  onEndMonthChange: (value: number) => void;
  onEndDayChange: (value: number) => void;
  onSetToday: () => void;
  onSetYesterday: () => void;
  onSetLast7Days: () => void;
  onSetLast30Days: () => void;
  completedDates?: Array<{ date: string; completedAt: string }>;
}

export function NaverSAList({
  version,
  isLoading,
  isRefetching,
  onRefetch,
  onOpenSettings,
  onStartWorkflow,
  onPasteFromClipboard,
  onClearAllData,
  startYear,
  startMonth,
  startDay,
  endYear,
  endMonth,
  endDay,
  onStartYearChange,
  onStartMonthChange,
  onStartDayChange,
  onEndYearChange,
  onEndMonthChange,
  onEndDayChange,
  onSetToday,
  onSetYesterday,
  onSetLast7Days,
  onSetLast30Days,
  completedDates = [],
}: NaverSAListProps) {
  const [isWorkflowPaused, setIsWorkflowPaused] = React.useState(true);

  // Check if dates are configured (valid non-zero values)
  const areDatesConfigured = React.useMemo(() => {
    // Consider dates configured if all values are valid (non-zero and within reasonable ranges)
    return (
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
  }, [startYear, startMonth, startDay, endYear, endMonth, endDay]);

  // Load workflow state from chrome storage on mount
  React.useEffect(() => {
    chrome.storage.local.get([STORAGE_KEYS.WORKFLOW_PAUSED], (result) => {
      setIsWorkflowPaused(result[STORAGE_KEYS.WORKFLOW_PAUSED] !== false);
    });
  }, []);

  // Listen for storage changes
  React.useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === "local" && changes[STORAGE_KEYS.WORKFLOW_PAUSED]) {
        setIsWorkflowPaused(changes[STORAGE_KEYS.WORKFLOW_PAUSED].newValue !== false);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  // Keep workflow paused when dates are configured (button should show Resume)
  // Don't auto-unpause - let user click Resume button to start

  const handleStartPauseClick = () => {
    if (isWorkflowPaused && onStartWorkflow) {
      // Start workflow
      onStartWorkflow();
      setIsWorkflowPaused(false);
      chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_PAUSED]: false });
    } else {
      // Pause workflow
      setIsWorkflowPaused(true);
      chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_PAUSED]: true });
    }
  };

  // Button should be enabled if paused OR if dates are configured
  const isButtonEnabled = isWorkflowPaused || areDatesConfigured;

  return (
    <>

      <div className="flex items-start justify-between">
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-foreground">
              NaverSA 자동화 봇
            </h2>
            {version && (
              <>
                <Badge variant="outline" className="border-2 border-black font-semibold">
                  <PawPrintIcon className="size-7" color="#f72585" />v{version}
                </Badge>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("https://docs.google.com/spreadsheets/d/10L5kkL9--JeQl7gkZu95S1sxELb6bu323vhjlgv9JJU/edit?gid=1715170512#gid=1715170512", "_blank")}
            title="Open Google Sheets"
          >
            <img src="/google-sheets-icon.png" alt="Google Sheets" className="size-6" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onPasteFromClipboard}
            title="Paste from clipboard"
          >
            <Clipboard className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onClearAllData}
            title="Clear all data"
            className="hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefetch}
            disabled={isRefetching}
            title="Refetch"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Date Configuration */}
      <DateRangePicker
        startYear={startYear}
        startMonth={startMonth}
        startDay={startDay}
        endYear={endYear}
        endMonth={endMonth}
        endDay={endDay}
        onStartYearChange={onStartYearChange}
        onStartMonthChange={onStartMonthChange}
        onStartDayChange={onStartDayChange}
        onEndYearChange={onEndYearChange}
        onEndMonthChange={onEndMonthChange}
        onEndDayChange={onEndDayChange}
        onSetToday={onSetToday}
        onSetYesterday={onSetYesterday}
        onSetLast7Days={onSetLast7Days}
        onSetLast30Days={onSetLast30Days}
        isLoading={isLoading}
      />

      {/* Completed Dates List */}
      {completedDates.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-[#04e762] text-sm px-1">
              완료된 날짜 ({completedDates.length})
            </h3>
          </div>
          <div className="space-y-1 px-1">
            {completedDates
              .sort((a, b) => {
                // Sort by completion time (most recent first)
                return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
              })
              .map((item) => {
                const completedDate = new Date(item.completedAt);
                const timeStr = completedDate.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                });

                return (
                  <div
                    key={item.date}
                    className="flex items-center justify-between py-1 px-2 border-b border-green-200 last:border-b-0"
                  >
                    <span className="font-mono text-sm text-green-700">{item.date}</span>
                    <span className="text-xs text-green-600">{timeStr}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Start/Pause Button */}
      <div className="flex justify-center w-full items-center gap-3">
        <div className="bg-black w-full h-[2px]" />
        <Button
          onClick={handleStartPauseClick}
          disabled={!isButtonEnabled}
          className={cn(
            "w-[100px] h-12 px-4 border-black border-2 text-base font-semibold !cursor-pointer",
            "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-150",
            "hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[-2px] hover:translate-y-[-2px]",
            "active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px]",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)]",
            "disabled:hover:translate-x-0 disabled:hover:translate-y-0",
            isWorkflowPaused ? "bg-[#89fc00] hover:bg-[#9dff1a]" : "bg-[#ff2c55] hover:bg-[#ff4066]"
          )}
        >
          {isWorkflowPaused ? (
            <Play className="size-5 text-black fill-black" />
          ) : (
            <Pause className="size-5 text-black fill-black" />
          )}
        </Button>
        <div className="bg-black w-full h-[2px]" />
      </div>
    </>
  );
}

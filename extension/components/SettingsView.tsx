"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Trash2, Eye, EyeOff } from "lucide-react";
import { DateRangePicker } from "./DateRangePicker";

interface SettingsViewProps {
  startYear: number;
  startMonth: number;
  startDay: number;
  endYear: number;
  endMonth: number;
  endDay: number;
  isLoading: boolean;
  buttonsVisible: boolean;
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
  onClearAllData: () => void;
  onBack: () => void;
  onToggleButtons: () => void;
}

export function SettingsView({
  startYear,
  startMonth,
  startDay,
  endYear,
  endMonth,
  endDay,
  isLoading,
  buttonsVisible,
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
  onClearAllData,
  onBack,
  onToggleButtons,
}: SettingsViewProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ChevronLeft className="size-5" />
          </Button>
          <h2 className="text-2xl font-semibold text-foreground">설정</h2>
        </div>
        <Button
          onClick={onClearAllData}
          disabled={isLoading}
          variant="destructive"
          className="w-fit shadow-brutal-button rounded-none"
          size="sm"
        >
          <Trash2 className="size-4" />
          Clear All Data
        </Button>
      </div>


      {/* Date Range Input */}
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


      {/* Button Visibility Toggle */}
      <div className="space-y-2 gap-4">
        <div className="font-bold text-xl text-foreground">
          버튼 표시 제어
        </div>
        <Button
          onClick={onToggleButtons}
          disabled={isLoading}
          variant="outline"
          className="w-full shadow-brutal-button rounded-none flex items-center gap-2"
        >
          {buttonsVisible ? (
            <>
              <EyeOff className="size-4" />
              <span>버튼 숨기기</span>
            </>
          ) : (
            <>
              <Eye className="size-4" />
              <span>버튼 표시</span>
            </>
          )}
        </Button>
      </div>

    </>
  );
}

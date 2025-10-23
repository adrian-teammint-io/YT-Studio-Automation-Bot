"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface DateRangePickerProps {
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
  isLoading?: boolean;
}

export function DateRangePicker({
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
  isLoading = false,
}: DateRangePickerProps) {
  return (
    <div className="space-y-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-bold text-xl text-foreground">
          2. Date Range
        </label>
        <div className="flex gap-2">
          <Button
            onClick={onSetToday}
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="shadow-brutal-button rounded-none"
          >
            Today
          </Button>
          <Button
            onClick={onSetYesterday}
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="shadow-brutal-button rounded-none"
          >
            Yesterday
          </Button>
          <Button
            onClick={onSetLast7Days}
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="shadow-brutal-button rounded-none"
          >
            Last 7 days
          </Button>
          <Button
            onClick={onSetLast30Days}
            variant="outline"
            size="sm"
            disabled={isLoading}
            className="shadow-brutal-button rounded-none"
          >
            Last 30 days
          </Button>
        </div>
      </div>

      <div className="flex gap-2 w-full justify-between px-3">
        {/* Start Date */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Start Date</label>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <input
                type="number"
                min="1"
                max="31"
                value={startDay}
                onChange={(e) => onStartDayChange(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Day"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Day</p>
            </div>
            <div className="space-y-1">
              <input
                type="number"
                min="1"
                max="12"
                value={startMonth}
                onChange={(e) => onStartMonthChange(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Month"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Month</p>
            </div>
            <div className="space-y-1">
              <input
                type="number"
                min="2020"
                max="2099"
                value={startYear}
                onChange={(e) => onStartYearChange(parseInt(e.target.value) || 2025)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Year"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Year</p>
            </div>
          </div>
        </div>

        {/* End Date */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">End Date</label>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <input
                type="number"
                min="1"
                max="31"
                value={endDay}
                onChange={(e) => onEndDayChange(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Day"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Day</p>
            </div>
            <div className="space-y-1">
              <input
                type="number"
                min="1"
                max="12"
                value={endMonth}
                onChange={(e) => onEndMonthChange(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Month"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Month</p>
            </div>
            <div className="space-y-1">
              <input
                type="number"
                min="2020"
                max="2099"
                value={endYear}
                onChange={(e) => onEndYearChange(parseInt(e.target.value) || 2025)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Year"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">Year</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

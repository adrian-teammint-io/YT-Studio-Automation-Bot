import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

interface YTAnalyticsInputProps {
  targetDate: string; // Format: "YYYY-MM-DD"
  onTargetDateChange: (date: string) => void;
  onSetToday: () => void;
  onSetYesterday: () => void;
}

export function YTAnalyticsInput({
  targetDate,
  onTargetDateChange,
  onSetToday,
  onSetYesterday,
}: YTAnalyticsInputProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          YouTube Analytics Date
        </h3>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="date"
            value={targetDate}
            onChange={(e) => {
              const newDate = e.target.value;
              onTargetDateChange(newDate);
              // Immediately save to chrome storage for instant sync
              if (typeof chrome !== "undefined" && chrome.storage) {
                chrome.storage.local.set({
                  'ytstudio_yt_analytics_target_date': newDate
                }).then(() => {
                  console.log("[YT Analytics Input] Date saved to storage:", newDate);
                });
              }
            }}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-2">
          <Button
            onClick={onSetToday}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            Today
          </Button>
          <Button
            onClick={onSetYesterday}
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
          >
            Yesterday
          </Button>
        </div>
      </div>

      {!targetDate ? (
        <div className="text-xs text-red-600 bg-red-50 border border-red-300 rounded-md p-2">
          <p className="font-semibold mb-1">⚠️ Date not configured!</p>
          <p>Please select a target date above before running the automation.</p>
        </div>
      ) : (
        <div className="text-xs text-green-700 bg-green-50 border border-green-300 rounded-md p-2">
          <p className="font-semibold mb-1">✅ Date configured: {targetDate}</p>
          <p className="mb-2 text-gray-600">Stats will be collected from the <strong>next day at ~12:10 AM</strong></p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Go to YouTube Studio Analytics page</li>
            <li>Click "Start Data Collection" button</li>
            <li>Data will be copied to clipboard</li>
          </ol>
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, XCircle, Cat, FolderOpen, Link2Icon, EyeIcon, SquareArrowUpRightIcon } from "lucide-react";
import type { Campaign, UploadStatus } from "../types/campaign";
import { getRegionBadgeColor, getTypeBadgeColor, getBadgeStyle } from "../utils/badgeColors";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

interface YTStudioItemProps {
  campaign: Campaign;
  index: number;
  currentIndex: number;
  uploadStatus?: UploadStatus;
  isCompleted: boolean;
  isLoading: boolean;
  onTriggerWorkflow: (index: number, event: React.MouseEvent) => void;
  onNavigateToGoogleDrive: (index: number, event: React.MouseEvent) => void;
}

export function YTStudioItem({
  campaign,
  index,
  currentIndex,
  uploadStatus,
  isCompleted,
  isLoading,
  onTriggerWorkflow,
  onNavigateToGoogleDrive,
}: YTStudioItemProps) {
  return (
    <div
      className={`w-full border-2 p-3 shadow-brutal-button rounded-none ${
        isCompleted
          ? "border-border bg-green-50/50"
          : index === currentIndex
          ? "border-primary bg-primary/5"
          : "border-border"
      }`}
    >
      <div className="flex flex-col gap-2">
        {/* Top Row: Campaign Info and Action Buttons */}
        <div className="flex items-center justify-between gap-3">
          {/* Campaign Info */}
          <div className="flex flex-col items-start space-y-1 flex-1 min-w-0">
            <div className="font-medium text-sm truncate w-full">
              {campaign.name}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-muted-foreground font-mono truncate">
                {campaign.id}
              </div>
              {campaign.region && (
                <Badge
                  className="text-xs border-2 border-black rounded-none h-5 px-1.5"
                  style={getBadgeStyle(getRegionBadgeColor(campaign.region))}
                >
                  {campaign.region}
                </Badge>
              )}
              {campaign.type && (
                <Badge
                  className="text-xs border-2 border-black rounded-none h-5 px-1.5"
                  style={getBadgeStyle(getTypeBadgeColor(campaign.type))}
                >
                  {campaign.type}
                </Badge>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Workflow Status Indicator */}
            {uploadStatus && uploadStatus.status !== "success" && (
              <div className="flex-shrink-0">
                {uploadStatus.status === "started" && (
                  <Loader2 className="size-5 text-blue-500 animate-spin" />
                )}
                {uploadStatus.status === "error" && (
                  <XCircle className="size-5 text-red-500" />
                )}
              </div>
            )}

            {/* Cat Icon Button - Trigger workflow (only for non-completed) */}
            {!isCompleted && (
              <Button
                onClick={(e) => onTriggerWorkflow(index, e)}
                disabled={!campaign.region || isLoading}
                variant="outline"
                size="sm"
                className="shadow-brutal-button rounded-none h-8 w-8 p-0"
                title="Start download and upload workflow"
              >
                <ExternalLinkIcon className="size-4" />
              </Button>
            )}

            {/* Google Drive Icon Button */}
            <Button
              onClick={(e) => onNavigateToGoogleDrive(index, e)}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="shadow-brutal-button rounded-none h-8 w-8 p-0"
              title="Open Google Drive folder"
            >
              <FolderOpen className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle, Cat, FolderOpen } from "lucide-react";
import type { Campaign, UploadStatus, RegionType, CampaignType } from "../types/campaign";

interface CampaignItemProps {
  campaign: Campaign;
  index: number;
  currentIndex: number;
  uploadStatus?: UploadStatus;
  selectedRegion?: RegionType;
  selectedType?: CampaignType;
  isCompleted: boolean;
  isLoading: boolean;
  onTriggerWorkflow: (index: number, event: React.MouseEvent) => void;
  onNavigateToGoogleDrive: (index: number, event: React.MouseEvent) => void;
  onRegionSelect: (campaignId: string, region: RegionType) => void;
  onTypeSelect: (campaignId: string, type: CampaignType) => void;
}

export function CampaignItem({
  campaign,
  index,
  currentIndex,
  uploadStatus,
  selectedRegion,
  selectedType,
  isCompleted,
  isLoading,
  onTriggerWorkflow,
  onNavigateToGoogleDrive,
  onRegionSelect,
  onTypeSelect,
}: CampaignItemProps) {
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
            <div className="text-xs text-muted-foreground font-mono truncate w-full">
              {campaign.id}
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
                disabled={!selectedRegion || isLoading}
                variant="outline"
                size="sm"
                className="shadow-brutal-button rounded-none h-8 w-8 p-0"
                title="Start download and upload workflow"
              >
                <Cat className="size-4" />
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

        {/* Bottom Row: Campaign Type & Region Selection Buttons */}
        <div className={`flex flex-col gap-2 ${!isCompleted ? "pt-2 border-t border-border/30" : ""}`}>
          {/* Campaign Type Buttons */}
          <div className="flex items-center gap-2">
            {(["PRODUCT", "LIVE"] as const).map((type) => {
              const isSelected = selectedType === type;
              return (
                <Button
                  key={type}
                  onClick={() => !isCompleted && onTypeSelect(campaign.id, type)}
                  variant="outline"
                  size="sm"
                  disabled={isCompleted}
                  className={`flex-1 h-7 text-xs shadow-brutal-button rounded-none transition-colors ${
                    isSelected ? "border-blue-500 bg-blue-50 text-blue-700" : ""
                  } ${isCompleted ? "cursor-not-allowed opacity-75" : ""}`}
                >
                  {type}
                </Button>
              );
            })}
          </div>

          {/* Region Selection Buttons */}
          <div className="flex items-center gap-2">
            {(["PH", "US", "ID", "MY"] as const).map((region) => {
              const isSelected = selectedRegion === region;
              return (
                <Button
                  key={region}
                  onClick={() => !isCompleted && onRegionSelect(campaign.id, region)}
                  variant="outline"
                  size="sm"
                  disabled={isCompleted}
                  className={`flex-1 h-7 max-w-[50px] text-xs shadow-brutal-button rounded-none transition-colors ${
                    isSelected ? "border-green-500 bg-green-50 text-green-700" : ""
                  } ${isCompleted ? "cursor-not-allowed opacity-75" : ""}`}
                >
                  {region}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

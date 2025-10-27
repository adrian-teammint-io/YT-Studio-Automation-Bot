"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Loader2, BadgeCheckIcon, RefreshCw, Play, Pause, Clipboard, MessageCircleQuestionIcon, Flower2Icon } from "lucide-react";
import { CampaignItem } from "./CampaignItem";
import { STORAGE_KEYS } from "../constants/storage";
import type { Campaign, UploadStatus, RegionType, CampaignType } from "../types/campaign";
import { cn } from "@/lib/utils";
import { getRegionBadgeColor, getTypeBadgeColor, getBadgeStyle } from "../utils/badgeColors";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

interface CampaignListProps {
  campaigns: Campaign[];
  currentIndex: number;
  uploadStatuses: Map<string, UploadStatus>;
  version: string;
  isLoading: boolean;
  isRefetching: boolean;
  uploadStatusInfo: { campaignName: string; status: UploadStatus; type: "uploading" } | null;
  onTriggerWorkflow: (index: number, event: React.MouseEvent) => void;
  onNavigateToGoogleDrive: (index: number, event: React.MouseEvent) => void;
  onRefetch: () => void;
  onOpenSettings: () => void;
  onStartWorkflow?: () => void;
  onPasteFromClipboard?: () => void;
}

export function CampaignList({
  campaigns,
  currentIndex,
  uploadStatuses,
  version,
  isLoading,
  isRefetching,
  uploadStatusInfo,
  onTriggerWorkflow,
  onNavigateToGoogleDrive,
  onRefetch,
  onOpenSettings,
  onStartWorkflow,
  onPasteFromClipboard,
}: CampaignListProps) {
  const [isWorkflowPaused, setIsWorkflowPaused] = React.useState(true);
  const completedCount = campaigns.filter(c => uploadStatuses.get(c.name)?.status === "success").length;

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

  const handleStartPauseClick = () => {
    if (isWorkflowPaused && onStartWorkflow) {
      // Start workflow - open first uncompleted campaign in new tab
      onStartWorkflow();
      setIsWorkflowPaused(false);
      chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_PAUSED]: false });
    } else {
      // Pause workflow
      setIsWorkflowPaused(true);
      chrome.storage.local.set({ [STORAGE_KEYS.WORKFLOW_PAUSED]: true });
    }
  };

  const hasPendingCampaigns = campaigns.length > 0 && completedCount < campaigns.length;

  return (
    <>

      <div className="flex items-start justify-between">
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-foreground">
              GMV 맥스 자동화 봇
            </h2>
            {version && (
              <Badge variant="outline">
                <BadgeCheckIcon className="size-4" />v{version}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* {campaigns.length > 0 && uploadStatusInfo && uploadStatusInfo.type === "uploading" && (
            <div className="flex items-center gap-2 px-3 py-2 border-2 rounded-none shadow-brutal-button border-blue-500 bg-blue-50" style={{ width: "150px" }}>
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              <span className="text-sm font-medium text-blue-700">
                업로드 중...
              </span>
            </div>
          )} */}

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("https://docs.google.com/spreadsheets/d/10L5kkL9--JeQl7gkZu95S1sxELb6bu323vhjlgv9JJU/edit?gid=1715170512#gid=1715170512", "_blank")}
            title="Refetch upload statuses from Google Drive"
          >
            <img src="/google-sheets-icon.png" alt="Google Drive" className="size-6" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onPasteFromClipboard}
            title="Paste campaign data from clipboard"
          >
            <Clipboard className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefetch}
            disabled={isRefetching}
            title="Refetch upload statuses from Google Drive"
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

      {/* Start/Pause Button */}
      {campaigns.length > 0 && (
        <div className="flex justify-center w-full items-center gap-3">
          <div className="bg-black w-full h-[2px]" />
          <Button
            onClick={handleStartPauseClick}
            disabled={!hasPendingCampaigns}
            className={cn("w-[100px] h-12 px-4 border-black border-2 text-base font-semibold !cursor-pointer", isWorkflowPaused ? "bg-[#89fc00]" : "bg-[#ff2c55]")}
          >
            {isWorkflowPaused ? (
              <Play className="size-5 text-black" />
            ) : (
              <Pause className="size-5 text-black" />
            )}
          </Button>
          <div className="bg-black w-full h-[2px]" />
        </div>
      )}

      {/* Campaign List */}
      {campaigns.length > 0 ? (
        <div className="flex flex-col space-y-4">
          {/* Completed Section */}
          {(() => {
            const completedCampaigns = campaigns
              .map((campaign, index) => ({ campaign, index }))
              .filter(({ campaign }) => uploadStatuses.get(campaign.name)?.status === "success");

            return completedCampaigns.length > 0 ? (
              <div className="space-y-2">
                <h3 className="font-semibold text-[#04e762] text-sm px-1">
                  완료됨 ({completedCampaigns.length})
                </h3>
                <div className="flex flex-col space-y-2">
                  {completedCampaigns.map(({ campaign, index }) => (
                    <CampaignItem
                      key={`completed-${campaign.id}-${index}`}
                      campaign={campaign}
                      index={index}
                      currentIndex={currentIndex}
                      uploadStatus={uploadStatuses.get(campaign.name)}
                      isCompleted={true}
                      isLoading={isLoading}
                      onTriggerWorkflow={onTriggerWorkflow}
                      onNavigateToGoogleDrive={onNavigateToGoogleDrive}
                    />
                  ))}
                </div>
              </div>
            ) : null;
          })()}

          {/* All Section */}
          {(() => {
            const allCampaigns = campaigns
              .map((campaign, index) => ({ campaign, index }))
              .filter(({ campaign }) => uploadStatuses.get(campaign.name)?.status !== "success");

            return (
              <div className="space-y-2">
                <h3 className="font-semibold text-[#008bf8] text-sm px-1">
                  전체 ({allCampaigns.length})
                </h3>

                {allCampaigns.length > 0 && (() => {
                  // Extract unique regions and types
                  const regions = new Set<RegionType>();
                  const types = new Set<CampaignType>();
                  let earliestDate: string | null = null;
                  let latestDate: string | null = null;

                  allCampaigns.forEach(({ campaign }) => {
                    if (campaign.region) regions.add(campaign.region);
                    if (campaign.type) types.add(campaign.type);

                    if (campaign.startDate) {
                      if (!earliestDate || campaign.startDate < earliestDate) {
                        earliestDate = campaign.startDate;
                      }
                    }
                    if (campaign.endDate) {
                      if (!latestDate || campaign.endDate > latestDate) {
                        latestDate = campaign.endDate;
                      }
                    }
                  });

                  return (
                    <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
                      <Flower2Icon color="red" className="size-6" />
                      {/* Date Range */}
                      {earliestDate && latestDate && (
                        <div className="flex items-center gap-1">
                          <Badge className="font-medium">{earliestDate}</Badge>
                          <span>→</span>
                          <Badge className="font-medium">{latestDate}</Badge>
                        </div>
                      )}

                      {/* Regions */}
                      {Array.from(regions).sort().map((region) => {
                        const bgColor = getRegionBadgeColor(region);
                        const style = getBadgeStyle(bgColor);
                        return (
                          <Badge
                            key={region}
                            variant="outline"
                            className="border-2 border-black font-semibold"
                            style={style}
                          >
                            {region}
                          </Badge>
                        );
                      })}

                      {/* Types */}
                      {Array.from(types).sort().map((type) => {
                        const bgColor = getTypeBadgeColor(type);
                        const style = getBadgeStyle(bgColor);
                        return (
                          <Badge
                            key={type}
                            variant="outline"
                            className="border-2 border-black font-semibold"
                            style={style}
                          >
                            {type}
                          </Badge>
                        );
                      })}
                    </div>
                  );
                })()}

                {allCampaigns.length > 0 ? (
                  <div className="flex flex-col space-y-2">
                    {allCampaigns.map(({ campaign, index }) => (
                      <CampaignItem
                        key={`all-${campaign.id}-${index}`}
                        campaign={campaign}
                        index={index}
                        currentIndex={currentIndex}
                        uploadStatus={uploadStatuses.get(campaign.name)}
                        isCompleted={false}
                        isLoading={isLoading}
                        onTriggerWorkflow={onTriggerWorkflow}
                        onNavigateToGoogleDrive={onNavigateToGoogleDrive}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    모든 캠페인이 완료되었습니다
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="py-12 text-center">
          <Button onClick={onOpenSettings} variant="default">
            <Settings className="mr-2 h-4 w-4" />
            캠페인 설정
          </Button>
        </div>
      )}
    </>
  );
}

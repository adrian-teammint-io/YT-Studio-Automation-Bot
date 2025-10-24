"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, Loader2, BadgeCheckIcon, RefreshCw } from "lucide-react";
import { CampaignItem } from "./CampaignItem";
import type { Campaign, UploadStatus, RegionType, CampaignType } from "../types/campaign";

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
}: CampaignListProps) {
  const completedCount = campaigns.filter(c => uploadStatuses.get(c.name)?.status === "success").length;

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
          <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
            <span>총 {campaigns.length}개의 캠페인이 가능합니다</span>
            {campaigns.length > 0 && (
              <span className="px-1.5 py-0.5 border rounded-sm">
                {completedCount}/{campaigns.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaigns.length > 0 && uploadStatusInfo && uploadStatusInfo.type === "uploading" && (
            <div className="flex items-center gap-2 px-3 py-2 border-2 rounded-none shadow-brutal-button border-blue-500 bg-blue-50" style={{ width: "150px" }}>
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
              <span className="text-sm font-medium text-blue-700">
                업로드 중...
              </span>
            </div>
          )}
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
                <h3 className="font-semibold text-sm text-foreground px-1">
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
                <h3 className="font-semibold text-sm text-foreground px-1">
                  전체 ({allCampaigns.length})
                </h3>
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

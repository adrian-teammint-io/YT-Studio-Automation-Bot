"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { POPUP_WIDTH } from "./constants/ui";
import { ChevronLeft, Settings, Trash2, Loader2, CheckCircle2, XCircle, Cat, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { detectRegionFromCampaign } from "./utils/region-detector";

/**
 * Campaign Navigator popup component for Chrome extension.
 * Features:
 * - Campaign name + ID management with localStorage
 * - Base URL configuration with campaign_id replacement
 * - Direct navigation to any campaign
 * - View-based settings (Settings button replaces view)
 * - Display campaigns in flex column format with name and ID
 */

interface Campaign {
  name: string;
  id: string;
  region?: "PH" | "US" | "ID" | "MY";
}

interface UploadStatus {
  status: "started" | "success" | "error";
  campaignName: string;
  fileName?: string;
  error?: string;
}

const STORAGE_KEYS = {
  CAMPAIGN_DATA: "gmv_max_campaign_data",
  BASE_URL: "gmv_max_base_url",
  CURRENT_INDEX: "gmv_max_current_index",
  COMPLETED_CAMPAIGNS: "gmv_max_completed_campaigns",
  AUTO_CLICK_ENABLED: "gmv_max_auto_click_enabled",
  LAST_UPLOAD_STATUS: "lastUploadStatus",
  UPLOAD_SUCCESS_STATUS: "gmv_max_upload_success_status", // Persistent upload success tracking
  CAMPAIGN_REGIONS: "gmv_max_campaign_regions", // Store region selections per campaign
};

export default function URLReplacerPopup() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [campaignDataText, setCampaignDataText] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [isSettingsView, setIsSettingsView] = React.useState(false);
  const [completedCampaigns, setCompletedCampaigns] = React.useState<Set<number>>(new Set());
  const [autoClickEnabled, setAutoClickEnabled] = React.useState(true);
  const [uploadStatuses, setUploadStatuses] = React.useState<Map<string, UploadStatus>>(new Map());
  const activeToastsRef = React.useRef<Map<string, string | number>>(new Map());
  const [lastSavedCampaignData, setLastSavedCampaignData] = React.useState("");
  const [lastSavedBaseUrl, setLastSavedBaseUrl] = React.useState("");
  const [campaignRegions, setCampaignRegions] = React.useState<Map<string, "PH" | "US" | "ID" | "MY">>(new Map());

  // Check if base URL contains required date parameters
  const hasRequiredDateParams = React.useMemo(() => {
    if (!baseUrl.trim()) return false;
    try {
      const url = new URL(baseUrl);
      const hasStartDate = url.searchParams.has("campaign_start_date");
      const hasEndDate = url.searchParams.has("campaign_end_date");
      return hasStartDate && hasEndDate;
    } catch {
      return false;
    }
  }, [baseUrl]);

  // Check if base URL starts with the correct product dashboard path
  const hasValidProductUrl = React.useMemo(() => {
    if (!baseUrl.trim()) return false;
    const requiredBasePath = "https://ads.tiktok.com/i18n/gmv-max/dashboard/product";
    return baseUrl.startsWith(requiredBasePath);
  }, [baseUrl]);

  // Load stored data on mount
  React.useEffect(() => {
    const loadStoredData = () => {
      try {
        const storedCampaignData = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_DATA);
        const storedBaseUrl = localStorage.getItem(STORAGE_KEYS.BASE_URL);
        const storedIndex = localStorage.getItem(STORAGE_KEYS.CURRENT_INDEX);
        const storedCompletedCampaigns = localStorage.getItem(STORAGE_KEYS.COMPLETED_CAMPAIGNS);

        if (storedCampaignData) {
          const data = JSON.parse(storedCampaignData);
          setCampaigns(data);
          setCampaignDataText(data.map((c: Campaign) => `${c.name}    ${c.id}`).join("\n"));
        }

        if (storedBaseUrl) {
          setBaseUrl(storedBaseUrl);
        }

        if (storedIndex) {
          setCurrentIndex(parseInt(storedIndex, 10));
        }

        if (storedCompletedCampaigns) {
          const completedIndices = JSON.parse(storedCompletedCampaigns);
          setCompletedCampaigns(new Set(completedIndices));
        }

        const storedAutoClick = localStorage.getItem(STORAGE_KEYS.AUTO_CLICK_ENABLED);
        if (storedAutoClick !== null) {
          setAutoClickEnabled(storedAutoClick === "true");
        }

        // Load persisted upload success statuses
        const storedUploadSuccessStatus = localStorage.getItem(STORAGE_KEYS.UPLOAD_SUCCESS_STATUS);
        if (storedUploadSuccessStatus) {
          const successStatuses = JSON.parse(storedUploadSuccessStatus);
          const statusMap = new Map<string, UploadStatus>();

          // Convert stored object to Map
          Object.entries(successStatuses).forEach(([campaignName, status]) => {
            statusMap.set(campaignName, status as UploadStatus);
          });

          setUploadStatuses(statusMap);
        }

        // Load persisted region selections
        const storedRegions = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_REGIONS);
        if (storedRegions) {
          const regions = JSON.parse(storedRegions);
          const regionsMap = new Map<string, "PH" | "US" | "ID" | "MY">();

          Object.entries(regions).forEach(([campaignId, region]) => {
            regionsMap.set(campaignId, region as "PH" | "US" | "ID" | "MY");
          });

          setCampaignRegions(regionsMap);
        }
      } catch (error) {
        console.error("Failed to load stored data:", error);
      }
    };

    loadStoredData();
  }, []);

  // Listen for upload status updates from background script
  React.useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === "local" && changes[STORAGE_KEYS.LAST_UPLOAD_STATUS]) {
        const statusMessage = changes[STORAGE_KEYS.LAST_UPLOAD_STATUS].newValue as UploadStatus;

        if (statusMessage) {
          // Update upload statuses map
          setUploadStatuses((prev) => {
            const newMap = new Map(prev);
            newMap.set(statusMessage.campaignName, statusMessage);

            // Persist success status to localStorage
            if (statusMessage.status === "success") {
              const storedSuccessStatuses = localStorage.getItem(STORAGE_KEYS.UPLOAD_SUCCESS_STATUS);
              const successStatuses = storedSuccessStatuses ? JSON.parse(storedSuccessStatuses) : {};

              // Store the success status permanently
              successStatuses[statusMessage.campaignName] = statusMessage;
              localStorage.setItem(STORAGE_KEYS.UPLOAD_SUCCESS_STATUS, JSON.stringify(successStatuses));
            }

            return newMap;
          });

          // Show toast notifications
          if (statusMessage.status === "success") {
            // Dismiss loading toast if it exists
            const loadingToastId = activeToastsRef.current.get(statusMessage.campaignName);
            if (loadingToastId) {
              toast.dismiss(loadingToastId);
              activeToastsRef.current.delete(statusMessage.campaignName);
            }
            toast.success("업로드 완료!");
          } else if (statusMessage.status === "error") {
            // Dismiss loading toast if it exists
            const loadingToastId = activeToastsRef.current.get(statusMessage.campaignName);
            if (loadingToastId) {
              toast.dismiss(loadingToastId);
              activeToastsRef.current.delete(statusMessage.campaignName);
            }
            toast.error(`Upload failed: ${statusMessage.error || "Unknown error"}`);
          } else if (statusMessage.status === "started") {
            // Store the loading toast ID
            const toastId = toast.loading(`Uploading to Google Drive...`);
            activeToastsRef.current.set(statusMessage.campaignName, toastId);
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // Load initial upload status
    chrome.storage.local.get([STORAGE_KEYS.LAST_UPLOAD_STATUS], (result) => {
      if (result[STORAGE_KEYS.LAST_UPLOAD_STATUS]) {
        const statusMessage = result[STORAGE_KEYS.LAST_UPLOAD_STATUS] as UploadStatus;
        setUploadStatuses((prev) => {
          const newMap = new Map(prev);
          newMap.set(statusMessage.campaignName, statusMessage);
          return newMap;
        });
      }
    });

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  /**
   * Auto-save campaign data when it changes (debounced)
   */
  React.useEffect(() => {
    if (!campaignDataText.trim()) return;

    const timer = setTimeout(() => {
      saveCampaignData(true); // Pass true for silent save
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [campaignDataText]);

  /**
   * Auto-save base URL when it changes (debounced)
   */
  React.useEffect(() => {
    if (!baseUrl.trim()) return;

    const timer = setTimeout(() => {
      saveBaseUrl(true); // Pass true for silent save
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [baseUrl]);

  /**
   * Auto-save when navigating back to main page
   */
  React.useEffect(() => {
    if (!isSettingsView) {
      // Save both when navigating back
      if (campaignDataText.trim()) {
        saveCampaignData(true);
      }
      if (baseUrl.trim()) {
        saveBaseUrl(true);
      }
    }
  }, [isSettingsView]);

  /**
   * Parse and save campaign data from textarea
   * Format: "name    id" (one per line)
   * Preserves the exact order from input
   */
  const saveCampaignData = (silent = false) => {
    try {
      // Parse campaign data from textarea (split by newlines, extract name and id)
      // Filter empty lines first to preserve order of non-empty entries
      const parsedCampaigns = campaignDataText
        .split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => {
          // Split by multiple spaces/tabs to separate name and id
          const parts = line.trim().split(/\s{2,}|\t+/);
          if (parts.length >= 2) {
            return {
              name: parts[0].trim(),
              id: parts[parts.length - 1].trim(),
            };
          }
          return null;
        })
        .filter((c): c is Campaign => c !== null);

      setCampaigns(parsedCampaigns);

      // Save to localStorage for popup state
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_DATA, JSON.stringify(parsedCampaigns));

      // Save to chrome.storage.local to trigger content script updates
      chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_DATA]: parsedCampaigns });

      // Reset index when saving new campaign data
      setCurrentIndex(0);
      localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, "0");
      chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_INDEX]: "0" });

      // Update last saved state for UI indicator
      setLastSavedCampaignData(campaignDataText);

      // Show success toast only if not silent
      if (!silent) {
        toast.success(`Campaign data saved (${parsedCampaigns.length} campaigns)`);
      }

      // setIsSettingsView(false);
    } catch (error) {
      console.error("Failed to save campaign data:", error);
      toast.error("Failed to save campaign data");
    }
  };

  /**
   * Save base URL to localStorage and chrome.storage.local
   */
  const saveBaseUrl = (silent = false) => {
    try {
      // Save to localStorage for popup state
      localStorage.setItem(STORAGE_KEYS.BASE_URL, baseUrl);

      // Save to chrome.storage.local to trigger content script updates
      chrome.storage.local.set({ [STORAGE_KEYS.BASE_URL]: baseUrl });

      // Update last saved state for UI indicator
      setLastSavedBaseUrl(baseUrl);

      // Show success toast only if not silent
      if (!silent) {
        toast.success("Base URL saved successfully");
        setIsSettingsView(false);
      }
    } catch (error) {
      console.error("Failed to save base URL:", error);
      toast.error("Failed to save base URL");
    }
  };

  /**
   * Toggle auto-click feature on/off
   */
  const toggleAutoClick = () => {
    try {
      const newValue = !autoClickEnabled;
      setAutoClickEnabled(newValue);
      localStorage.setItem(STORAGE_KEYS.AUTO_CLICK_ENABLED, newValue.toString());
      toast.success(newValue ? "Auto-click enabled" : "Auto-click disabled");
    } catch (error) {
      console.error("Failed to toggle auto-click:", error);
      toast.error("Failed to update auto-click setting");
    }
  };

  /**
   * Clear all data from localStorage and chrome.storage.local, then reset state
   */
  const clearAllData = async () => {
    try {
      // Clear all localStorage items
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });

      // Clear chrome.storage.local items
      if (typeof chrome !== "undefined" && chrome.storage) {
        await chrome.storage.local.clear();
      }

      // Reset all state
      setCampaignDataText("");
      setBaseUrl("");
      setCampaigns([]);
      setCurrentIndex(0);
      setCompletedCampaigns(new Set());
      setAutoClickEnabled(true);
      setUploadStatuses(new Map());

      toast.success("All data cleared successfully");
    } catch (error) {
      console.error("Failed to clear data:", error);
      toast.error("Failed to clear all data");
    }
  };

  /**
   * Handle region selection for a campaign
   */
  const handleRegionSelect = (campaignId: string, region: "PH" | "US" | "ID" | "MY") => {
    setCampaignRegions((prev) => {
      const newMap = new Map(prev);
      newMap.set(campaignId, region);

      // Persist to localStorage
      const regionsObj: Record<string, string> = {};
      newMap.forEach((value, key) => {
        regionsObj[key] = value;
      });
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_REGIONS, JSON.stringify(regionsObj));

      return newMap;
    });
  };

  /**
   * Navigate to Google Drive folder for a specific campaign
   */
  const navigateToGoogleDrive = async (index: number, event: React.MouseEvent) => {
    event.stopPropagation();

    if (campaigns.length === 0) {
      console.error("No campaigns available");
      toast.error("No campaigns available");
      return;
    }

    setIsLoading(true);

    try {
      // Get campaign at the specified index
      const campaign = campaigns[index];

      // Detect region from campaign name
      const regionInfo = detectRegionFromCampaign(campaign.name);
      if (!regionInfo) {
        toast.error(`Could not detect region from campaign name: ${campaign.name}`);
        setIsLoading(false);
        return;
      }

      // Construct Google Drive folder URL
      // Campaign folders are created inside the parent folder, so we navigate to the parent
      const googleDriveFolderUrl = `https://drive.google.com/drive/folders/${regionInfo.folderId}`;

      if (typeof chrome !== "undefined" && chrome.tabs) {
        // Open Google Drive folder in a new tab
        await chrome.tabs.create({ url: googleDriveFolderUrl });

        // Update current index
        setCurrentIndex(index);
        localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, index.toString());

        // Show success toast
        toast.success(`Opening Google Drive folder for ${regionInfo.region}`);

        // Close the popup after successful navigation
        window.close();
      }
    } catch (error) {
      console.error("Failed to navigate to Google Drive:", error);
      toast.error("Failed to open Google Drive folder");
      setIsLoading(false);
    }
  };

  /**
   * Trigger download->upload workflow (Cat button)
   * This initiates the auto-click download and Google Drive upload process
   */
  const triggerWorkflow = async (index: number, event: React.MouseEvent) => {
    event.stopPropagation();

    if (campaigns.length === 0) {
      console.error("No campaigns available");
      return;
    }

    if (!baseUrl.trim()) {
      console.error("No base URL provided");
      return;
    }

    setIsLoading(true);

    try {
      // Get campaign at the specified index
      const campaign = campaigns[index];

      // Replace campaign_id parameter in the base URL
      const urlObj = new URL(baseUrl);
      urlObj.searchParams.set("campaign_id", campaign.id);
      const newUrl = urlObj.toString();

      if (typeof chrome !== "undefined" && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab.id) {
          // Update the tab's URL to navigate and trigger auto-click
          await chrome.tabs.update(tab.id, { url: newUrl });

          // Update current index
          setCurrentIndex(index);
          localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, index.toString());

          // Show toast notification
          toast.success(`Workflow started for ${campaign.name}`);

          // Close the popup after successful navigation
          window.close();
        }
      }
    } catch (error) {
      console.error("Failed to trigger workflow:", error);
      toast.error("Failed to start workflow");
      setIsLoading(false);
    }
  };

  // Check if any upload is currently in progress
  const uploadStatusInfo = React.useMemo(() => {
    for (const [campaignName, status] of uploadStatuses.entries()) {
      if (status.status === "started") {
        return { campaignName, status, type: "uploading" as const };
      }
    }
    return null;
  }, [uploadStatuses]);

  return (
    <div className="bg-white" style={{ width: POPUP_WIDTH, height: "300px" }}>
      <Toaster duration={1500} position="top-center" />
      <div className="flex flex-col p-4 space-y-4 overflow-y-auto">
        {isSettingsView ? (
          /* Settings View */
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setIsSettingsView(false)}
                >
                  <ChevronLeft className="size-5" />
                </Button>
                {/* Settings */}
                <h2 className="text-2xl font-semibold text-foreground">설정</h2>
              </div>
              <Button
                onClick={clearAllData}
                disabled={isLoading}
                variant="destructive"
                className="w-fit shadow-brutal-button rounded-none"
                size="sm"
              >
                <Trash2 className="size-4" />
                Clear All Data
              </Button>
            </div>

            <div className="space-y-6">
              {/* Campaign Data Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="campaign-data" className="font-bold text-xl text-foreground">
                    Campaign Name & ID
                  </label>
                  {campaignDataText.trim() && lastSavedCampaignData === campaignDataText && (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="size-3" />
                      <span>Saved</span>
                    </div>
                  )}
                </div>
                <Textarea
                  id="campaign-data"
                  placeholder="CNT-CleansingOil-200ml_250512_PH_ProductGMV    1831881764572194&#10;CNT-DoubleCleansingDuo-None_250512_PH_ProductGMV    1831884518268977"
                  value={campaignDataText}
                  onChange={(e) => setCampaignDataText(e.target.value)}
                  className="h-[200px] font-mono text-xs"
                  disabled={isLoading}
                />
                <div className="text-xs text-muted-foreground">
                  {campaignDataText.split("\n").filter(line => line.trim()).length} campaigns
                </div>
              </div>

              {/* Base URL Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="base-url" className="font-bold text-xl text-foreground">
                    Base URL
                  </label>
                  {baseUrl.trim() && lastSavedBaseUrl === baseUrl && hasRequiredDateParams && hasValidProductUrl && (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="size-3" />
                      <span>Saved</span>
                    </div>
                  )}
                </div>
                <Textarea
                  id="base-url"
                  placeholder="https://ads.tiktok.com/i18n/gmv-max/dashboard?aadvid=123&campaign_id=1831881764572194&campaign_start_date=2025-01-01&campaign_end_date=2025-01-31"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="h-[100px] font-mono text-xs"
                  disabled={isLoading}
                />
                {baseUrl.trim() && (!hasRequiredDateParams || !hasValidProductUrl) && (
                  <p className="text-sm text-destructive font-medium">
                    {!hasValidProductUrl && (
                      <>The URL must start with "https://ads.tiktok.com/i18n/gmv-max/dashboard/product".</>
                    )}
                    {hasValidProductUrl && !hasRequiredDateParams && (
                      <>Please select the campaign start date and end date in the URL parameters. The URL must include both "campaign_start_date" and "campaign_end_date" parameters.</>
                    )}
                    {!hasValidProductUrl && !hasRequiredDateParams && (
                      <><br />Additionally, the URL must include both "campaign_start_date" and "campaign_end_date" parameters.</>
                    )}
                  </p>
                )}
              </div>

              {/* Auto-Click Toggle */}
              <div className="space-y-2">
                <label className="font-bold text-xl text-foreground">
                  Auto-Click Export Button
                </label>
                <div className="flex items-center justify-between p-4 border rounded-md">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Automatically click export button
                    </p>
                    <p className="text-xs text-muted-foreground">
                      When enabled, the extension will automatically click the export button when you navigate to a campaign page
                    </p>
                  </div>
                  <Switch
                    checked={autoClickEnabled}
                    onCheckedChange={toggleAutoClick}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Campaign List View */
          <>
            <div className="flex items-start justify-between">
              <div className="flex flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-semibold text-foreground">
                    {/* Campaign Navigator */}
                    캠페인 네비게이터
                  </h2>
                  <Badge>team-mint.io</Badge>
                  <Badge variant="secondary">Global Team</Badge>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {/* Total {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} available */}
                  총 {campaigns.length}개의 캠페인이 가능합니다
                </div>
              </div>
              <div className="flex items-center gap-2">
                {campaigns.length > 0 && uploadStatusInfo && uploadStatusInfo.type === "uploading" && (
                  /* Show upload status only when uploading */
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
                  onClick={() => setIsSettingsView(true)}
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
                  const completedCampaignsList = campaigns
                    .map((campaign, index) => ({ campaign, index }))
                    .filter(({ campaign }) => uploadStatuses.get(campaign.name)?.status === "success");

                  return completedCampaignsList.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm text-foreground px-1">
                        완료됨 ({completedCampaignsList.length})
                      </h3>
                      <div className="flex flex-col space-y-2">
                        {completedCampaignsList.map(({ campaign, index }) => {
                          const uploadStatus = uploadStatuses.get(campaign.name);

                          return (
                            <div
                              key={`completed-${campaign.id}-${index}`}
                              className={`w-full border-2 p-3 shadow-brutal-button rounded-none border-border bg-green-50/50`}
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
                                  {/* Workflow Status Indicator - only show loading or error */}
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

                                  {/* Cat Icon Button - Trigger download->upload workflow */}
                                  <Button
                                    onClick={(e) => triggerWorkflow(index, e)}
                                    disabled={!baseUrl.trim() || isLoading}
                                    variant="outline"
                                    size="sm"
                                    className="shadow-brutal-button rounded-none h-8 w-8 p-0"
                                    title="Start download and upload workflow"
                                  >
                                    <Cat className="size-4" />
                                  </Button>

                                  {/* Google Drive Icon Button - Open Google Drive folder */}
                                  <Button
                                    onClick={(e) => navigateToGoogleDrive(index, e)}
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

                              {/* Bottom Row: Region Selection Buttons */}
                              <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                                {(["PH", "US", "ID", "MY"] as const).map((region) => {
                                  const isSelected = campaignRegions.get(campaign.id) === region;
                                  return (
                                    <Button
                                      key={region}
                                      onClick={() => handleRegionSelect(campaign.id, region)}
                                      variant="outline"
                                      size="sm"
                                      className={`flex-1 h-7 text-xs shadow-brutal-button rounded-none transition-colors ${
                                        isSelected ? "border-green-500 bg-green-50 text-green-700" : ""
                                      }`}
                                    >
                                      {region}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* All Section */}
                {(() => {
                  const allCampaignsList = campaigns
                    .map((campaign, index) => ({ campaign, index }))
                    .filter(({ campaign }) => uploadStatuses.get(campaign.name)?.status !== "success");

                  return (
                    <div className="space-y-2">
                      <h3 className="font-semibold text-sm text-foreground px-1">
                        전체 ({allCampaignsList.length})
                      </h3>
                      {allCampaignsList.length > 0 ? (
                        <div className="flex flex-col space-y-2">
                          {allCampaignsList.map(({ campaign, index }) => {
                            const uploadStatus = uploadStatuses.get(campaign.name);

                            return (
                              <div
                                key={`all-${campaign.id}-${index}`}
                                className={`w-full border-2 p-3 shadow-brutal-button rounded-none ${index === currentIndex ? "border-primary bg-primary/5" : "border-border"
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
                                      {uploadStatus && (
                                        <div className="flex-shrink-0">
                                          {uploadStatus.status === "started" && (
                                            <Loader2 className="size-5 text-blue-500 animate-spin" />
                                          )}
                                          {uploadStatus.status === "error" && (
                                            <XCircle className="size-5 text-red-500" />
                                          )}
                                        </div>
                                      )}

                                      {/* Cat Icon Button - Trigger download->upload workflow */}
                                      <Button
                                        onClick={(e) => triggerWorkflow(index, e)}
                                        disabled={!baseUrl.trim() || isLoading}
                                        variant="outline"
                                        size="sm"
                                        className="shadow-brutal-button rounded-none h-8 w-8 p-0"
                                        title="Start download and upload workflow"
                                      >
                                        <Cat className="size-4" />
                                      </Button>

                                      {/* Google Drive Icon Button - Open Google Drive folder */}
                                      <Button
                                        onClick={(e) => navigateToGoogleDrive(index, e)}
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

                                  {/* Bottom Row: Region Selection Buttons */}
                                  <div className="flex items-center gap-2 pt-2 border-t border-border/30">
                                    {(["PH", "US", "ID", "MY"] as const).map((region) => {
                                      const isSelected = campaignRegions.get(campaign.id) === region;
                                      return (
                                        <Button
                                          key={region}
                                          onClick={() => handleRegionSelect(campaign.id, region)}
                                          variant="outline"
                                          size="sm"
                                          className={`flex-1 h-7 text-xs shadow-brutal-button rounded-none transition-colors ${
                                            isSelected ? "border-green-500 bg-green-50 text-green-700" : ""
                                          }`}
                                        >
                                          {region}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
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
                {/* <p className="text-muted-foreground mb-4">No campaigns configured</p> */}
                <Button
                  onClick={() => setIsSettingsView(true)}
                  variant="default"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Configure Campaigns
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

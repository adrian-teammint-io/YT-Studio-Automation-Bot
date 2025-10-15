"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { POPUP_WIDTH } from "./constants/ui";
import { ChevronLeft, Save, Settings, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { brutalismActiveClassName } from "@/lib/className";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

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
}

const STORAGE_KEYS = {
  CAMPAIGN_DATA: "gmv_max_campaign_data",
  BASE_URL: "gmv_max_base_url",
  CURRENT_INDEX: "gmv_max_current_index",
  COMPLETED_CAMPAIGNS: "gmv_max_completed_campaigns",
  AUTO_CLICK_ENABLED: "gmv_max_auto_click_enabled",
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
      } catch (error) {
        console.error("Failed to load stored data:", error);
      }
    };

    loadStoredData();
  }, []);

  /**
   * Parse and save campaign data from textarea
   * Format: "name    id" (one per line)
   * Preserves the exact order from input
   */
  const saveCampaignData = () => {
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
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_DATA, JSON.stringify(parsedCampaigns));

      // Reset index when saving new campaign data
      setCurrentIndex(0);
      localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, "0");

      // Show success toast
      toast.success(`Campaign data saved (${parsedCampaigns.length} campaigns)`);

      // setIsSettingsView(false);
    } catch (error) {
      console.error("Failed to save campaign data:", error);
      toast.error("Failed to save campaign data");
    }
  };

  /**
   * Save base URL to localStorage
   */
  const saveBaseUrl = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.BASE_URL, baseUrl);
      toast.success("Base URL saved successfully");
      setIsSettingsView(false);
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
   * Clear all data from localStorage and reset state
   */
  const clearAllData = () => {
    try {
      // Clear all localStorage items
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });

      // Reset all state
      setCampaignDataText("");
      setBaseUrl("");
      setCampaigns([]);
      setCurrentIndex(0);
      setCompletedCampaigns(new Set());
      setAutoClickEnabled(true);
    } catch (error) {
      console.error("Failed to clear data:", error);
    }
  };

  /**
   * Navigate to a specific campaign by index
   */
  const navigateToCampaign = async (index: number) => {
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
          // Update the tab's URL
          await chrome.tabs.update(tab.id, { url: newUrl });

          // Update current index
          setCurrentIndex(index);
          localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, index.toString());

          // Mark campaign as completed
          const updatedCompleted = new Set(completedCampaigns);
          updatedCompleted.add(index);
          setCompletedCampaigns(updatedCompleted);
          localStorage.setItem(STORAGE_KEYS.COMPLETED_CAMPAIGNS, JSON.stringify(Array.from(updatedCompleted)));

          // Close the popup after successful navigation
          window.close();
        }
      }
    } catch (error) {
      console.error("Failed to navigate to campaign:", error);
      setIsLoading(false);
    }
  };

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
                <label htmlFor="campaign-data" className="font-bold text-xl text-foreground">
                  Campaign Name & ID
                </label>
                <Textarea
                  id="campaign-data"
                  placeholder="CNT-CleansingOil-200ml_250512_PH_ProductGMV    1831881764572194&#10;CNT-DoubleCleansingDuo-None_250512_PH_ProductGMV    1831884518268977"
                  value={campaignDataText}
                  onChange={(e) => setCampaignDataText(e.target.value)}
                  className="h-[200px] font-mono text-xs"
                  disabled={isLoading}
                />
                <Button
                  onClick={saveCampaignData}
                  disabled={!campaignDataText.trim() || isLoading}
                  className="shadow-brutal-button rounded-none"
                  size="sm"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save Campaign Data ({campaignDataText.split("\n").filter(line => line.trim()).length} campaigns)
                </Button>
              </div>

              {/* Base URL Input */}
              <div className="space-y-2">
                <label htmlFor="base-url" className="font-bold text-xl text-foreground">
                  Base URL
                </label>
                <Textarea
                  id="base-url"
                  placeholder="https://ads.tiktok.com/i18n/gmv-max/dashboard?aadvid=123&campaign_id=1831881764572194&campaign_start_date=2025-01-01&campaign_end_date=2025-01-31"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="h-[100px] font-mono text-xs"
                  disabled={isLoading}
                />
                {baseUrl.trim() && !hasRequiredDateParams && (
                  <p className="text-sm text-destructive font-medium">
                    Please select the campaign start date and end date in the URL parameters. The URL must include both "campaign_start_date" and "campaign_end_date" parameters.
                  </p>
                )}
                <Button
                  onClick={saveBaseUrl}
                  disabled={!baseUrl.trim() || !hasRequiredDateParams || isLoading}
                  className="shadow-brutal-button rounded-none"
                  size="sm"
                >
                  <Save className="size-4" />
                  Save Base URL
                </Button>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSettingsView(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>


            {/* Campaign List */}
            {campaigns.length > 0 ? (
              <div className="flex flex-col justify-center items-center space-y-2">
                {campaigns.map((campaign, index) => {
                  const isCompleted = completedCampaigns.has(index);
                  return (
                    <Button
                      key={`${campaign.id}-${index}`}
                      onClick={() => navigateToCampaign(index)}
                      disabled={!baseUrl.trim() || isLoading}
                      variant={index === currentIndex ? "default" : "outline"}
                      className={`w-full justify-start text-left h-auto py-3 px-4 shadow-brutal-button rounded-none ${isCompleted ? "border-2 border-green-500" : ""
                        }`}
                    >
                      <div className="flex flex-col items-start w-full space-y-1">
                        <div className="font-medium text-sm truncate w-full">
                          {campaign.name}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {campaign.id}
                        </div>
                      </div>
                    </Button>
                  );
                })}
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

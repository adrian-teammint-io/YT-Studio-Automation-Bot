"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { POPUP_WIDTH } from "./constants/ui";
import { ChevronLeft, Settings, Trash2, Loader2, CheckCircle2, XCircle, Cat, FolderOpen, CatIcon, BadgeCheckIcon, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { detectRegionFromCampaign } from "./utils/region-detector";
import { findCampaignFolder } from "./services/google-drive";

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
  type?: "PRODUCT" | "LIVE";
}

// LIVE campaigns that should use the live dashboard URL
const LIVE_CAMPAIGNS = [
  { name: "SKIN1004MY(1st)", id: "1842021739590817" },
  { name: "skin1004my_official_250909", id: "1842771753445410" }
];

interface UploadStatus {
  status: "started" | "success" | "error";
  campaignName: string;
  fileName?: string;
  error?: string;
}

const STORAGE_KEYS = {
  CAMPAIGN_DATA: "gmv_max_campaign_data",
  CURRENT_INDEX: "gmv_max_current_index",
  COMPLETED_CAMPAIGNS: "gmv_max_completed_campaigns",
  AUTO_CLICK_ENABLED: "gmv_max_auto_click_enabled",
  LAST_UPLOAD_STATUS: "lastUploadStatus",
  UPLOAD_SUCCESS_STATUS: "gmv_max_upload_success_status", // Persistent upload success tracking
  CAMPAIGN_REGIONS: "gmv_max_campaign_regions", // Store region selections per campaign
  CAMPAIGN_TYPES: "gmv_max_campaign_types", // Store campaign type selections per campaign
  DATE_RANGE: "gmv_max_date_range", // Store start/end date values
};

// Region configuration with aadvid, oec_seller_id, and bc_id
const REGION_CONFIG = {
  US: {
    aadvid: "6860053951073484806",
    oec_seller_id: "7495275617887947202",
    bc_id: "7278556643061792769",
    utcOffset: 9, // UTC+09:00
  },
  ID: {
    aadvid: "7208105767293992962",
    oec_seller_id: "7494928748302076708",
    bc_id: "7208106862128939009",
    utcOffset: 7, // UTC+07:00
  },
  PH: {
    aadvid: "7265198676149075969",
    oec_seller_id: "7495168184921196786",
    bc_id: "7265198572054888449",
    utcOffset: 8, // UTC+08:00
  },
  MY: {
    aadvid: "7525257295555772423",
    oec_seller_id: "7496261644146150198",
    bc_id: "7525256178398674952",
    utcOffset: 8, // UTC+08:00
  },
} as const;

const BASE_URL = "https://ads.tiktok.com/i18n/gmv-max/dashboard/product";

/**
 * Convert region-specific date to timestamp
 * @param region - Region code (US, ID, MY, PH)
 * @param year - Year (e.g., 2025)
 * @param month - Month (1-12)
 * @param day - Day of month (1-31)
 * @param hour - Hour (0-23, default 0)
 * @param minute - Minute (0-59, default 0)
 * @param second - Second (0-59, default 0)
 * @returns Timestamp in milliseconds
 */
function regionDateToTimestamp(
  region: "US" | "ID" | "MY" | "PH",
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0
): number {
  const offset = REGION_CONFIG[region].utcOffset;

  // Convert the region's local time to UTC
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour - offset, minute, second));

  return utcDate.getTime(); // returns timestamp in milliseconds
}

/**
 * Build campaign URL with region-specific parameters
 * @param region - Region code
 * @param campaignId - Campaign ID
 * @param startTimestamp - Start date timestamp
 * @param endTimestamp - End date timestamp
 * @param campaignType - Campaign type (PRODUCT or LIVE)
 * @returns Complete campaign URL
 */
function buildCampaignUrl(
  region: "US" | "ID" | "MY" | "PH",
  campaignId: string,
  startTimestamp: number,
  endTimestamp: number,
  campaignType: "PRODUCT" | "LIVE" = "PRODUCT"
): string {
  const config = REGION_CONFIG[region];
  const baseUrl = campaignType === "LIVE"
    ? "https://ads.tiktok.com/i18n/gmv-max/dashboard/live"
    : BASE_URL;

  const params = new URLSearchParams({
    aadvid: config.aadvid,
    oec_seller_id: config.oec_seller_id,
    bc_id: config.bc_id,
    type: campaignType.toLowerCase(),
    campaign_id: campaignId,
    campaign_start_date: startTimestamp.toString(),
    campaign_end_date: endTimestamp.toString(),
  });

  // Only add list_status for PRODUCT campaigns
  if (campaignType === "PRODUCT") {
    params.set("list_status", "delivery_ok");
  }

  return `${baseUrl}?${params.toString()}`;
}

export default function URLReplacerPopup() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [campaignDataText, setCampaignDataText] = React.useState("");
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [isSettingsView, setIsSettingsView] = React.useState(false);
  const [completedCampaigns, setCompletedCampaigns] = React.useState<Set<number>>(new Set());
  const [autoClickEnabled, setAutoClickEnabled] = React.useState(true);
  const [uploadStatuses, setUploadStatuses] = React.useState<Map<string, UploadStatus>>(new Map());
  const activeToastsRef = React.useRef<Map<string, string | number>>(new Map());
  const [lastSavedCampaignData, setLastSavedCampaignData] = React.useState("");
  const [campaignRegions, setCampaignRegions] = React.useState<Map<string, "PH" | "US" | "ID" | "MY">>(new Map());
  const [campaignTypes, setCampaignTypes] = React.useState<Map<string, "PRODUCT" | "LIVE">>(new Map());

  // Version from manifest
  const [version, setVersion] = React.useState<string>("");

  // Refetch state
  const [isRefetching, setIsRefetching] = React.useState(false);

  // Date range state
  const [startYear, setStartYear] = React.useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = React.useState(new Date().getMonth() + 1);
  const [startDay, setStartDay] = React.useState(new Date().getDate());
  const [endYear, setEndYear] = React.useState(new Date().getFullYear());
  const [endMonth, setEndMonth] = React.useState(new Date().getMonth() + 1);
  const [endDay, setEndDay] = React.useState(new Date().getDate());

  // Load version from manifest on mount
  React.useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
      const manifest = chrome.runtime.getManifest();
      setVersion(manifest.version);
    }
  }, []);

  // Load stored data on mount
  React.useEffect(() => {
    const loadStoredData = async () => {
      try {
        const storedCampaignData = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_DATA);
        const storedIndex = localStorage.getItem(STORAGE_KEYS.CURRENT_INDEX);
        const storedCompletedCampaigns = localStorage.getItem(STORAGE_KEYS.COMPLETED_CAMPAIGNS);

        // Load date range from chrome.storage.local (for content script sync) or fallback to localStorage
        if (typeof chrome !== "undefined" && chrome.storage) {
          const result = await chrome.storage.local.get([STORAGE_KEYS.DATE_RANGE]);
          const dateRange = result[STORAGE_KEYS.DATE_RANGE];

          if (dateRange) {
            setStartYear(dateRange.startYear);
            setStartMonth(dateRange.startMonth);
            setStartDay(dateRange.startDay);
            setEndYear(dateRange.endYear);
            setEndMonth(dateRange.endMonth);
            setEndDay(dateRange.endDay);
          } else {
            // Fallback to localStorage if not in chrome.storage.local
            const storedDateRange = localStorage.getItem(STORAGE_KEYS.DATE_RANGE);
            if (storedDateRange) {
              const dateRange = JSON.parse(storedDateRange);
              setStartYear(dateRange.startYear);
              setStartMonth(dateRange.startMonth);
              setStartDay(dateRange.startDay);
              setEndYear(dateRange.endYear);
              setEndMonth(dateRange.endMonth);
              setEndDay(dateRange.endDay);
              // Sync to chrome.storage.local
              chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
            }
          }
        } else {
          // Fallback to localStorage if chrome.storage is not available
          const storedDateRange = localStorage.getItem(STORAGE_KEYS.DATE_RANGE);
          if (storedDateRange) {
            const dateRange = JSON.parse(storedDateRange);
            setStartYear(dateRange.startYear);
            setStartMonth(dateRange.startMonth);
            setStartDay(dateRange.startDay);
            setEndYear(dateRange.endYear);
            setEndMonth(dateRange.endMonth);
            setEndDay(dateRange.endDay);
          }
        }

        if (storedCampaignData) {
          const data = JSON.parse(storedCampaignData);
          setCampaigns(data);
          setCampaignDataText(data.map((c: Campaign) => `${c.name}    ${c.id}`).join("\n"));

          // Auto-populate region defaults from campaign names
          const storedRegions = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_REGIONS);
          const existingRegions = storedRegions ? JSON.parse(storedRegions) : {};
          let hasNewRegions = false;

          data.forEach((campaign: Campaign) => {
            // Only set default if not already set by user
            if (!existingRegions[campaign.id]) {
              const regionInfo = detectRegionFromCampaign(campaign.name);
              if (regionInfo) {
                // Map detected region to button region format
                const regionMap: Record<string, "PH" | "US" | "ID" | "MY"> = {
                  "2.WEST_US": "US",
                  "1.EAST_PH": "PH",
                  "1.EAST_MY": "MY",
                  "1.EAST_ID": "ID"
                };

                const buttonRegion = regionMap[regionInfo.region];
                if (buttonRegion) {
                  existingRegions[campaign.id] = buttonRegion;
                  hasNewRegions = true;
                }
              }
            }
          });

          // Save updated regions if we added new defaults
          if (hasNewRegions) {
            localStorage.setItem(STORAGE_KEYS.CAMPAIGN_REGIONS, JSON.stringify(existingRegions));
          }

          // Always sync all regions to chrome.storage.local (for content script access)
          if (typeof chrome !== "undefined" && chrome.storage && Object.keys(existingRegions).length > 0) {
            chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_REGIONS]: existingRegions });
          }

          // Set state with all regions (existing + new defaults)
          const regionsMap = new Map<string, "PH" | "US" | "ID" | "MY">();
          Object.entries(existingRegions).forEach(([campaignId, region]) => {
            regionsMap.set(campaignId, region as "PH" | "US" | "ID" | "MY");
          });
          setCampaignRegions(regionsMap);

          // Load campaign types from localStorage
          const storedTypes = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_TYPES);
          const existingTypes = storedTypes ? JSON.parse(storedTypes) : {};
          let hasNewTypes = false;

          data.forEach((campaign: Campaign) => {
            // Check if this campaign is in the LIVE_CAMPAIGNS array
            const isLiveCampaign = LIVE_CAMPAIGNS.some(
              lc => lc.name === campaign.name && lc.id === campaign.id
            );

            // Only set default if not already set by user
            if (!existingTypes[campaign.id]) {
              existingTypes[campaign.id] = isLiveCampaign ? "LIVE" : "PRODUCT";
              hasNewTypes = true;
            }
          });

          // Save updated types if we added new defaults
          if (hasNewTypes) {
            localStorage.setItem(STORAGE_KEYS.CAMPAIGN_TYPES, JSON.stringify(existingTypes));
          }

          // Always sync all types to chrome.storage.local (for content script access)
          if (typeof chrome !== "undefined" && chrome.storage && Object.keys(existingTypes).length > 0) {
            chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_TYPES]: existingTypes });
          }

          // Set state with all types (existing + new defaults)
          const typesMap = new Map<string, "PRODUCT" | "LIVE">();
          Object.entries(existingTypes).forEach(([campaignId, type]) => {
            typesMap.set(campaignId, type as "PRODUCT" | "LIVE");
          });
          setCampaignTypes(typesMap);
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

        // Load persisted upload success statuses from both localStorage and chrome.storage.local, merge them
        const storedUploadSuccessStatus = localStorage.getItem(STORAGE_KEYS.UPLOAD_SUCCESS_STATUS);
        const statusMap = new Map<string, UploadStatus>();
        if (storedUploadSuccessStatus) {
          const successStatuses = JSON.parse(storedUploadSuccessStatus);
          Object.entries(successStatuses).forEach(([campaignName, status]) => {
            statusMap.set(campaignName, status as UploadStatus);
          });
        }
        // Merge with chrome storage copy (authoritative if present)
        if (typeof chrome !== "undefined" && chrome.storage) {
          chrome.storage.local.get([STORAGE_KEYS.UPLOAD_SUCCESS_STATUS], (result) => {
            const chromeSuccessStatuses = result[STORAGE_KEYS.UPLOAD_SUCCESS_STATUS] || {};
            Object.entries(chromeSuccessStatuses).forEach(([campaignName, status]) => {
              statusMap.set(campaignName, status as UploadStatus);
            });
            if (statusMap.size > 0) {
              setUploadStatuses(statusMap);
            }
          });
        } else {
          if (statusMap.size > 0) {
            setUploadStatuses(statusMap);
          }
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
              // Also persist to chrome.storage.local so content scripts and future sessions stay in sync
              if (typeof chrome !== "undefined" && chrome.storage) {
                chrome.storage.local.set({ [STORAGE_KEYS.UPLOAD_SUCCESS_STATUS]: successStatuses });
              }
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
   * Auto-save date range when it changes (debounced)
   */
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const dateRange = {
        startYear,
        startMonth,
        startDay,
        endYear,
        endMonth,
        endDay,
      };

      // Save to localStorage for popup state
      localStorage.setItem(STORAGE_KEYS.DATE_RANGE, JSON.stringify(dateRange));

      // Save to chrome.storage.local for content script access
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [startYear, startMonth, startDay, endYear, endMonth, endDay]);

  /**
   * Auto-save when navigating back to main page
   */
  React.useEffect(() => {
    if (!isSettingsView) {
      // Save campaign data when navigating back
      if (campaignDataText.trim()) {
        saveCampaignData(true);
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

      // Auto-populate region defaults for new campaigns
      const storedRegions = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_REGIONS);
      const existingRegions = storedRegions ? JSON.parse(storedRegions) : {};
      let hasNewRegions = false;

      parsedCampaigns.forEach((campaign) => {
        // Only set default if not already set by user
        if (!existingRegions[campaign.id]) {
          const regionInfo = detectRegionFromCampaign(campaign.name);
          if (regionInfo) {
            // Map detected region to button region format
            const regionMap: Record<string, "PH" | "US" | "ID" | "MY"> = {
              "2.WEST_US": "US",
              "1.EAST_PH": "PH",
              "1.EAST_MY": "MY",
              "1.EAST_ID": "ID"
            };

            const buttonRegion = regionMap[regionInfo.region];
            if (buttonRegion) {
              existingRegions[campaign.id] = buttonRegion;
              hasNewRegions = true;
            }
          }
        }
      });

      // Save updated regions if we added new defaults
      if (hasNewRegions) {
        localStorage.setItem(STORAGE_KEYS.CAMPAIGN_REGIONS, JSON.stringify(existingRegions));
        // Also save to chrome.storage.local for content script access
        chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_REGIONS]: existingRegions });
      }

      // Update state with all regions (existing + new defaults)
      const regionsMap = new Map<string, "PH" | "US" | "ID" | "MY">();
      Object.entries(existingRegions).forEach(([campaignId, region]) => {
        regionsMap.set(campaignId, region as "PH" | "US" | "ID" | "MY");
      });
      setCampaignRegions(regionsMap);

      // Auto-populate campaign type defaults for new campaigns
      const storedTypes = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_TYPES);
      const existingTypes = storedTypes ? JSON.parse(storedTypes) : {};
      let hasNewTypes = false;

      parsedCampaigns.forEach((campaign) => {
        // Check if this campaign is in the LIVE_CAMPAIGNS array
        const isLiveCampaign = LIVE_CAMPAIGNS.some(
          lc => lc.name === campaign.name && lc.id === campaign.id
        );

        // Only set default if not already set by user
        if (!existingTypes[campaign.id]) {
          existingTypes[campaign.id] = isLiveCampaign ? "LIVE" : "PRODUCT";
          hasNewTypes = true;
        }
      });

      // Save updated types if we added new defaults
      if (hasNewTypes) {
        localStorage.setItem(STORAGE_KEYS.CAMPAIGN_TYPES, JSON.stringify(existingTypes));
        // Also save to chrome.storage.local for content script access
        chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_TYPES]: existingTypes });
      }

      // Update state with all types (existing + new defaults)
      const typesMap = new Map<string, "PRODUCT" | "LIVE">();
      Object.entries(existingTypes).forEach(([campaignId, type]) => {
        typesMap.set(campaignId, type as "PRODUCT" | "LIVE");
      });
      setCampaignTypes(typesMap);

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
      setCampaigns([]);
      setCurrentIndex(0);
      setCompletedCampaigns(new Set());
      setAutoClickEnabled(true);
      setUploadStatuses(new Map());

      // Reset date range to current date
      const now = new Date();
      setStartYear(now.getFullYear());
      setStartMonth(now.getMonth() + 1);
      setStartDay(now.getDate());
      setEndYear(now.getFullYear());
      setEndMonth(now.getMonth() + 1);
      setEndDay(now.getDate());

      toast.success("All data cleared successfully");
    } catch (error) {
      console.error("Failed to clear data:", error);
      toast.error("Failed to clear all data");
    }
  };

  /**
   * Refetch upload statuses from Google Drive
   */
  const handleRefetch = async () => {
    if (isRefetching) return;

    setIsRefetching(true);
    const loadingToast = toast.loading("Refetching upload statuses...");

    try {
      // Send message to background script to refetch statuses
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage({ type: "REFETCH_UPLOAD_STATUSES" }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response?.success) {
            resolve();
          } else {
            reject(new Error(response?.error || "Refetch failed"));
          }
        });
      });

      // Reload upload statuses from chrome.storage.local
      const result = await chrome.storage.local.get([STORAGE_KEYS.UPLOAD_SUCCESS_STATUS]);
      const chromeSuccessStatuses = result[STORAGE_KEYS.UPLOAD_SUCCESS_STATUS] || {};
      const statusMap = new Map<string, UploadStatus>();
      Object.entries(chromeSuccessStatuses).forEach(([campaignName, status]) => {
        statusMap.set(campaignName, status as UploadStatus);
      });
      setUploadStatuses(statusMap);

      toast.dismiss(loadingToast);
      toast.success("Upload statuses refreshed!");
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(`Failed to refetch: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsRefetching(false);
    }
  };

  /**
   * Handle region selection for a campaign
   */
  const handleRegionSelect = (campaignId: string, region: "PH" | "US" | "ID" | "MY") => {
    setCampaignRegions((prev) => {
      const newMap = new Map(prev);
      newMap.set(campaignId, region);

      // Persist to localStorage and chrome.storage.local
      const regionsObj: Record<string, string> = {};
      newMap.forEach((value, key) => {
        regionsObj[key] = value;
      });
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_REGIONS, JSON.stringify(regionsObj));

      // Save to chrome.storage.local for content script access
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_REGIONS]: regionsObj });
      }

      return newMap;
    });
  };

  /**
   * Handle campaign type selection for a campaign
   */
  const handleCampaignTypeSelect = (campaignId: string, type: "PRODUCT" | "LIVE") => {
    setCampaignTypes((prev) => {
      const newMap = new Map(prev);
      newMap.set(campaignId, type);

      // Persist to localStorage and chrome.storage.local
      const typesObj: Record<string, string> = {};
      newMap.forEach((value, key) => {
        typesObj[key] = value;
      });
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_TYPES, JSON.stringify(typesObj));

      // Save to chrome.storage.local for content script access
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_TYPES]: typesObj });
      }

      return newMap;
    });
  };

  /**
   * Set date range to today
   */
  const setToday = () => {
    const now = new Date();

    setStartYear(now.getFullYear());
    setStartMonth(now.getMonth() + 1);
    setStartDay(now.getDate());
    setEndYear(now.getFullYear());
    setEndMonth(now.getMonth() + 1);
    setEndDay(now.getDate());

    toast.success("Date set to today");
  };

  /**
   * Set date range to yesterday
   */
  const setYesterday = () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    setStartYear(yesterday.getFullYear());
    setStartMonth(yesterday.getMonth() + 1);
    setStartDay(yesterday.getDate());
    setEndYear(yesterday.getFullYear());
    setEndMonth(yesterday.getMonth() + 1);
    setEndDay(yesterday.getDate());

    toast.success("Date set to yesterday");
  };

  /**
   * Set date range to last 7 days
   */
  const setLast7Days = () => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    setStartYear(sevenDaysAgo.getFullYear());
    setStartMonth(sevenDaysAgo.getMonth() + 1);
    setStartDay(sevenDaysAgo.getDate());
    setEndYear(now.getFullYear());
    setEndMonth(now.getMonth() + 1);
    setEndDay(now.getDate());

    toast.success("Date set to last 7 days");
  };

  /**
   * Set date range to last 30 days
   */
  const setLast30Days = () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    setStartYear(thirtyDaysAgo.getFullYear());
    setStartMonth(thirtyDaysAgo.getMonth() + 1);
    setStartDay(thirtyDaysAgo.getDate());
    setEndYear(now.getFullYear());
    setEndMonth(now.getMonth() + 1);
    setEndDay(now.getDate());

    toast.success("Date set to last 30 days");
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

      // Show loading toast while searching for campaign folder
      toast.loading("Searching for campaign folder...");

      // Find the campaign folder within the region folder
      const campaignFolderId = await findCampaignFolder(campaign.name, regionInfo.folderId);

      // Dismiss loading toast
      toast.dismiss();

      if (!campaignFolderId) {
        // If campaign folder doesn't exist yet, navigate to the region folder
        toast.error(`Campaign folder not found. Opening region folder instead.`);
        const googleDriveFolderUrl = `https://drive.google.com/drive/folders/${regionInfo.folderId}`;

        if (typeof chrome !== "undefined" && chrome.tabs) {
          await chrome.tabs.create({ url: googleDriveFolderUrl });
          setCurrentIndex(index);
          localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, index.toString());
          window.close();
        }
        setIsLoading(false);
        return;
      }

      // Construct Google Drive folder URL for the campaign folder
      const googleDriveFolderUrl = `https://drive.google.com/drive/folders/${campaignFolderId}`;

      if (typeof chrome !== "undefined" && chrome.tabs) {
        // Open campaign folder in a new tab
        await chrome.tabs.create({ url: googleDriveFolderUrl });

        // Update current index
        setCurrentIndex(index);
        localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, index.toString());

        // Show success toast
        toast.success(`Opening campaign folder: ${campaign.name}`);

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
      toast.error("No campaigns available");
      return;
    }

    setIsLoading(true);

    try {
      // Get campaign at the specified index
      const campaign = campaigns[index];

      // Get the region for this campaign
      const region = campaignRegions.get(campaign.id);
      if (!region) {
        toast.error("Please select a region for this campaign");
        setIsLoading(false);
        return;
      }

      // Get the campaign type for this campaign
      const campaignType = campaignTypes.get(campaign.id) || "PRODUCT";

      // Calculate timestamps based on region
      const startTimestamp = regionDateToTimestamp(region, startYear, startMonth, startDay);
      const endTimestamp = regionDateToTimestamp(region, endYear, endMonth, endDay);

      // Build the campaign URL
      const newUrl = buildCampaignUrl(region, campaign.id, startTimestamp, endTimestamp, campaignType);

      if (typeof chrome !== "undefined" && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab.id) {
          // Show redirect toast notification with custom style
          toast.loading("리디렉션 중...", {
            style: {
              bottom: "184px",
            },
            duration: 2000,
          });

          // Update the tab's URL to navigate and trigger auto-click
          await chrome.tabs.update(tab.id, { url: newUrl });

          // Update current index
          setCurrentIndex(index);
          localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, index.toString());

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
                    1. Campaign Name & ID
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
                  className="h-fit font-mono text-xs"
                  disabled={isLoading}
                />
                <div className="text-xs text-muted-foreground">
                  {campaignDataText.split("\n").filter(line => line.trim()).length} campaigns
                </div>
              </div>

              {/* Date Range Input */}
              <div className="space-y-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-xl text-foreground">
                    2. Date Range
                  </label>
                  <div className="flex gap-2">
                    <Button
                      onClick={setToday}
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      className="shadow-brutal-button rounded-none"
                    >
                      Today
                    </Button>
                    <Button
                      onClick={setYesterday}
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      className="shadow-brutal-button rounded-none"
                    >
                      Yesterday
                    </Button>
                    <Button
                      onClick={setLast7Days}
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      className="shadow-brutal-button rounded-none"
                    >
                      Last 7 days
                    </Button>
                    <Button
                      onClick={setLast30Days}
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
                          onChange={(e) => setStartDay(parseInt(e.target.value) || 1)}
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
                          onChange={(e) => setStartMonth(parseInt(e.target.value) || 1)}
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
                          onChange={(e) => setStartYear(parseInt(e.target.value) || 2025)}
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
                          onChange={(e) => setEndDay(parseInt(e.target.value) || 1)}
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
                          onChange={(e) => setEndMonth(parseInt(e.target.value) || 1)}
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
                          onChange={(e) => setEndYear(parseInt(e.target.value) || 2025)}
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

              {/* Auto-Click Toggle */}
              {/* <div className="space-y-2">
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
              </div> */}
            </div>
          </>
        ) : (
          /* Campaign List View */
          <>
            <div className="flex items-start justify-between">
              <div className="flex flex-col items-start gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold  text-foreground">
                    {/* Campaign Navigator */}
                    {/* 캠페인 네비게이터 */}
                    {/* GMV Max Automation Bot */}
                    GMV 맥스 자동화 봇
                  </h2>
                  {version && <Badge variant='outline'><BadgeCheckIcon className="size-4" />v{version}</Badge>}
                  {/* <Badge>team-mint.io</Badge> */}
                </div>
                <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                  {/* Total {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} available */}
                  <span>총 {campaigns.length}개의 캠페인이 가능합니다</span>
                  {campaigns.length > 0 && (
                    <span className="px-1.5 py-0.5 border rounded-sm">
                      {campaigns.filter(c => uploadStatuses.get(c.name)?.status === "success").length}/{campaigns.length}
                    </span>
                  )}
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
                  onClick={handleRefetch}
                  disabled={isRefetching}
                  title="Refetch upload statuses from Google Drive"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                </Button>
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
                                    {/* <Button
                                    onClick={(e) => triggerWorkflow(index, e)}
                                    disabled={!baseUrl.trim() || isLoading}
                                    variant="outline"
                                    size="sm"
                                    className="shadow-brutal-button rounded-none h-8 w-8 p-0"
                                    title="Start download and upload workflow"
                                  >
                                    <CatIcon className="size-4" />
                                  </Button> */}

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

                                {/* Bottom Row: Campaign Type & Region Selection Buttons */}
                                <div className="flex flex-col gap-2">
                                  {/* Campaign Type Buttons */}
                                  <div className="flex items-center gap-2">
                                    {(["PRODUCT", "LIVE"] as const).map((type) => {
                                      const isSelected = campaignTypes.get(campaign.id) === type;
                                      const isCompleted = uploadStatuses.get(campaign.name)?.status === "success";
                                      return (
                                        <Button
                                          key={type}
                                          onClick={() => !isCompleted && handleCampaignTypeSelect(campaign.id, type)}
                                          variant="outline"
                                          size="sm"
                                          disabled={isCompleted}
                                          className={`flex-1 h-7 text-xs shadow-brutal-button rounded-none transition-colors ${isSelected ? "border-blue-500 bg-blue-50 text-blue-700" : ""
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
                                      const isSelected = campaignRegions.get(campaign.id) === region;
                                      const isCompleted = uploadStatuses.get(campaign.name)?.status === "success";
                                      return (
                                        <Button
                                          key={region}
                                          onClick={() => !isCompleted && handleRegionSelect(campaign.id, region)}
                                          variant="outline"
                                          size="sm"
                                          disabled={isCompleted}
                                          className={`flex-1 h-7 max-w-[50px] text-xs shadow-brutal-button rounded-none transition-colors ${isSelected ? "border-green-500 bg-green-50 text-green-700" : ""
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
                                        disabled={!campaignRegions.get(campaign.id) || isLoading}
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

                                  {/* Bottom Row: Campaign Type & Region Selection Buttons */}
                                  <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
                                    {/* Campaign Type Buttons */}
                                    <div className="flex items-center gap-2">
                                      {(["PRODUCT", "LIVE"] as const).map((type) => {
                                        const isSelected = campaignTypes.get(campaign.id) === type;
                                        const isCompleted = uploadStatuses.get(campaign.name)?.status === "success";
                                        return (
                                          <Button
                                            key={type}
                                            onClick={() => !isCompleted && handleCampaignTypeSelect(campaign.id, type)}
                                            variant="outline"
                                            size="sm"
                                            disabled={isCompleted}
                                            className={`flex-1 h-7 text-xs shadow-brutal-button rounded-none transition-colors ${isSelected ? "border-blue-500 bg-blue-50 text-blue-700" : ""
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
                                        const isSelected = campaignRegions.get(campaign.id) === region;
                                        const isCompleted = uploadStatuses.get(campaign.name)?.status === "success";
                                        return (
                                          <Button
                                            key={region}
                                            onClick={() => !isCompleted && handleRegionSelect(campaign.id, region)}
                                            variant="outline"
                                            size="sm"
                                            disabled={isCompleted}
                                            className={`flex-1 h-7 text-xs shadow-brutal-button rounded-none transition-colors ${isSelected ? "border-green-500 bg-green-50 text-green-700" : ""
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
                  {/* Configure Campaigns */}
                  캠페인 설정
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

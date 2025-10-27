"use client";

import * as React from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { POPUP_WIDTH } from "./constants/ui";
import { STORAGE_KEYS } from "./constants/storage";
import { LIVE_CAMPAIGNS } from "../lib/live_campaigns";
import { detectRegionFromCampaign } from "./utils/region-detector";
import { findCampaignFolder } from "./services/google-drive";
import { regionDateToTimestamp } from "./utils/date-utils";
import { buildCampaignUrl } from "./utils/url-builder";
import { CampaignList } from "./components/CampaignList";
import { SettingsView } from "./components/SettingsView";
import type { Campaign, UploadStatus, RegionType, CampaignType } from "./types/campaign";
import { mapParentFolderToRegion } from "./lib/parent-folder-mapper";

export default function URLReplacerPopup() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [campaignDataText, setCampaignDataText] = React.useState("");
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [isSettingsView, setIsSettingsView] = React.useState(false);
  const [uploadStatuses, setUploadStatuses] = React.useState<Map<string, UploadStatus>>(new Map());
  const activeToastsRef = React.useRef<Map<string, string | number>>(new Map());
  const [lastSavedCampaignData, setLastSavedCampaignData] = React.useState("");
  const [version, setVersion] = React.useState<string>("");
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

        // Load date range from chrome.storage.local or fallback to localStorage
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
            const storedDateRange = localStorage.getItem(STORAGE_KEYS.DATE_RANGE);
            if (storedDateRange) {
              const dateRange = JSON.parse(storedDateRange);
              setStartYear(dateRange.startYear);
              setStartMonth(dateRange.startMonth);
              setStartDay(dateRange.startDay);
              setEndYear(dateRange.endYear);
              setEndMonth(dateRange.endMonth);
              setEndDay(dateRange.endDay);
              chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
            }
          }
        } else {
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
          setCampaignDataText(data.map((c: Campaign) =>
            `${c.name}    ${c.id}    ${c.startDate || ""}    ${c.endDate || ""}    ${c.parentFolder || ""}    ${c.folderId || ""}    ${c.region || ""}    ${c.type || ""}`
          ).join("\n"));
        }

        if (storedIndex) {
          setCurrentIndex(parseInt(storedIndex, 10));
        }

        // Load persisted upload success statuses
        const storedUploadSuccessStatus = localStorage.getItem(STORAGE_KEYS.UPLOAD_SUCCESS_STATUS);
        const statusMap = new Map<string, UploadStatus>();
        if (storedUploadSuccessStatus) {
          const successStatuses = JSON.parse(storedUploadSuccessStatus);
          Object.entries(successStatuses).forEach(([campaignName, status]) => {
            statusMap.set(campaignName, status as UploadStatus);
          });
        }
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
          setUploadStatuses((prev) => {
            const newMap = new Map(prev);
            newMap.set(statusMessage.campaignName, statusMessage);

            if (statusMessage.status === "success") {
              const storedSuccessStatuses = localStorage.getItem(STORAGE_KEYS.UPLOAD_SUCCESS_STATUS);
              const successStatuses = storedSuccessStatuses ? JSON.parse(storedSuccessStatuses) : {};

              successStatuses[statusMessage.campaignName] = statusMessage;
              localStorage.setItem(STORAGE_KEYS.UPLOAD_SUCCESS_STATUS, JSON.stringify(successStatuses));
              if (typeof chrome !== "undefined" && chrome.storage) {
                chrome.storage.local.set({ [STORAGE_KEYS.UPLOAD_SUCCESS_STATUS]: successStatuses });
              }
            }

            return newMap;
          });

          if (statusMessage.status === "success") {
            const loadingToastId = activeToastsRef.current.get(statusMessage.campaignName);
            if (loadingToastId) {
              toast.dismiss(loadingToastId);
              activeToastsRef.current.delete(statusMessage.campaignName);
            }
            toast.success("업로드 완료!");
          } else if (statusMessage.status === "error") {
            const loadingToastId = activeToastsRef.current.get(statusMessage.campaignName);
            if (loadingToastId) {
              toast.dismiss(loadingToastId);
              activeToastsRef.current.delete(statusMessage.campaignName);
            }
            toast.error(`Upload failed: ${statusMessage.error || "Unknown error"}`);
          } else if (statusMessage.status === "started") {
            const toastId = toast.loading(`Uploading to Google Drive...`);
            activeToastsRef.current.set(statusMessage.campaignName, toastId);
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

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

  // Auto-save campaign data when it changes (debounced)
  React.useEffect(() => {
    if (!campaignDataText.trim()) return;

    const timer = setTimeout(() => {
      saveCampaignData(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [campaignDataText]);

  // Auto-save date range when it changes (debounced)
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

      localStorage.setItem(STORAGE_KEYS.DATE_RANGE, JSON.stringify(dateRange));

      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [startYear, startMonth, startDay, endYear, endMonth, endDay]);

  // Auto-save when navigating back to main page
  React.useEffect(() => {
    if (!isSettingsView) {
      if (campaignDataText.trim()) {
        saveCampaignData(true);
      }
    }
  }, [isSettingsView]);

  const saveCampaignData = (silent = false) => {
    try {
      const parsedCampaigns = campaignDataText
        .split("\n")
        .filter(line => line.trim().length > 0)
        .map(line => {
          const parts = line.trim().split(/\s{2,}|\t+/);
          if (parts.length >= 2) {
            const name = parts[0]?.trim() || "";
            const id = parts[1]?.trim() || "";

            // Skip campaigns with empty name or ID
            if (!name || !id) {
              console.warn(`[Popup] Skipping campaign with empty name or ID:`, { name, id });
              return null;
            }

            const campaign: Campaign = {
              name,
              id,
            };

            // New format: name | id | startDate | endDate | parentFolder | folderId | region | type
            // Old format: name | id | region | type
            // Detect format based on number of parts
            if (parts.length >= 6) {
              // New format with dates and folder info
              if (parts[2]?.trim()) {
                campaign.startDate = parts[2].trim();
                console.log(`[Popup] Campaign "${name}" - startDate extracted: "${campaign.startDate}"`);
              }
              if (parts[3]?.trim()) {
                campaign.endDate = parts[3].trim();
                console.log(`[Popup] Campaign "${name}" - endDate extracted: "${campaign.endDate}"`);
              }
              if (parts[4]?.trim()) {
                campaign.parentFolder = parts[4].trim();
              }
              if (parts[5]?.trim()) {
                campaign.folderId = parts[5].trim();
              }
              if (parts[6]?.trim()) {
                campaign.region = parts[6].trim() as RegionType;
              }
              if (parts[7]?.trim()) {
                campaign.type = parts[7].trim() as CampaignType;
              }
            } else {
              // Old format (backward compatibility)
              if (parts[2]?.trim()) {
                campaign.region = parts[2].trim() as RegionType;
              }
              if (parts[3]?.trim()) {
                campaign.type = parts[3].trim() as CampaignType;
              }
            }

            // Auto-detect region: prioritize parent folder name, fallback to campaign name
            if (!campaign.region) {
              // First, try to extract region from parent folder name
              if (campaign.parentFolder) {
                const regionFromFolder = mapParentFolderToRegion(campaign.parentFolder);
                if (regionFromFolder) {
                  campaign.region = regionFromFolder;
                  console.log(`[Popup] Region detected from parent folder "${campaign.parentFolder}": ${regionFromFolder}`);
                }
              }

              // Fallback: detect from campaign name if parent folder didn't work
              if (!campaign.region) {
                const regionInfo = detectRegionFromCampaign(campaign.name);
                if (regionInfo) {
                  const regionMap: Record<string, RegionType> = {
                    "2.WEST_US": "US",
                    "1.EAST_PH": "PH",
                    "1.EAST_MY": "MY",
                    "1.EAST_ID": "ID"
                  };
                  campaign.region = regionMap[regionInfo.region] || "US";
                  console.log(`[Popup] Region detected from campaign name "${campaign.name}": ${campaign.region}`);
                }
              }
            }

            // Auto-detect type from LIVE_CAMPAIGNS if not provided
            if (!campaign.type) {
              const isLive = LIVE_CAMPAIGNS.some(lc => {
                // Match by name if ID is empty in the list, otherwise match both name and ID
                if (!lc.id || lc.id === "") {
                  return lc.name === campaign.name;
                }
                return lc.name === campaign.name && lc.id === campaign.id;
              });
              campaign.type = isLive ? "LIVE" : "PRODUCT";
            }
            return campaign;
          }
          return null;
        })
        .filter((c): c is Campaign => c !== null);

      setCampaigns(parsedCampaigns);

      // Auto-set date range from first campaign with valid dates (only if not in silent mode)
      if (!silent && parsedCampaigns.length > 0) {
        const firstCampaignWithDates = parsedCampaigns.find(c => c.startDate && c.endDate);

        if (firstCampaignWithDates && firstCampaignWithDates.startDate && firstCampaignWithDates.endDate) {
          try {
            console.log(`[Popup] Raw dates from campaign:`, {
              startDate: firstCampaignWithDates.startDate,
              endDate: firstCampaignWithDates.endDate,
              campaignName: firstCampaignWithDates.name
            });

            // Parse dates - support both YYYY-MM-DD and DD-MM-YYYY formats
            const startParts = firstCampaignWithDates.startDate.trim().split(/[-/]/);
            const endParts = firstCampaignWithDates.endDate.trim().split(/[-/]/);

            console.log(`[Popup] Split date parts:`, {
              startParts,
              endParts
            });

            if (startParts.length === 3 && endParts.length === 3) {
              let startYear: number, startMonth: number, startDay: number;
              let endYear: number, endMonth: number, endDay: number;

              // Detect format: if first part is 4 digits, it's YYYY-MM-DD, otherwise DD-MM-YYYY
              if (startParts[0].length === 4) {
                // YYYY-MM-DD format
                startYear = parseInt(startParts[0], 10);
                startMonth = parseInt(startParts[1], 10);
                startDay = parseInt(startParts[2], 10);

                endYear = parseInt(endParts[0], 10);
                endMonth = parseInt(endParts[1], 10);
                endDay = parseInt(endParts[2], 10);

                console.log(`[Popup] Detected YYYY-MM-DD format`);
              } else if (startParts[2].length === 4) {
                // DD-MM-YYYY format
                startDay = parseInt(startParts[0], 10);
                startMonth = parseInt(startParts[1], 10);
                startYear = parseInt(startParts[2], 10);

                endDay = parseInt(endParts[0], 10);
                endMonth = parseInt(endParts[1], 10);
                endYear = parseInt(endParts[2], 10);

                console.log(`[Popup] Detected DD-MM-YYYY format`);
              } else {
                console.warn("[Popup] Unable to detect date format");
                return;
              }

              console.log(`[Popup] Parsed date values:`, {
                start: { year: startYear, month: startMonth, day: startDay },
                end: { year: endYear, month: endMonth, day: endDay }
              });

              // Validate dates
              if (
                !isNaN(startYear) && !isNaN(startMonth) && !isNaN(startDay) &&
                !isNaN(endYear) && !isNaN(endMonth) && !isNaN(endDay) &&
                startYear >= 2020 && startYear <= 2100 &&
                startMonth >= 1 && startMonth <= 12 &&
                startDay >= 1 && startDay <= 31 &&
                endYear >= 2020 && endYear <= 2100 &&
                endMonth >= 1 && endMonth <= 12 &&
                endDay >= 1 && endDay <= 31
              ) {
                console.log(`[Popup] ✅ Date validation passed, setting state values`);

                // Set state values directly - NO Date object creation to avoid timezone issues
                setStartYear(startYear);
                setStartMonth(startMonth);
                setStartDay(startDay);
                setEndYear(endYear);
                setEndMonth(endMonth);
                setEndDay(endDay);

                // Save to storage
                const dateRange = {
                  startYear,
                  startMonth,
                  startDay,
                  endYear,
                  endMonth,
                  endDay,
                };

                console.log(`[Popup] Saving date range to storage:`, dateRange);

                localStorage.setItem(STORAGE_KEYS.DATE_RANGE, JSON.stringify(dateRange));
                if (typeof chrome !== "undefined" && chrome.storage) {
                  chrome.storage.local.set({ [STORAGE_KEYS.DATE_RANGE]: dateRange });
                }

                toast.success(`Date range set: ${startMonth}/${startDay}/${startYear} - ${endMonth}/${endDay}/${endYear}`);
              } else {
                console.warn("[Popup] ❌ Invalid date values extracted:", {
                  start: { year: startYear, month: startMonth, day: startDay },
                  end: { year: endYear, month: endMonth, day: endDay }
                });
              }
            }
          } catch (error) {
            console.error("[Popup] Failed to parse campaign dates:", error);
          }
        }
      }

      // Save campaigns to storage
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_DATA, JSON.stringify(parsedCampaigns));
      chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_DATA]: parsedCampaigns });

      // Build and save region and type mappings for content.ts
      const campaignRegions: Record<string, RegionType> = {};
      const campaignTypes: Record<string, CampaignType> = {};

      parsedCampaigns.forEach(campaign => {
        if (campaign.region) {
          campaignRegions[campaign.id] = campaign.region;
        }
        if (campaign.type) {
          campaignTypes[campaign.id] = campaign.type;
        }
      });

      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_REGIONS, JSON.stringify(campaignRegions));
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_TYPES, JSON.stringify(campaignTypes));
      chrome.storage.local.set({
        [STORAGE_KEYS.CAMPAIGN_REGIONS]: campaignRegions,
        [STORAGE_KEYS.CAMPAIGN_TYPES]: campaignTypes
      });

      setCurrentIndex(0);
      localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, "0");
      chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_INDEX]: "0" });

      setLastSavedCampaignData(campaignDataText);

      if (!silent && parsedCampaigns.length > 0) {
        toast.success(`Campaign data saved (${parsedCampaigns.length} campaigns)`);
      }
    } catch (error) {
      console.error("Failed to save campaign data:", error);
      toast.error("Failed to save campaign data");
    }
  };

  const clearAllData = async () => {
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });

      if (typeof chrome !== "undefined" && chrome.storage) {
        await chrome.storage.local.clear();
      }

      setCampaignDataText("");
      setCampaigns([]);
      setCurrentIndex(0);
      setUploadStatuses(new Map());

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

  const handleRefetch = async () => {
    if (isRefetching) return;

    setIsRefetching(true);
    const loadingToast = toast.loading("Refetching upload statuses...");

    try {
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

  const navigateToGoogleDrive = async (index: number, event: React.MouseEvent) => {
    event.stopPropagation();

    if (campaigns.length === 0) {
      console.error("No campaigns available");
      toast.error("No campaigns available");
      return;
    }

    setIsLoading(true);

    try {
      const campaign = campaigns[index];
      const regionInfo = detectRegionFromCampaign(campaign.name);
      if (!regionInfo) {
        toast.error(`Could not detect region from campaign name: ${campaign.name}`);
        setIsLoading(false);
        return;
      }

      toast.loading("Searching for campaign folder...");

      const campaignFolderId = await findCampaignFolder(campaign.name, regionInfo.folderId);

      toast.dismiss();

      if (!campaignFolderId) {
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

      const googleDriveFolderUrl = `https://drive.google.com/drive/folders/${campaignFolderId}`;

      if (typeof chrome !== "undefined" && chrome.tabs) {
        await chrome.tabs.create({ url: googleDriveFolderUrl });
        setCurrentIndex(index);
        localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, index.toString());
        toast.success(`Opening campaign folder: ${campaign.name}`);
        window.close();
      }
    } catch (error) {
      console.error("Failed to navigate to Google Drive:", error);
      toast.error("Failed to open Google Drive folder");
      setIsLoading(false);
    }
  };

  const triggerWorkflow = async (index: number, event: React.MouseEvent) => {
    event.stopPropagation();

    if (campaigns.length === 0) {
      console.error("No campaigns available");
      toast.error("No campaigns available");
      return;
    }

    setIsLoading(true);

    try {
      const campaign = campaigns[index];
      const region = campaign.region;
      if (!region) {
        toast.error("Please select a region for this campaign");
        setIsLoading(false);
        return;
      }

      const campaignType = campaign.type || "PRODUCT";

      const startTimestamp = regionDateToTimestamp(region, startYear, startMonth, startDay);
      const endTimestamp = regionDateToTimestamp(region, endYear, endMonth, endDay);

      const newUrl = buildCampaignUrl(region, campaign.id, startTimestamp, endTimestamp, campaignType);

      if (typeof chrome !== "undefined" && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab.id) {
          toast.loading("리디렉션 중...", {
            style: {
              bottom: "184px",
            },
            duration: 2000,
          });

          await chrome.tabs.update(tab.id, { url: newUrl });

          setCurrentIndex(index);
          localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, index.toString());

          window.close();
        }
      }
    } catch (error) {
      console.error("Failed to trigger workflow:", error);
      toast.error("Failed to start workflow");
      setIsLoading(false);
    }
  };

  const uploadStatusInfo = React.useMemo(() => {
    for (const [campaignName, status] of uploadStatuses.entries()) {
      if (status.status === "started") {
        return { campaignName, status, type: "uploading" as const };
      }
    }
    return null;
  }, [uploadStatuses]);

  const handleStartWorkflow = async () => {
    if (campaigns.length === 0) {
      toast.error("No campaigns available");
      return;
    }

    try {
      // Find first uncompleted campaign
      let firstIndex = -1;
      for (let i = 0; i < campaigns.length; i++) {
        const campaign = campaigns[i];
        const uploadStatus = uploadStatuses.get(campaign.name);

        if (!uploadStatus || uploadStatus.status !== "success") {
          firstIndex = i;
          break;
        }
      }

      if (firstIndex === -1) {
        toast.error("All campaigns completed! 🎉");
        return;
      }

      const campaign = campaigns[firstIndex];
      const region = campaign.region;

      if (!region) {
        toast.error(`Please select a region for campaign: ${campaign.name}`);
        return;
      }

      const campaignType = campaign.type || "PRODUCT";
      const startTimestamp = regionDateToTimestamp(region, startYear, startMonth, startDay);
      const endTimestamp = regionDateToTimestamp(region, endYear, endMonth, endDay);
      const newUrl = buildCampaignUrl(region, campaign.id, startTimestamp, endTimestamp, campaignType);

      // Open in new tab
      if (typeof chrome !== "undefined" && chrome.tabs) {
        await chrome.tabs.create({ url: newUrl });

        setCurrentIndex(firstIndex);
        localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, firstIndex.toString());
        chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_INDEX]: firstIndex.toString() });

        toast.success(`Opening campaign: ${campaign.name}`);
      }
    } catch (error) {
      console.error("Failed to start workflow:", error);
      toast.error("Failed to start workflow");
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("Clipboard is empty");
        return;
      }

      setCampaignDataText(text);
      // Trigger immediate save to parse and update campaigns
      // The saveCampaignData function will show the success toast with the campaign count
      setTimeout(() => saveCampaignData(false), 100);
    } catch (error) {
      console.error("Failed to read clipboard:", error);
      toast.error("Failed to paste from clipboard. Please grant clipboard permissions.");
    }
  };

  return (
    <div className="bg-white" style={{ width: POPUP_WIDTH, height: "300px" }}>
      <Toaster duration={1500} position="top-center" />
      <div className="flex flex-col p-4 space-y-4 overflow-y-auto">
        {isSettingsView ? (
          <SettingsView
            campaignDataText={campaignDataText}
            lastSavedCampaignData={lastSavedCampaignData}
            startYear={startYear}
            startMonth={startMonth}
            startDay={startDay}
            endYear={endYear}
            endMonth={endMonth}
            endDay={endDay}
            isLoading={isLoading}
            onCampaignDataChange={setCampaignDataText}
            onStartYearChange={setStartYear}
            onStartMonthChange={setStartMonth}
            onStartDayChange={setStartDay}
            onEndYearChange={setEndYear}
            onEndMonthChange={setEndMonth}
            onEndDayChange={setEndDay}
            onSetToday={setToday}
            onSetYesterday={setYesterday}
            onSetLast7Days={setLast7Days}
            onSetLast30Days={setLast30Days}
            onClearAllData={clearAllData}
            onBack={() => setIsSettingsView(false)}
          />
        ) : (
          <CampaignList
            campaigns={campaigns}
            currentIndex={currentIndex}
            uploadStatuses={uploadStatuses}
            version={version}
            isLoading={isLoading}
            isRefetching={isRefetching}
            uploadStatusInfo={uploadStatusInfo}
            onTriggerWorkflow={triggerWorkflow}
            onNavigateToGoogleDrive={navigateToGoogleDrive}
            onRefetch={handleRefetch}
            onOpenSettings={() => setIsSettingsView(true)}
            onStartWorkflow={handleStartWorkflow}
            onPasteFromClipboard={handlePasteFromClipboard}
          />
        )}
      </div>
    </div>
  );
}

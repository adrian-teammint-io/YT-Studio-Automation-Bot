"use client";

import * as React from "react";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { POPUP_WIDTH } from "./constants/ui";
import { STORAGE_KEYS } from "./constants/storage";
import { LIVE_CAMPAIGNS } from "./constants/regions";
import { detectRegionFromCampaign } from "./utils/region-detector";
import { findCampaignFolder } from "./services/google-drive";
import { regionDateToTimestamp } from "./utils/date-utils";
import { buildCampaignUrl } from "./utils/url-builder";
import { CampaignList } from "./components/CampaignList";
import { SettingsView } from "./components/SettingsView";
import type { Campaign, UploadStatus, RegionType, CampaignType } from "./types/campaign";

export default function URLReplacerPopup() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [campaignDataText, setCampaignDataText] = React.useState("");
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [isSettingsView, setIsSettingsView] = React.useState(false);
  const [uploadStatuses, setUploadStatuses] = React.useState<Map<string, UploadStatus>>(new Map());
  const activeToastsRef = React.useRef<Map<string, string | number>>(new Map());
  const [lastSavedCampaignData, setLastSavedCampaignData] = React.useState("");
  const [campaignRegions, setCampaignRegions] = React.useState<Map<string, RegionType>>(new Map());
  const [campaignTypes, setCampaignTypes] = React.useState<Map<string, CampaignType>>(new Map());
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
          setCampaignDataText(data.map((c: Campaign) => `${c.name}    ${c.id}`).join("\n"));

          // Auto-populate region defaults from campaign names
          const storedRegions = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_REGIONS);
          const existingRegions = storedRegions ? JSON.parse(storedRegions) : {};
          let hasNewRegions = false;

          data.forEach((campaign: Campaign) => {
            if (!existingRegions[campaign.id]) {
              const regionInfo = detectRegionFromCampaign(campaign.name);
              if (regionInfo) {
                const regionMap: Record<string, RegionType> = {
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

          if (hasNewRegions) {
            localStorage.setItem(STORAGE_KEYS.CAMPAIGN_REGIONS, JSON.stringify(existingRegions));
          }

          if (typeof chrome !== "undefined" && chrome.storage && Object.keys(existingRegions).length > 0) {
            chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_REGIONS]: existingRegions });
          }

          const regionsMap = new Map<string, RegionType>();
          Object.entries(existingRegions).forEach(([campaignId, region]) => {
            regionsMap.set(campaignId, region as RegionType);
          });
          setCampaignRegions(regionsMap);

          // Load campaign types from localStorage
          const storedTypes = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_TYPES);
          const existingTypes = storedTypes ? JSON.parse(storedTypes) : {};
          let hasNewTypes = false;

          data.forEach((campaign: Campaign) => {
            const isLiveCampaign = LIVE_CAMPAIGNS.some(
              lc => lc.name === campaign.name && lc.id === campaign.id
            );

            if (!existingTypes[campaign.id]) {
              existingTypes[campaign.id] = isLiveCampaign ? "LIVE" : "PRODUCT";
              hasNewTypes = true;
            }
          });

          if (hasNewTypes) {
            localStorage.setItem(STORAGE_KEYS.CAMPAIGN_TYPES, JSON.stringify(existingTypes));
          }

          if (typeof chrome !== "undefined" && chrome.storage && Object.keys(existingTypes).length > 0) {
            chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_TYPES]: existingTypes });
          }

          const typesMap = new Map<string, CampaignType>();
          Object.entries(existingTypes).forEach(([campaignId, type]) => {
            typesMap.set(campaignId, type as CampaignType);
          });
          setCampaignTypes(typesMap);
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
      chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_DATA]: parsedCampaigns });

      setCurrentIndex(0);
      localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, "0");
      chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_INDEX]: "0" });

      // Auto-populate region defaults for new campaigns
      const storedRegions = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_REGIONS);
      const existingRegions = storedRegions ? JSON.parse(storedRegions) : {};
      let hasNewRegions = false;

      parsedCampaigns.forEach((campaign) => {
        if (!existingRegions[campaign.id]) {
          const regionInfo = detectRegionFromCampaign(campaign.name);
          if (regionInfo) {
            const regionMap: Record<string, RegionType> = {
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

      if (hasNewRegions) {
        localStorage.setItem(STORAGE_KEYS.CAMPAIGN_REGIONS, JSON.stringify(existingRegions));
        chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_REGIONS]: existingRegions });
      }

      const regionsMap = new Map<string, RegionType>();
      Object.entries(existingRegions).forEach(([campaignId, region]) => {
        regionsMap.set(campaignId, region as RegionType);
      });
      setCampaignRegions(regionsMap);

      // Auto-populate campaign type defaults for new campaigns
      const storedTypes = localStorage.getItem(STORAGE_KEYS.CAMPAIGN_TYPES);
      const existingTypes = storedTypes ? JSON.parse(storedTypes) : {};
      let hasNewTypes = false;

      parsedCampaigns.forEach((campaign) => {
        const isLiveCampaign = LIVE_CAMPAIGNS.some(
          lc => lc.name === campaign.name && lc.id === campaign.id
        );

        if (!existingTypes[campaign.id]) {
          existingTypes[campaign.id] = isLiveCampaign ? "LIVE" : "PRODUCT";
          hasNewTypes = true;
        }
      });

      if (hasNewTypes) {
        localStorage.setItem(STORAGE_KEYS.CAMPAIGN_TYPES, JSON.stringify(existingTypes));
        chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_TYPES]: existingTypes });
      }

      const typesMap = new Map<string, CampaignType>();
      Object.entries(existingTypes).forEach(([campaignId, type]) => {
        typesMap.set(campaignId, type as CampaignType);
      });
      setCampaignTypes(typesMap);

      setLastSavedCampaignData(campaignDataText);

      if (!silent) {
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

  const handleRegionSelect = (campaignId: string, region: RegionType) => {
    setCampaignRegions((prev) => {
      const newMap = new Map(prev);
      newMap.set(campaignId, region);

      const regionsObj: Record<string, string> = {};
      newMap.forEach((value, key) => {
        regionsObj[key] = value;
      });
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_REGIONS, JSON.stringify(regionsObj));

      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_REGIONS]: regionsObj });
      }

      return newMap;
    });
  };

  const handleCampaignTypeSelect = (campaignId: string, type: CampaignType) => {
    setCampaignTypes((prev) => {
      const newMap = new Map(prev);
      newMap.set(campaignId, type);

      const typesObj: Record<string, string> = {};
      newMap.forEach((value, key) => {
        typesObj[key] = value;
      });
      localStorage.setItem(STORAGE_KEYS.CAMPAIGN_TYPES, JSON.stringify(typesObj));

      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({ [STORAGE_KEYS.CAMPAIGN_TYPES]: typesObj });
      }

      return newMap;
    });
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
      const region = campaignRegions.get(campaign.id);
      if (!region) {
        toast.error("Please select a region for this campaign");
        setIsLoading(false);
        return;
      }

      const campaignType = campaignTypes.get(campaign.id) || "PRODUCT";

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
            campaignRegions={campaignRegions}
            campaignTypes={campaignTypes}
            version={version}
            isLoading={isLoading}
            isRefetching={isRefetching}
            uploadStatusInfo={uploadStatusInfo}
            onTriggerWorkflow={triggerWorkflow}
            onNavigateToGoogleDrive={navigateToGoogleDrive}
            onRegionSelect={handleRegionSelect}
            onTypeSelect={handleCampaignTypeSelect}
            onRefetch={handleRefetch}
            onOpenSettings={() => setIsSettingsView(true)}
          />
        )}
      </div>
    </div>
  );
}

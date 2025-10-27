export interface Campaign {
  name: string;
  id: string;
  region?: "PH" | "US" | "ID" | "MY";
  type?: "PRODUCT" | "LIVE";
  startDate?: string;
  endDate?: string;
  parentFolder?: string;
  folderId?: string;
}

export interface UploadStatus {
  status: "started" | "success" | "error";
  campaignName: string;
  fileName?: string;
  error?: string;
}

export type RegionType = "PH" | "US" | "ID" | "MY";
export type CampaignType = "PRODUCT" | "LIVE";

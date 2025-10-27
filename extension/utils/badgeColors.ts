import type { RegionType, CampaignType } from "../types/campaign";

// Badge color configuration
const BADGE_COLORS = {
  regions: {
    US: "#17ffc4", // Light green
    ID: "#cc17ff", // Purple
    PH: "#17ffee", // Cyan
    MY: "#affc41", // Yellow-green
  },
  types: {
    PRODUCT: "#f6e837", // Yellow
    LIVE: "#ee2a7d", // Pink
  },
} as const;

/**
 * Get the background color for a region badge
 */
export function getRegionBadgeColor(region: RegionType): string {
  return BADGE_COLORS.regions[region];
}

/**
 * Get the background color for a type badge
 */
export function getTypeBadgeColor(type: CampaignType): string {
  return BADGE_COLORS.types[type];
}

/**
 * Get badge style object with background color and appropriate text color
 */
export function getBadgeStyle(backgroundColor: string) {
  // Calculate if the background is light or dark to determine text color
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return {
    backgroundColor,
    color: luminance > 0.5 ? '#000000' : '#ffffff',
  };
}

/**
 * Extract region code from parent folder name
 * Examples: "2.WEST_US" -> "US", "1.EAST_PH" -> "PH"
 */
export function extractRegionFromFolder(parentFolder: string): RegionType | null {
  const match = parentFolder.match(/(US|PH|ID|MY)$/i);
  if (match) {
    const region = match[1].toUpperCase();
    if (region === 'US' || region === 'PH' || region === 'ID' || region === 'MY') {
      return region as RegionType;
    }
  }
  return null;
}

/**
 * Extract campaign type from campaign name
 * If campaign name contains "LIVE", return "LIVE", otherwise "PRODUCT"
 */
export function extractTypeFromCampaign(campaignName: string): CampaignType {
  return /LIVE/i.test(campaignName) ? "LIVE" : "PRODUCT";
}

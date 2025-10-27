/**
 * Manual campaign-to-region mapping
 *
 * For campaigns that don't have region indicators in their name,
 * this mapping provides explicit region assignments.
 *
 * Use this when:
 * - Campaign names are just handles (e.g., "@username_date")
 * - Campaign names don't follow standard naming conventions
 * - You need to override automatic detection
 */

import type { RegionType } from "../types/campaign";

/**
 * Manual mapping of campaign names to regions
 * Key: Campaign name (exact match, case-insensitive)
 * Value: Region code (US, PH, MY, ID)
 */
export const CAMPAIGN_REGION_MAP: Record<string, RegionType> = {
  // Social media handle campaigns without region indicators
  "@wethesibs_251014": "PH", // TODO: Verify correct region

  // Add more manual mappings here as needed
  // Example: "@campaignname_date": "US",
};

/**
 * Look up region for a campaign by exact name match
 * Returns null if no manual mapping exists
 */
export function getManualRegionMapping(campaignName: string): RegionType | null {
  if (!campaignName) return null;

  // Case-insensitive lookup
  const normalized = campaignName.trim().toLowerCase();

  for (const [mappedName, region] of Object.entries(CAMPAIGN_REGION_MAP)) {
    if (mappedName.toLowerCase() === normalized) {
      console.log(`[Manual Mapping] Found explicit region "${region}" for campaign: "${campaignName}"`);
      return region;
    }
  }

  return null;
}

/**
 * Check if a campaign has a manual region mapping
 */
export function hasManualMapping(campaignName: string): boolean {
  return getManualRegionMapping(campaignName) !== null;
}

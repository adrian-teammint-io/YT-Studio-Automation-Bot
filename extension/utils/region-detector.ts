/**
 * Region detection utility for determining Google Drive folder based on campaign name
 * Maps campaign name patterns to regional folder IDs
 */

export interface RegionMapping {
  region: string;
  folderId: string;
  pattern: RegExp;
}

/**
 * TEST MODE: All uploads go to a single test folder
 * This allows safe testing before deploying to production folders
 */
const TEST_FOLDER_ID = "1B6YGbi5Nqp5LKpFEYxA4WHbFYKirX2Vx"; // GMV_Max_Campaign_Navigator_TEST

/**
 * Region folder mappings
 * Format: campaign name contains region code -> Google Drive folder ID
 */
export const REGION_MAPPINGS: RegionMapping[] = [
  {
    region: "TEST_PH",
    folderId: TEST_FOLDER_ID,
    pattern: /PH/i, // Match any campaign containing "PH" (case-insensitive)
  },
  {
    region: "TEST_MY",
    folderId: TEST_FOLDER_ID,
    pattern: /MY/i, // Match any campaign containing "MY" (case-insensitive)
  },
  {
    region: "TEST_ID",
    folderId: TEST_FOLDER_ID,
    pattern: /ID/i, // Match any campaign containing "ID" (case-insensitive)
  },
  {
    region: "TEST_US",
    folderId: TEST_FOLDER_ID,
    pattern: /US/i, // Match any campaign containing "US" (case-insensitive)
  },
];

/**
 * PRODUCTION folder mappings (commented out for testing)
 * Uncomment these and remove TEST mappings when ready for production
 */
// export const REGION_MAPPINGS: RegionMapping[] = [
//   {
//     region: "WEST_US",
//     folderId: "1kyao3_UQjYFuzjKDGmf66QpDsYn9dM_p",
//     pattern: /_US_/i,
//   },
//   {
//     region: "EAST_PH",
//     folderId: "1nX2nVy-Oa2r9o-tke9EIci-Za7iCxl48",
//     pattern: /_PH_/i,
//   },
//   {
//     region: "EAST_MY",
//     folderId: "1QPXQu2xHKi441YE_UhpXU_t37UJSA2cv",
//     pattern: /_MY_/i,
//   },
//   {
//     region: "EAST_ID",
//     folderId: "1NGFgCLmFu1If39D8XQnolOV5t1zPVrRm",
//     pattern: /_ID_/i,
//   },
// ];

/**
 * Detect region from campaign name
 * Returns the Google Drive folder ID for the detected region
 *
 * @param campaignName - The campaign name (e.g., "CNT-Ampoule-55ml/100ml_250521_US_ProductGMV")
 * @returns The folder ID for the detected region, or null if no match found
 */
export function detectRegionFromCampaign(campaignName: string): {
  folderId: string;
  region: string;
} | null {
  console.log(`[Region Detector] Checking campaign: "${campaignName}"`);
  console.log(`[Region Detector] Campaign name length: ${campaignName.length}`);
  console.log(`[Region Detector] Available patterns:`, REGION_MAPPINGS.map(m => ({ region: m.region, pattern: m.pattern.source })));

  for (const mapping of REGION_MAPPINGS) {
    const matches = mapping.pattern.test(campaignName);
    console.log(`[Region Detector] Testing pattern ${mapping.pattern.source} for ${mapping.region}: ${matches}`);

    if (matches) {
      console.log(`[Region Detector] ✅ Detected region: ${mapping.region} for campaign: ${campaignName}`);
      return {
        folderId: mapping.folderId,
        region: mapping.region,
      };
    }
  }

  console.warn(`[Region Detector] ❌ No region detected for campaign: "${campaignName}"`);
  console.warn(`[Region Detector] Campaign does not match any of these patterns:`, REGION_MAPPINGS.map(m => m.pattern.source));
  return null;
}

/**
 * Validate that a campaign name can be mapped to a region
 * Useful for pre-validation before starting upload process
 */
export function canDetectRegion(campaignName: string): boolean {
  return detectRegionFromCampaign(campaignName) !== null;
}

/**
 * Get all available regions
 * Useful for displaying in UI or debugging
 */
export function getAvailableRegions(): Array<{ region: string; folderId: string }> {
  return REGION_MAPPINGS.map(({ region, folderId }) => ({ region, folderId }));
}

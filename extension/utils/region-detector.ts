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
 * PRODUCTION folder mappings
 * Maps campaign regions to their corresponding Google Drive folder IDs
 *
 * ⚠️ IMPORTANT: These MUST be Shared Drive folder IDs, NOT "My Drive" folder IDs
 * Service Accounts cannot upload to "My Drive" - they require Shared Drives.
 *
 * How to get Shared Drive folder IDs:
 * 1. Create/access a Shared Drive in Google Drive
 * 2. Create regional folders (2.WEST_US, 1.EAST_PH, etc.) inside the Shared Drive
 * 3. Share each folder with your service account email (Editor permission)
 * 4. Open folder in browser and copy the folder ID from the URL:
 *    https://drive.google.com/drive/folders/[COPY_THIS_FOLDER_ID]
 * 5. Replace the folder IDs below with your Shared Drive folder IDs
 */
export const REGION_MAPPINGS: RegionMapping[] = [
  {
    region: "2.WEST_US",
    folderId: "1kyao3_UQjYFuzjKDGmf66QpDsYn9dM_p", // 2.WEST_US (Shared Drive)
    // Match US in various formats: _US_, US(, US_, USspace, or US at end
    // Examples: "campaign_US_data", "SKIN1004US(1st)", "campaignUS_official"
    pattern: /(?:_US_|US(?=[_\(\s]|$))/i,
  },
  {
    region: "1.EAST_PH",
    folderId: "1nX2nVy-Oa2r9o-tke9EIci-Za7iCxl48", // 1.EAST_PH (Shared Drive)
    // Match PH in various formats: _PH_, PH(, PH_, PHspace, PH at end, or PHILIPPINES
    // Examples: "campaign_PH_data", "SKIN1004PH(1st)", "campaignPH_official", "SKIN1004PHILIPPINES_1ST"
    pattern: /(?:_PH_|PH(?=[_\(\s]|$)|PHILIPP(?:INES?|INE))/i,
  },
  {
    region: "1.EAST_MY",
    folderId: "1QPXQu2xHKi441YE_UhpXU_t37UJSA2cv", // 1.EAST_MY (Shared Drive)
    // Match MY in various formats: _MY_, MY(, MY_, MYspace, MY at end, or MALAYSIA
    // Examples: "campaign_MY_data", "SKIN1004MY(1st)", "skin1004my_official", "SKIN1004MALAYSIA_1ST"
    pattern: /(?:_MY_|MY(?=[_\(\s]|$)|MALAYSIA)/i,
  },
  {
    region: "1.EAST_ID",
    folderId: "1NGFgCLmFu1If39D8XQnolOV5t1zPVrRm", // 1.EAST_ID (Shared Drive)
    // Match ID in various formats: _ID_, ID(, ID_, IDspace, ID at end, or INDONESIA (with typo variants)
    // Examples: "campaign_ID_data", "SKIN1004ID(1st)", "campaignID_official", "SKIN1004_INDONESIA_1ST", "SKIN1004_INDOENSIA_1ST"
    pattern: /(?:_ID_|ID(?=[_\(\s]|$)|INDO[EN](?:E|N)SIA)/i,
  },
];

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


/**
 * Validate that folder IDs are in Shared Drives (not My Drive)
 * Call this function during development to verify your configuration
 *
 * Usage: Add this to your background.ts initialization:
 *   validateSharedDriveFolders(token).then(console.log)
 */
export async function validateSharedDriveFolders(token: string): Promise<{
  valid: boolean;
  results: Array<{ region: string; folderId: string; accessible: boolean; isSharedDrive: boolean; error?: string; folderName?: string }>;
}> {
  // Import the checkFolderAccess function (we'll use dynamic import to avoid circular deps)
  const { checkFolderAccess } = await import("../services/google-drive");

  const results = await Promise.all(
    REGION_MAPPINGS.map(async ({ region, folderId }) => {
      const accessCheck = await checkFolderAccess(token, folderId);

      if (!accessCheck.accessible) {
        return {
          region,
          folderId,
          accessible: false,
          isSharedDrive: false,
          error: `❌ ACCESS DENIED: ${accessCheck.error}`,
        };
      }

      const isSharedDrive = accessCheck.details?.isSharedDrive || false;

      return {
        region,
        folderId,
        accessible: true,
        isSharedDrive,
        folderName: accessCheck.details?.name,
        error: isSharedDrive
          ? undefined
          : "⚠️ This is a My Drive folder - Service Accounts require Shared Drives",
      }
    })
  );

  const allValid = results.every((r) => r.accessible && r.isSharedDrive);

  return {
    valid: allValid,
    results,
  };
}

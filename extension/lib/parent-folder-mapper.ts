/**
 * Maps parent folder names to region codes
 * Used when extracting region from 6-column campaign data format
 */

import type { RegionType } from "../types/campaign";

/**
 * Map parent folder name to region code
 * Supports various formats: "2.WEST_US", "1.EAST_PH", "1.EAST_MY", "1.EAST_ID"
 *
 * @param parentFolderName - The parent folder name from campaign data
 * @returns RegionType (US/PH/MY/ID) or null if no match
 *
 * @example
 * mapParentFolderToRegion("2.WEST_US") // => "US"
 * mapParentFolderToRegion("1.EAST_PH") // => "PH"
 * mapParentFolderToRegion("1.EAST_MY") // => "MY"
 * mapParentFolderToRegion("1.EAST_ID") // => "ID"
 */
export function mapParentFolderToRegion(parentFolderName: string): RegionType | null {
  if (!parentFolderName || parentFolderName.trim() === "") {
    return null;
  }

  const normalized = parentFolderName.trim().toUpperCase();

  // Direct mapping patterns
  const patterns: Record<string, RegionType> = {
    "2.WEST_US": "US",
    "1.EAST_PH": "PH",
    "1.EAST_MY": "MY",
    "1.EAST_ID": "ID",
  };

  // Check exact match first
  if (patterns[normalized]) {
    return patterns[normalized];
  }

  // Fallback: extract region code from folder name (e.g., "WEST_US" => "US")
  if (normalized.includes("US")) return "US";
  if (normalized.includes("PH")) return "PH";
  if (normalized.includes("MY")) return "MY";
  if (normalized.includes("ID")) return "ID";

  console.warn(`[Parent Folder Mapper] No region found for folder: "${parentFolderName}"`);
  return null;
}

/**
 * Get parent folder ID for a given region
 * Maps region codes back to their Google Drive folder IDs
 * Uses the same mapping as region-detector.ts
 */
export function getParentFolderIdForRegion(region: RegionType): string | null {
  const folderIds: Record<RegionType, string> = {
    US: "1kyao3_UQjYFuzjKDGmf66QpDsYn9dM_p", // 2.WEST_US
    PH: "1nX2nVy-Oa2r9o-tke9EIci-Za7iCxl48", // 1.EAST_PH
    MY: "1QPXQu2xHKi441YE_UhpXU_t37UJSA2cv", // 1.EAST_MY
    ID: "1NGFgCLmFu1If39D8XQnolOV5t1zPVrRm", // 1.EAST_ID
  };

  return folderIds[region] || null;
}

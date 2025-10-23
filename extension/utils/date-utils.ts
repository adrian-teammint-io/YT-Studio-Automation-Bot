import { REGION_CONFIG } from "../constants/regions";
import type { RegionType } from "../types/campaign";

/**
 * Convert region-specific date to timestamp
 */
export function regionDateToTimestamp(
  region: RegionType,
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0,
  second: number = 0
): number {
  const offset = REGION_CONFIG[region].utcOffset;
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour - offset, minute, second));
  return utcDate.getTime();
}

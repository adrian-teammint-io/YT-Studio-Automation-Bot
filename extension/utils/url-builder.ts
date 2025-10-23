import { REGION_CONFIG, BASE_URL } from "../constants/regions";
import type { RegionType, CampaignType } from "../types/campaign";

/**
 * Build campaign URL with region-specific parameters
 */
export function buildCampaignUrl(
  region: RegionType,
  campaignId: string,
  startTimestamp: number,
  endTimestamp: number,
  campaignType: CampaignType = "PRODUCT"
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
    list_status: "delivery_ok",
    campaign_id: campaignId,
    campaign_start_date: startTimestamp.toString(),
    campaign_end_date: endTimestamp.toString(),
  });

  return `${baseUrl}?${params.toString()}`;
}

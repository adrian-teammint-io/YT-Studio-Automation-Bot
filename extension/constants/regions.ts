export const REGION_CONFIG = {
  US: {
    aadvid: "6860053951073484806",
    oec_seller_id: "7495275617887947202",
    bc_id: "7278556643061792769",
    utcOffset: 9, // UTC+09:00
  },
  ID: {
    aadvid: "7208105767293992962",
    oec_seller_id: "7494928748302076708",
    bc_id: "7208106862128939009",
    utcOffset: 7, // UTC+07:00
  },
  PH: {
    aadvid: "7265198676149075969",
    oec_seller_id: "7495168184921196786",
    bc_id: "7265198572054888449",
    utcOffset: 8, // UTC+08:00
  },
  MY: {
    aadvid: "7525257295555772423",
    oec_seller_id: "7496261644146150198",
    bc_id: "7525256178398674952",
    utcOffset: 8, // UTC+08:00
  },
} as const;

export const BASE_URL = "https://ads.tiktok.com/i18n/gmv-max/dashboard/product";

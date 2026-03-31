export type TopUpCurrency = 'USD' | 'CAD' | 'CNY';

export type TopUpPack = {
  id: string;
  title: string;
  highlight?: string;
  baseCredits: number;
  bonusCredits: number;
  prices: Record<TopUpCurrency, number>;
};

/**
 * 建议锚点：
 * - 30 章课件生成成本约 2 USD
 * - 为了覆盖模型波动、支付手续费和退款空间，建议零售价大约 4 USD
 * - 因此按 1 USD ~= 60 credits 设计，30 章约消耗 240 credits
 */
export const RECOMMENDED_CREDITS_PER_USD = 60;
export const TARGET_30_CHAPTER_SLIDES_COST_USD = 4;
export const TARGET_30_CHAPTER_SLIDES_CREDITS =
  RECOMMENDED_CREDITS_PER_USD * TARGET_30_CHAPTER_SLIDES_COST_USD;

/** 2026-03 附近的粗略换算，仅用于展示充值建议页，不用于真实结算。 */
export const APPROX_USD_TO_CAD = 1.36;
export const APPROX_USD_TO_CNY = 6.9;

export const TOP_UP_PACKS: TopUpPack[] = [
  {
    id: 'starter',
    title: '启程包',
    baseCredits: 300,
    bonusCredits: 0,
    prices: { USD: 4.99, CAD: 6.99, CNY: 30 },
  },
  {
    id: 'adventurer',
    title: '进阶包',
    highlight: '+10%',
    baseCredits: 600,
    bonusCredits: 60,
    /** CNY 不宜按汇率简单取整：¥68 时 660/68 低于启程包 300/30，显得高档位更亏 */
    prices: { USD: 9.99, CAD: 13.99, CNY: 65 },
  },
  {
    id: 'pro',
    title: '专业包',
    highlight: '+15%',
    baseCredits: 1200,
    bonusCredits: 180,
    prices: { USD: 19.99, CAD: 27.99, CNY: 128 },
  },
  {
    id: 'studio',
    title: '工作室包',
    highlight: '+25%',
    baseCredits: 3000,
    bonusCredits: 750,
    prices: { USD: 49.99, CAD: 69.99, CNY: 328 },
  },
  {
    id: 'guild',
    title: '公会包',
    highlight: '+30%',
    baseCredits: 6000,
    bonusCredits: 1800,
    prices: { USD: 99.99, CAD: 139.99, CNY: 648 },
  },
];

const CURRENCY_FORMATTERS: Record<TopUpCurrency, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
  CAD: new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }),
  CNY: new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }),
};

export function formatTopUpPrice(currency: TopUpCurrency, amount: number): string {
  return CURRENCY_FORMATTERS[currency].format(amount);
}

export function formatApproxLocalizedPrice(currency: TopUpCurrency, usdAmount: number): string {
  const localizedAmount =
    currency === 'CAD'
      ? usdAmount * APPROX_USD_TO_CAD
      : currency === 'CNY'
        ? usdAmount * APPROX_USD_TO_CNY
        : usdAmount;
  return formatTopUpPrice(currency, localizedAmount);
}

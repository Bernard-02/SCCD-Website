/**
 * ISO 3166-1 alpha-2 (小寫) → 中英文名稱對照
 *
 * 對齊 sccd-theme/inc/cmb2-register.php sccd_country_options() 的 39 國。
 * Schema 的 country field 存 code（如 'tw'），前端用 countryName(code, 'zh'/'en')。
 */
export const COUNTRY_NAMES = {
  tw: { zh: '台灣',   en: 'Taiwan' },
  jp: { zh: '日本',   en: 'Japan' },
  kr: { zh: '韓國',   en: 'South Korea' },
  cn: { zh: '中國',   en: 'China' },
  hk: { zh: '香港',   en: 'Hong Kong' },
  sg: { zh: '新加坡', en: 'Singapore' },
  my: { zh: '馬來西亞', en: 'Malaysia' },
  th: { zh: '泰國',   en: 'Thailand' },
  vn: { zh: '越南',   en: 'Vietnam' },
  ph: { zh: '菲律賓', en: 'Philippines' },
  id: { zh: '印尼',   en: 'Indonesia' },
  in: { zh: '印度',   en: 'India' },
  au: { zh: '澳洲',   en: 'Australia' },
  nz: { zh: '紐西蘭', en: 'New Zealand' },
  us: { zh: '美國',   en: 'United States' },
  ca: { zh: '加拿大', en: 'Canada' },
  mx: { zh: '墨西哥', en: 'Mexico' },
  br: { zh: '巴西',   en: 'Brazil' },
  gb: { zh: '英國',   en: 'United Kingdom' },
  fr: { zh: '法國',   en: 'France' },
  de: { zh: '德國',   en: 'Germany' },
  it: { zh: '義大利', en: 'Italy' },
  es: { zh: '西班牙', en: 'Spain' },
  nl: { zh: '荷蘭',   en: 'Netherlands' },
  be: { zh: '比利時', en: 'Belgium' },
  ch: { zh: '瑞士',   en: 'Switzerland' },
  at: { zh: '奧地利', en: 'Austria' },
  se: { zh: '瑞典',   en: 'Sweden' },
  no: { zh: '挪威',   en: 'Norway' },
  dk: { zh: '丹麥',   en: 'Denmark' },
  fi: { zh: '芬蘭',   en: 'Finland' },
  pl: { zh: '波蘭',   en: 'Poland' },
  cz: { zh: '捷克',   en: 'Czechia' },
  ru: { zh: '俄羅斯', en: 'Russia' },
  tr: { zh: '土耳其', en: 'Turkey' },
  il: { zh: '以色列', en: 'Israel' },
  ae: { zh: '阿聯',   en: 'UAE' },
  za: { zh: '南非',   en: 'South Africa' },
  eg: { zh: '埃及',   en: 'Egypt' },
};

/**
 * 取得國家名稱
 * @param {string} code ISO2 code（大小寫不拘）
 * @param {'zh'|'en'} lang
 * @returns {string} 找不到時 fallback 回 code uppercase
 */
export function countryName(code, lang) {
  if (!code) return '';
  const k = String(code).toLowerCase();
  const entry = COUNTRY_NAMES[k];
  if (!entry) return String(code).toUpperCase();
  return entry[lang] || entry.en;
}

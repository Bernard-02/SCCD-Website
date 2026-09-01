// 把 faculty 三個含 country 子欄（educations / awards / occupations）的下拉選項擴到「全部國家」。
//   - 既有 39 國：順序與中英名稱完全保留（源自 js/data/country-names.js，curated 常用國在前）
//   - 其餘 ISO 3166-1 國家：用 Node 內建 Intl.DisplayNames 產 zh-Hant + en 名稱，接在後面（依英文名排序）
//   - 同時重寫 js/data/country-names.js（前台顯示 map），與後台 choices 同一份來源，不會 drift
// 跑（repo 根目錄）：NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/build-country-choices-full.cjs [--dry]
// idempotent、可重跑。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const token = fs.readFileSync('scripts/.directus-token', 'utf8').trim();
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const BASE = 'https://sccdtest.usc.edu.tw';
const DRY = process.argv.includes('--dry');
const COUNTRY_JS = path.join('js', 'data', 'country-names.js');
// 掃全 schema 自動找國家下拉（含 tw+jp 的 choices），不寫死 collection/field ——
// 涵蓋 faculty educations/awards/occupations、activities_* 的 guests.country/orgCountry、
// library_press/awards.country、alumni_hosting/employment.country 等全部 slot。
const looksCountry = ch => Array.isArray(ch) && ch.some(c => c?.value === 'tw') && ch.some(c => c?.value === 'jp');
// Intl 對某些地區給過長官方名（澳門→「中國澳門特別行政區」）；覆寫成慣用短名。只作用在 appended（既有 39 國不動）。
const NAME_OVERRIDES = { mo: { zh: '澳門', en: 'Macau' } };

// ISO 3166-1 alpha-2 官方指派碼（含常見屬地）；Intl 認不得的會被自動濾掉
const ALL_CODES = ('ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw').split(' ');

const zhNames = new Intl.DisplayNames(['zh-Hant'], { type: 'region', fallback: 'none' });
const enNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });

async function req(method, urlPath, body) {
  if (DRY && method !== 'GET') { console.log(`[dry] ${method} ${urlPath}`); return { data: {} }; }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${urlPath} → ${res.status} ${JSON.stringify(out).slice(0, 400)}`);
  return out;
}

(async () => {
  // 既有 39 國（保留順序＋curated 名稱）
  const { COUNTRY_NAMES } = await import(pathToFileURL(path.resolve(COUNTRY_JS)).href);
  const existing = Object.keys(COUNTRY_NAMES);
  const existingSet = new Set(existing);

  // 其餘國家：Intl 產名、濾掉認不得的、依英文名排序
  const appended = ALL_CODES
    .filter(c => !existingSet.has(c))
    .map(c => ({ code: c, zh: zhNames.of(c.toUpperCase()), en: enNames.of(c.toUpperCase()) }))
    .filter(x => x.zh && x.en)
    .sort((a, b) => a.en.localeCompare(b.en));

  const order = [...existing, ...appended.map(x => x.code)];
  const nameMap = {};
  for (const c of existing) nameMap[c] = { zh: COUNTRY_NAMES[c].zh, en: COUNTRY_NAMES[c].en };
  for (const x of appended) nameMap[x.code] = { zh: x.zh, en: x.en };
  // 短名覆寫，蓋過 Intl 產的官方長名（既有/新增都適用；再跑一次也會校正回短名）
  for (const [c, ov] of Object.entries(NAME_OVERRIDES)) {
    if (nameMap[c]) nameMap[c] = { zh: ov.zh || nameMap[c].zh, en: ov.en || nameMap[c].en };
  }

  console.log(`既有 ${existing.length} 國 + 新增 ${appended.length} 國 = 共 ${order.length} 國`);

  // 1) 重寫 js/data/country-names.js（前台顯示 map）
  const pad = Math.max(...order.map(c => c.length));
  const entries = order.map(c => {
    const zh = nameMap[c].zh.replace(/'/g, "\\'");
    const en = nameMap[c].en.replace(/'/g, "\\'");
    return `  ${c}:${' '.repeat(pad - c.length)} { zh: '${zh}', en: '${en}' },`;
  }).join('\n');
  const fileBody = `/**
 * ISO 3166-1 alpha-2 (小寫) → 中英文名稱對照
 *
 * 由 scripts/build-country-choices-full.cjs 產生（與後台 faculty country 下拉同源）。
 * 前 ${existing.length} 國為 curated 常用國（順序＆名稱固定），其餘由 Intl.DisplayNames 產、依英文名排序。
 * Schema 的 country field 存 code（如 'tw'），前端用 countryName(code, 'zh'/'en')。
 */
export const COUNTRY_NAMES = {
${entries}
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
`;
  if (DRY) console.log(`[dry] 會寫入 ${COUNTRY_JS}`);
  else fs.writeFileSync(COUNTRY_JS, fileBody);

  // 2) 掃全 schema，PATCH 每一個國家下拉（直接欄 or repeater 子欄，可能一欄多顆如 guests.country + orgCountry）
  const choices = order.map(c => ({ text: `${nameMap[c].zh} ${nameMap[c].en}`, value: c }));
  const allFields = (await req('GET', '/fields')).data || [];
  const patched = [];
  for (const f of allFields) {
    const o = f.meta?.options;
    if (!o) continue;
    let hits = [];
    if (looksCountry(o.choices)) { o.choices = choices; hits.push('(直接)'); }
    if (Array.isArray(o.fields)) {
      for (const s of o.fields) {
        const so = s.meta?.options;
        if (so && looksCountry(so.choices)) { so.choices = choices; hits.push(s.field); }
      }
    }
    if (!hits.length) continue;
    console.log(`PATCH ${f.collection}.${f.field} [${hits.join(', ')}] → ${choices.length} 國`);
    await req('PATCH', `/fields/${f.collection}/${f.field}`, { meta: f.meta });
    patched.push(`${f.collection}.${f.field}`);
  }

  console.log(`\n✅ 完成。共 patch ${patched.length} 個欄位，前台 country-names.js 也同步為 ${order.length} 國。`);
})().catch(e => { console.error('❌', e.message); process.exit(1); });

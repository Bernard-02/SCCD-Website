/**
 * Footer Content v2（Directus footer_tabs / footer_items / footer_legal → 渲染兩份 footer）
 *
 * 後台（footer 集合資料夾）：
 *   footer_tabs     — 分頁名/標誌(markIcon 檔)/順序（拖曳）/說明文字（note，選填；見 buildNote）
 *   footer_items    — 各分頁項目（tab-first：在分頁詳情內拖曳）；type = social（社群圖示）／text（文字：標題＋內文＋選填連結）
 *                     （2026-10-01 由 info/phone/address/link/social 收斂；舊值仍相容＝當 text 渲染）。連結一律後台自填，前台不再自動生成
 *   footer_settings — 單例：copyright＝自訂文字 或 自動年份（二選一；「Copyright ©」前綴固定）
 * 右下法務連結＝3 個固定站內頁（Donate/規章/政策），標籤固定 → 前台寫死 LEGAL const，不進 CMS
 *   （對應內容仍在 Directus regulations/support/policy_and_statements；那些是頁面內文，標題與 footer 標籤不同）。
 * 圖示（tab 標誌 + 社群 icon）＝Directus Files「Site Icons」資料夾的 SVG，前台以 CSS mask 依 mode 上色。
 *
 * 前台：single-flight cache；CMS 掛/空 → fallback /data/footer.json（快照自 Directus 重產，icon 存 CDN 絕對 URL——CDN 與後台主機分離，後台掛時仍可載）。
 * 渲染輸出「與 legacy 靜態 HTML 同構」DOM：資訊卡帶 .footer-info + itemKey(.footer-tel/fax/email/office) 吃既有版面；
 * 社群 icon 走全站 .icon（--icon mask + currentColor=--footer-fg）；tab 標誌 mask src+aspect-ratio 由 SVG viewBox 量。
 */

import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';
import { sitePath, SITE_BASE_PATHNAME } from './site-base.js';

// 圖示檔案欄位深取 filename_disk（<uuid>.svg）→ 組 CloudFront URL 繞過弱機 /assets 逾時（見 CMS_CDN_BASE）。
const TAB_FIELDS = 'key,nameZh,nameEn,note,markIcon.filename_disk,items.type,items.itemKey,items.labelZh,items.labelEn,' +
  'items.textZh,items.textEn,items.phoneCountry,items.phoneNumber,items.phoneExt,items.iconFile.filename_disk,items.url';
const DEEP = encodeURIComponent(JSON.stringify({ items: { _sort: ['sort'] } }));

// 右下法務連結：固定站內頁、標籤固定 → 寫死（不進 CMS）。頁面內文在 Directus regulations/support/policy_and_statements。
// 2026-09-09：regulations 與 policy 合併為「Regulations & Policy」一頁（隱私政策併入 regulations.html）；
//   無障礙聲明移進 Site Map（sitemap.html），故 policy-and-statements 不再列於 footer（頁面本身保留為孤兒 route）。
const LEGAL = [
  { labelEn: 'Donate', labelZh: '捐贈', url: 'donate.html' },
  { labelEn: 'Regulations & Policy', labelZh: '規章與政策', url: 'regulations.html' },
  { labelEn: 'Site Map', labelZh: '網站導覽', url: 'sitemap.html' },
];

let _dataPromise = null;

// copyright 設定（footer_settings 單例）：抓不到＝null（維持 HTML 靜態字），不拖累 tabs 主資料
async function fetchCopyright() {
  try {
    const res = await fetch(`${CMS_API_BASE}/footer_settings?fields=copyright_text,copyright_auto_year`);
    if (!res.ok) return null;
    const s = (await res.json()).data;
    return s ? { text: s.copyright_text, autoYear: !!s.copyright_auto_year } : null;
  } catch (_) { return null; }
}

async function fetchFooterData() {
  try {
    const [res, copyright] = await Promise.all([
      fetch(`${CMS_API_BASE}/footer_tabs?sort=sort&limit=-1&fields=${TAB_FIELDS}&deep=${DEEP}`),
      fetchCopyright(),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tabs = (await res.json()).data;
    if (!Array.isArray(tabs) || tabs.length === 0) throw new Error('empty data');
    // 圖示 filename_disk → CloudFront URL（fallback JSON 已預存 CDN 絕對 URL，不進這裡）
    tabs.forEach((t) => {
      t.markIconUrl = t.markIcon?.filename_disk ? `${CMS_CDN_BASE}/${t.markIcon.filename_disk}` : null;
      (t.items || []).forEach((it) => { it.iconUrl = it.iconFile?.filename_disk ? `${CMS_CDN_BASE}/${it.iconFile.filename_disk}` : null; });
    });
    return { tabs, copyright };
  } catch (err) {
    console.warn('[footer] CMS fetch failed, fallback /data/footer.json:', err && err.message);
    return (await fetch(sitePath('data/footer.json'))).json();
  }
}

export function getFooterData() {
  if (!_dataPromise) _dataPromise = fetchFooterData();
  return _dataPromise;
}

// icon URL 解析：CMS 是 http 絕對；fallback 本地路徑要 sitePath（inline style url() 依文件 base 解析、SPA 在 /pages/ 會錯）
const resolveAsset = (url) => (url && /^https?:\/\//.test(url) ? url : sitePath(url));

// SVG viewBox 比例（tab wordmark 用；社群 icon 走 .icon 方框免量）。fetch 一次快取；失敗回 wordmark-ish 3.5。
const _ratioCache = new Map();
async function getSvgRatio(url) {
  if (!url) return null;
  if (_ratioCache.has(url)) return _ratioCache.get(url);
  let ratio = 3.5;
  try {
    const txt = await (await fetch(url)).text();
    const m = /viewBox\s*=\s*["']\s*[\d.eE+-]+\s+[\d.eE+-]+\s+([\d.eE+-]+)\s+([\d.eE+-]+)/.exec(txt);
    if (m) { const w = parseFloat(m[1]), h = parseFloat(m[2]); if (w > 0 && h > 0) ratio = w / h; }
  } catch (_) { /* keep fallback */ }
  _ratioCache.set(url, ratio);
  return ratio;
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}
function link(url, { external = true, className = 'footer-link', ariaLabel } = {}) {
  const a = document.createElement('a');
  a.href = url;
  a.className = className;
  if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  if (ariaLabel) a.setAttribute('aria-label', ariaLabel);
  return a;
}

// 社群 icon＝雙色實心 SVG（黑塊白 f）用「原色 background-image」渲染、非 mask（mask 單色、且會把實心雙色填成整塊）。
// 反色由 CSS filter:invert 依 mode 控制（standard/color 深底 invert→白塊黑 f；inverse 反色白底 as-is→黑塊白 f）。見 .footer-social-glyph。
function buildSocialGroup(socials, fgroup) {
  const wrap = el('div', 'footer-social');
  wrap.dataset.fgroup = fgroup;
  socials.forEach((item) => {
    let label = 'Social';
    try { label = new URL(item.url).hostname.replace(/^www\./, '').split('.')[0]; label = label.charAt(0).toUpperCase() + label.slice(1); } catch (_) {}
    const box = el('div', 'footer-social-icon');
    const a = link(item.url || '#', { ariaLabel: label });
    const icon = el('span', 'icon footer-social-glyph');
    if (item.iconUrl) icon.style.setProperty('--icon', `url('${resolveAsset(item.iconUrl)}')`);
    a.appendChild(icon);
    box.appendChild(a);
    wrap.appendChild(box);
  });
  return wrap;
}

// 資訊卡通用外殼：.footer-info（+ itemKey→.footer-{key} 吃 legacy 版面）＋粗體標題列
function infoShell(item, fgroup) {
  const card = el('div', 'footer-info' + (item.itemKey ? ` footer-${item.itemKey}` : ''));
  card.dataset.fgroup = fgroup;
  const head = `${item.labelEn || ''} ${item.labelZh || ''}`.trim();
  if (head) card.appendChild(el('p', 'mb-xs font-bold', head));
  return card;
}

// 連結一律用後台填的 url（user 2026-10-01：地址等不再前台自動生成）；http(s) 開新分頁，mailto:/tel:/站內路徑原地
const isExternalUrl = (url) => /^https?:/i.test(url);

// 文字項（標題＋內文＋選填連結）。只有標題沒內文＝兩行卡（如關聯單位，整卡可點）；有內文＝粗體標題＋內文行（連結掛內文）。
// 舊類型 info/phone/address/link（後台遷移前資料）一律走這裡：phone 的國碼／號碼／分機併成英文內文。
function buildText(item, fgroup) {
  const phone = item.phoneNumber ? `${item.phoneCountry || ''} ${item.phoneNumber}`.trim() + (item.phoneExt ? ` #${item.phoneExt}` : '') : '';
  const textEn = item.textEn || phone;
  const textZh = item.textZh;
  if (!textEn && !textZh) {
    const card = item.url ? link(item.url, { className: 'footer-unit', external: isExternalUrl(item.url) }) : el('div', 'footer-unit');
    card.dataset.fgroup = fgroup;
    card.appendChild(el('span', 'footer-unit-en mb-en-zh-s', item.labelEn || ''));
    const zh = el('span', 'footer-unit-zh', item.labelZh || '');
    zh.lang = 'zh-Hant';
    card.appendChild(zh);
    return card;
  }
  const card = infoShell(item, fgroup);
  const line = (text, cls) => {
    const p = el('p', cls);
    if (item.url) { const a = link(item.url, { external: isExternalUrl(item.url) }); a.textContent = text; p.appendChild(a); }
    else p.textContent = text;
    card.appendChild(p);
    return p;
  };
  if (textEn) line(textEn, 'max-w-sm' + (textZh ? ' mb-xs' : ''));
  // 中文整行不拆（user 2026-10-01「104336 不需要分行」）：桌面散佈卡 nowrap 一行（footer.css .footer-text-zh）
  if (textZh) line(textZh, 'footer-text-zh').lang = 'zh-Hant';
  return card;
}

// 分頁說明文字（footer_tabs.note，選填；user 2026-10-03）：純文字、不可點、無 hover。留空＝該分頁不渲染（如關聯單位）。
// 第一行＝粗體標題，其餘照後台換行顯示。桌面貼散佈區左下角、散佈卡避開（footer-scatter.js 當 obstacle）；
// 外層＝定位／旋轉／clip-reveal 遮罩，內層做進出場位移。非桌面暫不顯示（footer.css）
function buildNote(tab) {
  const lines = String(tab.note || '').split(/\r?\n/).map((s) => s.trim());
  while (lines.length && !lines[0]) lines.shift();
  if (!lines.length) return null;
  const box = el('div', 'footer-note');
  box.dataset.fgroup = tab.key;
  const inner = el('div', 'footer-note-inner');
  inner.appendChild(el('p', 'footer-note-title font-bold', lines.shift()));
  const body = lines.join('\n').trim();
  if (body) inner.appendChild(el('p', 'footer-note-body', body));
  box.appendChild(inner);
  return box;
}

// Copyright：「Copyright ©」固定，後面二選一（user 2026-10-01）：後台 footer_settings 開「自動年份」＝今年（每年自動換），
// 否則＝後台文字。沒設定（後台未建／抓不到）＝維持 HTML 靜態「Copyright © SCCD」
function renderCopyright(footerRoot, copyright) {
  const p = footerRoot.querySelector('.footer-copyright');
  if (!p || !copyright) return;
  const tail = copyright.autoYear ? String(new Date().getFullYear()) : (copyright.text || '').trim();
  if (tail) p.textContent = `Copyright © ${tail}`;
}

function buildTabButton(tab, active, markRatio) {
  const btn = el('button', 'footer-tab' + (active ? ' is-active' : ''));
  btn.type = 'button';
  btn.dataset.fgroup = tab.key;
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  btn.setAttribute('aria-label', `${tab.nameEn} ${tab.nameZh}`);
  if (tab.markIconUrl) {
    const mark = el('span', 'footer-tab-mark');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.setProperty('--tab-mark-src', `url('${resolveAsset(tab.markIconUrl)}')`);
    if (markRatio) mark.style.aspectRatio = String(markRatio);
    btn.appendChild(mark);
  }
  btn.appendChild(el('span', 'footer-tab-en', tab.nameEn || ''));
  btn.appendChild(el('span', 'footer-tab-zh', tab.nameZh || ''));
  return btn;
}

function renderLegal(footerRoot, legal) {
  if (!legal || !legal.length) return;
  const privacy = footerRoot.querySelector('.footer-privacy > div');
  if (!privacy) return;
  privacy.querySelectorAll('[data-footer-legal]').forEach((n) => n.remove());
  const anchor = privacy.querySelector('.footer-a11y-badge') || privacy.firstChild;
  legal.forEach((lg) => {
    // ⚠️ 站內頁 href 要用 pathname 形式不能用 sitePath()（完整 http URL 會被 router 攔截器當外部連結放行
    //    → 整頁重載、footer/頁面退場動畫全不播）；SITE_BASE_PATHNAME 前綴讓子路徑部署也成立
    const a = link(SITE_BASE_PATHNAME + 'pages/' + (lg.url || ''), { external: false });
    a.dataset.footerLegal = '1';
    a.append(el('span', 'footer-legal-en mb-en-zh-s', `${lg.labelEn || ''} `), el('span', 'footer-legal-zh', lg.labelZh || ''));
    privacy.insertBefore(a, anchor);
  });
}

/** 渲染單一 footer root（idempotent；重呼叫先清本模組節點再建） */
export async function renderFooterContent(footerRoot) {
  if (!footerRoot) return;
  const area = footerRoot.querySelector('.footer-random');
  const tabsBox = footerRoot.querySelector('.footer-tabs');
  if (!area || !tabsBox) return;

  const { tabs, copyright } = await getFooterData();
  if (!tabs || !tabs.length) return;

  // tab 標誌 viewBox 比例先量好（wordmark 才需要；社群 icon 走方框）
  const markUrls = [...new Set(tabs.map((t) => t.markIconUrl).filter(Boolean))];
  const ratioMap = {};
  await Promise.all(markUrls.map(async (u) => { ratioMap[u] = await getSvgRatio(resolveAsset(u)); }));

  const current = area.dataset.fgroup;
  const activeKey = tabs.some((t) => t.key === current) ? current : tabs[0].key;
  area.dataset.fgroup = activeKey;

  tabsBox.querySelectorAll('.footer-tab').forEach((n) => n.remove());
  area.querySelectorAll('[data-footer-rendered]').forEach((n) => n.remove());

  const frag = document.createDocumentFragment();
  tabs.forEach((tab) => {
    tabsBox.appendChild(buildTabButton(tab, tab.key === activeKey, ratioMap[tab.markIconUrl]));
    const items = Array.isArray(tab.items) ? tab.items : [];
    const socials = items.filter((i) => i && i.type === 'social');
    let socialPlaced = false;
    items.forEach((item) => {
      if (!item) return;
      let node = null;
      if (item.type === 'social') {
        if (socialPlaced) return;
        node = buildSocialGroup(socials, tab.key);
        socialPlaced = true;
      } else node = buildText(item, tab.key);
      node.dataset.footerRendered = '1';
      frag.appendChild(node);
    });
    const note = buildNote(tab);
    if (note) { note.dataset.footerRendered = '1'; frag.appendChild(note); }
  });
  area.appendChild(frag);
  renderLegal(footerRoot, LEGAL);
  renderCopyright(footerRoot, copyright);
}

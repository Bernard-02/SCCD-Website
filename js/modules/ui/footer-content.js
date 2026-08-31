/**
 * Footer Content v2（Directus footer_tabs / footer_items / footer_legal → 渲染兩份 footer）
 *
 * 後台（footer 集合資料夾）：
 *   footer_tabs   — 分頁名/標誌(markIcon 檔)/順序（拖曳）
 *   footer_items  — 各分頁項目（tab-first：在分頁詳情內拖曳）；type = info/phone/address/link/social
 * 右下法務連結＝3 個固定站內頁（Donate/規章/政策），標籤固定 → 前台寫死 LEGAL const，不進 CMS
 *   （對應內容仍在 Directus regulations/support/policy_and_statements；那些是頁面內文，標題與 footer 標籤不同）。
 * 圖示（tab 標誌 + 社群 icon）＝Directus Files「Site Icons」資料夾的 SVG，前台以 CSS mask 依 mode 上色。
 *
 * 前台：single-flight cache；CMS 掛/空 → fallback /data/footer.json（其 icon 存本地路徑）。
 * 渲染輸出「與 legacy 靜態 HTML 同構」DOM：資訊卡帶 .footer-info + itemKey(.footer-tel/fax/email/office) 吃既有版面；
 * 社群 icon 走全站 .icon（--icon mask + currentColor=--footer-fg）；tab 標誌 mask src+aspect-ratio 由 SVG viewBox 量。
 */

import { CMS_API_BASE, CMS_CDN_BASE } from '../../config/api.js';
import { sitePath, SITE_BASE_PATHNAME } from './site-base.js';

// 圖示檔案欄位深取 filename_disk（<uuid>.svg）→ 組 CloudFront URL 繞過弱機 /assets 逾時（見 CMS_CDN_BASE）。
const TAB_FIELDS = 'key,nameZh,nameEn,markIcon.filename_disk,items.type,items.itemKey,items.labelZh,items.labelEn,' +
  'items.textZh,items.textEn,items.phoneCountry,items.phoneNumber,items.phoneExt,items.iconFile.filename_disk,items.url';
const DEEP = encodeURIComponent(JSON.stringify({ items: { _sort: ['sort'] } }));

// 右下法務連結：固定 3 個站內頁、標籤固定 → 寫死（不進 CMS）。頁面內文在 Directus regulations/support/policy_and_statements。
const LEGAL = [
  { labelEn: 'Donate', labelZh: '捐贈', url: 'donate.html' },
  { labelEn: 'Regulations', labelZh: '學系規章', url: 'regulations.html' },
  { labelEn: 'Policies & Statements', labelZh: '政策及聲明', url: 'policy-and-statements.html' },
];

let _dataPromise = null;

async function fetchFooterData() {
  try {
    const res = await fetch(`${CMS_API_BASE}/footer_tabs?sort=sort&limit=-1&fields=${TAB_FIELDS}&deep=${DEEP}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tabs = (await res.json()).data;
    if (!Array.isArray(tabs) || tabs.length === 0) throw new Error('empty data');
    // 圖示 filename_disk → CloudFront URL（fallback JSON 已是本地路徑，不進這裡）
    tabs.forEach((t) => {
      t.markIconUrl = t.markIcon?.filename_disk ? `${CMS_CDN_BASE}/${t.markIcon.filename_disk}` : null;
      (t.items || []).forEach((it) => { it.iconUrl = it.iconFile?.filename_disk ? `${CMS_CDN_BASE}/${it.iconFile.filename_disk}` : null; });
    });
    return { tabs };
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

function buildPhone(item, fgroup) {
  const card = infoShell(item, fgroup);
  const num = `${item.phoneCountry || ''} ${item.phoneNumber || ''}`.trim() + (item.phoneExt ? ` #${item.phoneExt}` : '');
  card.appendChild(el('p', null, num));
  return card;
}

function buildAddress(item, fgroup) {
  const card = infoShell(item, fgroup);
  // 前台由地址自動生 Google 地圖連結（英文地址優先，較利於查詢）
  const query = (item.textEn || item.textZh || '').trim();
  const mapUrl = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
  const addrLine = (text, cls) => {
    const p = el('p', cls);
    if (mapUrl) { const a = link(mapUrl); a.textContent = text; p.appendChild(a); }
    else p.textContent = text;
    return p;
  };
  if (item.textEn) card.appendChild(addrLine(item.textEn, 'max-w-sm' + (item.textZh ? ' mb-xs' : '')));
  if (item.textZh) {
    // 復刻「郵遞區號 <br> 其餘」：桌面散佈卡兩行、<1200 br 隱藏自然併行
    const p = el('p', 'footer-office-zh');
    p.lang = 'zh-Hant';
    const idx = item.textZh.indexOf(' ');
    if (mapUrl) {
      const a = link(mapUrl);
      if (idx > 0) { a.append(document.createTextNode(item.textZh.slice(0, idx) + ' '), el('br', 'footer-office-zh-br'), document.createTextNode(item.textZh.slice(idx + 1))); }
      else a.textContent = item.textZh;
      p.appendChild(a);
    } else p.textContent = item.textZh;
    card.appendChild(p);
  }
  return card;
}

function buildInfo(item, fgroup) {
  const card = infoShell(item, fgroup);
  const addText = (text) => {
    const p = el('p');
    if (item.url) { const isMail = /^(mailto:|tel:)/.test(item.url); const a = link(item.url, { external: !isMail }); a.textContent = text; p.appendChild(a); }
    else p.textContent = text;
    card.appendChild(p);
  };
  if (item.textEn) addText(item.textEn);
  if (item.textZh) addText(item.textZh);
  return card;
}

function buildLink(item, fgroup) {
  const a = link(item.url || '#', { className: 'footer-unit' });
  a.dataset.fgroup = fgroup;
  a.appendChild(el('span', 'footer-unit-en mb-en-zh-s', item.labelEn || ''));
  const zh = el('span', 'footer-unit-zh', item.labelZh || '');
  zh.lang = 'zh-Hant';
  a.appendChild(zh);
  return a;
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

  const { tabs } = await getFooterData();
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
      switch (item.type) {
        case 'social': if (socialPlaced) return; node = buildSocialGroup(socials, tab.key); socialPlaced = true; break;
        case 'phone': node = buildPhone(item, tab.key); break;
        case 'address': node = buildAddress(item, tab.key); break;
        case 'link': node = buildLink(item, tab.key); break;
        default: node = buildInfo(item, tab.key);
      }
      node.dataset.footerRendered = '1';
      frag.appendChild(node);
    });
  });
  area.appendChild(frag);
  renderLegal(footerRoot, LEGAL);
}

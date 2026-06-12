/**
 * About Data Loader（Vision / Class / Works）
 *
 * 把 about 頁 Vision（理念）/ Class（學制）/ Works（作品）三區的「文字內容」從
 * /data/about-*.json 注入到 about.html 既有的 DOM 容器（依 data-division 對位）。
 * about.html 內保留的硬編文字＝fallback；此 loader 跑完即以 JSON 為準覆寫。
 *
 * 之後要接 Directus：把這三個 fetch 路徑改成 `${CMS_API_BASE}/about_vision` 等即可
 * （singleton 回 {data:{...}}、list 回 {data:[...]}，記得解一層 .data）。
 *
 * 互動（sticky 切換 / slideshow / highlight / works 影片）全部仍由原模組處理，
 * 此 loader 只填內容、不碰互動 → 必須在那些 init 之前 await 完成（main-modular 已 defer）。
 */

import { sitePath } from '../../ui/site-base.js';

const SRC = {
  vision: '/data/about-vision.json',
  classes: '/data/about-class.json',
  works: '/data/about-works.json',
};

// 把 "段落1\n\n段落2" 拆成乾淨陣列
function splitParas(text) {
  return (text || '').split('\n\n').map(s => s.trim()).filter(Boolean);
}

// 交錯建 <p>：EN[i] 後接 ZH[i]。class 由呼叫端給（loader 端的 presentation，JSON 不含 class）
function buildInterleavedParas(en, zh, { enClass, zhClass, lastZhClass }) {
  const enArr = splitParas(en);
  const zhArr = splitParas(zh);
  const n = Math.max(enArr.length, zhArr.length);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    if (enArr[i]) {
      const p = document.createElement('p');
      p.className = enClass;
      p.textContent = enArr[i];
      frag.appendChild(p);
    }
    if (zhArr[i]) {
      const p = document.createElement('p');
      p.className = isLast ? lastZhClass : zhClass;
      p.textContent = zhArr[i];
      frag.appendChild(p);
    }
  }
  return frag;
}

// ── Vision（理念）：兩個 [data-overview-hl] span，DOM 順序 = EN、ZH ──
function fillVision(vision) {
  if (!vision) return;
  const spans = document.querySelectorAll('#overview [data-overview-hl]');
  if (spans[0] && vision.descriptionEn != null) spans[0].textContent = vision.descriptionEn;
  if (spans[1] && vision.descriptionZh != null) spans[1].textContent = vision.descriptionZh;
}

// ── Class（學制）：依 divisionKey 填按鈕標籤 + 學制標籤 + 圖文段落 ──
function fillClasses(list) {
  if (!Array.isArray(list)) return;
  // 供手機輪播（bfa-division-toggle.js）讀取 division 清單，維持單一資料來源
  /** @type {any} */ (window).SCCD_aboutClass = list;

  list.forEach(item => {
    const key = item.divisionKey;
    if (!key) return;

    // 桌面按鈕：第 1 個 div = EN、第 2 個 div = ZH
    const btn = document.querySelector(`.class-division-btn[data-division="${key}"]`);
    if (btn) {
      const divs = btn.querySelectorAll(':scope > div');
      if (divs[0] && item.nameEn != null) divs[0].textContent = item.nameEn;
      if (divs[1] && item.nameZh != null) divs[1].textContent = item.nameZh;
      // 學制標籤（按鈕前一個 .class-group-label，例 BFA 學士班）；groupLabel 空則不動
      const label = btn.previousElementSibling;
      if (label && label.classList.contains('class-group-label') && item.groupLabel) {
        label.textContent = item.groupLabel;
      }
    }

    // 手機分組 pill（.mobile-division-btn）：同步 EN/ZH 標籤（與桌面同一資料來源）
    const mobileBtn = document.querySelector(`.mobile-division-btn[data-division="${key}"]`);
    if (mobileBtn) {
      const mdivs = mobileBtn.querySelectorAll('.anchor-nav-inner > div');
      if (mdivs[0] && item.nameEn != null) mdivs[0].textContent = item.nameEn;
      if (mdivs[1] && item.nameZh != null) mdivs[1].textContent = item.nameZh;
    }

    // 圖文段落：EN1/ZH1/EN2/ZH2 交錯（沿用原 mb-xs / mb-md / 末段無 margin）
    const hl = document.querySelector(`.class-info-panel[data-division="${key}"] [data-class-hl]`);
    if (hl) {
      hl.innerHTML = '';
      hl.appendChild(buildInterleavedParas(item.descriptionEn, item.descriptionZh, {
        enClass: 'mb-xs division-text font-bold',
        zhClass: 'mb-md division-text font-bold',
        lastZhClass: 'division-text font-bold',
      }));
    }
  });
}

// playlist 網址 → embed 網址（videoseries 播整個清單）
function playlistToEmbed(url) {
  if (!url) return '';
  const m = url.match(/[?&]list=([^&]+)/);
  return m ? `https://www.youtube.com/embed/videoseries?list=${m[1]}` : '';
}

// ── Works（作品）：依 divisionKey 填說明段落（保留 .works-playlist-list）+ iframe src ──
function fillWorks(list) {
  if (!Array.isArray(list)) return;

  list.forEach(item => {
    const key = item.divisionKey;
    if (!key) return;
    const panel = document.querySelector(`.class-works-panel[data-division="${key}"]`);
    if (!panel) return;

    const hl = panel.querySelector('[data-works-hl]');
    if (hl) {
      hl.querySelectorAll(':scope > p').forEach(p => p.remove());
      const frag = buildInterleavedParas(item.descriptionEn, item.descriptionZh, {
        enClass: 'text-p2 mb-xs font-bold',
        zhClass: 'text-p2 mb-xs font-bold',
        lastZhClass: 'text-p2 font-bold',
      });
      const playlistList = hl.querySelector('.works-playlist-list');
      if (playlistList) hl.insertBefore(frag, playlistList);
      else hl.appendChild(frag);
    }

    // iframe：youtubePlaylist 空（如 MDES）→ src 留空
    const iframe = panel.querySelector('iframe.works-video-iframe');
    if (iframe) iframe.setAttribute('src', playlistToEmbed(item.youtubePlaylist));
  });
}

export async function loadAboutContent() {
  const [vision, classes, works] = await Promise.all([
    fetch(sitePath(SRC.vision)).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch(sitePath(SRC.classes)).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch(sitePath(SRC.works)).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  fillVision(vision);
  fillClasses(classes);
  fillWorks(works);
}

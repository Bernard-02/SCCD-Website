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

// ── Vision（理念）：兩個 [data-overview-hl] span，DOM 順序 = EN、ZH ──
// 文字寫進內層 [data-overview-text]（手機內捲層，padding 留在外盒）；無內層時退回外盒
function fillVision(vision) {
  if (!vision) return;
  const spans = document.querySelectorAll('#overview [data-overview-hl]');
  const target = i => spans[i] && (spans[i].querySelector('[data-overview-text]') || spans[i]);
  if (spans[0] && vision.descriptionEn != null) target(0).textContent = vision.descriptionEn;
  if (spans[1] && vision.descriptionZh != null) target(1).textContent = vision.descriptionZh;
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

    // 圖文段落：一段英文、一段中文（EN 吃 mb-en-zh-body、ZH 末段無距）
    const hl = document.querySelector(`.class-info-panel[data-division="${key}"] [data-class-hl]`);
    if (hl) {
      // 寫進內層 [data-class-text]（手機內捲層，padding 留在外盒）；無內層退回外盒
      const box = hl.querySelector('[data-class-text]') || hl;
      box.innerHTML = '';
      // 一段英文、一段中文（user 2026-08-13）：不再拆句交錯；EN→ZH 距離吃 --space-en-zh-body
      // （源文的 \n\n 段落分隔在 text node 內由 white-space:normal 收成單一空格）
      const enP = document.createElement('p');
      enP.className = 'mb-en-zh-body division-text font-regular';
      enP.textContent = item.descriptionEn || '';
      const zhP = document.createElement('p');
      zhP.className = 'division-text font-regular';
      zhP.lang = 'zh-Hant';   // 多行中文吃中文行距（--line-height-zh-*）
      zhP.textContent = item.descriptionZh || '';
      box.append(enP, zhP);
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
      // 段落與 playlist 都在內層 [data-works-text]（手機內捲層）；無內層退回外盒
      const box = hl.querySelector('[data-works-text]') || hl;
      box.querySelectorAll(':scope > p').forEach(p => p.remove());
      // 一段英文、一段中文（user 2026-08-13）：EN→ZH 距離吃 --space-en-zh-body
      const frag = document.createDocumentFragment();
      const enP = document.createElement('p');
      enP.className = 'text-s mb-en-zh-body font-regular';
      enP.textContent = item.descriptionEn || '';
      const zhP = document.createElement('p');
      zhP.className = 'text-s font-regular';
      zhP.lang = 'zh-Hant';   // 多行中文吃中文行距
      zhP.textContent = item.descriptionZh || '';
      frag.append(enP, zhP);
      const playlistList = box.querySelector('.works-playlist-list');
      if (playlistList) box.insertBefore(frag, playlistList);
      else box.appendChild(frag);
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

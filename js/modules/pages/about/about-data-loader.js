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
 * 互動（sticky 切換 / slideshow / works 影片）全部仍由原模組處理，
 * 此 loader 只填內容 → 必須在那些 init 之前 await 完成（main-modular 已 defer）。
 * 檔尾另有 initAboutHighlights：同一批說明色卡的底色＋Vision 字卡進退場（原 brand-trail.js）。
 */

import { loadAboutVision, loadAboutClasses, loadAboutWorks } from './about-source.js';
import { YT_API_KEY } from '../../../config/api.js';
import { isNavSpinDesktop } from '../../ui/section-switch-helpers.js';
import { registerPageExit } from '../../ui/page-exit.js';
import { setupClipReveal, playClipReveal, playRevealExit, tiltCardMask } from '../../ui/scroll-animate.js';

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

    // 組別按鈕標籤（EN/ZH/學制）已移到 ui_labels 統一管（見 ui-labels.js，data-label-key="program.*"），
    // 與 curriculum 組別按鈕共用單一後台來源；此 loader 只填圖文段落。

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

// playlist 網址 → embed 網址。
// ⚠️「播放清單選單／清單面板」是 YouTube 播放器自家 UI，沒有任何 embed 參數能強制開啟——videoseries 與 VIDEO_ID?list=
//    兩種形式差在「有沒有初始影片」而非選單有無。實務上 watch 連結（VIDEO_ID?list=）較常見清單列出現，故編輯者貼
//    watch URL（含 v= 或 youtu.be/）時保留 video id 用該形式；只貼純 playlist URL 才退回 videoseries（播整清單）。
function playlistToEmbed(url) {
  if (!url) return '';
  const list = url.match(/[?&]list=([^&]+)/)?.[1];
  if (!list) return '';
  const vid = url.match(/[?&]v=([^&]+)/)?.[1] || url.match(/youtu\.be\/([^&?/]+)/)?.[1];
  return vid
    ? `https://www.youtube.com/embed/${vid}?list=${list}`
    : `https://www.youtube.com/embed/videoseries?list=${list}`;
}

// ── YouTube 清單：playlistId → [{id,title}]（single-flight + sessionStorage LKG，省 quota；失敗退上次成功）──
// ⚠️ iframe 本就會播整個清單；這只為在畫面上「自己列出清單有哪些影片、點了換片」（YouTube embed 開不出自家清單選單）。
const ytCache = new Map();
function fetchPlaylist(listId) {
  if (ytCache.has(listId)) return ytCache.get(listId);
  const ssKey = 'yt:' + listId;
  const p = (async () => {
    // maxResults 上限 50 → 跟 nextPageToken 抓完整清單（1 unit/頁；封 5 頁=250 部防異常長清單）
    const items = [];
    let pageToken = '';
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${listId}&key=${YT_API_KEY}${pageToken ? `&pageToken=${pageToken}` : ''}`);
      if (!r.ok) throw r.status;
      const d = await r.json();
      items.push(...(d.items || []));
      pageToken = d.nextPageToken;
      if (!pageToken) break;
    }
    return items
      // 私人/已刪影片：resourceId 還在但 thumbnails 是空物件 → 一併濾掉（縮圖清單顯示灰圖也點不動）
      .filter(it => it.snippet?.resourceId?.videoId && it.snippet?.thumbnails?.medium)
      .map(it => ({ id: it.snippet.resourceId.videoId, title: it.snippet.title }));
  })()
    .then(vids => { if (vids.length) sessionStorage.setItem(ssKey, JSON.stringify(vids)); return vids; })
    .catch(err => {
      // 403 多半＝referrer 未過白名單（key 只放 localhost / github.io / sccd.usc.edu.tw；127.0.0.1、file:// 會被擋）
      console.warn('[works playlist] YouTube API 失敗（' + err + '），清單不顯示；改用 http://localhost:PORT 開，或把該 origin 加進 key 的 referrer 白名單。', listId);
      const s = sessionStorage.getItem(ssKey); return s ? JSON.parse(s) : [];
    });
  ytCache.set(listId, p);
  return p;
}

// 清單渲染＝播放器右側縮圖欄（16:9 thumb、無標題、隨機三原色底）；點某支 → iframe 換該影片（保留 ?list=）。
// accent 底設在 scroll 層而非外盒：scroll 層是 works cross-slide 動畫的共同 target（見 bfa-division-toggle
// 'iframe, .works-playlist-scroll'），色塊要跟縮圖一起滑、外盒（遮罩）保持透明。
// scroll 層晚於 works 進場 gsap.set 出生 → 出生時同步 iframe 當前 x/yPercent（iframe 藏著等 reveal 就跟著藏）。
function renderPlaylist(box, iframe, listId, vids) {
  if (!vids.length) return;
  const scroll = document.createElement('div');
  scroll.className = 'works-playlist-scroll';   // 滑動層＝色底＋動畫 target；捲動在內層
  scroll.style.background = SCCDHelpers.getRandomAccentColor();
  // 內捲層退縮在色塊內（inset）＝scrollbar 貼內層右緣、離色塊邊緣一個 padding（同 vision 卡：捲動容器≠色卡本身）
  const inner = document.createElement('div');
  inner.className = 'works-playlist-inner list-scroll';
  scroll.appendChild(inner);
  const spinOn = isNavSpinDesktop();
  vids.forEach(v => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'works-playlist-item';
    b.dataset.vid = v.id;
    // default 隨機旋轉（全站 -4~+6° 排除 0）；桌面 hover 轉正（lists.css）、離開換新角（全站卡片內圖片同款，user 2026-10-19）
    b.style.setProperty('--pl-rot', `${SCCDHelpers.getRandomRotation()}deg`);
    if (spinOn) b.addEventListener('mouseleave', () =>
      b.style.setProperty('--pl-rot', `${SCCDHelpers.rerollAngle(SCCDHelpers.getRandomRotation, b.style.getPropertyValue('--pl-rot'))}deg`));
    const img = document.createElement('img');
    img.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;   // 320×180 真 16:9（hqdefault 是 4:3 帶黑邊）
    img.alt = v.title;
    img.loading = 'lazy';     // 清單長、視窗外的省流量；此處無 data-pending-reveal gate、lazy 安全
    img.decoding = 'async';
    b.appendChild(img);
    inner.appendChild(b);
  });
  // 出生就框住當前播放那支（user 2026-10-26）：watch URL 帶 v= 的那支，videoseries 沒初始影片＝第一支
  const curVid = iframe.src.match(/\/embed\/([^?]+)/)?.[1];
  (inner.querySelector(`[data-vid="${curVid}"]`) || inner.firstElementChild)?.classList.add('is-active');
  scroll.addEventListener('click', e => {
    const btn = e.target.closest('.works-playlist-item');
    if (!btn) return;
    // enablejsapi=1 必帶：換片重設 src 會丟掉 pauseVideosOffscreen 補的參數 → 之後捲走/換 tab 的 pauseVideo postMessage 全失效
    iframe.src = `https://www.youtube.com/embed/${btn.dataset.vid}?list=${listId}&autoplay=1&enablejsapi=1`;
    scroll.querySelectorAll('.works-playlist-item').forEach(x => x.classList.toggle('is-active', x === btn));
  });
  if (typeof gsap !== 'undefined') {
    gsap.set(scroll, {
      xPercent: gsap.getProperty(iframe, 'xPercent'),
      yPercent: gsap.getProperty(iframe, 'yPercent'),
    });
  }
  box.replaceChildren(scroll);
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
      box.appendChild(frag);   // playlist 已移出文字盒（改在播放器旁），純段落直接 append
    }

    // iframe：youtubePlaylist 空（如 MDES）→ src 留空
    const iframe = panel.querySelector('iframe.works-video-iframe');
    if (iframe) iframe.setAttribute('src', playlistToEmbed(item.youtubePlaylist));

    // 自己那份可點清單：抽 URL 裡的 list ID → API 抓 titles → 渲染（編輯不變，照舊只貼 URL）
    const listId = item.youtubePlaylist?.match(/[?&]list=([^&]+)/)?.[1];
    const listBox = panel.querySelector('.works-playlist-list');
    if (listId && listBox && iframe) {
      fetchPlaylist(listId).then(vids => renderPlaylist(listBox, iframe, listId, vids));
    }
  });
}

export async function loadAboutContent() {
  // Directus 優先，各自本地 fallback（about-source.js）；任一失敗只影響該區、其餘照填
  const [vision, classes, works] = await Promise.all([
    loadAboutVision().catch(() => null),
    loadAboutClasses().catch(() => null),
    loadAboutWorks().catch(() => null),
  ]);
  fillVision(vision);
  fillClasses(classes);
  fillWorks(works);
}

// ── 說明色卡底色＋Vision 字卡進退場（原 brand-trail.js，2026-10-20 拖尾圖移除後併進來：同一批 [data-*-hl] 卡）──
// main-modular 在 loadAboutContent 完成、alive() 檢查後才呼叫（不放進 loadAboutContent：換頁中途不該註冊 exit／ScrollTrigger）
export function initAboutHighlights() {
  initOverviewHighlight();
  initClassHighlight();
  initWorksHighlight();
}

// Class 文字底色：每個 .class-info-panel 隨機一色，整塊文字區同色
function initClassHighlight() {
  const panels = document.querySelectorAll('.class-info-panel');
  if (!panels.length) return;
  panels.forEach(panel => {
    const color = SCCDHelpers.getRandomAccentColor();
    /** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll('[data-class-hl]')).forEach(el => {
      el.style.background = color;
      tiltCardMask(el);
    });
  });
}

// Works 底色：每個 .class-works-panel 隨機一色，標題/內文同色（整塊）
function initWorksHighlight() {
  const panels = document.querySelectorAll('.class-works-panel');
  if (!panels.length) return;
  panels.forEach(panel => {
    const color = SCCDHelpers.getRandomAccentColor();
    /** @type {NodeListOf<HTMLElement>} */ (panel.querySelectorAll('[data-works-hl]')).forEach(el => {
      el.style.background = color;
      tiltCardMask(el);
    });
  });
}

// Overview 文字底色（套在 span 上，只有文字部份有色）
// 進退場：Vision 字卡 hero clip-reveal（整塊色卡在父 <p> 遮罩內 yPercent 升起/沉出）。
// user 2026-08-10 一致化：文字字卡走 clip-reveal（滑動+遮罩）不再用 clip-path 擦除。
// 色卡＝含色底的 [data-overview-hl]（span），父 <p> 當靜止遮罩：span 在 p 內不可插 div wrapper，
// 故直接把父 <p> 設 overflow:clip（setupClipReveal 偵測父層已 clip 就不另包 wrapper），整塊色卡在 p 內滑動。
function initOverviewHighlight() {
  const hls = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('[data-overview-hl]')));
  if (!hls.length) return;
  const color = SCCDHelpers.getRandomAccentColor();
  hls.forEach(el => { el.style.background = color; });

  if (typeof gsap === 'undefined') return;

  // 父 <p> 當遮罩（overflow-y:clip；x 放行不裁行內裝飾）→ setupClipReveal 沿用不另包 div、色卡 yPercent:100 藏起
  hls.forEach(el => {
    const p = el.parentElement;
    if (p) { p.style.overflowY = 'clip'; p.style.overflowX = 'visible'; }
  });
  setupClipReveal(hls);

  let revealed = false;
  const reveal = () => { revealed = true; playClipReveal(hls, { stagger: { each: 0.08 } }); };
  if (typeof ScrollTrigger === 'undefined') { reveal(); }
  // trigger 用父 <p>（靜止遮罩、在自然 flow）而非 hls[0]（已被 gsap.set yPercent:100 = translateY 整個高度）：
  // ScrollTrigger 依 trigger 的「變形後」位置算 start，用被下推整段高度的 span 當 trigger → start 被推到頁面
  // 捲不到的地方（文字越窄越高、下推越多）→ onEnter 永不觸發、Vision 永久藏起（<1200px 症狀根因）。
  // 父 <p> 高度=文字自然高、位置不受 child transform 影響 → 'top 88%' 在各寬度都可靠觸發。
  else ScrollTrigger.create({ trigger: hls[0].parentElement || hls[0], start: 'top 88%', once: true, onEnter: reveal });

  // 離頁退場：整塊色卡 yPercent 沉出遮罩（clip-reveal 反向）；只在已進場 + 視窗內才跑（playRevealExit 內建 viewportOnly）
  registerPageExit(() => revealed ? playRevealExit(hls, { stagger: 0.08 }) : Promise.resolve());
}

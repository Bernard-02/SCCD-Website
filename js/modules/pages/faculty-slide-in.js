/**
 * Faculty Slide-in Module
 * 處理師資頁面的側邊滑入詳情頁功能
 *
 * 對齊 WP CMB2 schema：educations[] / experiences[] / awards[] 三個 sibling group，
 * 不再是舊版 sections[].items[] 雙層結構。本檔負責將打平資料重組成 3 個 section
 * （學歷 / 經歷 / 獲獎）渲染到 #faculty-detail-sections。
 *
 * Header 處理：比照 activities-lightbox / library-viewer 透過 lightbox-shell
 * 把 header bars 用 clip-path 收掉（logo 不動），確保 overlay 上只剩 logo 浮在最上
 */

// 無障礙 modal：記住開啟 slide-in 的觸發卡片，關閉時把焦點還回去
let facultyReturnFocus = /** @type {HTMLElement|null} */ (null);

// 有真實照片＋後台也傳了 wireframe 版的老師：slide-in 內每 5s 照片↔線框輪替的 timer。
// 2026-08-16 由 clip-path wipe 換 src 改 clip-reveal 層疊（user：placeholder 不動、照片像蓋上去）：
// 線框墊底恆顯（#faculty-detail-wireframe，absolute 不動畫）、照片上層在旋轉容器（overflow:clip）內
// 4 方向隨機滑出露線框／滑回蓋住；±110 過衝防 dpr hairline（同 faculty-filter SLIDE_MAP）
const CYCLE_SLIDE = {
  top:    { xPercent: 0,    yPercent: -110 },
  right:  { xPercent: 110,  yPercent: 0 },
  bottom: { xPercent: 0,    yPercent: 110 },
  left:   { xPercent: -110, yPercent: 0 },
};
const CYCLE_DIRS = Object.keys(CYCLE_SLIDE);
const randCycleDir = () => CYCLE_DIRS[(Math.random() * CYCLE_DIRS.length) | 0];
// 圖片遮罩容器旋轉角：每次開卡＋每次照片滑回蓋住時重擲（user 2026-08-16）。
// 範圍 ±3~6 同 grid 卡圖（HTML 的 rotate(-4deg) 只是 JS 前的初始值）；標題文字另有 ±2~4 cap 別混用
const randImgDeg = () => (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3);
let facultyImgCycleTimer = /** @type {ReturnType<typeof setInterval>|null} */ (null);
function stopFacultyImgCycle() {
  if (facultyImgCycleTimer) { clearInterval(facultyImgCycleTimer); facultyImgCycleTimer = null; }
  // 關卡/換老師可能落在滑動中途 → 殺 tween + 清 transform，下一位照片從「蓋住」狀態開始
  const img = document.getElementById('faculty-detail-image');
  if (img) {
    if (typeof gsap !== 'undefined') gsap.killTweensOf([img, img.parentElement]);
    img.style.transform = '';
    // 遮罩容器角度不歸位：中途殺掉停在當下角度即可，下次開卡會重擲
  }
}

import { enterLightboxMode, exitLightboxMode } from '../lightbox/lightbox-shell.js';
import { openSlideInBg, closeSlideInBg } from '../ui/slide-in-bg-sync.js';
import { prefersReducedMotion } from '../ui/reduce-motion.js';
import { DUR, EASE } from '../ui/motion.js';
import { countryName } from '../../data/country-names.js';
import { getFacultyData } from './faculty-source.js';
import { modePlaceholderUrl } from './faculty-data-loader.js';
import { applyMarqueeOverflow, buildSyncedMarqueeTimeline } from '../ui/marquee-overflow.js';
import { makeActivatable } from '../ui/a11y.js';
import { registerPageCleanup } from '../ui/page-cleanup.js';
import { loadUiLabels } from '../ui/ui-labels.js';

// 系所全名（slide-in 名字上方 tag）＝Directus ui_labels，老師後台可改；載入後填入、開卡時讀。
// key = `faculty.department.<department 欄值>`（dcd / bpaidc）；未載入 / 無此 row → 退下方 DEPT_FALLBACK。
let facultyUiLabels = null;
const DEPT_FALLBACK = {
  dcd:    { en: 'Department of Communications Design (DCD)', zh: '媒體傳達設計學系' },
  bpaidc: { en: 'Bachelor Program of AI Design Craftsmentship (BPAIDC)', zh: 'AI 設計職人學位學程' },
};

// 桌面 slide-in 詳情 cell 的 marquee 改用 JS 驅動，取代 CSS :hover animation——
// 目的：hover 離開時讓正在跑的文字「平滑捲回原點」，而非 CSS animation 被移除時 transform 直接歸 0 的瞬間 snap。
//   進場：cell 內每條溢出的 .faculty-marquee-line 共用一個 GSAP timeline（buildSyncedMarqueeTimeline）：
//   全部用「最長那條的自然速度」當共同 duration，短的移動比較慢但跟長的同時抵達終點，一輪跑完停 0.6s
//   （repeatDelay）才一起歸零重播——不是各自用自己的速度各跑各的（那樣會脫拍）。
//   離場：讀目前位移當起點，補間回 translateX(0)（0.45s，hero exit 同曲線）。
// cell = 每一欄 span：hover 該欄只捲它自己的行，比照原 `> span:hover` 行為。
// 監聽掛在 cell 上，slide-in 每次開都重建 #faculty-detail-sections innerHTML → 舊 cell 連監聽一併丟棄、不洩漏。
//
// 2026-08-04 改用 GSAP timeline（原本兩行各自 WAAPI iterations:Infinity 各跑各的 duration，EN/ZH 長度不同
// 久了會脫拍，跟 list-title-marquee 同一種問題，見 reference_gsap_timeline_desync_marquee_pair_sync）。
// faculty 每個 cell 恆為 EN/ZH 兩行（bilingualMarquee 每次 call 只放一組進一個 cell，不會像 activities
// 副標那樣同一 cell 塞多組），不需要另外處理落單/多筆配對。
function bindFacultyMarqueeReturn(scope) {
  scope.querySelectorAll('.faculty-grid-row > span').forEach((cell) => {
    const lines = [...cell.querySelectorAll('.faculty-marquee-line.is-overflow')];
    if (!lines.length || typeof gsap === 'undefined') return;
    const inners = lines.map(line => line.querySelector('.faculty-marquee-inner')).filter(Boolean);
    if (!inners.length) return;

    // --marquee-distance 是 applyMarqueeOverflow 算好的 dual-copy seamless 距離（字串如 "-120px"），
    // buildSyncedMarqueeTimeline 吃正數距離，取絕對值。
    const items = lines.map((line) => {
      const inner = line.querySelector('.faculty-marquee-inner');
      const dist = Math.abs(parseFloat(getComputedStyle(line).getPropertyValue('--marquee-distance'))) || 0;
      return inner && dist ? { el: inner, distance: dist } : null;
    }).filter(Boolean);
    if (!items.length) return;
    const tl = buildSyncedMarqueeTimeline(items);

    // ⚠️ 不能用 gsap.killTweensOf(inners) 清場——inners 同時也是 tl 自己 child tween 的 target，
    // 連自己都殺掉會讓 tl.play() 後沒有任何 tween 在跑（實測踩到：hover 完全不動）。
    // 只殺「捲回」那個獨立 tween（若還在跑），不動 tl 本身。
    let returnTween = null;
    cell.addEventListener('mouseenter', () => {
      if (returnTween) { returnTween.kill(); returnTween = null; }
      tl.play();
    });
    cell.addEventListener('mouseleave', () => {
      tl.pause();
      returnTween = gsap.to(inners, {
        x: 0, duration: 0.45, ease: 'cubic-bezier(0.25, 0, 0, 1)',
        onComplete: () => { tl.progress(0); returnTween = null; },
      });
    });
  });
}

export function initFacultySlideIn() {
  const slideIn = document.getElementById('faculty-slide-in');
  const slideInPanel = document.getElementById('faculty-panel');
  const slideInOverlay = document.getElementById('faculty-overlay');
  const closeBtn = document.getElementById('faculty-close-btn');
  const backBtnMobile = document.getElementById('faculty-back-btn-mobile');
  // 返回鍵 clip-reveal：每次開隨機四方向滑入、退場沿原方向滑回（2026-08-24 從固定由下改；同 courses-map.js）
  const BACK_DIRS = [
    { xPercent: 0, yPercent: 100 }, { xPercent: 0, yPercent: -100 },
    { xPercent: 100, yPercent: 0 }, { xPercent: -100, yPercent: 0 },
  ];
  let backHidden = BACK_DIRS[0];
  // hover 重擲隨機角度（角度套外層遮罩、cards.css transition 補間；guard 防同頁重綁，SPA 換頁元素隨 main 換掉免解綁）
  if (closeBtn && !closeBtn.dataset.hoverRotBound) {
    closeBtn.dataset.hoverRotBound = '1';
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.transform = `rotate(${Math.random() * 30 - 15}deg)`;
    });
  }
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (!slideIn || facultyCards.length === 0) return;

  loadUiLabels().then(m => { facultyUiLabels = m; });   // 系所全名來源（single-flight cache；開卡前通常已就緒）

  // open/close 世代序號（同 lightbox openSeq pattern）：open 與 close 都 ++，
  // close 動畫的 onComplete 發現序號過期（期間又開了新卡）就放棄隱藏，避免藏掉剛開的 panel
  let slideSeq = 0;

  // 與 faculty-data-loader 共用 faculty-source（cache）→ 同一份 Directus 資料、同一組 id
  getFacultyData()
    .then(data => {
      const facultyData = data.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});

      initializeFacultyInteractions(facultyData);
    })
    .catch(error => console.error('Error loading faculty data:', error));

  // 雙語儲存格：英文在上、中文在下（對齊 name/titles 也是 EN 上 ZH 下，user 2026-06-09），各包一個 .faculty-marquee-line（block）+ .faculty-marquee-inner。
  // 桌面單行超出欄寬時 hover row 才水平 marquee（手機維持自然換行，見 cards.css）。
  // 缺一語就不渲染該行（marqueeLine 空字串不輸出）— 只有一語就只顯示該語、不留空行；兩語皆空 → 空字串。
  // 把單段文字包成一個 marquee line（block + 內層 nowrap inner）；空字串不渲染。
  // 雙語格與 year 欄共用 → year 也能單行裁切 + hover 才 marquee（多年份列如「2019、2020、2023、2024」不再換行）。
  const marqueeLine = (text) => text
    ? `<span class="faculty-marquee-line"><span class="faculty-marquee-inner">${text}</span></span>`
    : '';
  function bilingualMarquee(zh, en) {
    return marqueeLine(en) + marqueeLine(zh);
  }

  // year 區段顯示：endYear 空 → 單年；endYear 與 startYear 相同也顯示單年；
  // isPresent=true（至今/進行中）→ "start-"（起始年 + dash，無結束年）；否則 "start-end"
  function formatYearRange(startYear, endYear, isPresent) {
    const s = (startYear || '').toString().trim();
    const e = (endYear || '').toString().trim();
    if (!s && !e) return '';
    if (isPresent && s) return `${s}-`;
    if (!e || e === s) return s;
    if (!s) return e;
    return `${s}-${e}`;
  }

  // 學歷 row：school(含國家) | major | degree（3 col；country 不再獨立佔欄，併進學校名稱字串，2026-08-03 user）
  // 國家英文用 ISO2 代碼（大寫，如 US / GB）接在英文校名後、中文全名接在中文校名後——
  // 格式同 activities guest aka（ZH 全形括號無空格、EN 半形帶前導空格）
  function renderEducationRow(item) {
    const countryZh = countryName(item.country, 'zh');
    const countryEn = (item.country || '').toUpperCase();
    const schoolEn = countryEn ? `${item.schoolEn || ''} (${countryEn})` : (item.schoolEn || '');
    const schoolZh = countryZh ? `${item.schoolZh || ''}（${countryZh}）` : (item.schoolZh || '');
    return `
      <div class="faculty-grid-row faculty-grid-row-education">
        <span class="faculty-grid-span2">${bilingualMarquee(schoolZh, schoolEn)}</span>
        <span>${bilingualMarquee(item.majorZh, item.majorEn)}</span>
        <span>${bilingualMarquee(item.degreeZh, item.degreeEn)}</span>
      </div>
    `;
  }

  // 經歷 row：year | organization(跨2 col) | role
  // isPresent（至今）→ year 顯示 "start-"；經歷/歷程共用此 row
  function renderExperienceRow(item) {
    const year = formatYearRange(item.startYear, item.endYear, item.isPresent);
    return `
      <div class="faculty-grid-row">
        <span>${marqueeLine(year)}</span>
        <span class="faculty-grid-span2">${bilingualMarquee(item.organizationZh, item.organizationEn)}</span>
        <span>${bilingualMarquee(item.roleZh, item.roleEn)}</span>
      </div>
    `;
  }

  // 獲獎 row：year | country | name | category（獎別欄已移除，改放國家；2026-06-04 user）
  // 國家比照學歷 row：中文全名 + ISO2 代碼（大寫）
  function renderAwardRow(item) {
    const year = formatYearRange(item.startYear, item.endYear);
    return `
      <div class="faculty-grid-row faculty-grid-row-award">
        <span>${marqueeLine(year)}</span>
        <span>${bilingualMarquee(countryName(item.country, 'zh'), (item.country || '').toUpperCase())}</span>
        <span>${bilingualMarquee(item.nameZh, item.nameEn)}</span>
        <span>${bilingualMarquee(item.categoryZh, item.categoryEn)}</span>
      </div>
    `;
  }

  // 包一個 section 區塊（左標題 + 右內容）；items 為空就回空字串不渲染
  // 桌面：左標題 md:sticky md:top-0，sticky reference 是右欄獨立 scroll container 上緣；
  // 加 bg-white 蓋住 scroll 經過時下方 row 的字（否則 sticky title 半透疊字）；
  // self-start 避免 flex stretch 讓 title col 等高失去 sticky；
  // h6 leading-none 把 line-height 壓成 font-size 讓字頂貼 col top，跟右側 row p2 文字頂部對齊
  // row 間距改由 .faculty-rows 父層 gap 控制（無 row 自身 padding-bottom）→ 標題 col 不需 md:pb-4 補償，
  // sticky 失效時標題與最後一個 row 自然都在 content 底對齊（user 2026-06-09 桌機也改 gap）
  function buildSection(titleEn, titleZh, items, renderRow) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const rows = items.map(renderRow).join('');
    return `
      <div class="flex flex-col md:flex-row gap-xs md:gap-sm">
        <div class="faculty-section-title-col w-full md:w-[20%] mb-xs md:mb-0 md:sticky md:top-0 md:self-start md:z-[1]">
          <h3 class="text-base text-black whitespace-nowrap leading-none md:pt-1">${titleEn} ${titleZh}</h3>
        </div>
        <div class="flex-1 faculty-rows">
          ${rows}
        </div>
      </div>
    `;
  }

  // 右欄雙語純文字 stack（EN 上 ZH 下）：三型的職級/職稱（titles）＋兼任職稱（occupations）共用。
  // 桌面各項間距由外層 .faculty-rows 的 gap 統一控制（＝右側 list 內容 gap 16px），故此處不加 item margin。
  function buildLabelStack(pairs) {
    const list = pairs.filter(p => (p.en || '').trim() || (p.zh || '').trim());
    if (!list.length) return '';
    return list.map((p) =>
      `<div>` +
        (p.en ? `<p class="text-s font-bold text-black mb-en-zh-s">${p.en}</p>` : '') +
        (p.zh ? `<p class="text-s font-bold text-black" lang="zh-Hant">${p.zh}</p>` : '') +
      `</div>`
    ).join('');
  }
  const buildRank = (items) => buildLabelStack((items || []).map(t => ({ en: t.titleEn, zh: t.titleZh })));
  const buildOccupation = (items) => buildLabelStack((items || []).map(o => ({ en: o.occupationEn, zh: o.occupationZh })));

  // admin 的純文字 contact section
  function buildContactSection(contact) {
    if (!contact) return '';
    return `
      <div class="flex flex-col md:flex-row gap-xs md:gap-sm">
        <div class="w-full md:w-[25%] mb-xs md:mb-0">
          <h3 class="text-s text-black">Contact 聯絡</h3>
        </div>
        <div class="flex-1">
          <!-- faculty-contact-text：手機/矮橫向升 p1 對齊詳情 row（cards.css 手機 block + landscape.css）；桌面維持 p2=row 同級 -->
          <p class="text-s faculty-contact-text" style="white-space: pre-line;">${contact}</p>
        </div>
      </div>
    `;
  }

  function initializeFacultyInteractions(facultyData) {
    function loadFacultyData(facultyId) {
      const data = facultyData[facultyId];
      if (!data) return;

      // 桌面才把名字下方的職級/職稱移到右欄最上；手機/矮橫向維持在 sticky profile 左欄（手機無「右欄」）。
      // 每次開卡即時判斷（跨斷點靠 orientation-reload 自癒，比照本頁其他 isMobile 判斷）。
      const useMobileLayout = window.innerWidth < 768 ||
        window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;

      // 圖片：沒真實照片的 fulltime/parttime/admin → 用代用 logo。slide-in 底色一直是彩色 accent（panelBg），
      // 故「固定用黑線框 wireframe 版」而非依 site mode 挑彩色 glitch（user 2026-06-11）。
      // 加 .theme-invert → 線條隨底色亮度翻黑/白對比（CSS var(--theme-invert-filter)，mode-color 期間每幀更新）。
      const imgElement = /** @type {HTMLImageElement | null} */ (document.getElementById('faculty-detail-image'));
      const wfLayer = /** @type {HTMLImageElement | null} */ (document.getElementById('faculty-detail-wireframe'));
      if (imgElement) {
        stopFacultyImgCycle(); // 換老師時先停掉上一位的輪替（含照片 transform 復位＝蓋住狀態）
        const phUrl = modePlaceholderUrl(data, 'wireframeBlack');
        imgElement.src = phUrl || data.image;
        imgElement.classList.toggle('theme-invert', !!phUrl);

        // 每次開卡重擲圖片遮罩容器角度（panel 尚未進場，直接 set 無視覺 snap）。
        // 一律走 gsap.set：容器角度後續由 GSAP rotation tween 接手，直接寫 style.transform 會讓 GSAP 內部快取失準
        const imgMask = imgElement.parentElement;
        if (imgMask) {
          if (typeof gsap !== 'undefined') gsap.set(imgMask, { rotation: randImgDeg() });
          else imgMask.style.transform = `rotate(${randImgDeg().toFixed(2)}deg)`;
        }

        // 有真實照片＋後台也有 wireframe 版 → 每 5s 輪替：線框墊底不動、照片滑出露線框／滑回蓋住；
        // 沒照片者維持恆顯線框不切（線框直接當主圖、底層 hidden）
        const wfUrl = !phUrl && data.hasRealPhoto && data.placeholders && data.placeholders.wireframeBlack;
        if (wfLayer) {
          wfLayer.classList.toggle('hidden', !wfUrl);
          if (wfUrl) wfLayer.src = wfUrl; // 設 src 即載入，首次掀開不閃空白
        }
        if (wfUrl) {
          let showingWf = false;
          facultyImgCycleTimer = setInterval(() => {
            showingWf = !showingWf;
            const target = showingWf ? CYCLE_SLIDE[randCycleDir()] : { xPercent: 0, yPercent: 0 };
            if (typeof gsap === 'undefined' || prefersReducedMotion()) {
              // 減少動態：瞬切不滑動、角度不重擲（減少視覺跳動）
              imgElement.style.transform = showingWf ? `translate(${target.xPercent}%, ${target.yPercent}%)` : '';
              return;
            }
            gsap.to(imgElement, {
              ...target,
              duration: DUR.medium,
              ease: showingWf ? EASE.exit : EASE.enter,
              overwrite: true, // 連續 tick 落在動畫中途直接接手，不疊 tween
            });
            // 照片滑回蓋住時整個相框（含線框）同步順轉到新隨機角＝「換個角度接住照片」（user 2026-08-16）
            if (!showingWf && imgMask) {
              gsap.to(imgMask, { rotation: randImgDeg(), duration: DUR.medium, ease: EASE.enter, overwrite: true });
            }
          }, 5000);
        }
      }

      // 姓名 + titles 旋轉：fulltime/admin 桌面手機都套（2026-05-26 user 要求手機也旋轉；
      //   2026-06-11 admin（執行秘書等）比照 fulltime 旋轉，原本漏掉只有 fulltime 旋轉）
      // EN / ZH 一律各佔一行（block）；rotate 對象另加 width:fit-content → rotate 繞 content 寬度不撐父寬
      // （2026-06-08 user 要求桌面也分兩行；原桌面 inline-block 把 EN+ZH 擠成一行已取消）
      // 旋轉角度隨機（user 2026-06-11）：名字一個角、title 另一個角，兩者明顯不同（呼應全站隨機傾斜風格）。
      //   ±2~5°（排除近 0 免像沒轉）；每次開 slide-in 重隨機；太接近(<2°)就把 title 反向確保看得出差異。
      //   名字 EN/ZH 共用同一角（名字視為一體）；若要 EN/ZH 也各異，各自呼叫 randDeg() 即可。
      // 三型（fulltime/admin/parttime）都旋轉（user 2026-08-12：兼任 slide-in 也要旋轉標題）
      const rotateName = true;
      // ±2~4°（user 2026-08-12 由 ±2~5° 收斂：標題/職稱長時旋轉太多不好看）；排除近 0 免像沒轉
      const randDeg = () => (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
      const nameDeg = randDeg();
      let titlesDeg = randDeg();
      if (Math.abs(nameDeg - titlesDeg) < 2) titlesDeg = -titlesDeg;
      const nameEnElement = document.getElementById('faculty-detail-name-en');
      const nameZhElement = document.getElementById('faculty-detail-name-zh');
      const nameDisplay = rotateName ? 'block' : '';
      const nameWidth = rotateName ? 'fit-content' : '';
      if (nameEnElement) {
        nameEnElement.textContent = data.nameEn;
        nameEnElement.style.transform = rotateName ? `rotate(${nameDeg}deg)` : '';
        nameEnElement.style.transformOrigin = rotateName ? 'left center' : '';
        nameEnElement.style.display = nameDisplay;
        nameEnElement.style.width = nameWidth;
      }
      if (nameZhElement) {
        nameZhElement.textContent = data.nameZh;
        nameZhElement.style.transform = rotateName ? `rotate(${nameDeg}deg)` : '';
        nameZhElement.style.transformOrigin = rotateName ? 'left center' : '';
        nameZhElement.style.display = nameDisplay;
        nameZhElement.style.width = nameWidth;
      }

      // 系所全名（英上中下）：dcd / bpaidc → 完整名稱，顯示在職級/職稱（Founder 等）「上方」。
      // 版位隨 layout：桌面進右欄 lead、手機進左欄 titles（Founder 在哪欄，dept 就墊該欄 title 區頂端）。
      // 有值才渲染、空值不顯示；每次 open 靠 innerHTML 重寫＝冪等、換老師不殘留。
      // data.department 由 mapRow 的 {...r} 帶入（fallback JSON 無此欄→undefined→不顯示）。
      // 顯示文字＝ui_labels `faculty.department.<key>`（後台可改）；無 row 退 DEPT_FALLBACK。
      const deptKey = (data.department || '').trim().toLowerCase();
      const deptRow = facultyUiLabels?.[`faculty.department.${deptKey}`];
      const deptInfo = deptRow ? { en: deptRow.en, zh: deptRow.zh } : DEPT_FALLBACK[deptKey];
      const deptHtml = deptInfo
        ? `<div class="mb-sm"><p class="text-s font-bold text-black mb-en-zh-s">${deptInfo.en}</p>` +
          `<p class="text-s font-bold text-black" lang="zh-Hant">${deptInfo.zh}</p></div>`
        : '';

      // Titles（subtitle）：三種 type 共用 titles[] repeater，EN 上 ZH 下、多筆各自 stack、隨機旋轉一個角（跟名字不同角）。
      // 2026-08-12：兼任的 titles[] 語意＝「職級」（兼任講師等）→ 左欄 subtitle；公司/身份（職業/單位）改存
      // occupation 欄、顯示在右側（見下方 sections）。fulltime/admin 的 titles[] 維持學術職稱。
      const rotateTitles = rotateName;
      const titlesContainer = document.getElementById('faculty-detail-titles');
      if (titlesContainer) {
        // 桌面：職級/職稱移到右欄（見下方 sections）→ 左欄名字下方留空；手機/矮橫向：維持在名字下方（三型皆是，user 2026-08-13）
        const pairs = useMobileLayout ? (data.titles || []).map(t => ({ en: t.titleEn || '', zh: t.titleZh || '' })) : [];
        let html = '';
        pairs.forEach((p, i) => {
          const isLast = i === pairs.length - 1;
          html += `<div${isLast ? '' : ' class="mb-sm"'}>` +
            `<p class="text-s font-regular text-black mb-en-zh-s">${p.en}</p>` +
            `<p class="text-s font-regular text-black">${p.zh}</p>` +
            `</div>`;
        });
        titlesContainer.innerHTML = (useMobileLayout ? deptHtml : '') + html;   // 手機：系所全名墊在 titles 頂
        titlesContainer.style.transform = rotateTitles ? `rotate(${titlesDeg}deg)` : '';
        titlesContainer.style.transformOrigin = rotateTitles ? 'left top' : '';
        titlesContainer.style.display = rotateTitles ? 'block' : '';
      }

      // Sections：依 type 組裝
      const sectionsContainer = document.getElementById('faculty-detail-sections');
      const leadContainer = document.getElementById('faculty-detail-lead');
      // 桌面：職級/職稱渲染進 #faculty-detail-lead（非捲動 header，在 sections scroll 區之上）→ 右側 scrollbar
      // 從 lead 下方才起、不含 lead（user 2026-08-16）；lead↔Education 1rem 由 lead 的 md:mb-sm 控。
      // 手機/矮橫向：lead 在 profile 左欄 → 此 header 清空（empty:hidden 不佔位）；parttime 的 occupation 照舊排 sections 最上。
      if (leadContainer) {
        if (useMobileLayout) {
          leadContainer.innerHTML = '';
        } else {
          const lead = data.type === 'parttime'
            ? buildRank(data.titles) + buildOccupation(data.occupations)  // parttime 再疊 occupation
            : buildRank(data.titles);
          // .faculty-rows 讓 rank↔occupation／多筆間距＝list 內容 gap（16px）
          const leadRows = lead ? `<div class="faculty-rows faculty-lead-rows">${lead}</div>` : '';
          leadContainer.innerHTML = deptHtml + leadRows;   // 桌面：系所全名墊在職級(Founder 等)上方
        }
      }
      if (sectionsContainer) {
        let html = '';
        if (useMobileLayout && data.type === 'parttime') html += buildOccupation(data.occupations);

        if (data.type === 'admin') {
          html += buildContactSection(data.contact);
        } else {
          // fulltime / parttime 共用 sections（空陣列不渲染；兼任通常全空 → 右欄只剩上方 lead）
          html += buildSection('Education', '學歷', data.educations, renderEducationRow);
          // Journey 歷程：欄位與 Experience 相同（year | organization | role），收錄該老師與系上相關的經歷，
          // 故直接複用 renderExperienceRow；data.journey 空/未填時 buildSection 回空字串不渲染。
          // 順序排在 Experience 之前（user 2026-06-05）。
          html += buildSection('Journey', '歷程', data.journey, renderExperienceRow);
          html += buildSection('Experience', '經歷', data.experiences, renderExperienceRow);
          html += buildSection('Awards', '榮譽', data.awards, renderAwardRow);
        }
        sectionsContainer.innerHTML = html;

        // （lead 已移出 scroll 容器當 header → section title/年份 sticky 直接釘 scroll 頂 top:0，
        //   不再需要 --faculty-lead-h offset 量測；lead↔Education 1rem 走 #faculty-detail-lead 的 md:mb-sm）

        // 詳情 row 雙語格各語單行超出欄寬 → hover row 才 marquee（桌面限定，仿卡片職稱）。
        // panel 此時仍 invisible(visibility，非 display:none) → 仍可量 offsetWidth。
        // 等字型載入避免 fallback 字寬誤判溢出（見 memory feedback_measure_text_layout_wait_fonts_ready）。
        // 矮橫向不跑（landscape gate 詳情 row 走手機自然換行；marquee 會把溢出欄換成兩份 copy＝換行下文字重複）。
        if (window.innerWidth >= 768 && !window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) {
          const runMarquee = () => {
            applyMarqueeOverflow(sectionsContainer, '.faculty-marquee-line', '.faculty-marquee-inner');
            bindFacultyMarqueeReturn(sectionsContainer);   // JS 驅動 row marquee + 離場平滑捲回
          };
          if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(runMarquee);
          else runMarquee();
        }
      }

      // 手機 sticky 疊層：profile block（圖+名+職稱）實高寫入 --faculty-profile-h，
      // section title 的 sticky top = header + profile 高（cards.css）。圖片 h-auto
      // 載入後高度才定 → rAF 先量一次、img load 再補量一次。
      if (window.innerWidth < 768) {
        const measureProfile = () => {
          const profile = document.getElementById('faculty-profile-block');
          if (profile && slideInPanel) {
            // getBoundingClientRect 取精確浮點高（offsetHeight 取整會差 <1px，title 釘住位置
            // 跟 profile 底之間露出 sub-pixel 縫）
            slideInPanel.style.setProperty('--faculty-profile-h', `${profile.getBoundingClientRect().height}px`);
            // 左欄（年份/國家）sticky top = profile 高 + title 高（cards.css）；title 單行、各 section 等高，量第一個即可
            const titleCol = slideInPanel.querySelector('.faculty-section-title-col');
            if (titleCol) {
              slideInPanel.style.setProperty('--faculty-title-h', `${titleCol.getBoundingClientRect().height}px`);
            }
          }
        };
        requestAnimationFrame(measureProfile);
        if (imgElement && !imgElement.complete) {
          imgElement.addEventListener('load', measureProfile, { once: true });
        }
      }

      // 每次開新老師都從頂部開始：歸零兩個可能的 scroll 容器 —
      // 桌面 = 右欄 .list-scroll 獨立 scroll；手機 = 整個內容容器 .no-scrollbar。
      // 否則上一位老師若在捲到下方時關閉，scrollTop 殘留 → 下一位老師會從中間打開。
      slideInPanel?.querySelectorAll('.list-scroll, .no-scrollbar').forEach(el => { el.scrollTop = 0; });
    }

    facultyCards.forEach(card => {
      const category = card.getAttribute('data-category');
      if (category === 'fulltime' || category === 'admin' || category === 'parttime') {
        makeActivatable(card); // 無障礙：師資卡是 <div>，補可 Tab + Enter 開詳情（名字當可讀名）
        card.addEventListener('click', function(e) {
          e.preventDefault();

          const facultyId = card.getAttribute('data-faculty-id');
          if (facultyId && slideIn) {
            // 世代 ++：作廢仍在跑的上一次 close onComplete（close 動畫中途快速點開下一位，
            // 舊 onComplete 會把剛開的 panel 蓋回 invisible——同 lightbox openSeq race 三件套）
            ++slideSeq;
            loadFacultyData(facultyId);

            const cardColor = getComputedStyle(card).getPropertyValue('--card-color').trim() || '#26BCFF';
            slideInPanel.style.backgroundColor = cardColor;
            // 右欄 sticky title 用此 var 蓋住下方 scroll 經過的字（inherit 抓不到 painted bg）
            slideInPanel.style.setProperty('--faculty-panel-bg', cardColor);

            slideIn.classList.remove('invisible', 'pointer-events-none');
            slideIn.classList.add('pointer-events-auto');
            // 黑方塊返回鍵：每次開重隨機旋轉（角度套外層遮罩）+ inner 平移做 hero clip-reveal（比照 header bars：外層 overflow:clip 當遮罩、inner 隨機四方向滑入被剪裁）
            let backInner = null;
            if (closeBtn) {
              closeBtn.style.transform = `rotate(${Math.random() * 30 - 15}deg)`;
              if (typeof gsap !== 'undefined' && !prefersReducedMotion() && window.innerWidth >= 768) {
                backInner = closeBtn.querySelector('.slide-in-back-square-inner');
                backHidden = BACK_DIRS[Math.floor(Math.random() * BACK_DIRS.length)];
                // 兩軸都 set：洗掉上次退場殘留的另一軸位移
                if (backInner) gsap.set(backInner, backHidden);
              }
            }
            // 無障礙 modal：記住觸發卡片、把焦點移進 dialog（關閉時歸還）；preventScroll 避免 fixed panel focus 造成跳動
            facultyReturnFocus = /** @type {HTMLElement} */ (card);
            requestAnimationFrame(() => slideInPanel.focus({ preventScroll: true }));

            // freeze 底層捲動 + 凍結在原位（不跳頂部）+ header bars clip-path 收掉，全由 lightbox-shell 統一處理
            // （內含 save/restore scrollTop，對付本頁 html overflow-x:clip 被 overflow-y:hidden 重算成 hidden
            //   導致的 scroll reset；slide-in 與全螢幕 lightbox 共用同一套，不分流）
            enterLightboxMode();
            const openTl = openSlideInBg({
              overlay: slideInOverlay,
              panel: slideInPanel,
              panelBg: cardColor,
            });
            // 返回鍵跟 panel 同步 clip-reveal（openSlideInBg panel 進場 offset 0.3 / DUR.medium）
            if (openTl && backInner) {
              openTl.fromTo(backInner, backHidden,
                { xPercent: 0, yPercent: 0, duration: DUR.medium, ease: EASE.enter, clearProps: 'transform' }, 0.3);
            }
          }
        });
      }
    });
  }

  function closeSlideIn() {
    if (!slideIn) return;
    if (slideIn.classList.contains('invisible')) return;

    const mySeq = ++slideSeq; // close 也 ++（作廢更早的 pending close）；onComplete 過期則整段放棄
    stopFacultyImgCycle();

    // deferHeaderShow：slide-in 往右滑出，header bars 立即揭露會白 bar 冒在頂部蓋住離場中的 panel → 延後到 panel 走完
    exitLightboxMode({ deferHeaderShow: true });

    const closeTl = closeSlideInBg({
      overlay: slideInOverlay,
      panel: slideInPanel,
      onComplete: () => {
        if (mySeq !== slideSeq) return; // 動畫期間又開了新卡（或再次 close）→ 這次 close 已過期，別藏新 panel
        slideIn.classList.add('invisible', 'pointer-events-none');
        slideIn.classList.remove('pointer-events-auto');
        slideInPanel.style.backgroundColor = '';
        if (facultyReturnFocus) { facultyReturnFocus.focus({ preventScroll: true }); facultyReturnFocus = null; }
      },
    });
    // 返回鍵跟 panel 同步 clip-reveal 退場（inner 沿進場方向滑回被遮罩剪掉；panel 退場 offset 0）
    const backInner = closeBtn && closeBtn.querySelector('.slide-in-back-square-inner');
    if (closeTl && backInner && typeof gsap !== 'undefined' && !prefersReducedMotion() && window.innerWidth >= 768) {
      closeTl.to(backInner, { ...backHidden, duration: DUR.medium, ease: EASE.exit }, 0);
    }
  }

  // Overlay click + close button click 都關閉 slide-in
  // overlay 的 left cursor 由 cursor.css 的 #faculty-slide-in-overlay 規則統一管
  if (closeBtn) closeBtn.addEventListener('click', closeSlideIn);
  if (backBtnMobile) backBtnMobile.addEventListener('click', closeSlideIn);
  if (slideInOverlay) slideInOverlay.addEventListener('click', closeSlideIn);

  // 無障礙：Escape 關閉 slide-in（背板 overlay 不該變成可 Tab 元素，鍵盤關閉走 Escape；對齊 courses slide-in）。
  // 每次進 faculty 頁 re-init → registerPageCleanup 解綁避免跨 SPA 累積。
  const onEsc = (e) => {
    if (e.key === 'Escape' && slideIn && !slideIn.classList.contains('invisible')) closeSlideIn();
  };
  document.addEventListener('keydown', onEsc);
  registerPageCleanup(() => {
    document.removeEventListener('keydown', onEsc);
    stopFacultyImgCycle(); // slide-in 開著直接換頁時 interval 不殘留
  });
}

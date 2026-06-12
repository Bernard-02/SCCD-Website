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

import { enterLightboxMode, exitLightboxMode } from '../lightbox/lightbox-shell.js';
import { openSlideInBg, closeSlideInBg } from '../ui/slide-in-bg-sync.js';
import { countryName } from '../../data/country-names.js';
import { getFacultyData } from './faculty-source.js';
import { modePlaceholderUrl } from './faculty-data-loader.js';
import { applyMarqueeOverflow } from '../ui/marquee-overflow.js';

// 桌面 slide-in 詳情 cell 的 marquee 改用 JS(WAAPI) 驅動，取代 CSS :hover animation——
// 目的：hover 離開時讓正在跑的文字「平滑捲回原點」，而非 CSS animation 被移除時 transform 直接歸 0 的瞬間 snap。
//   進場：每條溢出的 .faculty-marquee-line 內層 0 → --marquee-distance 無限 linear 捲動（與原 CSS keyframe 同）。
//   離場：先讀目前位移當起點（cancel 後 transform 會歸 0），再補間回 translateX(0)（0.45s，hero exit 同曲線）。
// cell = 每一欄 span：hover 該欄只捲它自己的行，比照原 `> span:hover` 行為。
// 監聽掛在 cell 上，slide-in 每次開都重建 #faculty-detail-sections innerHTML → 舊 cell 連監聽一併丟棄、不洩漏。
function bindFacultyMarqueeReturn(scope) {
  scope.querySelectorAll('.faculty-grid-row > span').forEach((cell) => {
    const lines = [...cell.querySelectorAll('.faculty-marquee-line.is-overflow')];
    if (!lines.length) return;
    const running = new Map(); // inner -> Animation（捲動 or 捲回）

    cell.addEventListener('mouseenter', () => {
      lines.forEach((line) => {
        const inner = line.querySelector('.faculty-marquee-inner');
        if (!inner) return;
        running.get(inner)?.cancel();   // 取消上一個（可能是捲回中）
        const cs = getComputedStyle(line);
        const dist = cs.getPropertyValue('--marquee-distance').trim() || '0px';
        const durMs = (parseFloat(cs.getPropertyValue('--marquee-duration')) || 8) * 1000;
        running.set(inner, inner.animate(
          [{ transform: 'translateX(0)' }, { transform: `translateX(${dist})` }],
          { duration: durMs, iterations: Infinity, easing: 'linear' }
        ));
      });
    });

    cell.addEventListener('mouseleave', () => {
      lines.forEach((line) => {
        const inner = line.querySelector('.faculty-marquee-inner');
        if (!inner) return;
        const cur = running.get(inner);
        if (!cur) return;
        const from = getComputedStyle(inner).transform;  // 先讀目前位移（cancel 後歸 0）
        cur.cancel();
        const back = inner.animate(
          [{ transform: from }, { transform: 'translateX(0)' }],
          { duration: 450, easing: 'cubic-bezier(0.25, 0, 0, 1)' }
        );
        running.set(inner, back);
        back.onfinish = () => { if (running.get(inner) === back) running.delete(inner); };
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
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (!slideIn || facultyCards.length === 0) return;

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

  // 學歷 row：country | school | major | degree（4 col 各 1）
  // 國家英文用 ISO2 代碼（大寫，如 US / GB）而非全名（user 2026-06-03）；中文仍用全名
  function renderEducationRow(item) {
    return `
      <div class="faculty-grid-row">
        <span>${bilingualMarquee(countryName(item.country, 'zh'), (item.country || '').toUpperCase())}</span>
        <span>${bilingualMarquee(item.schoolZh, item.schoolEn)}</span>
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
          <h6 class="text-base text-black whitespace-nowrap leading-none md:pt-1">${titleEn} ${titleZh}</h6>
        </div>
        <div class="flex-1 faculty-rows">
          ${rows}
        </div>
      </div>
    `;
  }

  // admin 的純文字 contact section
  function buildContactSection(contact) {
    if (!contact) return '';
    return `
      <div class="flex flex-col md:flex-row gap-xs md:gap-sm">
        <div class="w-full md:w-[25%] mb-xs md:mb-0">
          <h6 class="text-black">Contact 聯絡</h6>
        </div>
        <div class="flex-1">
          <p class="text-p2" style="white-space: pre-line;">${contact}</p>
        </div>
      </div>
    `;
  }

  function initializeFacultyInteractions(facultyData) {
    function loadFacultyData(facultyId) {
      const data = facultyData[facultyId];
      if (!data) return;

      // 圖片：沒真實照片的 fulltime/parttime/admin → 用代用 logo。slide-in 底色一直是彩色 accent（panelBg），
      // 故「固定用黑線框 wireframe 版」而非依 site mode 挑彩色 glitch（user 2026-06-11）。
      // 加 .theme-invert → 線條隨底色亮度翻黑/白對比（CSS var(--theme-invert-filter)，mode-color 期間每幀更新）。
      const imgElement = /** @type {HTMLImageElement | null} */ (document.getElementById('faculty-detail-image'));
      if (imgElement) {
        const phUrl = modePlaceholderUrl(data, 'wireframeBlack');
        imgElement.src = phUrl || data.image;
        imgElement.classList.toggle('theme-invert', !!phUrl);
      }

      // 姓名 + titles 旋轉：fulltime/admin 桌面手機都套（2026-05-26 user 要求手機也旋轉；
      //   2026-06-11 admin（執行秘書等）比照 fulltime 旋轉，原本漏掉只有 fulltime 旋轉）
      // EN / ZH 一律各佔一行（block）；rotate 對象另加 width:fit-content → rotate 繞 content 寬度不撐父寬
      // （2026-06-08 user 要求桌面也分兩行；原桌面 inline-block 把 EN+ZH 擠成一行已取消）
      // 旋轉角度隨機（user 2026-06-11）：名字一個角、title 另一個角，兩者明顯不同（呼應全站隨機傾斜風格）。
      //   ±2~5°（排除近 0 免像沒轉）；每次開 slide-in 重隨機；太接近(<2°)就把 title 反向確保看得出差異。
      //   名字 EN/ZH 共用同一角（名字視為一體）；若要 EN/ZH 也各異，各自呼叫 randDeg() 即可。
      const rotateName = data.type === 'fulltime' || data.type === 'admin';
      const randDeg = () => (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 3);
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

      // Titles：admin 用單 titleEn/titleZh；fulltime 用 titles[] repeater
      // titles rotate(4deg)：桌機+手機都套（2026-06-11 user 要桌面 title 也轉、跟名字一致；原本只手機）。
      // 用 block display 讓 titles 自然在 name 下方流（不被 inline-block 擠到右邊）。
      const rotateTitles = rotateName;
      const titlesContainer = document.getElementById('faculty-detail-titles');
      if (titlesContainer) {
        let pairs;
        if (data.type === 'admin') {
          pairs = [{ en: data.titleEn || '', zh: data.titleZh || '' }];
        } else {
          pairs = (data.titles || []).map(t => ({ en: t.titleEn || '', zh: t.titleZh || '' }));
        }
        let html = '';
        pairs.forEach((p, i) => {
          const isLast = i === pairs.length - 1;
          html += `<div${isLast ? '' : ' class="mb-sm"'}>` +
            `<h6 class="font-regular text-black">${p.en}</h6>` +
            `<h6 class="font-regular text-black">${p.zh}</h6>` +
            `</div>`;
        });
        titlesContainer.innerHTML = html;
        titlesContainer.style.transform = rotateTitles ? `rotate(${titlesDeg}deg)` : '';
        titlesContainer.style.transformOrigin = rotateTitles ? 'left top' : '';
        // 手機改 block 讓 titles 自然在 name 下方換行；桌面保留預設不動
        titlesContainer.style.display = rotateTitles ? 'block' : '';
      }

      // Sections：依 type 組裝
      const sectionsContainer = document.getElementById('faculty-detail-sections');
      if (sectionsContainer) {
        let html = '';
        if (data.type === 'admin') {
          html = buildContactSection(data.contact);
        } else {
          // fulltime（parttime 不走 slide-in，但保留結構容錯）
          html += buildSection('Education', '學歷', data.educations, renderEducationRow);
          // Journey 歷程：欄位與 Experience 相同（year | organization | role），收錄該老師與系上相關的經歷，
          // 故直接複用 renderExperienceRow；data.journey 空/未填時 buildSection 回空字串不渲染。
          // 順序排在 Experience 之前（user 2026-06-05）。
          html += buildSection('Journey', '歷程', data.journey, renderExperienceRow);
          html += buildSection('Experience', '經歷', data.experiences, renderExperienceRow);
          html += buildSection('Awards', '榮譽', data.awards, renderAwardRow);
        }
        sectionsContainer.innerHTML = html;

        // 詳情 row 雙語格各語單行超出欄寬 → hover row 才 marquee（桌面限定，仿卡片職稱）。
        // panel 此時仍 invisible(visibility，非 display:none) → 仍可量 offsetWidth。
        // 等字型載入避免 fallback 字寬誤判溢出（見 memory feedback_measure_text_layout_wait_fonts_ready）。
        if (window.innerWidth >= 768) {
          const runMarquee = () => {
            applyMarqueeOverflow(sectionsContainer, '.faculty-marquee-line', '.faculty-marquee-inner');
            bindFacultyMarqueeReturn(sectionsContainer);   // JS 驅動 row marquee + 離場平滑捲回
          };
          if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(runMarquee);
          else runMarquee();
        }
      }

      // 每次開新老師都從頂部開始：歸零兩個可能的 scroll 容器 —
      // 桌面 = 右欄 .list-scroll 獨立 scroll；手機 = 整個內容容器 .no-scrollbar。
      // 否則上一位老師若在捲到下方時關閉，scrollTop 殘留 → 下一位老師會從中間打開。
      slideInPanel?.querySelectorAll('.list-scroll, .no-scrollbar').forEach(el => { el.scrollTop = 0; });
    }

    facultyCards.forEach(card => {
      const category = card.getAttribute('data-category');
      if (category === 'fulltime' || category === 'admin') {
        card.addEventListener('click', function(e) {
          e.preventDefault();

          const facultyId = card.getAttribute('data-faculty-id');
          if (facultyId && slideIn) {
            loadFacultyData(facultyId);

            const cardColor = getComputedStyle(card).getPropertyValue('--card-color').trim() || '#26BCFF';
            slideInPanel.style.backgroundColor = cardColor;
            // 右欄 sticky title 用此 var 蓋住下方 scroll 經過的字（inherit 抓不到 painted bg）
            slideInPanel.style.setProperty('--faculty-panel-bg', cardColor);

            slideIn.classList.remove('invisible', 'pointer-events-none');
            slideIn.classList.add('pointer-events-auto');

            // freeze 底層捲動 + 凍結在原位（不跳頂部）+ header bars clip-path 收掉，全由 lightbox-shell 統一處理
            // （內含 save/restore scrollTop，對付本頁 html overflow-x:clip 被 overflow-y:hidden 重算成 hidden
            //   導致的 scroll reset；slide-in 與全螢幕 lightbox 共用同一套，不分流）
            enterLightboxMode();
            openSlideInBg({
              overlay: slideInOverlay,
              panel: slideInPanel,
              panelBg: cardColor,
            });
          }
        });
      }
    });
  }

  function closeSlideIn() {
    if (!slideIn) return;
    if (slideIn.classList.contains('invisible')) return;

    exitLightboxMode();

    closeSlideInBg({
      overlay: slideInOverlay,
      panel: slideInPanel,
      onComplete: () => {
        slideIn.classList.add('invisible', 'pointer-events-none');
        slideIn.classList.remove('pointer-events-auto');
        slideInPanel.style.backgroundColor = '';
      },
    });
  }

  // Overlay click + close button click 都關閉 slide-in
  // overlay 的 left cursor 由 cursor.css 的 #faculty-slide-in-overlay 規則統一管
  if (closeBtn) closeBtn.addEventListener('click', closeSlideIn);
  if (backBtnMobile) backBtnMobile.addEventListener('click', closeSlideIn);
  if (slideInOverlay) slideInOverlay.addEventListener('click', closeSlideIn);
}

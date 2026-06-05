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

export function initFacultySlideIn() {
  const slideIn = document.getElementById('faculty-slide-in');
  const slideInPanel = document.getElementById('faculty-panel');
  const slideInOverlay = document.getElementById('faculty-overlay');
  const closeBtn = document.getElementById('faculty-close-btn');
  const backBtnMobile = document.getElementById('faculty-back-btn-mobile');
  const facultyCards = document.querySelectorAll('.faculty-card');

  if (!slideIn || facultyCards.length === 0) return;

  fetch('/data/faculty.json')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status} - Check if data/faculty.json exists`);
      return response.json();
    })
    .then(data => {
      const facultyData = data.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});

      initializeFacultyInteractions(facultyData);
    })
    .catch(error => console.error('Error loading faculty data:', error));

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
        <span>${countryName(item.country, 'zh')}<br>${(item.country || '').toUpperCase()}</span>
        <span>${item.schoolZh || ''}<br>${item.schoolEn || ''}</span>
        <span>${item.majorZh || ''}<br>${item.majorEn || ''}</span>
        <span>${item.degreeZh || ''}<br>${item.degreeEn || ''}</span>
      </div>
    `;
  }

  // 經歷 row：year | organization(跨2 col) | role
  // isPresent（至今）→ year 顯示 "start-"；經歷/歷程共用此 row
  function renderExperienceRow(item) {
    const year = formatYearRange(item.startYear, item.endYear, item.isPresent);
    const orgZh = item.organizationZh || '';
    const orgEn = item.organizationEn || '';
    const roleZh = item.roleZh || '';
    const roleEn = item.roleEn || '';
    return `
      <div class="faculty-grid-row">
        <span>${year}</span>
        <span class="faculty-grid-span2">${orgZh}${orgEn ? '<br>' + orgEn : ''}</span>
        <span>${roleZh}${roleEn ? '<br>' + roleEn : ''}</span>
      </div>
    `;
  }

  // 獲獎 row：year | country | name | category（獎別欄已移除，改放國家；2026-06-04 user）
  // 國家比照學歷 row：中文全名 + ISO2 代碼（大寫）
  function renderAwardRow(item) {
    const year = formatYearRange(item.startYear, item.endYear);
    const nameZh = item.nameZh || '';
    const nameEn = item.nameEn || '';
    const catZh = item.categoryZh || '';
    const catEn = item.categoryEn || '';
    const countryZh = countryName(item.country, 'zh');
    const countryCode = (item.country || '').toUpperCase();
    return `
      <div class="faculty-grid-row faculty-grid-row-award">
        <span>${year}</span>
        <span>${countryZh}${countryCode ? '<br>' + countryCode : ''}</span>
        <span>${nameZh}${nameEn ? '<br>' + nameEn : ''}</span>
        <span>${catZh}${catEn ? '<br>' + catEn : ''}</span>
      </div>
    `;
  }

  // 包一個 section 區塊（左標題 + 右內容）；items 為空就回空字串不渲染
  // 桌面：左標題 md:sticky md:top-0，sticky reference 是右欄獨立 scroll container 上緣；
  // 加 bg-white 蓋住 scroll 經過時下方 row 的字（否則 sticky title 半透疊字）；
  // self-start 避免 flex stretch 讓 title col 等高失去 sticky；
  // h6 leading-none 把 line-height 壓成 font-size 讓字頂貼 col top，跟右側 row p2 文字頂部對齊
  // md:pb-2 (= 0.5rem)：對齊 .faculty-grid-row 自身 padding-bottom: 0.5rem，sticky 失效臨界點對齊最後一個 row 底邊
  function buildSection(titleEn, titleZh, items, renderRow) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const rows = items.map(renderRow).join('');
    return `
      <div class="flex flex-col md:flex-row gap-xs md:gap-sm">
        <div class="faculty-section-title-col w-full md:w-[20%] mb-xs md:mb-0 md:pb-2 md:sticky md:top-0 md:self-start md:z-[1]">
          <h6 class="text-black whitespace-nowrap leading-none">${titleEn} ${titleZh}</h6>
        </div>
        <div class="flex-1">
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

      // 圖片
      const imgElement = /** @type {HTMLImageElement | null} */ (document.getElementById('faculty-detail-image'));
      if (imgElement) imgElement.src = data.image;

      // 姓名 + titles 旋轉：fulltime 桌面手機都套（2026-05-26 user 要求手機也旋轉，桌面行為不變）
      // 桌面用 inline-block 讓 rotate 不撐父寬；手機用 block 各佔一行（EN 一行 → ZH 一行 → titles 在下方）
      const rotateName = data.type === 'fulltime';
      const isMobile = window.innerWidth < 768;
      const nameEnElement = document.getElementById('faculty-detail-name-en');
      const nameZhElement = document.getElementById('faculty-detail-name-zh');
      const nameDisplay = rotateName ? (isMobile ? 'block' : 'inline-block') : '';
      if (nameEnElement) {
        nameEnElement.textContent = data.nameEn;
        nameEnElement.style.transform = rotateName ? 'rotate(4deg)' : '';
        nameEnElement.style.transformOrigin = rotateName ? 'left center' : '';
        nameEnElement.style.display = nameDisplay;
      }
      if (nameZhElement) {
        nameZhElement.textContent = data.nameZh;
        nameZhElement.style.transform = rotateName ? 'rotate(4deg)' : '';
        nameZhElement.style.transformOrigin = rotateName ? 'left center' : '';
        nameZhElement.style.display = nameDisplay;
      }

      // Titles：fulltime/parttime 用 titles[] repeater；admin 用單 titleEn/titleZh
      // 手機 fulltime titles 也 rotate(4deg)，但用 block display 不 inline-block，讓 titles 自然在 name 下方流（不會被擠到右邊）
      const rotateTitles = rotateName && isMobile;
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
        titlesContainer.style.transform = rotateTitles ? 'rotate(4deg)' : '';
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
      }
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

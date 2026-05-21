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

  // year 區段顯示：endYear 空 → 單年；endYear 與 startYear 相同也顯示單年；否則 "start-end"
  function formatYearRange(startYear, endYear) {
    const s = (startYear || '').toString().trim();
    const e = (endYear || '').toString().trim();
    if (!s && !e) return '';
    if (!e || e === s) return s;
    if (!s) return e;
    return `${s}-${e}`;
  }

  // 學歷 row：country | school | major | degree（4 col 各 1）
  function renderEducationRow(item) {
    return `
      <div class="faculty-grid-row">
        <span>${countryName(item.country, 'zh')}<br>${countryName(item.country, 'en')}</span>
        <span>${item.schoolZh || ''}<br>${item.schoolEn || ''}</span>
        <span>${item.majorZh || ''}<br>${item.majorEn || ''}</span>
        <span>${item.degreeZh || ''}<br>${item.degreeEn || ''}</span>
      </div>
    `;
  }

  // 經歷 row：year | organization(跨2 col) | role
  function renderExperienceRow(item) {
    const year = formatYearRange(item.startYear, item.endYear);
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

  // 獲獎 row：year | name | work(獎項) | category(獎別)
  function renderAwardRow(item) {
    const year = formatYearRange(item.startYear, item.endYear);
    const nameZh = item.nameZh || '';
    const nameEn = item.nameEn || '';
    const workZh = item.workZh || '';
    const workEn = item.workEn || '';
    const catZh = item.categoryZh || '';
    const catEn = item.categoryEn || '';
    return `
      <div class="faculty-grid-row">
        <span>${year}</span>
        <span>${nameZh}${nameEn ? '<br>' + nameEn : ''}</span>
        <span>${workZh}${workEn ? '<br>' + workEn : ''}</span>
        <span>${catZh}${catEn ? '<br>' + catEn : ''}</span>
      </div>
    `;
  }

  // 包一個 section 區塊（左標題 + 右內容）；items 為空就回空字串不渲染
  function buildSection(titleEn, titleZh, items, renderRow) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const rows = items.map(renderRow).join('');
    return `
      <div class="flex flex-col md:flex-row gap-xs md:gap-sm">
        <div class="w-full md:w-[20%] mb-xs md:mb-0">
          <h6 class="text-black whitespace-nowrap">${titleEn} ${titleZh}</h6>
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
          <h6 class="text-black">Contact 聯絡資訊</h6>
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

      // 姓名 + fulltime 桌面旋轉
      const isDesktop = window.innerWidth >= 768;
      const rotateName = data.type === 'fulltime' && isDesktop;
      const nameEnElement = document.getElementById('faculty-detail-name-en');
      const nameZhElement = document.getElementById('faculty-detail-name-zh');
      if (nameEnElement) {
        nameEnElement.textContent = data.nameEn;
        nameEnElement.style.transform = rotateName ? 'rotate(4deg)' : '';
        nameEnElement.style.display = rotateName ? 'inline-block' : '';
      }
      if (nameZhElement) {
        nameZhElement.textContent = data.nameZh;
        nameZhElement.style.transform = rotateName ? 'rotate(4deg)' : '';
        nameZhElement.style.display = rotateName ? 'inline-block' : '';
      }

      // Titles：fulltime/parttime 用 titles[] repeater；admin 用單 titleEn/titleZh
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
          html += buildSection('Experience', '經歷', data.experiences, renderExperienceRow);
          html += buildSection('Awards', '獲獎', data.awards, renderAwardRow);
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

            slideIn.classList.remove('invisible', 'pointer-events-none');
            slideIn.classList.add('pointer-events-auto');

            // header bars clip-path 收掉（logo 不動）+ body.overflow 鎖捲動（lightbox-shell 內處理）
            // 不額外鎖 htmlEl.overflow：html overflow:hidden 會讓 html 失去 scroll container，
            // 內層 md:sticky md:top-[200px]（faculty filter rail）失效退回 static → 整個 rail 飄上去 ~200px
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

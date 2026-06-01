/**
 * Lightbox Reference Button（PDF viewer + activities-lightbox 共用）
 * 在 lightbox 內提供「ref 跳轉」UI：
 *   - 一顆 ref btn pill（插在 back btn 跟 title 之間，視覺與 back btn 同 pill 樣式）
 *   - 點擊 → ref chip 列從 ref btn 底邊往上 clip-reveal 展開（hero-style）
 *   - 再次點擊 / 點 popover 外 → 收起
 *   - 點 chip → 關閉 lightbox + SPA 切到 activities?section=X&item=Y
 *
 * caller 流程：
 *   1. createRefBtn(color, onClose) → 回 { btnEl, popoverEl, setReferences(refs), reset() }
 *   2. 把 btnEl insert 到 back btn 之後、title 之前
 *   3. popoverEl append 到 lightbox 容器（absolute 定位 anchored 到 btnEl）
 *   4. 每次開 lightbox / 換 media 時 call setReferences(refs)（無 refs → 自動隱藏 btn）
 *   5. 關閉時 call reset() 清狀態
 *
 * 視覺：
 *   - btn pill：跟 back btn 同色（caller 傳 color，下游 setBtnColor 重染）
 *   - chip：跟 list-ref-btn 同樣式（白底 / hover 黑底白字），垂直堆疊
 *   - chip title 雙語兩欄；title 過寬時 marquee（dual-copy seamless loop）
 */

const ACTIVITIES_PATH = '/pages/activities.html';

let _gsapWarned = false;
function gsapAvailable() {
  if (typeof gsap !== 'undefined') return true;
  if (!_gsapWarned) { console.warn('[lightbox-ref-btn] GSAP not loaded, animations disabled'); _gsapWarned = true; }
  return false;
}

/**
 * @param {string} initialColor accent color (e.g. '#00FF80')
 * @param {() => Promise<void> | void} onCloseLightbox 在 chip 點擊跳頁前用來關掉 host lightbox 的 callback
 * @returns {{ btnEl: HTMLButtonElement, popoverEl: HTMLDivElement, setReferences: (refs: any[]) => void, setColor: (c: string) => void, reset: () => void }}
 */
export function createRefBtn(initialColor, onCloseLightbox) {
  const btnEl = document.createElement('button');
  btnEl.className = 'lightbox-ref-btn';
  btnEl.style.display = 'none';
  btnEl.setAttribute('aria-label', 'Show references');
  btnEl.innerHTML = `
    <span class="lightbox-ref-btn-pill" style="display:inline-flex;align-items:center;justify-content:center;background:${initialColor || '#00FF80'};color:#000;width:44px;height:44px;font-size:var(--font-size-p1);line-height:1;transform:rotate(0deg);transform-origin:left bottom;box-sizing:border-box;">
      <span class="icon icon-ref-lightbox icon-m"></span>
    </span>
  `;

  // popover 容器：absolute 定位到 btn 正上方
  // overflow 由 openPopover / closePopover 動態切（進場期間 clip 給 clip-reveal 用，動畫後 visible 讓旋轉 card 角不被裁）
  const popoverEl = document.createElement('div');
  popoverEl.className = 'lightbox-ref-popover';
  // z-index 9999：超過 PDF modal 內部 back/title/chevron (z:50) + modal 本身 (z:9999) 同層後 append
  // user 要求 ref popover 顯示時在最上層不被任何 lightbox 元素蓋
  popoverEl.style.cssText = 'position:absolute;display:none;z-index:9999;';

  // 內層 stack：垂直堆疊 chip（gap / align-items 由 CSS 控）
  const stackEl = document.createElement('div');
  stackEl.className = 'lightbox-ref-stack';
  popoverEl.appendChild(stackEl);

  let currentRefs = [];
  let currentColor = initialColor || '#00FF80';
  let isOpen = false;
  let openCloseAnimation = null;

  function setColor(color) {
    currentColor = color || '#00FF80';
    const pill = /** @type {HTMLElement | null} */ (btnEl.querySelector('.lightbox-ref-btn-pill'));
    if (pill) pill.style.background = currentColor;
  }

  function setReferences(refs) {
    currentRefs = Array.isArray(refs) ? refs.filter(r => r && r.section && r.itemId) : [];
    if (currentRefs.length === 0) {
      btnEl.style.display = 'none';
      closePopover(false);
      return;
    }
    btnEl.style.display = '';
    renderChips();
    if (isOpen) {
      // 已開啟狀態切換 media → 重新定位（chip 數量可能變）
      positionPopover();
    }
  }

  function renderChips() {
    stackEl.innerHTML = '';
    // 所有 ref 放在「單一」card 內，內部 grid 兩欄（label / title）統一對齊 title 起始位置
    // 每個 row 仍可獨立 click（button），但視覺是一張連續的卡（共用 bg + 整張旋轉）
    const card = document.createElement('div');
    card.className = 'lightbox-ref-card';
    card.style.background = currentColor;
    // 整張卡 ±1~3° 旋轉（取代既有 per-chip 旋轉）
    const rot = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2);
    card.style.transform = `rotate(${rot}deg)`;
    card.style.transformOrigin = 'left center';

    currentRefs.forEach(ref => {
      const row = document.createElement('button');
      row.type = 'button';
      // 故意不套 .list-ref-btn class：避免繼承 themes/color.css 對 list-ref-btn 的 mode-color
      // 染灰規則。lightbox 是獨立 host，hover 行為由 lightbox.css 自己定義
      row.className = 'lightbox-ref-chip';
      row.dataset.refSection = ref.section || '';
      row.dataset.refItem = ref.itemId || '';
      // chip layout 上下兩區：label 一行 EN+ZH 併排（上）、title EN/ZH 各自獨立 marquee row（下）
      // 兩個 title row 各自獨立 marquee 因為 EN/ZH 長度差異很大、合在一起 marquee 短的會空跑
      row.innerHTML = `
        <div class="lightbox-ref-chip-label">
          ${ref.labelEn ? `<p class="text-p3">${escape(ref.labelEn)}</p>` : ''}
          ${ref.labelZh ? `<p class="text-p3">${escape(ref.labelZh)}</p>` : ''}
        </div>
        <div class="lightbox-ref-chip-title">
          ${ref.titleEn ? `
            <div class="lightbox-ref-chip-title-row">
              <div class="lightbox-ref-chip-title-window">
                <div class="lightbox-ref-chip-title-track">
                  <div class="lightbox-ref-chip-title-unit">
                    <p class="text-p3 font-bold">${escape(ref.titleEn)}</p>
                  </div>
                </div>
              </div>
            </div>` : ''}
          ${ref.titleZh ? `
            <div class="lightbox-ref-chip-title-row">
              <div class="lightbox-ref-chip-title-window">
                <div class="lightbox-ref-chip-title-track">
                  <div class="lightbox-ref-chip-title-unit">
                    <p class="text-p3 font-bold">${escape(ref.titleZh)}</p>
                  </div>
                </div>
              </div>
            </div>` : ''}
        </div>
      `;
      row.addEventListener('click', e => {
        e.stopPropagation();
        navigateToRef(ref);
      });
      card.appendChild(row);
    });
    stackEl.appendChild(card);
    // 不再 alignLabelColumn（舊 layout label/title 並排需跨 row 對齊 title 起點；新 layout 上下排不需要）
    requestAnimationFrame(() => {
      setupAllMarquees();
    });
  }

  // 每個 title-row 獨立 marquee（EN/ZH 長度差異大，合在一起短的會空跑）
  // 量時若 popover 還 display:none → 暫時 visibility:hidden + display:block 量完還原
  function setupAllMarquees() {
    const wasDisplay = popoverEl.style.display;
    if (wasDisplay === 'none') {
      popoverEl.style.visibility = 'hidden';
      popoverEl.style.display = 'block';
    }
    stackEl.querySelectorAll('.lightbox-ref-chip-title-row').forEach(rowEl => {
      const win = /** @type {HTMLElement | null} */ (rowEl.querySelector('.lightbox-ref-chip-title-window'));
      const track = /** @type {HTMLElement | null} */ (rowEl.querySelector('.lightbox-ref-chip-title-track'));
      if (!win || !track) return;
      if (typeof gsap !== 'undefined') gsap.killTweensOf(track);
      track.style.transform = '';
      while (track.children.length > 1) track.removeChild(track.lastElementChild);
      const unit = /** @type {HTMLElement | null} */ (track.querySelector('.lightbox-ref-chip-title-unit'));
      if (!unit) return;
      const unitWidth = unit.getBoundingClientRect().width;
      const winWidth = win.clientWidth;
      if (unitWidth <= winWidth + 4) return;
      const clone = /** @type {HTMLElement} */ (unit.cloneNode(true));
      clone.style.marginLeft = '24px';
      track.appendChild(clone);
      const distance = unitWidth + 24;
      if (typeof gsap !== 'undefined') {
        gsap.fromTo(track, { x: 0 }, {
          x: -distance, duration: Math.max(3, distance / 80), ease: 'none', repeat: -1,
        });
      }
    });
    if (wasDisplay === 'none') {
      popoverEl.style.display = 'none';
      popoverEl.style.visibility = '';
    }
  }

  // popover 定位：btn 上緣往上彈出
  // 用 viewport coordinates（getBoundingClientRect）→ 相對 lightbox container（fixed inset:0）的 top/left
  // 不設 width / max-width：chip 寬度由內容決定（align-self:flex-start），popover 自己撐到最寬 chip
  // 允許 overflow 蓋到 PDF（user 同意，反正可收）
  function positionPopover() {
    const btnRect = btnEl.getBoundingClientRect();
    const parent = popoverEl.parentElement;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    // 量自己 height 才知道往上偏多少；先 visibility:hidden + display:block 量
    const wasDisplay = popoverEl.style.display;
    if (wasDisplay === 'none') {
      popoverEl.style.visibility = 'hidden';
      popoverEl.style.display = 'block';
    }
    const popH = popoverEl.offsetHeight;
    if (wasDisplay === 'none') {
      popoverEl.style.display = 'none';
      popoverEl.style.visibility = '';
    }
    // GAP 跟 padding 一起算：chip 底邊到 btn 視覺距離 ≈ padding(20) + GAP；GAP 設 0 即 padding 自然 buffer
    const GAP = 0;
    popoverEl.style.top = `${btnRect.top - parentRect.top - popH - GAP}px`;
    // chip 左緣對齊 btn 左緣 → popover 自己往左偏 padding 量讓 chip(在 popover 內 padding-left:32) 對齊 btn
    // padding 跟 lightbox.css .lightbox-ref-popover 同步（32px 給旋轉 card 角 breathing room）
    popoverEl.style.left = `${btnRect.left - parentRect.left - 32}px`;
  }

  function openPopover() {
    if (isOpen || currentRefs.length === 0) return;
    isOpen = true;
    popoverEl.style.display = 'block';
    // 進場期間 overflow:clip 給 clip-reveal 用（stackEl 從底邊長出，超出部分裁掉）；
    // onComplete 後改 visible，否則 card 旋轉 ±3° 後超出 popover bbox 的角會被永久裁切
    popoverEl.style.overflow = 'clip';
    positionPopover();
    if (gsapAvailable()) {
      if (openCloseAnimation) openCloseAnimation.kill();
      gsap.set(stackEl, { yPercent: 100 });
      openCloseAnimation = gsap.to(stackEl, {
        yPercent: 0,
        duration: 0.5,
        ease: 'power3.out',
        onComplete: () => { popoverEl.style.overflow = 'visible'; },
      });
    } else {
      stackEl.style.transform = '';
      popoverEl.style.overflow = 'visible';
    }
  }

  function closePopover(animated = true) {
    if (!isOpen) {
      popoverEl.style.display = 'none';
      return;
    }
    isOpen = false;
    // 退場前先把 overflow 切回 clip — 否則 yPercent 100→100 過程中旋轉 card 角會穿出 popover 底邊看不雅
    popoverEl.style.overflow = 'clip';
    if (gsapAvailable() && animated) {
      if (openCloseAnimation) openCloseAnimation.kill();
      openCloseAnimation = gsap.to(stackEl, {
        yPercent: 100,
        duration: 0.35,
        ease: 'power3.in',
        onComplete: () => { popoverEl.style.display = 'none'; },
      });
    } else {
      popoverEl.style.display = 'none';
    }
  }

  function togglePopover() {
    if (isOpen) closePopover(true);
    else openPopover();
  }

  async function navigateToRef(ref) {
    // 1) 關閉 host lightbox（caller 提供的 onClose 含 enter/exitLightboxMode + fadeout）
    if (typeof onCloseLightbox === 'function') {
      try { await onCloseLightbox(); } catch (_) { /* swallow */ }
    }
    // 2) 收起 popover 自己狀態
    closePopover(false);
    // 3) 跳轉分流：
    //    a) 已在 activities 頁 + __sccdNavigateToItem 可用 → 直接 in-page 跳（同 list 內 ref btn 行為）
    //       避免「重 init 整頁 → 回 hero top → 再 scroll 到 item」的視覺鏈
    //    b) 其他頁（library/alumni/index 等）→ <a> click 走 router SPA 換頁
    const onActivitiesPage = /\/(activities|pages\/activities)\.?html?$/i.test(location.pathname)
      || location.pathname === '/pages/activities.html';
    if (onActivitiesPage && typeof window.__sccdNavigateToItem === 'function') {
      window.__sccdNavigateToItem(ref.section, ref.itemId || null);
      return;
    }
    const url = `${ACTIVITIES_PATH}?section=${encodeURIComponent(ref.section)}&item=${encodeURIComponent(ref.itemId)}`;
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  btnEl.addEventListener('click', e => {
    e.stopPropagation();
    togglePopover();
  });

  // 點 popover 外關閉（用 document click + closest 判斷不在 btn / popover 內）
  document.addEventListener('click', e => {
    if (!isOpen) return;
    const target = /** @type {HTMLElement} */ (e.target);
    if (btnEl.contains(target) || popoverEl.contains(target)) return;
    closePopover(true);
  });

  function reset() {
    closePopover(false);
    currentRefs = [];
    btnEl.style.display = 'none';
  }

  return { btnEl, popoverEl, setReferences, setColor, reset };
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

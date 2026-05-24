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
      <span class="icon icon-arrow-right icon-m"></span>
    </span>
  `;

  // popover 容器：absolute 定位到 btn 正上方；外層 overflow:clip 給內部 yPercent:100→0 clip-reveal 用
  const popoverEl = document.createElement('div');
  popoverEl.className = 'lightbox-ref-popover';
  popoverEl.style.cssText = 'position:absolute;display:none;z-index:60;overflow:clip;';

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
      row.innerHTML = `
        <div class="lightbox-ref-chip-label">
          ${ref.labelEn ? `<p class="text-p3">${escape(ref.labelEn)}</p>` : ''}
          ${ref.labelZh ? `<p class="text-p3">${escape(ref.labelZh)}</p>` : ''}
        </div>
        <div class="lightbox-ref-chip-title">
          <div class="lightbox-ref-chip-title-window">
            <div class="lightbox-ref-chip-title-track">
              <div class="lightbox-ref-chip-title-unit">
                ${ref.titleEn ? `<p class="text-p3 font-bold">${escape(ref.titleEn)}</p>` : ''}
                ${ref.titleZh ? `<p class="text-p3 font-bold">${escape(ref.titleZh)}</p>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
      row.addEventListener('click', e => {
        e.stopPropagation();
        navigateToRef(ref);
      });
      card.appendChild(row);
    });
    stackEl.appendChild(card);
    // 量最寬 label width 後 set 到 card css var，讓 title 欄跨 row 對齊
    // 必須在 layout 後（rAF）量；marquee 也跑同 rAF
    requestAnimationFrame(() => {
      alignLabelColumn(card);
      setupAllMarquees();
    });
  }

  function alignLabelColumn(card) {
    // popover 可能 display:none（renderChips 在 setReferences 時跑，此時還沒 openPopover）
    // → getBoundingClientRect 全 0，量不到實際寬度
    // 暫時 visibility:hidden + display:block 量完還原；不會影響視覺也不會觸發 open animation
    const wasDisplay = popoverEl.style.display;
    if (wasDisplay === 'none') {
      popoverEl.style.visibility = 'hidden';
      popoverEl.style.display = 'block';
    }
    // 也要先清空 --ref-label-w 確保量「自然 intrinsic width」而非套了 var 後的固定值
    card.style.removeProperty('--ref-label-w');
    const labels = card.querySelectorAll('.lightbox-ref-chip-label');
    let maxW = 0;
    labels.forEach(el => {
      const w = el.getBoundingClientRect().width;
      if (w > maxW) maxW = w;
    });
    if (wasDisplay === 'none') {
      popoverEl.style.display = 'none';
      popoverEl.style.visibility = '';
    }
    if (maxW > 0) card.style.setProperty('--ref-label-w', `${Math.ceil(maxW)}px`);
  }

  function setupAllMarquees() {
    stackEl.querySelectorAll('.lightbox-ref-chip').forEach(chip => {
      const win = /** @type {HTMLElement | null} */ (chip.querySelector('.lightbox-ref-chip-title-window'));
      const track = /** @type {HTMLElement | null} */ (chip.querySelector('.lightbox-ref-chip-title-track'));
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
    // chip 左緣對齊 btn 左緣 → popover 自己往左偏 padding 量讓 chip(在 popover 內 padding-left:20) 對齊 btn
    popoverEl.style.left = `${btnRect.left - parentRect.left - 20}px`;
  }

  function openPopover() {
    if (isOpen || currentRefs.length === 0) return;
    isOpen = true;
    popoverEl.style.display = 'block';
    positionPopover();
    // clip-reveal：stackEl 從 yPercent:100 → 0；外層 popoverEl overflow:clip 把溢出部分裁掉
    // 視覺：chip 列從 popover 底邊「長出來」，配合往上彈的位置 = 從 ref btn 上方湧出
    if (gsapAvailable()) {
      if (openCloseAnimation) openCloseAnimation.kill();
      gsap.set(stackEl, { yPercent: 100 });
      openCloseAnimation = gsap.to(stackEl, {
        yPercent: 0,
        duration: 0.5,
        ease: 'power3.out',
      });
    } else {
      stackEl.style.transform = '';
    }
  }

  function closePopover(animated = true) {
    if (!isOpen) {
      popoverEl.style.display = 'none';
      return;
    }
    isOpen = false;
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
    // 3) SPA navigate 到 activities 對應 section/item
    //    用 router 攔截的 a-click pattern：dispatch click on <a>，或直接改 location.href（router popstate 處理）
    //    這裡選擇用 anchor click 觸發 router（router.js 攔截 document a[href] click）
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

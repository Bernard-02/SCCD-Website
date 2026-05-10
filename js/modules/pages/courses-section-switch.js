/**
 * Courses Section Switch Module
 * 處理 courses.html 的三組 program 切換（bfa-animation / bfa-cmd / mdes）
 *
 * 新版 layout：
 *   - 三個按鈕橫排於頂部，BFA 兩 btn 各自上方有 .courses-bfa-label「BFA Class 學士班」
 *     （仿 about.html class section 的 class-group-label 結構，每 BFA btn 各自一個 label）
 *   - 點 bfa-* btn → 該 btn 上方的 label 同步套 active 色 + 新隨機旋轉
 *   - 旋轉/位移/hover 比照 about/bfa-division-toggle.js：所有 btn-inner 與 label 都有
 *     _baseRot；hover 時隨機切換 rotation+accent，mouseleave 還原 _baseRot
 *   - 內容改 grid（學期×必修/選修×年級）+ 右下 sticky desc panel
 */

import { renderCoursesGrid, deselectActiveCard } from './courses-map.js';
import { setActiveNavBtn } from '../ui/section-switch-helpers.js';

let currentProgramColor = '';
export function getCurrentProgramColor() { return currentProgramColor; }

// courses 專用旋轉幅度 ±2°（排除 ±0.5）— 比 SCCDHelpers.getRandomRotation(-4~6) 小，
// 配合寬 btn（如 "Animation & Moving Image" 兩行）與 BFA label 視覺較柔
function getRot() {
  let r = 0;
  while (Math.abs(r) < 0.5) r = parseFloat((Math.random() * 4 - 2).toFixed(2));
  return r;
}
function getColor() { return SCCDHelpers.getRandomAccentColor(); }

// 替每個 .courses-bfa-label 與 inactive btn-inner 寫入 _baseRot 並套 transform，
// 同時清掉 inactive btn-inner 的殘留 inline bg/color（避免之前 active/hover 期間
// 設過 inline color: #000000，切換後 .active 被移除但 inline color 還在 → 文字還是黑色）
// setActiveNavBtn 只清 bg 與 transform，不清 color，所以 color 要在這手動清
function applyBaseRotations() {
  document.querySelectorAll('.courses-bfa-label').forEach(label => {
    const el = /** @type {HTMLElement & { _baseRot?: number }} */ (label);
    if (el._baseRot == null) el._baseRot = getRot();
    el.style.transform = `rotate(${el._baseRot}deg)`;
  });
  document.querySelectorAll('.courses-program-btn:not(.active) .anchor-nav-inner').forEach(inner => {
    const el = /** @type {HTMLElement & { _baseRot?: number }} */ (inner);
    if (el._baseRot == null) el._baseRot = getRot();
    el.style.transform = `rotate(${el._baseRot}deg)`;
    el.style.background = '';
    el.style.color = '';
  });
}

// 替 active btn-inner 把當下 inline transform 取出記到 _baseRot，方便日後 mouseleave 還原
/** @param {HTMLElement|null} activeBtn */
function syncActiveBaseRot(activeBtn) {
  if (!activeBtn) return;
  activeBtn.querySelectorAll('.anchor-nav-inner').forEach(inner => {
    const el = /** @type {HTMLElement & { _baseRot?: number }} */ (inner);
    const m = el.style.transform.match(/rotate\(([-\d.]+)deg\)/);
    if (m) el._baseRot = parseFloat(m[1]);
  });
}

// hover handler：mouseenter 給 btn-inner 與同 group 的 label 一個臨時隨機 rotation + accent；
// mouseleave 還原到各自的 _baseRot 並清 inline bg/color
/** @param {HTMLElement} btn */
function bindHover(btn) {
  if (btn.dataset.hoverBound) return;
  btn.dataset.hoverBound = '1';

  const inner = /** @type {HTMLElement & { _baseRot?: number } | null} */ (btn.querySelector('.anchor-nav-inner'));
  const group = btn.closest('.courses-program-group');
  const label = /** @type {(HTMLElement & { _baseRot?: number }) | null} */ (group?.querySelector('.courses-bfa-label') || null);

  btn.addEventListener('mouseenter', () => {
    if (btn.classList.contains('active')) return;
    const color = getColor();
    const rot = getRot();
    const labelRot = getRot();
    if (inner) {
      inner.style.background = color;
      inner.style.color = '#000000';
      inner.style.transform = `rotate(${rot}deg)`;
    }
    if (label) {
      label.style.background = color;
      label.style.color = '#000000';
      label.style.transform = `rotate(${labelRot}deg)`;
    }
    // _pending* 給 click 用：點下去保留剛剛 hover 看到的角度+顏色（仿 about/bfa-division-toggle.js）
    /** @type {any} */ (btn)._pendingColor = color;
    /** @type {any} */ (btn)._pendingRot = rot;
    /** @type {any} */ (btn)._pendingLabelRot = labelRot;
  });

  btn.addEventListener('mouseleave', () => {
    if (btn.classList.contains('active')) return;
    if (inner) {
      inner.style.background = '';
      inner.style.color = '';
      inner.style.transform = `rotate(${inner._baseRot || 0}deg)`;
    }
    if (label) {
      label.style.background = '';
      label.style.color = '';
      label.style.transform = `rotate(${label._baseRot || 0}deg)`;
    }
    /** @type {any} */ (btn)._pendingColor = null;
    /** @type {any} */ (btn)._pendingRot = null;
    /** @type {any} */ (btn)._pendingLabelRot = null;
  });
}

export function initCoursesSectionSwitch() {
  const programBtns = document.querySelectorAll('.courses-program-btn');
  const panels = document.querySelectorAll('.courses-panel');
  const sectionEl = document.getElementById('courses-content-section');

  if (!programBtns.length || !panels.length) return;

  // hover 一次性綁定（每 btn 帶 dataset flag 避免重綁）
  programBtns.forEach(bindHover);

  // ?program= 兼容：bfa → bfa-animation
  const params = new URLSearchParams(window.location.search);
  const hasQueryDeepLink = params.has('program');
  const rawProgram = params.get('program');
  const initialProgram = (rawProgram === 'bfa') ? 'bfa-animation' : (rawProgram || 'bfa-animation');

  switchToProgram(initialProgram, programBtns, false);
  if (hasQueryDeepLink) {
    setTimeout(() => {
      if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth' });
    }, 1000);
  }

  programBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchToProgram(btn.getAttribute('data-program'), programBtns, true);
    });
  });

  async function switchToProgram(program, btns, shouldScroll) {
    // 找出將被 active 的 btn，把 hover 留下的 _pendingColor / _pendingRot / _pendingLabelRot
    // 拿出來餵給 setActiveNavBtn，達成「hover 看到什麼角度，click 就停在什麼角度」的記憶效果（仿 about）
    const incomingBtn = /** @type {any} */ ([...btns].find(b => b.getAttribute('data-program') === program));
    const opts = {};
    if (incomingBtn?._pendingColor) opts.color = incomingBtn._pendingColor;
    if (incomingBtn?._pendingRot != null) opts.rotation = incomingBtn._pendingRot;
    const pendingLabelRot = incomingBtn?._pendingLabelRot;

    const { color } = setActiveNavBtn(btns, program, 'data-program', opts);
    currentProgramColor = color;
    panels.forEach(p => p.classList.toggle('hidden', p.id !== `panel-${program}`));

    // 切 program 時 reset 卡片選取狀態（避免 active card / slide-in 殘留）
    deselectActiveCard();

    // setActiveNavBtn 清掉 inactive btn-inner 的 inline transform，需 re-apply _baseRot
    applyBaseRotations();

    const activeBtn = /** @type {HTMLElement|null} */ (document.querySelector(
      `.courses-program-btn.active[data-program="${program}"]`
    ));

    // 把 active btn-inner 的 inline rotation 同步到 _baseRot（供之後 mouseleave 還原用）
    syncActiveBaseRot(activeBtn);

    // 全部 label 先清 inline bg/color；active group 那個重新套 accent + rotation
    // label rotation 優先用 hover pending，無 pending 才隨機（避免 click 後 label 角度突然亂跳）
    document.querySelectorAll('.courses-bfa-label').forEach(l => {
      /** @type {HTMLElement} */ (l).style.background = '';
      /** @type {HTMLElement} */ (l).style.color = '';
    });
    if (activeBtn) {
      const group = activeBtn.closest('.courses-program-group');
      const label = /** @type {HTMLElement & { _baseRot?: number }} */ (group?.querySelector('.courses-bfa-label'));
      if (label) {
        label._baseRot = pendingLabelRot != null ? pendingLabelRot : getRot();
        label.style.background = color;
        label.style.color = '#000000';
        label.style.transform = `rotate(${label._baseRot}deg)`;
      }
    }

    // click 後要清掉 _pending（避免下次無 hover 直接點時還沿用舊值）
    if (incomingBtn) {
      incomingBtn._pendingColor = null;
      incomingBtn._pendingRot = null;
      incomingBtn._pendingLabelRot = null;
    }

    await renderCoursesGrid(program);
    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();

    // 卡片進場 clip-path reveal：所有卡片同時出現（無 stagger），每張隨機從 4 方向之一展開
    // inset 四值用 % 單位（GSAP tween inset() 四值單位需一致，否則直接跳終值不動畫）
    const CLIP_DIRS = [
      'inset(100% 0% 0% 0%)',  // 上 → 下
      'inset(0% 0% 100% 0%)',  // 下 → 上
      'inset(0% 100% 0% 0%)',  // 左 → 右
      'inset(0% 0% 0% 100%)',  // 右 → 左
    ];
    const activePanel = document.getElementById(`panel-${program}`);
    if (activePanel && typeof gsap !== 'undefined') {
      const allCards = activePanel.querySelectorAll('.courses-grid-card');
      if (allCards.length) {
        gsap.killTweensOf(allCards);
        allCards.forEach(card => {
          const dir = CLIP_DIRS[Math.floor(Math.random() * CLIP_DIRS.length)];
          gsap.set(card, { clipPath: dir });
        });

        const playReveal = () => {
          gsap.to(allCards, {
            clipPath: 'inset(0% 0% 0% 0%)',
            duration: 0.4,
            ease: 'cubic-bezier(0.25, 0, 0, 1)',
            overwrite: true,
            clearProps: 'clipPath',
          });
        };

        if (typeof ScrollTrigger !== 'undefined') {
          ScrollTrigger.create({
            trigger: activePanel,
            start: 'top 90%',
            once: true,
            onEnter: playReveal,
          });
        } else {
          playReveal();
        }
      }
    }

    if (shouldScroll && sectionEl) {
      sectionEl.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

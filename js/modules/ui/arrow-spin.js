// 箭頭隨機角度互動（user 2026-09-10；2026-09-15 改「離開保持」全站定案）。
// 角度全站統一抽 −4°~+6°（user 09-10 拍板，各處不再帶自己的 range）。
// hover＝抽隨機新角；mouseleave＝保持新角（轉正定案、不彈回）；click＝沿用 hover 角（沒有 hover 時──手機、
// 或同一次 hover 內連點──就重抽一個保證跟現角差 SPAN/4 以上的新角，連點才看得出變）。
// setAngle(deg) 由 caller 決定寫法（inline transform / CSS var）；rotate 的 transition 也由 caller 備妥。
const MIN = -4, MAX = 6;
const SPAN = MAX - MIN;

// 抽新角：避開近 0（看起來像沒轉）＋跟現角至少差 SPAN/4（否則抽到相近角＝視覺無變化）。
// 角度由別的系統持有的元素（footer 散佈卡＝GSAP rotation）直接拿現角來抽
export function randomSpinAngle(from) {
  let r = from;
  while (Math.abs(r) < 0.5 || Math.abs(r - from) < SPAN / 4) {
    r = +(Math.random() * SPAN + MIN).toFixed(2);
  }
  return r;
}

/**
 * @param {HTMLElement} el
 * @param {(deg: number) => void} setAngle
 * @param {{ initial?: number, onCommit?: (deg: number) => void, ignoreEnter?: (e: MouseEvent) => boolean, clickReroll?: boolean | (() => boolean) }} [opts]
 *   clickReroll:false＝點擊不重抽（只定案 hover 角；沒 hover 就維持現角）；傳函式＝點擊當下判斷
 */
export function bindArrowSpin(el, setAngle, { initial = 0, onCommit, ignoreEnter, clickReroll = true } = {}) {
  let committed = initial;
  let pending = null;   // hover 預覽角（about tab 的 _pendingRot）
  const rand = () => randomSpinAngle(committed);
  // hover 只綁桌面（矮橫向 gate 同 landscape.css）
  if (SCCDHelpers.isDesktopLayout()) {
    el.addEventListener('mouseenter', (e) => {
      if (ignoreEnter && ignoreEnter(e)) return;   // 補發的假 mouseenter（元素被搬 DOM／overlay 蓋過又掀開）→ 別抽新角
      // active／開著的鈕 hover 不轉（user 2026-09-29 全站：history 清單鈕 .active、footer tab .is-active、header 漢堡鈕 .is-open）
      if (el.classList.contains('active') || el.classList.contains('is-active') || el.classList.contains('is-open')) return;
      pending = rand(); setAngle(pending);
    });
    // 離開保持新角＝直接轉正定案（角度已顯示、不需 setAngle）
    el.addEventListener('mouseleave', () => { if (pending != null) committed = pending; pending = null; });
  }
  el.addEventListener('click', () => {
    const reroll = typeof clickReroll === 'function' ? clickReroll() : clickReroll;
    // 沒 hover 角又不重抽＝角度不動、不寫回（現角可能是 CSS 預設，如 history 鈕 −8°，跟 committed 初值 0 對不上）
    if (pending == null && !reroll) return;
    committed = pending ?? rand();
    pending = null;   // 同一次 hover 內再點＝重抽（不清的話連點會一直定同一個角）
    setAngle(committed);
    if (onCommit) onCommit(committed);
  });
  const api = {
    // 外部重設定案角
    commit(deg) { committed = deg; pending = null; setAngle(deg); },
    // 重抽一個新定案角（slide-in 每次開啟用；走同一套 −4~+6 取值）
    reroll() { committed = rand(); pending = null; setAngle(committed); },
  };
  // SPA 同頁重 init 時新 closure 拿不到舊 api → 掛元素上取用
  /** @type {any} */ (el)._arrowSpin = api;
  return api;
}

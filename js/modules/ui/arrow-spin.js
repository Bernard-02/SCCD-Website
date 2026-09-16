// 箭頭隨機角度互動（user 2026-09-10；2026-09-15 改「離開保持」全站定案）。
// 角度全站統一抽 −4°~+6°（user 09-10 拍板，各處不再帶自己的 range）。
// hover＝抽隨機新角；mouseleave＝保持新角（轉正定案、不彈回）；click＝沿用 hover 角（沒有 hover 時──手機、
// 或同一次 hover 內連點──就重抽一個保證跟現角差 SPAN/4 以上的新角，連點才看得出變）。
// setAngle(deg) 由 caller 決定寫法（inline transform / CSS var）；rotate 的 transition 也由 caller 備妥。
const MIN = -4, MAX = 6;
const SPAN = MAX - MIN;

export function bindArrowSpin(el, setAngle, { initial = 0, onCommit, ignoreEnter } = {}) {
  let committed = initial;
  let pending = null;   // hover 預覽角（about tab 的 _pendingRot）
  const rand = () => {
    // 避開近 0（看起來像沒轉）＋跟現角至少差 SPAN/4（否則抽到相近角＝視覺無變化）
    let r = committed;
    while (Math.abs(r) < 0.5 || Math.abs(r - committed) < SPAN / 4) {
      r = +(Math.random() * SPAN + MIN).toFixed(2);
    }
    return r;
  };
  // hover 只綁桌面（矮橫向 gate 同 landscape.css）
  if (window.innerWidth >= 768 && !window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) {
    el.addEventListener('mouseenter', () => {
      if (ignoreEnter && ignoreEnter()) return;   // re-parent 補發的假 mouseenter（元素被搬 DOM）→ 別抽新角
      pending = rand(); setAngle(pending);
    });
    // 離開保持新角＝直接轉正定案（角度已顯示、不需 setAngle）
    el.addEventListener('mouseleave', () => { if (pending != null) committed = pending; pending = null; });
  }
  el.addEventListener('click', () => {
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

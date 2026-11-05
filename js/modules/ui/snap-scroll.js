import { DUR, EASE } from './motion.js';
import { registerPageCleanup } from './page-cleanup.js';

// 捲完後「hold」住 snap=none，等使用者首次主動捲動/互動才交回 mandatory（見 scrollWindowNoSnap 註解）。
const INTERACT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
let _restoreHandler = null;
// list item 開著期間鎖住 snap=none（不交回 mandatory）：list 需要停在 section 中段自由捲讀 + 程式精準對齊，
// mandatory 會把它吸到 snap 點（section 頂/footer）＝user 報的「對齊後又被吸走」。開 item→lockSnapOff、收合/切 section/換頁→unlockSnap。
let _snapLocked = false;

function cancelHeldRestore() {
  if (_restoreHandler) {
    INTERACT_EVENTS.forEach(t => window.removeEventListener(t, _restoreHandler));
    _restoreHandler = null;
  }
}

// 捲完不還原；掛一次性互動 listener，使用者首次捲動/互動才交回 mandatory（restore 後自我移除）。
// 鎖住期間（item 開著）直接 return：snap 維持 none 由 unlockSnap 才還原，不讓「互動即還原」把鎖打開。
function holdSnapUntilInteract(html) {
  if (_snapLocked) return;
  cancelHeldRestore();
  _restoreHandler = () => { cancelHeldRestore(); html.style.scrollSnapType = ''; };
  INTERACT_EVENTS.forEach(t => window.addEventListener(t, _restoreHandler, { passive: true }));
}

// list item 開啟時呼叫：snap 鎖成 none 直到 unlockSnap。期間自由捲讀、程式對齊都不會被 mandatory 吸走。
export function lockSnapOff() {
  _snapLocked = true;
  cancelHeldRestore();
  document.documentElement.style.scrollSnapType = 'none';
}
// 收合 item / 切 section 時呼叫：解鎖並交回 mandatory（清 inline → CSS .snap-* class 重新生效）。
export function unlockSnap() {
  _snapLocked = false;
  document.documentElement.style.scrollSnapType = '';
}

// 立即交回 mandatory + 清掉 pending 互動 listener + 清鎖。router 換頁時呼叫（清掉上一頁殘留的 hold/lock），
// 否則 inline `none` 蓋過新頁 .snap-* class → 新頁磁吸失效。
export function releaseSnapHold() {
  _snapLocked = false;
  cancelHeldRestore();
  document.documentElement.style.scrollSnapType = '';
}

// 把程式捲動落點上限 clamp 到「footer 仍在視窗外」(viewport 底 ≤ footer 頂)。targetY 通常是「對齊頂部」理想落點；
// 回傳 min(targetY, footer頂−視窗高)＝有空間就對齊頂部、沒空間就停在「footer 剛好貼視窗底」(section 完整捲到底)處。
//
// ★正確用法（user 2026-06-28「有空間就在打開同時對齊頂部」）：**呼叫前先把 item content 撐開**（gsap.set height:auto）
//   讓 footer 已落在「展開後」位置再呼叫 → 落點一次到位、不受 #activities-content-section min-height:100vh 留白騙
//   （短 list 展開不一定推 footer，用 content.scrollHeight 預測會失準＝「先對齊頂部又往下修」的兩步跳）。量完即 set 回
//   height:0（同 tick set→量→set 不繪製不閃）。
// footerShiftPx（signed）：量到的 footer「之後」還會發生的位移。開 item 同時 search bar 收合會把 footer 往上拉
//   → 傳 −searchInner高 補償；bar 已收 / 無 bar / 不撐開＝傳 0。
// 不撐開直接呼叫（curriculum slide-in 不推 footer、ref 按鈕 instant 之後才開）＝用收合態 footer、最保守。
// #site-footer = SPA 各頁容器、#site-footer-static = index；隱藏 footer 的頁(library/atlas/generate)抓不到 → 不 clamp。
export function clampBelowFooter(targetY, footerShiftPx = 0) {
  const footer = document.getElementById('site-footer') || document.getElementById('site-footer-static');
  if (!footer || footer.style.display === 'none') return targetY;
  const footerTop = footer.getBoundingClientRect().top + window.scrollY + footerShiftPx;
  return Math.min(targetY, Math.max(0, Math.round(footerTop - window.innerHeight)));
}

/**
 * 程式捲動 window 到 targetY，全程把 mandatory scroll-snap 設成 none；捲完「不立刻」交回，而是 hold 成 none
 * 直到使用者首次主動捲動/互動才還原 .snap-* class 規則（mandatory）。
 *
 * Why（兩段問題）：
 * 1) 捲動「中」：snap-type:y mandatory（掛 <html>，見 css/layout/scroll-snap.css）會把 smooth scroll 搶回最近 snap
 *    點 → 到不了精準目標、速度被牽制、footer 起步無限抖動。故捲動全程設 none。
 * 2) 捲動「完」：deep-link 落點（如 activities 捲到 list 中某 item，對齊 sticky filter bar 底 ~200px）**不是**
 *    .snap-zone 的 snap 點。原本捲完立刻還原 → 瀏覽器當場 re-snap 把落點吸到最近 snap 點（section 頂）
 *    → item「頂到位後又被吸偏一點才展開」（user 2026-06-28）。需要 scroll 的 item 才中招；前幾個落點≈section 頂的不會。
 *    解法：捲完 hold none，等使用者「首次互動」(wheel/touch/key/pointer) 才交回 snap。磁吸本意是給「使用者捲動」用的，
 *    不該破壞「程式精準落點」；使用者一動就恢復磁吸，落地不動時 snap 本來就沒作用。
 *
 * 換頁要主動 releaseSnapHold()（router 換頁時呼叫）：否則殘留的 inline `none` 會蓋過新頁的 .snap-* class → 新頁磁吸失效。
 *
 * GSAP + ScrollToPlugin 在就用（onComplete/onInterrupt 精準）；否則 native smooth + 依距離估時。
 *
 * @param {number} targetY
 * @param {{ duration?: number, ease?: string, onComplete?: () => void }} [opts]
 */
export function scrollWindowNoSnap(targetY, { duration = DUR.medium, ease = EASE.move, onComplete } = {}) {
  const html = document.documentElement;
  cancelHeldRestore();                 // 上一次捲動若還在 hold，先清掉它的 pending restore（避免兩者打架）
  // 前一條 window scroll tween 未跑完又叫新的（deep-link 兩段式：先 section 頂、建完再對 item）→ 先殺舊的，
  // 避免兩條並存每幀搶寫 scrollTop；舊 onInterrupt 清 snapType 後下一行立即重設 'none'，順序安全
  if (typeof gsap !== 'undefined') gsap.killTweensOf(window);
  html.style.scrollSnapType = 'none';
  if (typeof gsap !== 'undefined' && typeof window.ScrollToPlugin !== 'undefined') {
    gsap.to(window, {
      scrollTo: { y: targetY, autoKill: false }, duration, ease,
      onComplete: () => { holdSnapUntilInteract(html); onComplete && onComplete(); },
      onInterrupt: () => { cancelHeldRestore(); html.style.scrollSnapType = ''; },  // 使用者中斷＝正在互動，立即交回磁吸
    });
  } else {
    // 多數頁沒載 ScrollToPlugin（只 index 等 5 頁有）→ native smooth：scrollend 一到就收尾；
    // 不支援 scrollend 的瀏覽器 / 距離 0 不捲動 → 依距離(px≈ms)估時兜底，夾 0.4~1.2s
    const ms = Math.min(1200, Math.max(400, Math.abs(targetY - window.scrollY)));
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('scrollend', finish);
      clearTimeout(timer);
      holdSnapUntilInteract(html);
      onComplete && onComplete();
    };
    const timer = setTimeout(finish, ms);
    window.addEventListener('scrollend', finish);
    window.scrollTo({ top: targetY, behavior: 'smooth' });
  }
}

// ── about 直向手機磁吸（user 2026-10-27：about 各區已照一屏排；DSD 直向 10-29 也用）──
// 原生 CSS snap 只開真桌面、且只吸最近點（過半才換屏）＋會蓋掉 footer 的方向磁吸 → 這頁手機改 JS：
// 停手（含慣性）後往某方向捲超過 15% 屏高＝補捲到那方向的下一個落點，不到＝回原落點。
// 落點＝.snap-zone 頂 − scroll-margin-top（同 nav btn 落點）＋最後一個＝footer 頂貼視窗底；footer 那段交給 footer-scatter 的方向磁吸。
// 比一屏高的區段（小螢幕 floor 撐高）：補「段尾貼視窗底」落點、段頭～段尾之間自由捲。
// 有 tab 的段（.snap-zone 標 data-snap-tabs＝該段 tab 鈕 selector，active 鈕帶 .active）：手勢從「段尾」落點往下／「段頂」落點往上
// 、停手位移過門檻＝切該方向的下一個 tab 並回段頂，不到門檻＝回原落點（不交給換屏／footer 磁吸＝footer 要最後一個 tab 走完才開）；
// 沒有下一個 tab 才換屏。段尾＝下一段是 footer 時的 footer 點（內容底貼視窗底：curriculum 年級清單比一屏長，先捲完才換年級）、
// 否則＝下一段頭之前最後一個落點（一屏段＝段頂，about Programs／Works）。換屏進 tab 段＝從上進第一個、從下進最後一個
// （user 2026-11-01 about「往下滑應該換 tab 不是換 section」、curriculum「往下滑切下一個年級、不切班級」）。
// 點 tab 的時機：往下進＝落地才點（about 手機 works ctx 靠 ScrollTrigger 捲過才翻、落地前點會切到圖文）；往上進＝決定換屏當下
// 就點（ctx 還是 works 只切 works panel，圖文由 bfa-division-toggle onLeaveBack 同步一次到位；落地才點會跟 bfa→animation 回退撞成切兩次）。
// ponytail: 以手勢起點所在落點判定、不看落點＝甩太遠也不會跳過 tab
const SNAP_SWITCH = 0.15;

// 100lvh 的 px＝iOS Safari 工具列收起後的可視高（其他環境＝innerHeight）。「footer 頂貼視窗底」類落點一律用它不用 innerHeight：
// 往上捲 Safari 工具列會展開（innerHeight 變 svh），footer 貼 svh 底＝整截透出在半透明工具列後面（user 2026-10-29）；
// 貼 lvh 底＝展開態 footer 在工具列帶下方（帶內是前一區自己的底 padding）、收起態剛好貼底
export function lvhPx() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:100lvh';
  document.body.append(probe);
  const h = Math.max(window.innerHeight, probe.offsetHeight);
  probe.remove();
  return h;
}

export function initAboutMobileSnap() {   // about／DSD／curriculum 直向手機共用（名字沿用）
  const mq = window.matchMedia('(max-width: 767px) and (orientation: portrait)');
  let lastY = window.scrollY, dir = 0, timer = 0, touching = false;
  let startY = window.scrollY;   // 這次手勢的起點（touchstart／程式捲動的目的地）＝tab 規則看的「出發段」
  let enterFirst = false;        // 往下換屏進 tab 段：落地後點第一個 tab
  // 捲到頁底再往上推的手指位移：footer 改浮層後（2026-11-04）文件底下沒東西可捲，段尾往下的 tab 手勢量不到捲動位移
  //（scrollY 卡在最大值）→ 改量手指。只在頁底、這一手勢沒捲動時代替位移
  let touchY0 = 0, pull = 0;
  const points = () => {
    const vh = window.innerHeight, sy = window.scrollY, fullH = lvhPx();
    const max = document.documentElement.scrollHeight - vh;
    const clamp = y => Math.round(Math.min(Math.max(y, 0), max));
    const zones = [...document.querySelectorAll('#page-content .snap-zone')]
      .filter(el => el.getClientRects().length).map(el => /** @type {HTMLElement} */ (el));   // display:none 的段（DSD 沒影片時的影片屏）rect 0＝會把當下位置當落點
    const ys = zones.map(el => el.getBoundingClientRect().top + sy - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0));
    const tabsAt = new Map(zones.flatMap((el, i) => el.dataset.snapTabs ? [[clamp(ys[i]), el.dataset.snapTabs]] : []));
    const footer = Array.from(document.querySelectorAll('#site-footer-static, #site-footer')).find(f => f.getClientRects().length);
    if (footer) ys.push(footer.getBoundingClientRect().top + sy - fullH);   // 貼 lvh 底（見 lvhPx）
    const pts = [...new Set(ys.map(clamp))].sort((a, b) => a - b);
    // 長段門檻用 100lvh：各屏 min-height 100lvh（iOS 工具列展開時比 innerHeight 高幾十 px，多出的是刻意留白）不算長段；
    // 多出不到換屏門檻（矮機多半是 bar 後的底 padding）也不算——否則捲 20% 只停在段尾那幾十 px、換不了屏
    // footer 點本身已是「內容底貼視窗底」＝段尾，不再往上補一屏：補了會在最後一屏多一個假落點（清單捲到最後一屏，
    // 每捲一點都被吸回去，user 2026-11-04 activities／admission「只滾一點都會自己滾」）→ 多出超過換屏門檻就整段自由捲
    const heads = ys.map(clamp), footerPt = footer ? heads[heads.length - 1] : null;
    const free = [];
    for (let i = pts.length - 1; i > 0; i--) {
      const gap = pts[i] - pts[i - 1];
      if (pts[i] === footerPt) { if (gap > vh * SNAP_SWITCH) free.push([pts[i - 1], pts[i]]); }
      else if (gap > fullH + vh * SNAP_SWITCH) { free.push([pts[i - 1], pts[i] - vh]); pts.splice(i, 0, pts[i] - vh); }
    }
    // tab 段的段尾落點（見檔頭）：下一段頭＝footer 點就是它；否則下一段頭之前最後一個落點（長段＝補的段尾點、一屏段＝段頂）
    const tailOf = new Map([...tabsAt.keys()].map(top => {
      const next = heads.filter(h => h > top).sort((a, b) => a - b)[0];
      return [top, next === undefined ? top : next === footerPt ? next : pts.filter(p => p < next).pop()];
    }));
    return { pts, free, tabsAt, tailOf };
  };
  const settle = () => {
    if (!mq.matches || touching || !dir || document.body.classList.contains('anchor-jumping')
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const y = window.scrollY;
    const pushed = pull; pull = 0;   // 這一手勢在頁底往下推的量（觸控／滾輪），讀一次就清
    const { pts, free, tabsAt, tailOf } = points();
    const th = window.innerHeight * SNAP_SWITCH;
    const tabsOf = (p) => [...document.querySelectorAll(tabsAt.get(p) || '')].map(b => /** @type {HTMLElement} */ (b));
    // tab 段：看手勢淨位移（起點＝出發落點）；放在「已在落點」判斷之前（甩到剛好落在別的落點也不能跳過 tab）。
    // 起點要真的停在落點上（footer 內的停點往上查也會查到 footer 點＝不算）。
    // 頁底一律算最後一個落點：footer 點用 100lvh 算，iOS 工具列展開時比頁底高一截＝停在頁底也要能往下換 tab（user 2026-11-04）
    const atEnd = y >= document.documentElement.scrollHeight - window.innerHeight - 1;
    const startAtEnd = startY >= document.documentElement.scrollHeight - window.innerHeight - 1;
    const from = startAtEnd ? pts[pts.length - 1] : pts.filter(p => p <= startY + 1).pop();
    const top = [...tabsAt.keys()].find(t => from === t || from === tailOf.get(t));
    if (top !== undefined && (startAtEnd || Math.abs(startY - from) <= 1)) {
      const d = y === startY && atEnd && pushed > 0 ? pushed : y - startY;
      const want = d > 0 && from === tailOf.get(top) ? 1 : d < 0 && from === top ? -1 : 0;   // 段尾往下／段頂往上才算 tab 手勢
      const tabs = tabsOf(top);
      const to = want ? tabs[tabs.findIndex(b => b.classList.contains('active')) + want] : null;
      if (to && !(/** @type {HTMLButtonElement} */ (to).disabled)) {   // disabled＝該段還沒準備好（activities 清單沒建完）＝原地不動
        // 先捲再點：點擊自帶捲頂的（curriculum 年級鈕 scrollToSectionTopNow：GSAP 接手＋鎖段高防新年級較短先露 footer）會蓋掉這條
        if (Math.abs(d) > th) { startY = top; window.scrollTo({ top, behavior: 'smooth' }); to.click(); }
        else { startY = from; window.scrollTo({ top: from, behavior: 'smooth' }); }
        return;
      }
    }
    if (y >= pts[pts.length - 1] - 1 || pts.some(p => Math.abs(p - y) <= 1)) {   // footer 段／已在落點
      if (enterFirst && tabsAt.has(y)) tabsOf(y)[0]?.click();
      enterFirst = false; startY = y;
      return;
    }
    if (free.some(([a, b]) => y > a && y < b)) { startY = y; return; }
    const prev = pts.filter(p => p < y).pop();
    const next = pts.find(p => p > y);
    if (prev === undefined || next === undefined) return;
    const to = dir > 0 ? (y - prev > th ? next : prev) : (next - y > th ? prev : next);
    if (tabsAt.has(to) && to !== from) {   // 回自己那段＝不動 tab
      if (to > from) enterFirst = true;
      else { const t = tabsOf(to); t[t.length - 1]?.click(); }
    }
    startY = to;
    window.scrollTo({ top: to, behavior: 'smooth' });
  };
  const arm = () => { clearTimeout(timer); timer = setTimeout(settle, 120); };
  const onScroll = () => {
    const y = window.scrollY;
    if (y !== lastY) dir = Math.sign(y - lastY);
    lastY = y;
    arm();
  };
  const onTouchStart = (/** @type {TouchEvent} */ e) => {   // 手指介入＝使用者接手，取消落地自動切 tab
    touching = true; startY = window.scrollY; enterFirst = false;
    touchY0 = e.touches[0]?.clientY ?? 0; pull = 0;
  };
  const onTouchMove = (/** @type {TouchEvent} */ e) => { if (e.touches[0]) pull = touchY0 - e.touches[0].clientY; };
  const onTouchEnd = () => {
    touching = false;
    // 頁底往上推（沒捲動＝沒 scroll 事件給方向）：補方向，settle 才會看 tab 手勢
    if (pull > 0 && window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 1) dir = 1;
    arm();
  };
  // 滾輪（桌面窄視窗／DevTools 手機模擬）：頁底再往下滾＝同觸控上推，累計到停手 settle（user 2026-11-04 滾到底不換年級）
  const onWheel = (/** @type {WheelEvent} */ e) => {
    if (e.deltaY <= 0 || window.scrollY < document.documentElement.scrollHeight - window.innerHeight - 1) return;
    pull += e.deltaY; dir = 1;
    arm();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  ['touchend', 'touchcancel'].forEach(t => window.addEventListener(t, onTouchEnd, { passive: true }));
  registerPageCleanup(() => {
    clearTimeout(timer);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    ['touchend', 'touchcancel'].forEach(t => window.removeEventListener(t, onTouchEnd));
  });
}

// ── 真桌面 frame 右欄的分段磁吸（faculty 四類／curriculum 三 program，user 2026-11-04「跟 about 一樣每個 section 都 snap」）──
// 不用原生 CSS snap：比欄高的區段尾，滑鼠一格一格（100px）滾會被吸回段尾＝出不去（Chrome 實測 mandatory／proximity 都是；
// about 每區剛好一屏才沒踩到）。改 JS：落點＝欄內 .snap-zone 頂 − scroll-margin-top（＝點 nav 的落點，各頁 JS 寫好）；
// 比欄高的段補「段尾貼欄底」落點、段中自由捲；停手（120ms）時若停在兩落點之間＝往捲動方向吸到下一個（同 about 桌面原生
// 的手感：一格就換段，不設門檻）。只認使用者自己的滾輪／按鍵（600ms 內）＝點 nav、deep-link 這類程式捲動不會被拉走。
// 觸控（iPad 橫向）／reduced-motion 不開（同 window 那套）。
/** @param {HTMLElement|null} col @param {HTMLElement|null} [inputHost] 收滾輪的範圍（含欄外留白帶，bindFrameScrollSplit 會路由進欄） */
export function initColSnap(col, inputHost = col) {
  if (!col || !SCCDHelpers.isDesktopLayout() || !window.matchMedia('(pointer: fine)').matches) return;
  let last = col.scrollTop, dir = 0, timer = 0, lastInput = 0;
  const points = () => {
    const H = col.clientHeight, max = col.scrollHeight - H, top = col.getBoundingClientRect().top;
    const clamp = (/** @type {number} */ y) => Math.round(Math.min(Math.max(y, 0), max));
    const starts = [...new Set([...col.querySelectorAll('.snap-zone')].filter(z => z.getClientRects().length)
      .map(z => clamp(z.getBoundingClientRect().top - top + col.scrollTop - (parseFloat(getComputedStyle(z).scrollMarginTop) || 0))))]
      .sort((a, b) => a - b);
    const pts = [...starts], free = /** @type {[number, number][]} */ ([]);
    // 段 i 覆蓋 [起點, 下一段起點 − 欄高]：比欄高＝段中自由捲＋補段尾落點；最後一段一路到捲動終點（終點也是落點）
    starts.forEach((s, i) => {
      const tail = i < starts.length - 1 ? starts[i + 1] - H : max;
      if (tail > s) { free.push([s, tail]); pts.push(tail); }
    });
    return { pts: [...new Set(pts)].sort((a, b) => a - b), free };
  };
  const settle = () => {
    if (!dir || performance.now() - lastInput > 600 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const y = col.scrollTop;
    const { pts, free } = points();
    if (pts.some(p => Math.abs(p - y) <= 1) || free.some(([a, b]) => y > a && y < b)) return;
    const to = dir > 0 ? pts.find(p => p > y) : pts.filter(p => p < y).pop();
    if (to !== undefined) col.scrollTo({ top: to, behavior: 'smooth' });
  };
  col.addEventListener('scroll', () => {
    const y = col.scrollTop;
    if (y !== last) dir = Math.sign(y - last);
    last = y;
    clearTimeout(timer);
    timer = window.setTimeout(settle, 120);
  }, { passive: true });   // 欄在 #page-content 內＝換頁隨 DOM 丟
  const onInput = () => { lastInput = performance.now(); };
  inputHost?.addEventListener('wheel', onInput, { passive: true });
  window.addEventListener('keydown', onInput);
  registerPageCleanup(() => { clearTimeout(timer); window.removeEventListener('keydown', onInput); });
}

// 捲動停了（150ms 沒新的 scroll）才叫 cb；回傳取消函式（連點 nav＝取消上一個再掛新的）。
// faculty／curriculum 點 nav：經過的 section 進場照播、落地才收成終態（user 2026-11-04「去的時候不會看到直接 load 完，回到上面也不會空白」）
/** @param {Window|HTMLElement} target @param {() => void} cb */
export function whenScrollSettles(target, cb) {
  let t = 0;
  const kick = () => { clearTimeout(t); t = window.setTimeout(done, 150); };
  const off = () => { clearTimeout(t); target.removeEventListener('scroll', kick); };
  const done = () => { off(); cb(); };
  target.addEventListener('scroll', kick, { passive: true });
  kick();
  return off;
}

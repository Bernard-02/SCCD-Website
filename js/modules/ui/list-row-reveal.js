// list rows 進退場＝CSS transition（四輪 Part 1，2026-09-03）。
//
// 取代 activities/admission 清單 rows 的 GSAP yPercent（gsap.set/gsap.to）——那是切分頁 ~9s 凍結的根因：
// 新建 row 對 GSAP 永遠「冷」，首觸 gsap.set/to 逐列讀 computed style＝逐列全頁 style recalc（50~120ms×N）。
// 改 CSS transition：compositor 接管、零 computed 讀、longtask 不凍幀（同 B-1 zebra、library reveal 已驗證的路線）。
//
// 前提：rows 已被 setupClipReveal 包 `.clip-reveal-wrapper` 遮罩（overflow-y:clip）→ translateY 被剪＝clip-reveal 位移感。
//   （Option B：保留 setupClipReveal 包遮罩＝零 layout 變、buildItemHtml 不動；只把 hide/reveal/exit「動畫」退 GSAP。）
// translateY(110%)＝自身高度 + 10% 過衝（防 dpr hairline），等義於 GSAP yPercent:100。
//
// ⚠️ 揭前隱藏態必須已 commit（painted）才會 transition 而非 snap：
//   - 切換 master 路徑：caller reveal loop 前 `void panel.offsetHeight` 單次 reflow commit。
//   - reveal-IO / ScrollTrigger onEnter：隔幀 fire＝天然已 commit。
//   同一同步區塊內先 hide 又 reveal（無中間 paint）會 snap → 各 caller 已保證有 commit 點。
import { DUR } from './motion.js';
import { prefersReducedMotion } from './reduce-motion.js';

// CSS 版 killTweensOf（六輪 2026-09-03）：轉 CSS transition 後沒有 GSAP 的 overwrite/killTweensOf——
// reveal 被退場/藏打斷時，殘留的 transitionend / setTimeout 回呼仍會開火：clr 把 transform 清成顯示態
// （row「已滑出/隱藏」彈回全亮）、finish 解鎖 data-pre-reveal（蓋掉退場剛設的鎖）＝「list 沒載完就切換、
// 未揭 item 完整靜態裸露」。解法＝generation 戳記：每次對一批 row 寫新狀態就 ++_gen 蓋到 row.dataset.rrGen，
// 舊回呼開火前比對捕獲的代數，不符＝已被接管 → no-op（**不得**清 inline，否則彈回）。
let _gen = 0;
function stampRows(list) { const g = String(++_gen); list.forEach(r => { r.dataset.rrGen = g; }); return g; }

// 藏：直寫 transform（transition:none＝殺 in-flight 揭/收 transition，否則從當前態反向走全程）。fromTop＝從上滑入。
export function hideRow(row, fromTop = false) {
  row.dataset.rrGen = String(++_gen);
  row.style.transition = 'none';
  row.style.transform = fromTop ? 'translateY(-110%)' : 'translateY(110%)';
}
export function hideRows(rows, fromTop = false) {
  const list = Array.from(rows || []);
  stampRows(list);
  list.forEach(r => { r.style.transition = 'none'; r.style.transform = fromTop ? 'translateY(-110%)' : 'translateY(110%)'; });
}

// 瞬間到終態（顯示、無動畫）：cull snap / reduced-motion / deep-link 直達。清 inline＝乾淨 rest。
export function snapRowsShown(rows) {
  const list = Array.from(rows || []);
  stampRows(list);
  list.forEach(r => { r.style.transition = 'none'; r.style.transform = ''; });
}

// 揭：逐 row transition-delay stagger（delay＝整組起跑「絕對」延遲，對齊原 GSAP timeline 的絕對時間位；
//   同步一次設完全部＝各自從同一 now 起算＝等義 timeline）。揭完各自 transitionend 清 inline；
//   onDone（解鎖 data-pre-reveal）掛整組結束時間的逾時兜底（transform 無變化時不 fire transitionend、不卡死互動）。
export function revealRows(rows, { dur = DUR.reveal, delay = 0, stagger = 0.06, onDone = null } = {}) {
  const list = Array.from(rows || []);
  if (!list.length) { if (onDone) onDone(); return; }
  const g = stampRows(list);
  let done = false;
  const finish = () => {
    if (done) return;
    if (list[0] && list[0].dataset.rrGen !== g) return;  // 六輪：被接管的 reveal 不解鎖 data-pre-reveal
    done = true; if (onDone) onDone();
  };
  if (prefersReducedMotion()) {
    // 直寫終態（不走 snapRowsShown＝不再 ++_gen，否則 finish 代數比對會誤判被接管、漏解鎖）
    list.forEach(r => { r.style.transition = 'none'; r.style.transform = ''; });
    finish(); return;
  }
  list.forEach((row, i) => {
    row.style.transition = `transform ${dur}s ease-out ${(delay + i * stagger).toFixed(3)}s`;
    row.style.transform = 'translateY(0)';
    const clr = (e) => {
      if (row.dataset.rrGen !== g) { row.removeEventListener('transitionend', clr); return; }  // 六輪：已被接管 → 只解綁、不清 inline
      if (e.target !== row || e.propertyName !== 'transform') return;
      row.style.transition = ''; row.style.transform = '';
      row.removeEventListener('transitionend', clr);
    };
    row.addEventListener('transitionend', clr);
  });
  setTimeout(finish, (delay + (list.length - 1) * stagger + dur + 0.1) * 1000);
}

// 退場：逐 row transform→110% 滑出（反向）。回 Promise（逾時 resolve）。fromEnd＝從尾端起 stagger。
export function exitRows(rows, { dur = DUR.base, stagger = 0, fromEnd = false } = {}) {
  const list = Array.from(rows || []);
  if (!list.length || prefersReducedMotion()) return Promise.resolve();
  stampRows(list);  // 六輪：換代作廢被打斷的 reveal 回呼（其 clr/finish 比對代數即 no-op、不彈回）
  const n = list.length;
  return new Promise(resolve => {
    list.forEach((row, i) => {
      const d = (fromEnd ? (n - 1 - i) : i) * stagger;
      row.style.transition = `transform ${dur}s ease-in ${d.toFixed(3)}s`;
      row.style.transform = 'translateY(110%)';
    });
    setTimeout(resolve, ((n - 1) * stagger + dur + 0.1) * 1000);
  });
}

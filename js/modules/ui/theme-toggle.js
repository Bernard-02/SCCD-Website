import { DUR, EASE } from './motion.js';
import { sitePath } from './site-base.js';
import { runLottieWhenVisible } from './lottie-visibility.js';
import { prefersReducedMotion } from './reduce-motion.js';
/**
 * Theme Toggle Module
 * 切換 standard / inverse / color 模式（影響整個網站的 body class）
 *
 * 整合策略：
 * - mode 存 sessionStorage，跨頁保持，新開視窗/分頁重置為 standard
 * - /generate 頁跟其他頁共用 mode：header mode-btn 跟 generate-app colormode btn 都走 setSiteMode
 * - applyModeForPage / updateToggleBtnVisualState 由 main-modular.js 在每次切頁呼叫，SPA 也能即時 re-evaluate
 *
 * mode-color：持續變化的隨機色（直接複製 generate-app wireframe Play 實作）
 *   - HSB(hue, 80, 100) ≡ HSL(hue, 100%, 60%)
 *   - 速度：每幀 `hue += 0.125`（直抄 wireframe baseSpeeds[0]）— 跟 gen 觀感同步
 *     不用時間驅動（dt × per-second rate），雖然理論值同 7.5°/s，但 gen 在實際環境下
 *     fps 可能不滿 60，per-frame 才能在 user 螢幕上跟 gen 同節奏
 *   - 對比文字色用 WCAG relative luminance（gamma-corrected sRGB），threshold 0.5
 *   - 元件已用 var(--theme-fg)/(--theme-bg) 的會自動跟著走
 *   - 純黑/白底 + 三原色 hl bg → CSS rule 用 var(--theme-overlay-25) 蓋成半透明，顯露隨機色
 */

const MODES = ['standard', 'inverse', 'color'];
const STORAGE_KEY = 'sccd-theme-mode';

// Mode 切換 fade：applyMode 在 body/html 加 .mode-switching class（typography.css 規則套 0.4s transition 到全 subtree），
//   0.4s 後移除 → 穩態下無 transition，避免 mode-color RAF 高頻更新 --theme-bg 跟 transition 衝突 lag
// 首次 apply（page load）跳過 fade，避免 default 白底 → 目標 mode 的閃爍
// 速度＝共用 token --dur-base（motion.js DUR.base 開機讀）：class 存活時窗必須＝CSS fade 時長，
// 改 variables.css 的 --dur-base 這裡自動跟上（user 09-08：變色 transition 一律走共用值）
const MODE_FADE_MS = DUR.base * 1000;
let hasAppliedModeOnce = false;
let modeSwitchTimer = null;
let antiJitterStyle = null;
// 獨立追蹤上次 apply 的 mode：不能用 body.mode-* class 偵測 currentMode，因為 /create 會把 body class
// 移除（pause），回來時 body class=null 會被誤判為「換了 mode」觸發 fade；fade 的 *!important transition
// 規則會蓋掉新頁進場動畫的 inline transition（如 library-card clipReveal 的 clip-path），導致卡片瞬間 snap
// 沒揭露動畫。改用 module 狀態變數，/create paused 不重設，回來同 mode → isSameMode=true 跳過 fade
let lastAppliedMode = null;
// mode-color RAF 延後啟動：fade 期間凍結 --theme-bg/fg，避免 1) RAF 每幀 retarget 讓 transition 不走純 ease 曲線
//                                                          2) --theme-fg 在 luminance threshold 上下二元翻黑/白導致 [data-section-title] 等用 fg bg 的元件抖動
let colorRAFStartTimer = null;

/* ===== mode-color: random hue loop ===== */
let colorRAF = null;
let colorHue = Math.random() * 360;
let lastThemeDispatch = 0;
// 對比黑/白遲滯狀態：亮度卡 0.5 門檻的色域(橘 hue~35 / 青 hue~195)會讓 isLightBg 每幀在兩側抖
// → --theme-fg / --theme-invert-filter 等全站對比 var 狂翻黑白 = 文字 + placeholder logo 一起閃。
let _lastIsLightBg = null;
// 降速：gen wireframe Play 用 0.125，但 gen sketch 重實際 fps 跑不滿，視覺較慢；
// mode-color 每幀只 set 幾個 CSS var 跑滿 frame rate，需手動降增量才能跟 gen 視覺等速
const HUE_PER_FRAME = 0.04;

// HSB → RGB（對齊 generate-app wireframe color(hue, 80, 100) HSB 模式；mode-color-panel 共用）
export function hsbToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// WCAG relative luminance（gamma-corrected sRGB）—— 對齊 generate-app getRelativeLuminance
export function relativeLuminance(r, g, b) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function applyColorVars() {
  const { r, g, b } = hsbToRgb(colorHue, 80, 100);
  const lum = relativeLuminance(r, g, b);
  // 遲滯（dead zone 0.45~0.55）：lum>0.55 明確淺底、<0.45 明確深底、中間維持上次 → 門檻附近不抖、對比穩定
  if (lum > 0.55) _lastIsLightBg = true;
  else if (lum < 0.45) _lastIsLightBg = false;
  else if (_lastIsLightBg === null) _lastIsLightBg = lum > 0.5;
  const isLightBg = _lastIsLightBg; // WCAG threshold（同 wireframe getContrastColor）+ 遲滯
  const fgRgb = isLightBg ? '0, 0, 0' : '255, 255, 255';
  const fgInverseRgb = isLightBg ? '255, 255, 255' : '0, 0, 0';
  const fgHex = isLightBg ? '#000000' : '#ffffff';
  const fgInverseHex = isLightBg ? '#ffffff' : '#000000';

  const root = document.documentElement;
  root.style.setProperty('--theme-bg', `rgb(${r}, ${g}, ${b})`);
  root.style.setProperty('--theme-bg-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--theme-fg', fgHex);
  root.style.setProperty('--theme-fg-rgb', fgRgb);
  root.style.setProperty('--theme-fg-inverse', fgInverseHex);
  root.style.setProperty('--theme-fg-inverse-rgb', fgInverseRgb);
  root.style.setProperty('--theme-overlay-25', `rgba(${fgRgb}, 0.25)`);
  // list 斑馬 strip（mode3）：顏色固定白、只 alpha 依 hue 亮暗——亮 hue 白較不顯需更濃(0.4)、暗 hue(0.15)。
  // lists.css body.mode-color 用 var(--list-zebra-strip)。user 2026-06-22。
  // 2026-09-18 起直接算成「白疊 bg」的實色 rgb（同 alpha 合成數學、視覺不變）：半透明白會透出
  // 後方內容（atlas host/employ subchip 透星雲、create control-box），實色化杜絕。
  const stripA = isLightBg ? 0.4 : 0.15;
  const stripMix = (c) => Math.round(255 * stripA + c * (1 - stripA));
  root.style.setProperty('--list-zebra-strip', `rgb(${stripMix(r)}, ${stripMix(g)}, ${stripMix(b)})`);

  // 互補 hue（hue + 180°）：footer 用，跟 body bg 永遠互補
  // 對應的對比文字色獨立算（互補色亮度跟原色不同，可能在 luminance threshold 兩側）
  const compHue = (colorHue + 180) % 360;
  const { r: cr, g: cg, b: cb } = hsbToRgb(compHue, 80, 100);
  const cLum = relativeLuminance(cr, cg, cb);
  const cIsLightBg = cLum > 0.5;
  const cFgHex = cIsLightBg ? '#000000' : '#ffffff';
  const cFgInverseHex = cIsLightBg ? '#ffffff' : '#000000';
  root.style.setProperty('--theme-bg-contrast', `rgb(${cr}, ${cg}, ${cb})`);
  root.style.setProperty('--theme-bg-contrast-rgb', `${cr}, ${cg}, ${cb}`);
  root.style.setProperty('--theme-fg-contrast', cFgHex);
  // fg-contrast 的對比色（strict B/W）：footer 上的 chip 用 fg-contrast 當底時，文字用此維持純黑白對比
  root.style.setProperty('--theme-fg-inverse-contrast', cFgInverseHex);
  // Footer logo Lottie 是黑色版（SCCDLogoStandard.json）；亮 footer bg = 不翻、暗 footer bg = invert(1) 翻白
  root.style.setProperty('--footer-invert-filter', cIsLightBg ? 'none' : 'invert(1)');
  // .theme-invert（黑色靜態 SVG/PNG）對比翻色：page bg 亮時不 invert（保留黑），暗時 invert(1) 變白
  // 用 invert(0) 不用 none：invert(0) 同樣「不反轉」但是合法 filter 函式，可被 faculty placeholder hover 規則
  // 疊加成 `invert(0) invert(1)`（none 不能跟函式並列會讓整條 filter 無效）；視覺等同 none，既有 .theme-invert 不受影響。
  root.style.setProperty('--theme-invert-filter', isLightBg ? 'invert(0)' : 'invert(1)');
  // 中性灰浮層（card/chip 想在 vivid hue 上顯純灰不帶 hue tint）：對齊 mode1 #F0F0F0 / mode2 var(--gray-2)
  // 亮 hue → gray-9 (#E6E6E6 最淺灰)、暗 hue → gray-2 (#333333，跟 inverse 卡片底一致)
  root.style.setProperty('--theme-neutral-gray', isLightBg ? 'var(--gray-9)' : 'var(--gray-2)');
  // 反向中性灰：給「在 active list-content 等本地容器內」的元件用，本地容器 bg = theme-fg（亮頁=黑、暗頁=白），
  // ref/chip 在容器內要跟 theme-fg 同側才能襯托而非合體 → 亮 hue → gray-2 深灰、暗 hue → gray-9 淺灰
  root.style.setProperty('--theme-neutral-gray-inverse', isLightBg ? 'var(--gray-2)' : 'var(--gray-9)');

  // --lib-bg 兩階切換（mode3）：對齊 mode1/2 的固定灰值，依 page bg luminance 翻
  // 亮 page → #f2f2f2（同 mode1 standard）/ 暗 page → #333333（同 mode2 inverse）
  root.style.setProperty('--lib-bg', isLightBg ? '#f2f2f2' : '#333333');
  // --lib-zebra-alpha：library 斑馬 mode3 alpha。library 卡片 mode3 是兩階固定灰（非 cycling hue，見上 --lib-bg）→
  // 斑馬跟著灰底走、不套 activities 的 hue-aware 白 strip：亮 card(#f2f2f2) 黑疊 0.05（同 mode1）/ 暗 card(#333) 白疊 0.15（同 mode2）。
  // 配 CSS 的 rgba(var(--theme-fg-rgb), var(--lib-zebra-alpha))，theme-fg 已亮黑暗白 → 方向自動對。user 2026-06-23
  root.style.setProperty('--lib-zebra-alpha', isLightBg ? '0.05' : '0.15');
  // --lib-ref-bg：awards ref 展開列底色「比 --lib-bg 灰卡再深一階」，依 hue 亮暗跟著切
  // 亮 card(#f2f2f2) → gray-9(#E6E6E6)（同 standard）/ 暗 card(#333333) → gray-1(#1A1A1A)（同 inverse）；
  // ref 文字直接吃 var(--lib-fg)（=theme-fg，亮黑暗白）→ 不需另設 ref-fg var
  root.style.setProperty('--lib-ref-bg', isLightBg ? 'var(--gray-9)' : 'var(--gray-1)');

  // --lib-*-contrast：library 主卡 mode3 改「反色島」（卡片對比 page hue：亮 hue→深卡白字 / 暗 hue→淺卡黑字，
  // user 2026-06-27「淺 hue 灰卡要用深灰底邏輯才對」）。⚠️ atlas 也借用上面的 --lib-bg/--lib-fg 當中性灰 chip
  // （亮 hue 淺灰匹配 page）→ 不能全域翻，故另開 contrast 變數、只在 color.css 的 #library-card subtree remap。
  // 值＝上面 --lib-bg/--lib-zebra-alpha/--lib-ref-bg 的左右對調；卡內文字色直接用既有 --theme-fg-inverse。
  root.style.setProperty('--lib-bg-contrast', isLightBg ? '#333333' : '#f2f2f2');
  root.style.setProperty('--lib-zebra-alpha-contrast', isLightBg ? '0.15' : '0.05');
  root.style.setProperty('--lib-ref-bg-contrast', isLightBg ? 'var(--gray-1)' : 'var(--gray-9)');
  // 反色島上的黑色 PNG（awards ticker 桂冠 logo）要跟「卡底」對比，不是跟 page：卡深(亮 hue)→翻白、卡淺(暗 hue)→不翻。
  // = --theme-invert-filter 的相反（後者跟 page：暗 page 才翻）。
  root.style.setProperty('--lib-invert-contrast', isLightBg ? 'invert(1)' : 'invert(0)');

  // Header logo（wireframe）對比翻色：wireframe-standard base 黑色，亮 hue → filter:none(黑) / 暗 hue → invert(1)(白)。
  // 直接比對 style.filter（cheap read）避免維護 lastIsLightBg 狀態 + 處理 logo async load 的 race
  // ⚠️ slide-in / lightbox 開啟時「也一樣」走 hue 對比、不強制白（user 2026-06-24）：mode3 slide-in panel bg = theme-bg
  //    同 hue（手機 panel w-full 蓋住 logo、桌面 panel 在右），logo 要對比那個 hue。因 hue 不因 slide-in 改變 →
  //    開 slide-in 當下對比結果不變 → logo 不翻＝零跳動；mode3 也不換 wireframe-inverse JSON（換 JSON 會 Lottie reload 跳一下）。
  const logo = document.getElementById('header-logo');
  if (logo) {
    if (logo.dataset.logoType === 'wireframe') {
      // overlay（slide-in / 全螢幕 lightbox）開啟時 wireframe 一律翻白：桌面 logo 浮在 #faculty-overlay 黑底 dim
      // 上（panel 在右 79%、logo 落在左側黑 dim），恆需白 logo（user 2026-09-08：mode3 slide-in 也要白線框，對齊
      // overlay 一律白 wireframe 慣例；翻掉 06-24「slide-in 走 hue 對比」＝亮 hue 下黑線落在黑 dim 上看不見的 bug）。
      // 純 mode3（無 overlay）維持 hue 對比：亮 hue → 黑線 / 暗 hue → 白線。
      // 用 overlayLogoActive 旗標（非直接讀 class）：checkSlideInState 開啟設 true、slide-in 關閉延到 ~0.7s 設 false。
      // → 白 logo 撐到 overlay 快淡完才隨底變亮翻回 hue 對比（user 2026-09-08），配 CSS transition:filter 平滑。
      const desired = overlayLogoActive ? 'invert(1)' : (isLightBg ? 'none' : 'invert(1)');
      if (logo.style.filter !== desired) logo.style.filter = desired;
    } else if (logo.dataset.logoType === 'wireframe-inverse') {
      if (logo.style.filter !== 'none') logo.style.filter = 'none';
    }
  }

  // 手機 logo 對比追蹤（mode3：logo 一律 wireframe-standard + contrast='auto'，依 hue 翻黑/白；slide-in 時手機
  //   panel(w-full) bg=theme-bg 蓋住 logo → 同樣對比該 hue，不強制白）。
  const mlogo = document.getElementById('header-logo-mobile');
  if (mlogo && mlogo.dataset.logoContrast === 'auto') {
    const desiredM = isLightBg ? 'none' : 'invert(1)';
    if (mlogo.style.filter !== desiredM) mlogo.style.filter = desiredM;
  }

  const now = performance.now();
  if (now - lastThemeDispatch > 200) {
    lastThemeDispatch = now;
    window.dispatchEvent(new CustomEvent('theme:changed', {
      detail: { mode: 'color', bg: `rgb(${r}, ${g}, ${b})`, fg: fgHex, hue: colorHue },
    }));
  }
}

function colorTick() {
  colorHue = (colorHue + HUE_PER_FRAME) % 360;
  applyColorVars();
  colorRAF = requestAnimationFrame(colorTick);
}

function startColorLoop() {
  if (colorRAF || colorRAFStartTimer) return; // 已在跑或即將啟動（idempotent）
  applyColorVars(); // 先 sync set 一次：fade 期間 hue 凍結，避免 RAF retarget 干擾 ease 曲線
  // 延後 MODE_FADE_MS 才啟動 RAF：等 .mode-switching transition 跑完純 ease 曲線後再開始 hue 旋轉
  colorRAFStartTimer = setTimeout(() => {
    colorRAFStartTimer = null;
    if (colorRAF) return; // 已被啟動或又被取消
    colorRAF = requestAnimationFrame(colorTick);
  }, MODE_FADE_MS);
}

function cancelColorLoopRAF() {
  if (colorRAF) {
    cancelAnimationFrame(colorRAF);
    colorRAF = null;
  }
  if (colorRAFStartTimer) {
    clearTimeout(colorRAFStartTimer);
    colorRAFStartTimer = null;
  }
}

/**
 * 完整 stop：RAF 取消 + 清 inline CSS vars，讓 :root / body.mode-* 的 default CSS 規則重新生效。
 * 給 applyMode('standard'/'inverse') 用——使用者切離 mode-color 時要 reset 視覺。
 */
function stopColorLoop() {
  cancelColorLoopRAF();
  const root = document.documentElement;
  // applyColorVars 設過的所有 inline CSS vars 一次清掉，讓 :root / body.mode-* default 規則重新生效
  [
    '--theme-bg', '--theme-bg-rgb', '--theme-fg', '--theme-fg-rgb',
    '--theme-fg-inverse', '--theme-fg-inverse-rgb', '--theme-overlay-25',
    '--theme-invert-filter', '--theme-neutral-gray', '--theme-neutral-gray-inverse',
    '--lib-bg', '--lib-zebra-alpha', '--lib-ref-bg',
    '--lib-bg-contrast', '--lib-zebra-alpha-contrast', '--lib-ref-bg-contrast', '--lib-invert-contrast',
    '--theme-bg-contrast', '--theme-bg-contrast-rgb', '--theme-fg-contrast', '--theme-fg-inverse-contrast',
    '--footer-invert-filter', '--list-zebra-strip',
  ].forEach(p => root.style.removeProperty(p));
  // wireframe logo 的 invert filter 不在這清：新 logo 換上那刻才換（switchHeaderLogo），換檔期間舊線框照原色轉
}

/**
 * Pause-only：取消 RAF 但保留 CSS vars 在當前值，hue 凍結。
 * 給 generate-app Pause btn 用——user 仍在 mode-color，期望畫面停在當前色不是回 default。
 * 若清掉 vars，body bg 失去 --theme-bg fallback 變白／預設色，跟 #create-app 不同色。
 */
function pauseColorLoop() {
  cancelColorLoopRAF();
}

function getCurrentPage() {
  const path = window.location.pathname;
  return path.split('/').pop().replace('.html', '') || 'index';
}

let isSlideInOpen = false;
// 手機 slide-in 開場 logo 延後切換 timer（見下方說明）
let mobileSlideInLogoTimer = null;
// overlay logo「該不該套白線框」的唯一旗標（取代直接讀 class）：mode3 filter 由 applyColorVars 依此翻，
// 且 slide-in 關閉要延到 ~0.7s 才還原——class 的兩個時間點（lightbox-open t=0 消、has-slide-in t=0.8 消）都不合用。
let overlayLogoActive = false;
let overlayRestoreTimer = null;
// 手機 slide-in 開場：panel 在 t=0.3 開始滑入、歷時 DUR.medium（power3.out）。延到 panel 蓋住「左上 logo
// 左緣」才切手機 logo wireframe，否則 panel 還沒蓋到時 logo 在 dim 暗 overlay 上先變 wireframe 很怪（user 2026-06-10）。
// 實測（faculty/courses 同 timeline）：power3.out 前段快，panel.left 在 ~570ms（≈ 0.3 + DUR.medium×0.55，slide 約 55%）
// 就降到 logo 左緣(24px) 以下＝已蓋住。用此值不用 nominal 末端 0.8s（user 2026-06-10「再快點」），仍不露暗底線條 logo。
// 2026-09-10 user「可以快一點」：crossfade 先 fade-out（DUR.micro/2）＋Lottie 重載後 wireframe 才真正現身，
// fire 提前這段 lead——新 logo 實際出現時間點不變早於「panel 已蓋住」，只是少等一拍。
const MOBILE_SLIDEIN_LOGO_DELAY_MS = Math.round((0.3 + DUR.medium * 0.55 - DUR.micro / 2) * 1000);
// slide-in 關閉：面板滑出(0~0.5s)+overlay 淡出(0.5~0.8s)。logo 延到 ~0.7s（overlay 快淡完、底變亮）才 crossfade
// 回原本 logo，隨 overlay 變亮浮現（user 2026-09-08：白 logo 不停到最後才換、又不會黑 logo 硬疊在還暗的 overlay 上）。可調。
const SLIDEIN_LOGO_RESTORE_MS = 550;

function checkSlideInState() {
  // 主訊號＝body.lightbox-open（overlay 是否覆蓋；enterLightboxMode 設、exitLightboxMode t=0 立即移除）。
  //   - 開啟 → 立刻切白 wireframe logo。
  //   - slide-in 關閉（有 html.has-slide-in 面板）：面板滑出+overlay 淡出約 0.8s；logo 延到 ~0.7s
  //     （SLIDEIN_LOGO_RESTORE_MS，overlay 快淡完、底變亮）才 crossfade 回原本，隨 overlay 變亮浮現（user 2026-09-08）。
  //   - full lightbox 關閉（無 panel、overlay 直接淡出）：立即還原。
  // ⚠️ 白線框「該不該套」不再直接讀 class，改由 overlayLogoActive 旗標控制（mode3 filter 由 applyColorVars 依它翻、
  //    且關閉要延到 0.7s；class 的 t=0/t=0.8 兩個時間點都不合用）。翻掉 06-10「一退場就還原」與 09-08「等全消瞬間換」。
  const overlayNow = document.body.classList.contains('lightbox-open');
  if (isSlideInOpen === overlayNow) return;
  isSlideInOpen = overlayNow;

  const isSlideInPanel = document.documentElement.classList.contains('has-slide-in');
  clearTimeout(overlayRestoreTimer);

  if (overlayNow) {
    overlayLogoActive = true;
    applyOverlayLogo(true, isSlideInPanel, /*fade*/true);
  } else if (isSlideInPanel) {
    // slide-in 關閉：延到 ~0.7s 才 crossfade 還原（隨 overlay 變亮浮現）
    overlayRestoreTimer = setTimeout(() => {
      if (isSlideInOpen) return;   // 延遲窗口內又開了新 overlay → 放棄還原
      overlayLogoActive = false;
      applyOverlayLogo(false, true, /*fade*/true);
    }, SLIDEIN_LOGO_RESTORE_MS);
  } else {
    // full lightbox 關閉：立即還原（無 panel、overlay 已在淡出；黑底 instant 不突兀）
    overlayLogoActive = false;
    applyOverlayLogo(false, false, /*fade*/false);
  }
}

// 套用 overlay logo 狀態（開啟/還原共用）。open＝overlay 覆蓋中；isSlideInPanel 供手機延遲；fade＝桌面 logo 換檔是否 crossfade。
// overlay 開啟：mode3 恆 wireframe（白由 applyColorVars 依 overlayLogoActive 強制 invert）；mode1/2 換白 wireframe-inverse。
// 還原：依 mode 回 color=wireframe / inverse=inverse / standard=standard。
function applyOverlayLogo(open, isSlideInPanel, fade) {
  const mode = getStoredMode();
  let logoType;
  if (mode === 'color') logoType = 'wireframe';
  else if (open) logoType = 'wireframe-inverse';
  else if (mode === 'inverse') logoType = 'inverse';
  else logoType = 'standard';

  const _page = getCurrentPage();   // /create 是 typewriter logo，不切 Lottie（同 applyMode guard）
  if (_page === 'create' || _page === 'generate' || !document.getElementById('header-logo')) return;

  // mode3 同 type → switchHeaderLogo skip（filter 走下面 applyColorVars + CSS transition:filter 平滑）；
  // mode1/2 換檔＝實心↔線框不同 JSON，fade 時走 opacity crossfade（filter 補不了形狀變）。
  switchHeaderLogo(logoType, { fade });
  // ⚠️ mode3 桌面 logo 白/黑 filter 只在 colorTick RAF 由 applyColorVars 翻；色輪暫停(pauseColorLoop)時迴圈停 →
  //   這裡（observer/timer 驅動）補呼一次同步 filter（讀 overlayLogoActive）（user 2026-09-08 色輪暫停 bug）。
  if (mode === 'color') applyColorVars();

  // 手機 logo（mode1/2 才 reload；mode3 手機恆 wireframe-standard + contrast='auto'、開關不 reload，白由 applyColorVars pin）
  if (mode !== 'color' && typeof window.__sccdReloadMobileLogo === 'function') {
    clearTimeout(mobileSlideInLogoTimer);
    if (open && isSlideInPanel && window.innerWidth < 768) {
      // 手機 slide-in 開啟：延到 panel 蓋滿 logo 區才切（見 MOBILE_SLIDEIN_LOGO_DELAY_MS）；fire 時再確認仍 slide-in
      mobileSlideInLogoTimer = setTimeout(() => {
        if (document.documentElement.classList.contains('has-slide-in')) window.__sccdReloadMobileLogo({ fade });
      }, MOBILE_SLIDEIN_LOGO_DELAY_MS);
    } else {
      window.__sccdReloadMobileLogo({ fade });   // full lightbox 開／任何關閉 → 不延遲（crossfade 比照桌面）
    }
  }
}

// 首頁 hover WATCH 的 spotlight overlay：logo 比照 full lightbox 開關（開＝白線框 crossfade、關＝立即還原；user 2026-10-02）。
// 真 overlay 開著由 checkSlideInState 接管。logoType 同 applyOverlayLogo，但不重載手機 logo（桌面 hover 才觸發）。
/** @param {boolean} open */
export function setSpotlightLogo(open) {
  if (isSlideInOpen || overlayLogoActive === open) return;
  overlayLogoActive = open;
  const mode = getStoredMode();
  switchHeaderLogo(mode === 'color' ? 'wireframe' : open ? 'wireframe-inverse' : mode === 'inverse' ? 'inverse' : 'standard', { fade: open });
  if (mode === 'color') applyColorVars();
}

export function initThemeToggle() {
  applyModeForPage(getCurrentPage());

  // 自動監聽 Slide-in / Lightbox 的開關狀態來切換 Logo
  // html.has-slide-in (faculty/courses slide-in) + body.lightbox-open (activities/library lightbox)
  const observer = new MutationObserver(checkSlideInState);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // header 是非同步注入；ready 後綁 click 一次（後續 SPA 切頁不需重綁，listener 內部自己 check 頁面）
  document.addEventListener('header:ready', () => {
    bindToggleBtns();
    updateToggleBtnVisualState(getCurrentPage());
  });

  if (document.querySelector('.theme-toggle-btn')) {
    bindToggleBtns();
    updateToggleBtnVisualState(getCurrentPage());
  }
}

function bindToggleBtns() {
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.theme-toggle-btn')).forEach(btn => {
    if (btn.dataset.themeBound) return; // 防重複綁定
    btn.dataset.themeBound = '1';
    btn.addEventListener('click', () => {
      // atlas 渲染/intro 完成前 gate（main-modular 掛、atlas.js 解）：pointer-events CSS 擋滑鼠，
      // 這裡再擋鍵盤 Enter / 程式 click() 等繞過 pointer-events 的觸發
      if (document.body.classList.contains('atlas-mode-gate')) return;
      const current = sessionStorage.getItem(STORAGE_KEY) || 'standard';
      const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
      setSiteMode(next);
    });
  });
}

/** 由 main-modular.js initPageModules 在每次 SPA 切頁時呼叫 */
export function applyModeForPage(_page) {
  const savedMode = sessionStorage.getItem(STORAGE_KEY) || 'standard';
  applyMode(savedMode);
}

/** 由 main-modular.js initPageModules 在每次 SPA 切頁時呼叫
 *  /create 頁停用 header mode-btn（mode 改由頁內 colormode-button 控制）；其他頁恢復可點 */
let _lastUpdateTogglePage = null;
export function updateToggleBtnVisualState(page) {
  // 直接訪問 URL 是 'create'，SPA 內 routed page 名是 'generate'，兩個都要 catch
  const isGenerate = page === 'generate' || page === 'create';
  const wasGenerate = _lastUpdateTogglePage === 'generate' || _lastUpdateTogglePage === 'create';
  document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
    const el = /** @type {HTMLButtonElement} */ (btn);
    if (isGenerate) {
      el.disabled = true;
      el.style.pointerEvents = 'none';
      el.setAttribute('title', 'Mode 由下方 control bar 控制');
    } else {
      el.disabled = false;
      el.style.pointerEvents = '';
      el.removeAttribute('title');
    }
  });
  // Header desktop mode-btn clip-reveal 進退場：
  //   - 進 /create：hide（width 0 + clip 100%）→ 其他 bars 自然往右 shift 填補
  //   - 離 /create：show（width 24 + clip 0%）→ 其他 bars 往左 shift 回原位
  //   show 必須在新頁面 init 階段 fire（不是放 /create page-exit timeline 並行）— 否則 user 視線在
  //   /create 主內容退場時 show 動畫已跑完，新頁面渲染後看起來像「flash」一閃就出現沒過程
  if (isGenerate && !wasGenerate) {
    import('../../header.js').then(({ animateHeaderModeBtnHide }) => animateHeaderModeBtnHide());
  } else if (!isGenerate && wasGenerate) {
    // 若 playCreateExitAnimation 已並行跑 show 動畫（user 2026-05-31 對稱反向需求），
    // 這裡跳過避免重播；flag 由 create-app exit timeline set，用完即清
    if (window.__sccdModeBtnShowInExit) {
      window.__sccdModeBtnShowInExit = false;
    } else {
      import('../../header.js').then(({ animateHeaderModeBtnShow }) => animateHeaderModeBtnShow());
    }
  }
  _lastUpdateTogglePage = page;
}

/**
 * 給 generate-app classic scripts 用（透過 create-app.js bridge 到 window.sccdSetMode）：
 * 寫 sessionStorage + applyMode，等效於 user 點 header mode-btn 的 click handler 內容
 * @param {string} mode
 * @param {Object} [opts]
 * @param {boolean} [opts.autoStartColorLoop] 切到 'color' 時是否自動啟動 colorTick RAF；/create 內 colormode btn 預設 false（user 須手動點 Play），其他全域切換預設 true
 */
export function setSiteMode(mode, opts) {
  if (!MODES.includes(mode)) return;
  sessionStorage.setItem(STORAGE_KEY, mode);
  applyMode(mode, opts);
}

/** generate-app Play btn 啟動 site colorTick RAF（內部 idempotent） */
export function startSiteColorLoop() { startColorLoop(); }
/** generate-app Pause btn 停 site colorTick RAF（hue 凍結在當前值；保留 CSS vars 不切回 default） */
export function stopSiteColorLoop() { pauseColorLoop(); }
/** generate-app / mode-color-panel 判斷 Play 是否正在跑（更新 Play/Pause icon）。
 *  含「排程中」：startColorLoop 會先掛 400ms timer 才起 RAF，點 Play 當下只看 colorRAF 會誤報 false → icon 卡在 play。 */
export function isColorLoopRunning() { return colorRAF !== null || colorRAFStartTimer !== null; }

/**
 * user 拖 color wheel 時把選中的 hue 寫回 site
 * 否則 sketch.js draw() 每幀讀 site colorHue 會立刻把 drag 設的值覆蓋（drag 看起來無效）
 * Play 中：site colorTick 從新 hue 繼續轉；Pause 中：hue 停在新值
 * @param {number} hue
 */
export function setColorHue(hue) {
  const h = ((hue % 360) + 360) % 360;
  colorHue = h;
  // 若目前正處於 mode-color（colorRAF 跑或剛 stop），立刻 apply 一次 CSS var 讓 header / page bg 同步
  if (document.body.classList.contains('mode-color')) {
    applyColorVars();
  }
}

/**
 * @param {string} mode
 * @param {Object} [opts]
 * @param {boolean} [opts.autoStartColorLoop=true] 預設 true；/create 內 colormode btn 切到 color 傳 false
 */
function applyMode(mode, opts) {
  const autoStartColorLoop = !(opts && opts.autoStartColorLoop === false);
  const isFirstApply = !hasAppliedModeOnce;
  hasAppliedModeOnce = true;

  // SPA 切頁同 mode 重 apply：body class 不會變，body bg 不會變，不用動 transition
  // 用 lastAppliedMode 而非讀 body class：/create 會 remove body.mode-* (pause)，body class=null 會誤判換 mode
  const isSameMode = lastAppliedMode === mode;
  lastAppliedMode = mode;

  // 非首次 + 真的會切換 mode 才過渡（首次 apply 跳過：避免從 default 白底 → 目標 mode 的閃爍）；
  // reduced-motion＝瞬間切換（原本仍 fade 0.4s，2026-10-01 順修）
  const animate = !isFirstApply && !isSameMode && !prefersReducedMotion();
  // View Transition（user 2026-10-01 plan B）：整頁新舊快照在合成器交叉淡入，只做一次樣式重算——取代逐元素 CSS
  //   transition（library/about/activities 實測每幀樣式重算 50–100ms＝0.4s 只剩幾格、header 帶與大背景脫節）
  if (animate && canModeViewTransition()) {
    runModeViewTransition(() => commitMode(mode, autoStartColorLoop));
    return;
  }
  if (animate) {
    document.body.classList.add('mode-switching');
    document.documentElement.classList.add('mode-switching');

    // 動態注入防抖動 CSS，只在 mode-switching 期間對旋轉元素開啟硬體加速，避免永久 will-change 破壞 z-index
    // ⚠️ 勿加入 .atlas-name：那是 ~223 個被 float 迴圈逐幀 transform 的 map chip，mode 切換時一次全推上 GPU layer
    //    （will-change+preserve-3d+box-shadow）會造成切換卡頓（2026-06-23 移除）。atlas chip 不需防抖。
    if (!antiJitterStyle) {
      antiJitterStyle = document.createElement('style');
      antiJitterStyle.textContent = `
        html.mode-switching.mode-switching .courses-grid-card,
        html.mode-switching.mode-switching .atlas-alumni-career,
        html.mode-switching.mode-switching .atlas-list-col-career,
        html.mode-switching.mode-switching .anchor-nav-inner,
        html.mode-switching.mode-switching .class-group-label,
        html.mode-switching.mode-switching .class-division-btn,
        html.mode-switching.mode-switching .courses-bfa-label,
        html.mode-switching.mode-switching .faculty-card-image-wrapper,
        html.mode-switching.mode-switching .hero-title-wrapper,
        html.mode-switching.mode-switching .hero-title-cn-wrapper,
        html.mode-switching.mode-switching .hero-text-en-wrapper,
        html.mode-switching.mode-switching .hero-text-cn-wrapper,
        html.mode-switching.mode-switching .hero-banner,
        html.mode-switching.mode-switching .color-rect-title,
        html.mode-switching.mode-switching .timeline-card-inner,
        html.mode-switching.mode-switching .lib-panel-title,
        html.mode-switching.mode-switching .album-thumb,
        html.mode-switching.mode-switching .class-img,
        html.mode-switching.mode-switching #prev-card,
        html.mode-switching.mode-switching #next-card,
        html.mode-switching.mode-switching #prev-labels h4,
        html.mode-switching.mode-switching #prev-labels h2,
        html.mode-switching.mode-switching #next-labels h4,
        html.mode-switching.mode-switching #next-labels h2,
        html.mode-switching.mode-switching #homepage-marquee-wrap,
        html.mode-switching.mode-switching #homepage-yt-card,
        html.mode-switching.mode-switching [data-hero-hl],
        html.mode-switching.mode-switching [data-section-title],
        html.mode-switching.mode-switching .section-title-strip,
        html.mode-switching.mode-switching img,
        html.mode-switching.mode-switching canvas {
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          -webkit-font-smoothing: subpixel-antialiased !important;
          transform-style: preserve-3d !important;
          -webkit-transform-style: preserve-3d !important;
          outline: 1px solid transparent !important;
          box-shadow: 0 0 1px rgba(0,0,0,0) !important;
          will-change: transform !important;
        }
      `;
      document.head.appendChild(antiJitterStyle);
    }

    if (modeSwitchTimer) clearTimeout(modeSwitchTimer);
    modeSwitchTimer = setTimeout(() => {
      document.body.classList.remove('mode-switching');
      document.documentElement.classList.remove('mode-switching');
      modeSwitchTimer = null;
    }, MODE_FADE_MS);
  }

  commitMode(mode, autoStartColorLoop);
}

/** 換 mode 的實際 DOM 更新（class／icon／color loop／theme:changed／header logo）。
 *  View Transition 路徑在 update callback 內呼叫＝新快照含這些變更。
 *  @param {string} mode @param {boolean} autoStartColorLoop */
function commitMode(mode, autoStartColorLoop) {
  document.body.classList.remove('mode-standard', 'mode-inverse', 'mode-color');
  document.documentElement.classList.remove('mode-standard', 'mode-inverse', 'mode-color');
  document.body.classList.add(`mode-${mode}`);
  document.documentElement.classList.add(`mode-${mode}`);

  // Header mode btn icon: 跟 mode 切換同步換 mode_1/2/3 SVG（.icon mask 系統，currentColor 跟 .theme-toggle-btn 走）
  const MODE_TO_ICON_CLASS = { standard: 'icon-mode-1', inverse: 'icon-mode-2', color: 'icon-mode-3' };
  document.querySelectorAll('[data-header-mode-icon]').forEach(el => {
    el.className = `icon ${MODE_TO_ICON_CLASS[mode] || 'icon-mode-1'}`;
  });

  if (mode === 'color') {
    // autoStartColorLoop=false：/create 內 colormode btn 切到 color 時不自動啟動 RAF（user 須手動點 Play）。
    // 已在跑的 loop 不會被這裡 stop——/create 內切到 color 前若 loop 早就在跑（從外面進來時 applyModeForPage 啟動），
    // 維持 running 狀態（user paused 過會自己 stop）
    if (autoStartColorLoop) {
      startColorLoop(); // 內部 idempotent；SPA 切頁重呼 applyMode 不會多開
    } else {
      // 不啟動 RAF 但仍 sync 一次 CSS vars，否則 --theme-bg 為空 → header 失去 mode-color 色相回 default 白
      // /create page bg 由 sketch.js 用同一 colorHue 算 wireframeColor → header / page 自動同色
      applyColorVars();
    }
  } else {
    stopColorLoop();
  }

  // 通知需即時反應的元件（如 canvas 繪製）theme 已變動
  window.dispatchEvent(new CustomEvent('theme:changed', { detail: { mode } }));

  // /create 頁有自己的 typewriter logo（由 header.js triggerGenerateLogo 注入），不要套 Lottie 蓋掉
  // 注意：getCurrentPage() 從 URL pathname 推出 'create'（不是 router 用的 logical 名稱 'generate'）
  // 兩種都 guard 以防後續任何路徑改名
  const _page = getCurrentPage();
  if (_page === 'create' || _page === 'generate') return;

  // overlay 開啟時 logo 變體（與 checkSlideInState 同一套，改一處要兩處同步）：slide-in / full-black lightbox
  //   一律白線框——mode1/2 wireframe-inverse、mode3 wireframe（白由 applyColorVars 強制）。關閉 → 依 mode 還原。
  let logoType;
  if (mode === 'color') logoType = 'wireframe';
  else if (isSlideInOpen) logoType = 'wireframe-inverse';
  else if (mode === 'inverse') logoType = 'inverse';
  else logoType = 'standard';

  if (document.getElementById('header-logo')) {
    switchHeaderLogo(logoType);
  } else {
    document.addEventListener('header:ready', () => switchHeaderLogo(logoType), { once: true });
  }
}

// ── mode 切換 View Transition（user 2026-10-01 plan B；樣式在 typography.css「mode 切換 View Transition」段）──
// atlas：09-28 實測 VT 無收益；/create：p5 畫布自管 mode。不支援的瀏覽器退回舊的 .mode-switching CSS fade。
// 10-03 再測：atlas 星雲做即時層（照動）會卡，user 實機比較後定案維持舊 fade（兩套分開維護）。
function canModeViewTransition() {
  if (typeof document.startViewTransition !== 'function') return false;
  const page = getCurrentPage();
  return page !== 'atlas' && page !== 'create' && page !== 'generate';
}

// 具名 group 各自擷取、畫在整頁快照之上（依原元素繪製順序排）：
// - header logo、鉛筆（#mode-color-panel）全站命名，只顯示即時新畫面（typography.css）＝過渡中 logo 照轉、
//   換檔不消失（舊 logo 一直轉到新的載好，見 switchHeaderLogo），鉛筆照常滑進滑出（user 2026-10-01）
// - library 三原色卡切 mode 要 snap（user 2026-08-11）＝卡單獨成 group 不淡 → 平常疊在色卡上面的灰卡、next 鈕、header、
//   左下當前頁卡、開著的 menu 也都要命名，否則被色卡 group 蓋掉。⚠️別命名 #site-header：0 高的 static 殼，
//   擷取不含裡面的 fixed header／sticky 頁卡（10-01 實測過渡中整個消失）→ 逐一命名實際元素
// - 會動的層（vt-live-N＋view-transition-class: vt-live）：整層抽出整頁快照、只顯示即時畫面＝過渡中照動、不凍也不殘影
//   （user 2026-10-03）。層內變色沒有快照可淡 → 靠層內自己的 CSS transition（typography.css，selector 清單要跟這裡同步）。
//   ⭐只收「一直在動」的東西、範圍收到最小（user 同日）：不動的沒有殘影問題，留在快照裡照常交叉淡入才跟大背景完全同步
//   ——所以 news banner 只抽字在捲的裁切窗（.hm-banner-viewport），bar／數字方塊留快照；ticker 只抽透明的 wrapper，
//   外層底色（＝灰卡色）留在灰卡快照。命名「裁切容器」而非裡面在動的元素：具名元素不吃祖先 overflow 裁切、只保得住自己的
const MODE_VT_LIVE_LAYERS = '#floating-layer, .hm-banner-viewport, .lib-title-box, #library-awards-ticker .awards-ticker-wrapper';
/** @returns {HTMLElement[]} 已命名元素（VT 結束後清） */
function nameModeVtElements() {
  /** @type {HTMLElement[]} */
  const named = [];
  const name = (/** @type {HTMLElement|null} */ el, /** @type {string} */ n) => {
    if (!el) return;
    el.style.viewTransitionName = n;
    named.push(el);
  };
  name(document.getElementById('header-logo'), 'header-logo');
  name(document.getElementById('mode-color-panel'), 'mcp');   // 此刻可能還 display:none、新畫面才出現（2→3）＝照樣命名
  // mode 鈕 icon 換圖不淡、直接切（user 2026-10-02）；桌面／手機各一顆，名稱不可重複
  document.querySelectorAll('[data-header-mode-icon]').forEach((el, i) => name(/** @type {HTMLElement} */ (el), `mode-icon-${i}`));
  // 只命名看得到的（隱藏 panel 的標題盒不必）；名稱各自唯一、樣式靠共用的 view-transition-class 套
  let live = 0;
  document.querySelectorAll(MODE_VT_LIVE_LAYERS).forEach(el => {
    if (!el.getClientRects().length) return;
    name(/** @type {HTMLElement} */ (el), `vt-live-${++live}`);
    /** @type {HTMLElement} */ (el).style.setProperty('view-transition-class', 'vt-live');
  });
  // 首頁 news banner 本體（bar／數字方塊，不動）照常交叉淡入，命名只因為疊在漂浮卡層上面
  name(document.getElementById('homepage-marquee-stack'), 'home-news');
  // 首頁 WATCH 卡整顆自己漂（rAF）：具名 group 跟著即時位置走＝新舊圖同位不殘影，照常交叉淡入；也因為疊在漂浮卡層上面
  name(document.getElementById('homepage-yt-card'), 'home-yt');
  const stack = document.getElementById('library-card-stack');
  if (stack) {
    let i = 0;
    [document.getElementById('library-card-main'), ...stack.children].forEach(c => {
      if (!(c instanceof HTMLElement)) return;
      name(c, c.style.cssText.includes('--lib-bg') ? 'lib-gray' : `lib-snap-${++i}`);   // --lib-bg＝當前灰卡（setAsGray 標記）
    });
    name(document.querySelector('.lib-card-next-btn'), 'lib-next');
  }
  if (!stack && !live) return named;
  // 以下＝平常疊在色卡／會動的層上面的東西
  name(document.querySelector('#site-header > header'), 'site-header');
  name(document.getElementById('page-indicator'), 'page-indicator');
  name(document.getElementById('custom-scrollbar-thumb'), 'scroll-thumb');
  if (document.documentElement.classList.contains('mobile-menu-open')) name(document.getElementById('mobile-nav-panel'), 'site-menu');
  return named;
}

/** @type {any} */
let modeVT = null;
// mode 切換中新 logo 換上的時機＝大背景亮暗過中點（交叉淡入 ease 曲線約 30% 時間走到一半）：太早換＝新 logo 疊在
// 還沒變的底色上（白 logo 壓白底＝看起來閃一下不見），太晚反之。switchHeaderLogo 載好後等它
/** @type {Promise<void> | null} */
let logoSwapGate = null;
// VT 期間凍住的 GSAP（舊快照是靜態圖、新畫面即時 → 過渡中還在動＝殘影，user 2026-10-03）。連點時新 VT 接手整包，
// 最後一個 finished 才 resume。只凍「正在跑／排程中」的；本來就 paused 的（ScrollTrigger scrub、等 .play() 的）不碰，
// update 內才建的 tween（鉛筆滑入等）照跑。CSS animation 由 html.mode-vt 凍（typography.css）、rAF 迴圈各自看 class。
// 目標在「會動的層」（vt-live-N，只顯示即時畫面）裡的不凍：漂浮卡 3D 擺動、awards ticker 照跑
/** @type {any[]} */
let vtFrozen = [];
/** @param {() => void} update */
function runModeViewTransition(update) {
  const root = document.documentElement;
  const named = nameModeVtElements();
  root.classList.add('mode-vt');   // 期間殺全部 CSS transition＝新快照直接是終態（typography.css）
  if (typeof gsap !== 'undefined') {
    const liveLayers = named.filter(el => el.style.viewTransitionName.startsWith('vt-live'));
    const inLiveLayer = (/** @type {any} */ a) => (a.targets ? a.targets() : a.getChildren(true, true, false).flatMap((/** @type {any} */ t) => t.targets()))
      .some((/** @type {any} */ t) => t instanceof Element && liveLayers.some(l => l.contains(t)));
    const running = gsap.globalTimeline.getChildren(false, true, true).filter(a => !a.paused() && !inLiveLayer(a));
    running.forEach(a => a.pause());
    vtFrozen.push(...running);
  }
  const vt = document.startViewTransition(update);
  modeVT = vt;
  const gate = logoSwapGate = vt.ready.then(() => new Promise(r => setTimeout(r, MODE_FADE_MS * 0.3)), () => {});
  // VT 期間真人點擊的 target 一律是 <html>（Chrome 行為，09-28 實測）＝連點 mode 鈕循環會被吞 →
  //   點擊座標落在 mode 鈕上就轉交（新的 VT 會自動中止舊的）
  /** @param {MouseEvent} e */
  const forwardModeClick = (e) => {
    if (e.target !== root) return;
    const btn = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.theme-toggle-btn')]).find(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (btn) btn.click();
  };
  document.addEventListener('click', forwardModeClick, true);
  vt.finished.finally(() => {
    document.removeEventListener('click', forwardModeClick, true);
    if (logoSwapGate === gate) logoSwapGate = null;
    if (modeVT !== vt) return;   // 已被新的 VT 接手，收尾交給它
    modeVT = null;
    root.classList.remove('mode-vt');
    named.forEach(el => { el.style.viewTransitionName = ''; el.style.removeProperty('view-transition-class'); });
    vtFrozen.forEach(a => a.resume());
    vtFrozen = [];
  });
}

/** Header logo 進場 reveal：hero clip-reveal（<a> 當遮罩 overflow:hidden、logo 本體 yPercent 100→0 滑入）+ 清 opacity。
 *  /create exit anim 把 logo.style.opacity:0；下一頁需要顯示時跑這個。
 *  抽出 helper 因為「需要 reveal」的判斷點有兩處（doSwap 後 + skip path 後）。
 *  2026-07-15 由 clip-path 左→右 wipe 改 hero 式滑入（user：logo 進退場統一 clip reveal）；
 *  遮罩只在動畫期間裁切（Lottie 齒輪 paint 超出 180 box，常駐 hidden 會裁掉外圈）。 */
function runHeaderLogoReveal(logo) {
  if (typeof gsap === 'undefined') {
    logo.style.opacity = '1';
    return;
  }
  logo.style.opacity = '1';
  const mask = /** @type {HTMLElement|null} */ (logo.closest('a'));
  if (mask) mask.style.overflow = 'hidden';
  gsap.fromTo(logo,
    { yPercent: 100 },
    {
      yPercent: 0,
      duration: DUR.reveal,
      ease: EASE.enter,
      clearProps: 'transform',
      onComplete: () => { if (mask) mask.style.overflow = ''; },
    }
  );
}

// 每次 switchHeaderLogo 遞增；DOMLoaded callback 比對 generation，過期的 stale load 直接丟掉
// 防 race：lightbox 快速開→關時 switchHeaderLogo('inverse') 跟 ('standard') 連續觸發，
// 舊 'inverse' Lottie 的 JSON fetch 若慢於 'standard' 完成，DOMLoaded 後到的 SVG 會覆蓋掉新 'standard' SVG。
let logoLoadGeneration = 0;
// fade 換檔已開始淡出、還沒換上（淡出中／載入中）
let logoFading = false;

export function switchHeaderLogo(type, { fade = false } = {}) {
  const logo = document.getElementById('header-logo');
  if (!logo || typeof lottie === 'undefined') return;

  // 呼叫當下就遞增（不等 doSwap）：fade 淡出期間又被呼叫時，淡出 onComplete 那次 doSwap 才認得出自己過期。
  // 案：首頁快速掃過 WATCH——進場淡出 0.1s 內就離開，還原呼叫同 type 走 skip，淡出完照樣換上白線框而卡住
  const myGeneration = ++logoLoadGeneration;
  // 打斷上一次 fade：opacity 停在 crossfade 殘值（不是 /create 退場的 0、不走 reveal），畫面上仍是舊 logo → 淡回來
  const interrupted = logoFading;
  logoFading = false;
  if (interrupted) gsap.to(logo, { opacity: 1, duration: DUR.micro / 2, ease: EASE.enterSoft, overwrite: 'auto' });

  // 不管 doSwap 走哪條路，都先記下「是否需要 reveal」— 從 /create 退場時 exit anim 把 logo.opacity 設為 0
  // ⚠️ Recovery 機制：若 user 在 /create typewriter 沒跑完就切頁，Lottie 還留在 logo 內 + dataset.logoType
  //    沒被 typewriter 改 → 下面 skip 條件成立 → 不跑 DOMLoaded → opacity:0 永遠卡住 → 下一頁 logo 不見
  //    所以無論走 skip 還是 doSwap，需要 reveal 時都要主動跑 helper
  const prevOpacity = parseFloat(logo.style.opacity);
  const needsReveal = !interrupted && !isNaN(prevOpacity) && prevOpacity < 0.5;

  // 已是相同 type 的 Lottie 在運行 → skip 大件事，但 opacity:0 仍要救。
  // logoType＝畫面上那支（雙緩衝換上才改，見 doSwap）→ 載入中又切回它＝作廢載入中的那支（上面 generation 已遞增）
  if (logo.dataset.logoType === type && logo.querySelector('svg')) {
    if (needsReveal) runHeaderLogoReveal(logo);
    return;
  }

  // fade（overlay 開關傳入）：換檔前先把舊 logo 淡出、doSwap 內 DOMLoaded 再淡入 → 換檔不硬跳（user 2026-09-08）。
  // 只在「有既有 svg 可淡 + 非 /create reveal + gsap 在」時啟用；mode3 同 type 走上面 skip 不到這（其 filter 翻白
  // 由 CSS transition:filter 平滑）；mode1/2 換的是 filled↔outline 不同 JSON（形狀變），filter 補不了硬跳，靠 opacity crossfade。
  const fading = fade && !needsReveal && typeof gsap !== 'undefined' && !!logo.querySelector('svg');

  const doSwap = () => {
    if (myGeneration !== logoLoadGeneration) return;   // 淡出期間已被後來的呼叫取代
    let file;
    if (type === 'wireframe') file = 'SCCDLogoWireframeStandard.json';
    else if (type === 'wireframe-inverse') file = 'SCCDLogoWireframeInverse.json';
    else if (type === 'inverse') file = 'SCCDLogoInverse.json';
    else file = 'SCCDLogoStandard.json';

    // 雙緩衝（user 2026-10-01「logo 要在旋轉的時候切換樣式」）：新 logo 先載進隱形層、舊的照轉，DOMLoaded 才換上。
    // 原本先清空再載＝載入那幾格 logo 是空的；mode 切換 View Transition 期間 logo 是即時畫面，空檔直接露成「閃一下不見」
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;inset:0;visibility:hidden';   // 定位框＝外層 <a>（relative、同 logo 尺寸）
    logo.appendChild(layer);
    const anim = lottie.loadAnimation({
      container: layer,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      name: 'header-logo-anim',
      path: sitePath('data/' + file),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    });

    /** @returns {any[]} 畫面上那支＋其他載入中的舊請求（註冊序最早＝畫面上那支） */
    const otherAnims = () => lottie.getRegisteredAnimations().filter((/** @type {any} */ a) => a.name === 'header-logo-anim' && a !== anim);
    anim.addEventListener('DOMLoaded', () => {
      // 被後來的換檔取代：丟掉自己就好，畫面上的舊 logo 不動
      if (myGeneration !== logoLoadGeneration) { anim.destroy(); layer.remove(); return; }
      const svg = layer.querySelector('svg');
      if (svg) {
        svg.style.overflow = 'visible';
        svg.setAttribute('viewBox', '0 14 1080 1080');   // 可見頂貼 box 頂（同 header.js 初載）
      }
      // 防 autoplay 在 race 情境下未真正啟動（symptom：Lottie 卡 frame 0 看不到 central circle）
      if (typeof anim.play === 'function' && anim.isPaused) anim.play();
      // Frame 同步：接上舊 logo 此刻的旋轉角，之後兩支同速轉＝隱形層裡一路對齊。swap 的 logo JSON 時間軸完全相同
      // （ip:0 / op:3600 / fr:60），frame 1:1 對應同一旋轉角度；不接的話新 anim 從 0 重起 → 環角度 snap 回起點「jump」。
      const prev = otherAnims()[0];
      if (prev && prev.currentFrame > 0 && typeof anim.goToAndPlay === 'function') anim.goToAndPlay(prev.currentFrame, true);
      if (logoSwapGate) logoSwapGate.then(swap); else swap();
    });
    const swap = () => {
      if (myGeneration !== logoLoadGeneration) { anim.destroy(); layer.remove(); return; }
      layer.remove();   // 先拿出來：舊 anim destroy 會清空它的容器（header.js 初載那支的容器就是 logo 本身）
      otherAnims().forEach((a) => a.destroy());
      logoFading = false;
      logo.dataset.logoType = type;
      // wireframe（mode3）filter＝當前 --theme-fg 對比（同手機 logo「初值讀當前 --theme-fg」招式），後續逐幀翻轉交 applyColorVars；
      // 其他 type 不帶 filter。換上這刻才設：載入期間畫面上還是舊 logo，提早設／清會先把舊的翻色（離開 mode3 白線框
      // 先變黑線框）；wireframe 也不能等 applyColorVars（RAF 首拍在 MODE_FADE_MS 後 → 暗 hue 先露黑線框再跳白，user 09-08）
      if (type === 'wireframe') {
        const fgNow = getComputedStyle(document.documentElement).getPropertyValue('--theme-fg').trim().toLowerCase();
        logo.style.filter = (overlayLogoActive || fgNow === '#ffffff' || fgNow === '#fff') ? 'invert(1)' : 'none';   // 條件同 applyColorVars wireframe 分支
      } else {
        logo.style.filter = '';
      }
      // filter 翻黑白走 CSS transition 平滑（mode3 overlay 開關 + hue 過門檻；user 2026-09-08）
      logo.style.transition = 'filter var(--dur-base) ease';
      layer.style.cssText = 'width:100%;height:100%';
      logo.replaceChildren(layer);
      // **不能用 gsap.killTweensOf(logo)**：會把 header.js 的 scroll-shrink ScrollTrigger
      // (180→100 scrub) 一起殺掉，logo 卡在 180 永遠不收縮
      if (needsReveal) runHeaderLogoReveal(logo);
      else if (fading) gsap.to(logo, { opacity: 1, duration: DUR.micro / 2, ease: EASE.enterSoft, overwrite: 'auto' });
      else logo.style.opacity = '1';
    };
    // 必須在上面 DOMLoaded listener 之後註冊：上面會補 play／goToAndPlay，看不到的容器要由它再停回去
    runLottieWhenVisible(anim);
  };

  // fade：先淡出（0.1s）→ onComplete 換檔＋淡入（0.1s）＝crossfade 共 ~0.2s（user 2026-09-08「切換再快一點」，原 DUR.base/2
  // 各 0.2s 覺得慢）。淡出期間舊 anim 仍轉，doSwap 抓當下 frame 接得上。overwrite:'auto' 只殺 logo opacity tween（scroll-shrink 動 width、不受影響）。
  if (fading) {
    logoFading = true;
    gsap.to(logo, { opacity: 0, duration: DUR.micro / 2, ease: EASE.exitSoft, overwrite: 'auto', onComplete: doSwap });
  } else doSwap();
}

// 對 main-modular.js 暴露：進入 /create 時讀當前 site mode + colorHue，帶進 iframe URL params
// 讓 generate-app 承襲 site 的 mode（不重置成 Standard）；mode-color 時還帶當前 hue 讓色環接續 site 的 hue 直接 Play
export function getStoredMode() {
  return sessionStorage.getItem(STORAGE_KEY) || 'standard';
}
export function getColorHue() {
  return colorHue;
}

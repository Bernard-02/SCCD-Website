// ========================================
// 色彩選擇器模組
// 桌面版色環 / 手機版色條 + 滑鼠/觸控事件 + 顏色對比過渡 + Wireframe 背景色
// 依賴：variables.js（全域變數）、utils.js（updateIconsForMode）
// ========================================

// 繪製色環（桌面版）或色條（手機版）
function drawColorWheel() {
  if (!colorPickerCanvas) {
    return;
  }

  // 根據設備選擇繪製方式
  if (isMobileMode) {
    drawColorBar(); // 手機版：繪製橫向色條
  } else {
    drawColorRing(); // 桌面版：繪製色環
  }
}

// 桌面版：繪製色環（甜甜圈形狀）
function drawColorRing() {
  if (!colorPickerCanvas) return;

  let w = colorPickerCanvas.width;
  let h = colorPickerCanvas.height;
  let centerX = w / 2;
  let centerY = h / 2;

  // 色環半徑基於 canvas 尺寸（thickness 0.55→0.62 變細；2026-06-11 0.62→0.50→0.54 微調環帶寬度）
  // outerRadius 0.49 留 ~1% 給 stroke 不被 canvas edge clip；thickness = 46% of outerRadius
  // ⚠️inner 比例同步 line ~260/~317 的 hit detection，改這要一起改
  let outerRadius = Math.min(w, h) * 0.49;
  let innerRadius = outerRadius * 0.54;

  // 清空並設置 30% 透明白色背景
  colorPickerCanvas.clear(); // 先清空
  colorPickerCanvas.noFill(); // 30% 透明白色 (255 * 0.3 ≈ 77)
  colorPickerCanvas.noStroke();
  colorPickerCanvas.rect(0, 0, w, h);

  // 繪製色環 - 使用 HSB 顏色模式
  colorPickerCanvas.colorMode(_p5.HSB, 360, 100, 100);
  colorPickerCanvas.noStroke();

  // 繪製色環 - 使用弧形疊加
  colorPickerCanvas.push();
  colorPickerCanvas.translate(centerX, centerY);

  // 設定線條粗細（色環的厚度）
  let ringThickness = outerRadius - innerRadius;
  colorPickerCanvas.strokeWeight(ringThickness);
  colorPickerCanvas.strokeCap(_p5.SQUARE); // 使用方形端點，避免間隙

  // 計算弧形的半徑（在內外圈中間）
  let arcRadius = (outerRadius + innerRadius) / 2;

  // 繪製 360 個弧形線段，每段稍微重疊以避免間隙
  for (let angle = 0; angle < 360; angle += 1) {
    // 使用 HSB 顏色模式設置描邊顏色
    colorPickerCanvas.stroke(angle, 80, 100); // H=angle, S=80, B=100

    // 繪製一小段弧形（從頂部開始，順時針）
    // 稍微擴大角度範圍以確保完全覆蓋，避免間隙
    let startAngle = _p5.radians(angle - 90 - 0.5);
    let endAngle = _p5.radians(angle + 1 - 90 + 0.5);

    colorPickerCanvas.noFill();
    colorPickerCanvas.arc(0, 0, arcRadius * 2, arcRadius * 2, startAngle, endAngle);
  }

  colorPickerCanvas.pop();

  // 切換回 RGB 模式繪製其他元素
  colorPickerCanvas.colorMode(_p5.RGB, 255);

  // 繪製中心 30% 透明白色圓形（清除中心區域）
  colorPickerCanvas.noFill(); // 30% 透明白色 (255 * 0.3 ≈ 77)
  colorPickerCanvas.noStroke();
  colorPickerCanvas.circle(centerX, centerY, innerRadius * 2);

  // 兩圈 border＋indicator 顏色 = box 內 fg（box bg = --lib-bg → border = --lib-fg）
  // box 淺灰 → fg 黑 / box 深灰 → fg 白；三 mode 統一從 #colorpicker-box computed style 讀 color
  // computedStyle.color 反映 .control-box 的 color: var(--lib-fg) cascade 結果
  let borderShade = 255;
  const pickerBox = document.getElementById('colorpicker-box');
  if (pickerBox) {
    const fg = getComputedStyle(pickerBox).color; // "rgb(R, G, B)" 格式
    const match = fg.match(/\d+/g);
    if (match && match.length >= 3) {
      // 取 R 通道判斷亮度（--lib-fg 是純黑或純白，R 直接表示明暗）
      borderShade = parseInt(match[0], 10) > 127 ? 255 : 0;
    }
  }
  // 兩圈 border＋indicator（從內圈到外圈的線，-HALF_PI＝從頂部起算）同一個 path、一次 stroke：
  // 粗度皆 1.8（user 2026-06-22：indicator＝邊框厚度）
  const angle = _p5.map(selectedHue, 0, 360, 0, _p5.TWO_PI) - _p5.HALF_PI;
  const path = new Path2D();
  path.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
  path.moveTo(centerX + innerRadius, centerY);
  path.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  path.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
  path.lineTo(centerX + Math.cos(angle) * outerRadius, centerY + Math.sin(angle) * outerRadius);
  // hover 色環＝框線＋indicator 淡成「0.6 的實色」、瞬間（同 mode-color-panel 色條，user 2026-10-21）：
  // 先把線的位置挖空（destination-out）再畫 0.6 alpha＝線底下透的是盒底而非色帶＝同預混實色；
  // 一次 stroke＝indicator 跟內外圈交接處不疊兩次變深。每幀重畫，hover 直接讀 :hover
  const hovered = colorPickerCanvas.elt.matches(':hover');
  const ctx = colorPickerCanvas.drawingContext;
  ctx.save();
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'butt';   // ＝p5 SQUARE
  if (hovered) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000';
    ctx.stroke(path);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.strokeStyle = `rgba(${borderShade}, ${borderShade}, ${borderShade}, ${hovered ? 0.6 : 1})`;
  ctx.stroke(path);
  ctx.restore();
}

// 手機版：繪製橫向漸變色條
function drawColorBar() {
  if (!colorPickerCanvas) return;

  let w = colorPickerCanvas.width;
  let h = colorPickerCanvas.height;

  // 清空 canvas
  colorPickerCanvas.clear();

  // 使用 HSB 顏色模式繪製漸變
  colorPickerCanvas.colorMode(_p5.HSB, 360, 100, 100);

  // === 第一層：色彩漸變條（0~360 鋪滿整條寬；同 mode3 色條 .mcp-bar，兩端不再為圓圈補紅）===
  colorPickerCanvas.noStroke();
  for (let x = 0; x <= w; x++) {
    colorPickerCanvas.fill(_p5.map(x, 0, w, 0, 360), 80, 100);
    colorPickerCanvas.rect(x, 0, 1, h);
  }

  // === 第二層：indicator（直線），在 bar 上方 ===
  colorPickerCanvas.colorMode(_p5.RGB, 255);
  drawColorBarIndicator(w, h);
}

// 色條 indicator＝滿高直線（user 2026-10-30：同桌面色環、mode3 色條；原空心圓圈）。
// wrap＝主線另一側 ±整條寬再畫一條、canvas 自己裁：359.9→0 那一幀兩條位置互換＝無縫（同 mode-color-panel drawBar）
function drawColorBarIndicator(w, h) {
  if (!colorPickerCanvas) return;
  const x = ((((selectedHue % 360) + 360) % 360) / 360) * w;

  let lineColor;
  if (mode === "Standard") {
    lineColor = colorPickerCanvas.color(0, 0, 0);
  } else if (mode === "Inverse") {
    lineColor = colorPickerCanvas.color(255, 255, 255);
  } else {
    lineColor = wireframeStrokeColor ? wireframeStrokeColor : colorPickerCanvas.color(255, 255, 255);
  }
  colorPickerCanvas.stroke(lineColor);
  colorPickerCanvas.strokeWeight(2);
  colorPickerCanvas.strokeCap(_p5.SQUARE);
  for (const dx of [-w, 0, w]) colorPickerCanvas.line(x + dx, 0, x + dx, h);
}

// ── 點擊（非拖）→ hue tween 過去（2026-07-15，對齊 mode-color-panel 的點擊行為）──
// 桌面色環走「最短弧線」；手機色條走線性（bar 是直線，hue wrap 會讓 indicator 左右端跳）。
// tween 每幀寫 window.sccdSetColorHue → draw() 每幀讀回 → indicator / wireframeColor / --theme-bg 全自動沿途掃過中間色。
// 常數 0.4 / power3.out ＝ site 的 DUR.base / EASE.enter（classic script 無法 import motion.js，值對齊）。
let hueClickTween = null;
let pickerDownX = 0, pickerDownY = 0;
const PICKER_DRAG_THRESHOLD = 3;   // px：超過才視為拖曳（觸控微抖不取消 tween）

function killHueClickTween() {
  if (hueClickTween) { hueClickTween.kill(); hueClickTween = null; }
}

// 從座標算目標 hue（不 apply）——數學同 updateColorFromMouse 兩分支
function hueFromPickerPoint(clientX, clientY) {
  const rect = colorPickerCanvas.elt.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const w = colorPickerCanvas.width;
  const h = colorPickerCanvas.height;
  if (isMobileMode) return (Math.min(Math.max(x, 0), w) / w) * 360;
  const angle = Math.atan2(y - h / 2, x - w / 2);
  return (angle * 180 / Math.PI + 90 + 360) % 360;
}

function tweenPickerHue(target) {
  if (typeof gsap === 'undefined' || typeof window.sccdSetColorHue !== 'function'
    || typeof window.sccdGetColorHue !== 'function') return false;
  const cur = ((window.sccdGetColorHue() % 360) + 360) % 360;
  // 桌面環最短路徑 (-180,180]；手機 bar 線性直達（不跨 wrap）
  const delta = isMobileMode ? (target - cur) : (((target - cur + 540) % 360) - 180);
  const proxy = { h: cur };
  killHueClickTween();
  hueClickTween = gsap.to(proxy, {
    h: cur + delta, duration: 0.4, ease: 'power3.out',
    onUpdate: () => { window.sccdSetColorHue(proxy.h); },
    onComplete: () => { hueClickTween = null; },
  });
  return true;
}

// 處理鼠標事件
function handleColorPickerMouseDown(e) {
  if (!colorPickerCanvas) return;

  // 檢查初始點擊是否在色環範圍內（桌面版）或色條範圍內（手機版）
  if (!isMobileMode) {
    let rect = colorPickerCanvas.elt.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    let w = colorPickerCanvas.width;

    let centerX = w / 2;
    let centerY = w / 2;
    let dx = x - centerX;
    let dy = y - centerY;
    let distance = Math.sqrt(dx * dx + dy * dy);

    // 跟 drawColorRing 同步（outer 0.49 of canvas，inner = outer × 0.54）
    let outerRadius = w * 0.49;
    let innerRadius = w * 0.49 * 0.54;

    // 只有在色環範圍內按下時才開始拖曳
    if (distance < innerRadius || distance > outerRadius) {
      return; // 不在色環範圍內，不開始拖曳
    }
  }

  colorPickerDragging = true;
  pickerDownX = e.clientX; pickerDownY = e.clientY;
  // 點擊先走 tween（最短路徑掃過去）；gsap 不在（極端）才退回即時 set
  if (!tweenPickerHue(hueFromPickerPoint(e.clientX, e.clientY))) updateColorFromMouse(e);
}

function handleColorPickerMouseMove(e) {
  if (!colorPickerCanvas || !colorPickerDragging) return;
  // tween 中且位移未超閾值＝點擊微抖，不打斷；真拖曳 → kill tween 回 1:1 跟手
  if (hueClickTween && Math.hypot(e.clientX - pickerDownX, e.clientY - pickerDownY) < PICKER_DRAG_THRESHOLD) return;
  killHueClickTween();
  updateColorFromMouse(e);
}

function handleColorPickerMouseUp() {
  colorPickerDragging = false;

  // 恢復 transition（移除內聯樣式，讓 CSS 接管）
  let body = _p5.select('#create-app');
  let canvasContainer = _p5.select('#canvas-container');
  let desktopCanvasContainer = _p5.select('#desktop-canvas-container');

  if (body) {
    body.elt.style.removeProperty('transition');
  }
  if (canvasContainer) {
    canvasContainer.elt.style.removeProperty('transition');
  }
  if (desktopCanvasContainer) {
    desktopCanvasContainer.elt.style.removeProperty('transition');
  }
}

// Touch 事件處理函數
function handleColorPickerTouchStart(e) {
  if (!colorPickerCanvas) return;
  e.preventDefault(); // 防止滾動

  // 檢查初始觸摸是否在色環範圍內（桌面版）或色條範圍內（手機版）
  if (!isMobileMode && e.touches.length > 0) {
    let touch = e.touches[0];
    let rect = colorPickerCanvas.elt.getBoundingClientRect();
    let x = touch.clientX - rect.left;
    let y = touch.clientY - rect.top;
    let w = colorPickerCanvas.width;

    let centerX = w / 2;
    let centerY = w / 2;
    let dx = x - centerX;
    let dy = y - centerY;
    let distance = Math.sqrt(dx * dx + dy * dy);

    // 跟 drawColorRing 同步（outer 0.49 of canvas，inner = outer × 0.54）
    let outerRadius = w * 0.49;
    let innerRadius = w * 0.49 * 0.54;

    // 只有在色環範圍內觸摸時才開始拖曳
    if (distance < innerRadius || distance > outerRadius) {
      return; // 不在色環範圍內，不開始拖曳
    }
  }

  colorPickerDragging = true;
  if (e.touches.length > 0) {
    const t = e.touches[0];
    pickerDownX = t.clientX; pickerDownY = t.clientY;
    // 同 mouse down：tap 先走 tween（最短路徑掃過去）
    if (!tweenPickerHue(hueFromPickerPoint(t.clientX, t.clientY))) updateColorFromTouch(t);
  }
}

function handleColorPickerTouchMove(e) {
  if (!colorPickerCanvas || !colorPickerDragging) return;
  e.preventDefault(); // 防止滾動
  if (e.touches.length > 0) {
    const t = e.touches[0];
    // 同 mouse move：tween 中的微抖不打斷；真拖曳 kill tween 回 1:1
    if (hueClickTween && Math.hypot(t.clientX - pickerDownX, t.clientY - pickerDownY) < PICKER_DRAG_THRESHOLD) return;
    killHueClickTween();
    updateColorFromTouch(t);
  }
}

function updateColorFromTouch(touch) {
  if (!colorPickerCanvas) return;

  // 創建一個類似 mouse event 的對象傳給 updateColorFromMouse
  let fakeEvent = {
    clientX: touch.clientX,
    clientY: touch.clientY
  };

  updateColorFromMouse(fakeEvent);
}

function updateColorFromMouse(e) {
  if (!colorPickerCanvas) return;

  let rect = colorPickerCanvas.elt.getBoundingClientRect();
  let x = e.clientX - rect.left;
  let y = e.clientY - rect.top;

  let w = colorPickerCanvas.width;
  let h = colorPickerCanvas.height;

  if (isMobileMode) {
    // 手機版：色條（橫向）0~360 鋪滿整條寬，同繪製
    selectedHue = _p5.map(_p5.constrain(x, 0, w), 0, w, 0, 360);
    // Phase 2：drag 必須寫回 site colorHue 變成 single source；否則 sketch.js draw() 下幀 sccdGetColorHue 立刻覆蓋
    if (typeof window.sccdSetColorHue === 'function') window.sccdSetColorHue(selectedHue);

    // 更新 wireframeColor
    _p5.colorMode(_p5.HSB, 360, 100, 100);
    wireframeColor = _p5.color(selectedHue, 80, 100);
    _p5.colorMode(_p5.RGB, 255);

    // 根據亮度決定描邊顏色
    let newStrokeColor = getContrastColor(wireframeColor);
    startStrokeColorTransition(newStrokeColor);

    // 更新背景顏色
    updateBackgroundColor(wireframeColor, true);

    // 更新輸入框文字顏色
    updateInputTextColor();

  } else {
    // 桌面版：色環邏輯
    let centerX = w / 2;
    let centerY = h / 2;

    // 計算相對於中心的位置
    let dx = x - centerX;
    let dy = y - centerY;

    // 計算角度（弧度）- atan2 返回 -PI 到 PI
    // 即使拖曳到色環外，仍然可以根據角度改變顏色
    let angle = Math.atan2(dy, dx);

    // 轉換為度數並調整：
    // 1. atan2(dy, dx) 在右側 = 0，頂部 = -90度
    // 2. 我們要頂部 = 0度，所以加 90度
    // 3. 轉換到 0-360 範圍
    selectedHue = (_p5.degrees(angle) + 90 + 360) % 360;
    // Phase 2：drag 必須寫回 site colorHue 變成 single source；否則 sketch.js draw() 下幀 sccdGetColorHue 立刻覆蓋
    if (typeof window.sccdSetColorHue === 'function') window.sccdSetColorHue(selectedHue);

    // 更新 wireframeColor（使用 HSB 模式：飽和度 80%，亮度 100%）
    _p5.colorMode(_p5.HSB, 360, 100, 100);
    wireframeColor = _p5.color(selectedHue, 80, 100);
    _p5.colorMode(_p5.RGB, 255);

    // 根據亮度決定描邊顏色（黑色或白色）- 啟動平滑過渡
    let newStrokeColor = getContrastColor(wireframeColor);
    startStrokeColorTransition(newStrokeColor);

    // 更新背景顏色（拖動時禁用 transition，實現即時更新）
    updateBackgroundColor(wireframeColor, true);

    // 更新輸入框文字顏色（即時更新，與背景同步）
    updateInputTextColor();
  }
}

// 計算顏色的相對亮度（根據 WCAG 標準）
function getRelativeLuminance(col) {
  let r = _p5.red(col) / 255;
  let g = _p5.green(col) / 255;
  let b = _p5.blue(col) / 255;

  // 應用 gamma 校正
  r = r <= 0.03928 ? r / 12.92 : _p5.pow((r + 0.055) / 1.055, 2.4);
  g = g <= 0.03928 ? g / 12.92 : _p5.pow((g + 0.055) / 1.055, 2.4);
  b = b <= 0.03928 ? b / 12.92 : _p5.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 根據背景顏色亮度選擇黑色或白色作為對比色
function getContrastColor(bgColor) {
  let luminance = getRelativeLuminance(bgColor);

  // 如果亮度大於 0.5，使用黑色；否則使用白色
  if (luminance > 0.5) {
    return _p5.color(0, 0, 0); // 黑色
  } else {
    return _p5.color(255, 255, 255); // 白色
  }
}

// 啟動描邊顏色的平滑過渡動畫
function startStrokeColorTransition(newTargetColor) {
  // 記錄當前顏色作為 lerp 的起點
  if (wireframeStrokeColor) {
    currentStrokeColor = _p5.color(
      _p5.red(wireframeStrokeColor),
      _p5.green(wireframeStrokeColor),
      _p5.blue(wireframeStrokeColor)
    );
  } else {
    // 如果還沒有當前顏色，使用目標顏色（第一次進入 Wireframe 模式）
    currentStrokeColor = newTargetColor;
    wireframeStrokeColor = newTargetColor;
    strokeColorLerpProgress = 1;
    return;
  }

  // 設置目標顏色
  targetStrokeColor = newTargetColor;

  // 檢查是否需要過渡（如果目標顏色與當前顏色相同，則不需要）
  let currentR = _p5.red(currentStrokeColor);
  let targetR = _p5.red(targetStrokeColor);
  if (_p5.abs(currentR - targetR) < 1) {
    // 顏色已經一樣，不需要過渡
    wireframeStrokeColor = targetStrokeColor;
    strokeColorLerpProgress = 1;
    return;
  }

  // 開始 lerp 動畫
  strokeColorLerpProgress = 0;
  strokeColorLerpStartTime = _p5.millis();
}

// 更新輸入框文字顏色（Wireframe 模式下使用對比色）
// user 2026-05-27 方向 C：CSS 已用 var(--wireframe-border) → alias 到 site --theme-fg 自動跟；
// 不再 inline 覆蓋 textarea color（inline 會卡住 var alias 變化）；保留空函式給 caller call 不炸
function updateInputTextColor() {
  // intentionally no-op：留函式 ref 給 sketch.js / ui-state.js 既有 caller，不破壞 cleanup
}

// 更新背景顏色（Wireframe 模式）
// user 2026-05-27 方向 C 改寫：page bg + contrast fg 全部由 site colorTick 寫 --theme-bg/-fg；
// variables.css 已 alias --wireframe-* → site var；CSS 透過 var() 自動跟，不需 generate-app 再寫
//
// 本函式現在只做一件 generate-app 私有的事：**dark-icons class 跨閾值切換**
// 這個 class 是 generate-app 在 create.css 內定義的（slider thumb 色、icon invert filter 等），
// site 不管。為避免每幀 toggle 重設 + icon src 重寫拖累 frame rate，只在 isDark 跟上次不同才動作
//
// 事件型 caller 仍呼叫此函式（mode 切換 / colorpicker drag / windowResized / save）；
// drag 場景 caller 已 sccdSetColorHue 回 site，site applyColorVars 會立刻寫 --theme-bg/-fg 同步 page bg
function updateBackgroundColor(bgColor, _disableTransition) {
  // WCAG 0.5 threshold 算 dark/light（getContrastColor 內部走同邏輯）
  let contrastColor = getContrastColor(bgColor);
  let borderR = _p5.red(contrastColor);
  let isDarkIcons = borderR === 0;

  let body = _p5.select('#create-app');
  if (!body) return;
  const had = body.elt.classList.contains('dark-icons');
  if (isDarkIcons !== had) {
    body.elt.classList.toggle('dark-icons', isDarkIcons);
    if (typeof updateIconsForMode === 'function') updateIconsForMode();
  }
}

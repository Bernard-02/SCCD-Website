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

  // 色環半徑基於 canvas 尺寸
  let outerRadius = Math.min(w, h) / 2 - 2; // 留 2px 給邊框
  let innerRadius = outerRadius * 0.55; // 內圈是外圈的 60%

  // 清空並設置 30% 透明白色背景
  colorPickerCanvas.clear(); // 先清空
  colorPickerCanvas.noFill(); // 30% 透明白色 (255 * 0.3 ≈ 77)
  colorPickerCanvas.noStroke();
  colorPickerCanvas.rect(0, 0, w, h);

  // 繪製色環 - 使用 HSB 顏色模式
  colorPickerCanvas.colorMode(HSB, 360, 100, 100);
  colorPickerCanvas.noStroke();

  // 繪製色環 - 使用弧形疊加
  colorPickerCanvas.push();
  colorPickerCanvas.translate(centerX, centerY);

  // 設定線條粗細（色環的厚度）
  let ringThickness = outerRadius - innerRadius;
  colorPickerCanvas.strokeWeight(ringThickness);
  colorPickerCanvas.strokeCap(SQUARE); // 使用方形端點，避免間隙

  // 計算弧形的半徑（在內外圈中間）
  let arcRadius = (outerRadius + innerRadius) / 2;

  // 繪製 360 個弧形線段，每段稍微重疊以避免間隙
  for (let angle = 0; angle < 360; angle += 1) {
    // 使用 HSB 顏色模式設置描邊顏色
    colorPickerCanvas.stroke(angle, 80, 100); // H=angle, S=80, B=100

    // 繪製一小段弧形（從頂部開始，順時針）
    // 稍微擴大角度範圍以確保完全覆蓋，避免間隙
    let startAngle = radians(angle - 90 - 0.5);
    let endAngle = radians(angle + 1 - 90 + 0.5);

    colorPickerCanvas.noFill();
    colorPickerCanvas.arc(0, 0, arcRadius * 2, arcRadius * 2, startAngle, endAngle);
  }

  colorPickerCanvas.pop();

  // 切換回 RGB 模式繪製其他元素
  colorPickerCanvas.colorMode(RGB, 255);

  // 繪製中心 30% 透明白色圓形（清除中心區域）
  colorPickerCanvas.noFill(); // 30% 透明白色 (255 * 0.3 ≈ 77)
  colorPickerCanvas.noStroke();
  colorPickerCanvas.circle(centerX, centerY, innerRadius * 2);

  // 繪製邊框（根據背景色自動選擇黑色或白色）
  colorPickerCanvas.noFill();
  // 使用對比色（與 wireframeStrokeColor 相同）
  if (wireframeStrokeColor) {
    let r = red(wireframeStrokeColor);
    let g = green(wireframeStrokeColor);
    let b = blue(wireframeStrokeColor);
    colorPickerCanvas.stroke(r, g, b);
  } else {
    colorPickerCanvas.stroke(0); // 預設黑色
  }
  colorPickerCanvas.strokeWeight(1.8);
  colorPickerCanvas.circle(centerX, centerY, outerRadius * 2); // 外圈
  colorPickerCanvas.circle(centerX, centerY, innerRadius * 2); // 內圈

  // 繪製 indicator
  drawColorPickerIndicator(centerX, centerY, outerRadius, innerRadius);
}

// 手機版：繪製橫向漸變色條
function drawColorBar() {
  if (!colorPickerCanvas) return;

  let w = colorPickerCanvas.width;
  let h = colorPickerCanvas.height;

  // 清空 canvas
  colorPickerCanvas.clear();

  // 使用 HSB 顏色模式繪製漸變
  colorPickerCanvas.colorMode(HSB, 360, 100, 100);

  // 計算 indicator 的半徑
  let circleRadius = h * 0.4;

  // === 第一層：繪製色彩漸變條（背景） ===
  // Color pick 模式：實際可選的顏色範圍是 circleRadius 到 w - circleRadius
  // Bar 的左右兩端補上紅色（hue = 0）
  colorPickerCanvas.noStroke();

  // 左側紅色區域（0 到 circleRadius）
  colorPickerCanvas.fill(0, 80, 100); // 紅色
  colorPickerCanvas.rect(0, 0, circleRadius, h);

  // 中間色彩漸變區域（circleRadius 到 w - circleRadius）
  for (let x = circleRadius; x <= w - circleRadius; x++) {
    let hue = map(x, circleRadius, w - circleRadius, 0, 360);
    colorPickerCanvas.fill(hue, 80, 100);
    colorPickerCanvas.rect(x, 0, 1, h);
  }

  // 右側紅色區域（w - circleRadius 到 w）
  colorPickerCanvas.fill(0, 80, 100); // 紅色
  colorPickerCanvas.rect(w - circleRadius, 0, circleRadius, h);

  // === 第二層：繪製 indicator（圓圈），在 bar 上方 ===
  colorPickerCanvas.colorMode(RGB, 255);
  drawColorBarIndicator(w, h, circleRadius);

  // 切換回 RGB 模式
  colorPickerCanvas.colorMode(RGB, 255);
}

// 繪製色條的 indicator（圓圈）
function drawColorBarIndicator(w, h, circleRadius) {
  if (!colorPickerCanvas) return;

  let y = h / 2; // 垂直置中

  // === 單一圓圈，單一位置 ===
  // selectedHue：圓圈的位置（可以超出 0-360）
  // - Pause 時：用戶點擊選擇顏色，設定 selectedHue（0-360，不會被切掉）
  // - Play 時：selectedHue 持續增加，可以超出 360，圓圈會被切掉

  // 先計算在 0-360 範圍內的基礎位置
  let normalizedHue = selectedHue % 360;
  if (normalizedHue < 0) normalizedHue += 360;

  // 計算基礎 x 位置
  let barWidth = w - 2 * circleRadius;
  let baseX = circleRadius + (normalizedHue / 360) * barWidth;

  // 計算額外的循環偏移（當 selectedHue 超出 0-360 時）
  let extraRotation = selectedHue - normalizedHue;
  let extraDistance = (extraRotation / 360) * barWidth;

  let x = baseX + extraDistance;

  // 根據當前模式設定邊框顏色
  let borderColor;
  if (mode === "Standard") {
    borderColor = colorPickerCanvas.color(0, 0, 0); // 黑色邊框
  } else if (mode === "Inverse") {
    borderColor = colorPickerCanvas.color(255, 255, 255); // 白色邊框
  } else if (mode === "Wireframe") {
    // Wireframe 模式：使用 wireframeStrokeColor
    borderColor = wireframeStrokeColor ? wireframeStrokeColor : colorPickerCanvas.color(255, 255, 255);
  }

  // 繪製主圓（永遠繪製）
  // 圓圈內部透明，直接顯示 bar 的顏色（這樣左右兩邊的圓圈顏色會同步）
  colorPickerCanvas.noFill();
  colorPickerCanvas.stroke(borderColor);
  colorPickerCanvas.strokeWeight(2);
  colorPickerCanvas.circle(x, y, circleRadius * 2);

  // 循環效果：右邊被遮住多少，左邊就同步出現多少
  // 無論 play 或 pause，只要圓圈超出右邊界就繪製左邊的圓圈
  let rightEdge = x + circleRadius;

  // 當圓的右邊緣開始超出右邊界時，左邊就開始出現對應的部分
  if (rightEdge > w) {
    // 計算右邊被遮住的距離（超出多少）
    let occludedDistance = rightEdge - w;

    // 左邊圓的位置：從左邊界外開始，根據被遮住的距離進入
    // 當右邊遮住 X 距離時，左邊就進入 X 距離
    let leftX = -circleRadius + occludedDistance;

    // 繪製左邊出現的循環圓圈（與主圓同步，也是透明）
    colorPickerCanvas.noFill();
    colorPickerCanvas.stroke(borderColor);
    colorPickerCanvas.strokeWeight(2);
    colorPickerCanvas.circle(leftX, y, circleRadius * 2);
  }
}

// 繪製 indicator（線段，黑色）- 桌面版色環用
function drawColorPickerIndicator(centerX, centerY, outerRadius, innerRadius) {
  if (!colorPickerCanvas) return;

  // 計算角度
  let angle = map(selectedHue, 0, 360, 0, TWO_PI) - HALF_PI; // -HALF_PI 從頂部開始

  // 計算線段的起點和終點（從內圈到外圈）
  let x1 = centerX + cos(angle) * innerRadius;
  let y1 = centerY + sin(angle) * innerRadius;
  let x2 = centerX + cos(angle) * outerRadius;
  let y2 = centerY + sin(angle) * outerRadius;

  // 繪製線段（根據背景色自動選擇黑色或白色）
  // 使用對比色（與 wireframeStrokeColor 相同）
  if (wireframeStrokeColor) {
    let r = red(wireframeStrokeColor);
    let g = green(wireframeStrokeColor);
    let b = blue(wireframeStrokeColor);
    colorPickerCanvas.stroke(r, g, b);
  } else {
    colorPickerCanvas.stroke(0); // 預設黑色
  }
  colorPickerCanvas.strokeWeight(1.8);
  colorPickerCanvas.strokeCap(SQUARE); // 使用方形端點
  colorPickerCanvas.line(x1, y1, x2, y2);
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

    let outerRadius = w * 0.45;
    let innerRadius = w * 0.25;

    // 只有在色環範圍內按下時才開始拖曳
    if (distance < innerRadius || distance > outerRadius) {
      return; // 不在色環範圍內，不開始拖曳
    }
  }

  colorPickerDragging = true;
  updateColorFromMouse(e);
}

function handleColorPickerMouseMove(e) {
  if (!colorPickerCanvas || !colorPickerDragging) return;
  updateColorFromMouse(e);
}

function handleColorPickerMouseUp() {
  colorPickerDragging = false;

  // 恢復 transition（移除內聯樣式，讓 CSS 接管）
  let body = select('body');
  let canvasContainer = select('#canvas-container');
  let desktopCanvasContainer = select('#desktop-canvas-container');

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

    let outerRadius = w * 0.45;
    let innerRadius = w * 0.25;

    // 只有在色環範圍內觸摸時才開始拖曳
    if (distance < innerRadius || distance > outerRadius) {
      return; // 不在色環範圍內，不開始拖曳
    }
  }

  colorPickerDragging = true;
  if (e.touches.length > 0) {
    updateColorFromTouch(e.touches[0]);
  }
}

function handleColorPickerTouchMove(e) {
  if (!colorPickerCanvas || !colorPickerDragging) return;
  e.preventDefault(); // 防止滾動
  if (e.touches.length > 0) {
    updateColorFromTouch(e.touches[0]);
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
    // 手機版：色條邏輯（橫向）
    // 計算圓圈半徑
    let circleRadius = h * 0.4;

    // 限制 x 在圓圈不被切掉的範圍內
    // 範圍：circleRadius (左邊緣) 到 w - circleRadius (右邊緣)
    x = constrain(x, circleRadius, w - circleRadius);

    // 根據 x 位置計算色相（0-360）
    // 使用與繪製相同的 mapping
    selectedHue = map(x, circleRadius, w - circleRadius, 0, 360);

    // 更新 wireframeColor
    colorMode(HSB, 360, 100, 100);
    wireframeColor = color(selectedHue, 80, 100);
    colorMode(RGB, 255);

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
    selectedHue = (degrees(angle) + 90 + 360) % 360;

    // 更新 wireframeColor（使用 HSB 模式：飽和度 80%，亮度 100%）
    colorMode(HSB, 360, 100, 100);
    wireframeColor = color(selectedHue, 80, 100);
    colorMode(RGB, 255);

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
  let r = red(col) / 255;
  let g = green(col) / 255;
  let b = blue(col) / 255;

  // 應用 gamma 校正
  r = r <= 0.03928 ? r / 12.92 : pow((r + 0.055) / 1.055, 2.4);
  g = g <= 0.03928 ? g / 12.92 : pow((g + 0.055) / 1.055, 2.4);
  b = b <= 0.03928 ? b / 12.92 : pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 根據背景顏色亮度選擇黑色或白色作為對比色
function getContrastColor(bgColor) {
  let luminance = getRelativeLuminance(bgColor);

  // 如果亮度大於 0.5，使用黑色；否則使用白色
  if (luminance > 0.5) {
    return color(0, 0, 0); // 黑色
  } else {
    return color(255, 255, 255); // 白色
  }
}

// 啟動描邊顏色的平滑過渡動畫
function startStrokeColorTransition(newTargetColor) {
  // 記錄當前顏色作為 lerp 的起點
  if (wireframeStrokeColor) {
    currentStrokeColor = color(
      red(wireframeStrokeColor),
      green(wireframeStrokeColor),
      blue(wireframeStrokeColor)
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
  let currentR = red(currentStrokeColor);
  let targetR = red(targetStrokeColor);
  if (abs(currentR - targetR) < 1) {
    // 顏色已經一樣，不需要過渡
    wireframeStrokeColor = targetStrokeColor;
    strokeColorLerpProgress = 1;
    return;
  }

  // 開始 lerp 動畫
  strokeColorLerpProgress = 0;
  strokeColorLerpStartTime = millis();
}

// 更新輸入框文字顏色（Wireframe 模式下使用對比色）
function updateInputTextColor() {
  if (mode === "Wireframe" && wireframeStrokeColor) {
    // 使用與 logo 邊框相同的對比色
    let r = red(wireframeStrokeColor);
    let g = green(wireframeStrokeColor);
    let b = blue(wireframeStrokeColor);
    let textColor = `rgb(${r}, ${g}, ${b})`;

    inputBox.style("color", textColor);
    if (inputBoxMobile) {
      inputBoxMobile.style("color", textColor);
    }
  }
}

// 更新背景顏色（Wireframe 模式）- 使用 CSS 變數
function updateBackgroundColor(bgColor, disableTransition = false) {
  // 將顏色轉換為 CSS rgb 格式
  let r = red(bgColor);
  let g = green(bgColor);
  let b = blue(bgColor);
  let cssColor = `rgb(${r}, ${g}, ${b})`;

  // 根據背景亮度計算對比色（黑色或白色）
  let contrastColor = getContrastColor(bgColor);
  let borderR = red(contrastColor);
  let borderG = green(contrastColor);
  let borderB = blue(contrastColor);
  let borderCssColor = `rgb(${borderR}, ${borderG}, ${borderB})`;

  // 判斷是否使用暗色 icon（黑色 icon）
  let isDarkIcons = borderR === 0 && borderG === 0 && borderB === 0;

  // 根據 icon 顏色設定透明度：白色 50%，黑色 25%
  let opacityValue = isDarkIcons ? '0.25' : '0.5';

  if (disableTransition) {
    // 拖動色環時：臨時禁用 transition，實現即時更新
    let body = select('body');
    let canvasContainer = select('#canvas-container');
    let desktopCanvasContainer = select('#desktop-canvas-container');

    if (body) {
      body.elt.style.transition = 'none';
    }
    if (canvasContainer) {
      canvasContainer.elt.style.transition = 'none';
    }
    if (desktopCanvasContainer) {
      desktopCanvasContainer.elt.style.transition = 'none';
    }

    // 更新 CSS 變數
    document.documentElement.style.setProperty('--wireframe-bg', cssColor);
    document.documentElement.style.setProperty('--wireframe-border', borderCssColor);
    document.documentElement.style.setProperty('--wireframe-opacity', opacityValue);

    // 通知外層 header 更新背景色（Wireframe 模式拖色環 / Play 模式旋轉）
    // instant: true → header 跟 iframe 同步用 0s transition 即時追，避免 1s fade 落後感
    window.parent.postMessage({ genMode: 'Wireframe', bg: cssColor, text: borderCssColor, instant: true }, '*');

    // 更新 landscape overlay 的 CSS 變數
    document.documentElement.style.setProperty('--current-wireframe-bg', cssColor);
    document.documentElement.style.setProperty('--current-wireframe-text', borderCssColor);

    // landscape overlay 的顏色現在由 CSS 變數控制，不需要設置 inline style

    // 根據 icon 顏色添加或移除 dark-icons class
    if (isDarkIcons) {
      body.addClass('dark-icons');
    } else {
      body.removeClass('dark-icons');
    }

    // 更新輸入框文字顏色（即時更新）
    if (inputBox) {
      inputBox.style("color", borderCssColor);
    }
    if (inputBoxMobile) {
      inputBoxMobile.style("color", borderCssColor);
    }

    // 更新 icon 顏色（即時更新）
    updateIconsForMode();

    // 強制瀏覽器重新計算樣式（觸發 reflow）
    if (body) {
      body.elt.offsetHeight;
    }
  } else {
    // 切換模式時：使用 transition 動畫
    let body = select('body');

    document.documentElement.style.setProperty('--wireframe-bg', cssColor);
    document.documentElement.style.setProperty('--wireframe-border', borderCssColor);
    document.documentElement.style.setProperty('--wireframe-opacity', opacityValue);

    // 通知外層 header 更新背景色（Wireframe 模式切換進入時）
    window.parent.postMessage({ genMode: 'Wireframe', bg: cssColor, text: borderCssColor }, '*');

    // 更新 landscape overlay 的 CSS 變數
    document.documentElement.style.setProperty('--current-wireframe-bg', cssColor);
    document.documentElement.style.setProperty('--current-wireframe-text', borderCssColor);

    // 根據 icon 顏色添加或移除 dark-icons class
    if (body) {
      if (isDarkIcons) {
        body.addClass('dark-icons');
      } else {
        body.removeClass('dark-icons');
      }
    }

    // 更新輸入框文字顏色（使用 transition 動畫）
    if (inputBox) {
      inputBox.style("color", borderCssColor);
    }
    if (inputBoxMobile) {
      inputBoxMobile.style("color", borderCssColor);
    }

    // 更新 icon 顏色
    updateIconsForMode();
  }
}

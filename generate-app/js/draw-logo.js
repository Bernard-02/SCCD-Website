// ========================================
// Logo 繪圖模組
// drawPlaceholder (無文字時的 SVG 輪廓) / drawLogo (核心繪圖) / drawCentralCircle
// 依賴：variables.js（大量狀態變數）、utils.js 內的 normalizeAngle
// ========================================

// --- 繪製 Placeholder SVG Wireframe ---
function drawPlaceholder(pg) {
  // 檢查圖片是否已載入（防止手機版首次載入時圖片未完成載入）
  if (!placeholderR || !placeholderG || !placeholderB ||
      !placeholderR_white || !placeholderG_white || !placeholderB_white) {
    return; // 圖片尚未載入完成，跳過繪製
  }

  // 更新旋轉角度（使用 baseSpeeds: [0.125, -0.125, 0.25] 對應 R, G, B）
  placeholderRotations[0] += baseSpeeds[0]; // R: 0.125
  placeholderRotations[1] += baseSpeeds[1]; // G: -0.125
  placeholderRotations[2] += baseSpeeds[2]; // B: 0.25

  // Fade in/out 動畫（fade out: 0.3s，fade in: 0.5s）
  let fadeSpeed = (targetPlaceholderAlpha === 0) ? 0.3 : 0.15; // fade out 快，fade in 慢
  placeholderAlpha = lerp(placeholderAlpha, targetPlaceholderAlpha, fadeSpeed);

  // 根據模式決定透明度倍數和版本
  let opacityMultiplier = 0.25; // 預設 25%（Standard 模式，黑色版本）
  let isWhiteVersion = false;

  if (mode === 'Inverse') {
    // Inverse 模式：使用白色版本 + 50% 透明度
    isWhiteVersion = true;
    opacityMultiplier = 0.5;
  } else if (mode === 'Wireframe' && wireframeStrokeColor) {
    // Wireframe 模式：根據背景亮度決定使用黑色或白色版本及其透明度
    let r = red(wireframeStrokeColor);
    isWhiteVersion = r > 128;
    // 白色 50%，黑色 25%
    opacityMultiplier = isWhiteVersion ? 0.5 : 0.25;
  }

  // 結合頁面載入動畫的 opacity
  let finalAlpha = placeholderAlpha * logoOpacity * opacityMultiplier;

  pg.push();
  pg.translate(width / 2, height / 2);
  pg.imageMode(CENTER);

  // 繪製尺寸：根據 canvas 大小動態調整
  // 桌面版基準：432x540 canvas，svgSize = 485.1
  // 手機版：按相同比例縮放，縮小到 95% 讓 placeholder 更小
  let svgSize = isMobileMode ? (width / 432) * 485.1 * 0.95 : 485.1 * 0.95;

  // 根據 isWhiteVersion 選擇正確的 SVG 檔案
  let rImg = isWhiteVersion ? placeholderR_white : placeholderR;
  let gImg = isWhiteVersion ? placeholderG_white : placeholderG;
  let bImg = isWhiteVersion ? placeholderB_white : placeholderB;

  // 繪製 R 層
  pg.push();
  pg.rotate(radians(placeholderRotations[0]));
  pg.tint(255, finalAlpha);
  pg.image(rImg, 0, 0, svgSize, svgSize);
  pg.pop();

  // 繪製 G 層
  pg.push();
  pg.rotate(radians(placeholderRotations[1]));
  pg.tint(255, finalAlpha);
  pg.image(gImg, 0, 0, svgSize, svgSize);
  pg.pop();

  // 繪製 B 層
  pg.push();
  pg.rotate(radians(placeholderRotations[2]));
  pg.tint(255, finalAlpha);
  pg.image(bImg, 0, 0, svgSize, svgSize);
  pg.pop();

  pg.pop();
}

// --- 核心 Logo 繪製邏輯 (直接從 ref.js 移植，簡化版) ---
function drawLogo(pg, alphaMultiplier = 255) {
  let totalLetters = letters.length;
  if (totalLetters === 0) return;

  // 確保 textSize 正確設定（避免 resizeCanvas 重置後遺失）
  // 桌面版固定 367.5，手機版根據 canvas 大小縮放
  let currentTextSize = isMobileMode ? (width / 432) * 367.5 * 1.1 : 367.5;
  pg.textSize(currentTextSize);

  // 計算每個字母應佔的角度
  let angleStep = 360 / totalLetters;

  // 簡單地將字母分為三組
  let sectionSize = floor(totalLetters / 3);
  let remainder = totalLetters % 3;
  let rCount = sectionSize + (remainder > 0 ? 1 : 0);
  let gCount = sectionSize + (remainder > 1 ? 1 : 0);

  // 將原點移動到畫布中心
  pg.push();
  // 修正：統一使用畫布的中心 width/2, height/2
  pg.translate(width / 2, height / 2);

  // 判斷是否為wireframe模式
  let isWireframeMode = (mode === "Wireframe");
  // 根據當前模式設定混合模式（wireframe模式使用BLEND，不需要特殊混合）
  if (!isWireframeMode) {
    pg.blendMode(mode === "Inverse" ? SCREEN : MULTIPLY);
  }

  // --- 旋轉效果 ---
  // 開啟時立即開始，關閉時立即停止
  if (autoRotate) {
    rotationFactor = 1;
  } else {
    rotationFactor = 0;
  }

  // 如果需要重設角度到 0°，使用 ease 效果平滑過渡
  if (shouldResetToZero) {
    let allReachedZero = true;

    // 處理 rotationAngles（Auto 模式的旋轉）
    for (let i = 0; i < totalLetters; i++) {
      if (rotationAngles[i] !== undefined) {
        // 使用 lerp 讓角度平滑回到 0°
        rotationAngles[i] = lerp(rotationAngles[i], 0, 0.08);

        // 檢查是否已經很接近 0°
        if (abs(rotationAngles[i]) > EASE_THRESHOLD) {
          allReachedZero = false;
        }
      }
    }

    // 處理手動偏移（Custom 模式的 offset）- 使用陣列迴圈
    for (let i = 0; i < 3; i++) {
      rotationOffsets[i] = lerp(rotationOffsets[i], 0, 0.08);
      // 檢查 offset 是否也接近 0°
      if (abs(rotationOffsets[i]) > EASE_THRESHOLD) {
        allReachedZero = false;
      }
    }

    // 如果所有角度都接近 0° 了，完全重設並停止
    if (allReachedZero) {
      rotationAngles = [...originalRotationAngles];
      rotationOffsets.fill(0); // 重設所有 offset 為 0
      shouldResetToZero = false;
    }
  }

  // Custom 模式的 ease 動畫（用於 Random 和 Reset 按鈕）
  if (isEasingCustomRotation && !isAutoRotateMode && !isEasterEggActive) {
    let allReachedTarget = true;

    // 使用陣列迴圈處理 R/G/B rotation ease
    for (let i = 0; i < 3; i++) {
      // 使用 lerp 平滑過渡到目標角度
      rotationOffsets[i] = lerp(rotationOffsets[i], targetRotationOffsets[i], customEaseSpeed);

      // 檢查是否已經很接近目標角度
      if (abs(rotationOffsets[i] - targetRotationOffsets[i]) > EASE_THRESHOLD) {
        allReachedTarget = false;
      }
    }

    // 如果所有角度都已接近目標，完全設置為目標值並停止 ease
    if (allReachedTarget) {
      for (let i = 0; i < 3; i++) {
        rotationOffsets[i] = targetRotationOffsets[i];
        // 正規化角度值到 -180° 到 180°
        rotationOffsets[i] = normalizeAngle(rotationOffsets[i]);
        // 同步更新目標值
        targetRotationOffsets[i] = rotationOffsets[i];
      }
      isEasingCustomRotation = false;
    }
  }

  // Slider 的 ease 動畫（與 rotation ease 同步）
  if (isEasingSlider && !isAutoRotateMode && !isEasterEggActive) {
    let allSlidersReachedTarget = true;

    // 使用陣列迴圈處理 R/G/B slider ease 動畫
    for (let i = 0; i < 3; i++) {
      // 使用 lerp 平滑過渡到目標 slider 值
      currentSliderValues[i] = lerp(currentSliderValues[i], targetSliderValues[i], customEaseSpeed);

      // 更新桌面版和手機版 slider 顯示值
      if (sliders[i]) sliders[i].value(currentSliderValues[i]);
      if (mobileSliders[i]) mobileSliders[i].value(currentSliderValues[i]);

      // 檢查是否已經很接近目標值
      if (abs(currentSliderValues[i] - targetSliderValues[i]) > EASE_THRESHOLD) {
        allSlidersReachedTarget = false;
      }
    }

    // 如果所有 slider 都已接近目標，完全設置為目標值並停止 ease
    if (allSlidersReachedTarget) {
      for (let i = 0; i < 3; i++) {
        currentSliderValues[i] = targetSliderValues[i];
        if (sliders[i]) sliders[i].value(currentSliderValues[i]);
        if (mobileSliders[i]) mobileSliders[i].value(currentSliderValues[i]);
      }
      isEasingSlider = false;
    }
  }

  // 繪製字母（Hover 功能已停用）
  let drawingPasses = 1;

  for (let pass = 0; pass < drawingPasses; pass++) {
    for (let i = 0; i < totalLetters; i++) {
      let letter = letters[i];

      // 獲取當前 textSize（從 pg 的設定中）
      // 注意：p5.Graphics 沒有直接的 getter，所以我們需要用其他方式
      // 在這裡直接使用全域的 textSize，因為 setup 時設定為 367.5
      // 但在保存時會臨時修改為 735
      let currentTextSize = pg._renderer._textSize || 367.5;

      // 獲取字母的邊界，以計算垂直偏移，使其中心對齊
      let bounds = font.textBounds(letter, 0, 0, currentTextSize);
      let offsetY = bounds.y + bounds.h / 2;

      // 決定當前字母的顏色
      let colorIndex;
      if (i < rCount) {
        colorIndex = 0; // 紅色組
      } else if (i < rCount + gCount) {
        colorIndex = 1; // 綠色組
      } else {
        colorIndex = 2; // 藍色組
      }

      // Hover 邏輯
      // let isHoveredColor = false;
      // if (hoveredSlider) {
      //   if (hoveredSlider === 'r' && colorIndex === 0) isHoveredColor = true;
      //   if (hoveredSlider === 'g' && colorIndex === 1) isHoveredColor = true;
      //   if (hoveredSlider === 'b' && colorIndex === 2) isHoveredColor = true;
      // }

      // 第一次繪製時跳過 hover 的顏色，第二次只繪製 hover 的顏色
      // if (drawingPasses === 2) {
      //   if (pass === 0 && isHoveredColor) continue; // 第一批：跳過 hover 的
      //   if (pass === 1 && !isHoveredColor) continue; // 第二批：只繪製 hover 的
      // }

    // --- 更新每個字母的旋轉角度 ---
    // 只有在不是 ease 回 0° 的狀態下，才累積旋轉角度
    if (!shouldResetToZero) {
      let rotationSpeed = baseSpeeds[colorIndex] * rotationFactor;
      if (rotationAngles[i] === undefined) { rotationAngles[i] = 0; }
      rotationAngles[i] += rotationSpeed;
    }

    // --- 應用手動偏移 ---
    // 使用陣列直接取得對應的 rotation offset
    let currentManualOffset = rotationOffsets[colorIndex] || 0;

    pg.push();
    // 計算並應用旋轉角度
    // 修正：減去最後一個字母的角度，確保最後一個字母在 0 度位置
    let rotationOffset = (totalLetters > 1) ? (totalLetters - 1) * angleStep : 0;
    let finalAngle = radians(i * angleStep - rotationOffset + rotationAngles[i] + currentManualOffset);
    pg.rotate(finalAngle);

    // 特殊處理 'W'，因為它通常比較寬
    if (letter === 'W') {
      pg.scale(0.85);
    }

    // 根據模式設定文字樣式並繪製
    // Hover 時，非 hover 的字母 25% 不透明度
    // let letterAlpha = (hoveredSlider && !isHoveredColor) ? 64 : 255;
    let letterAlpha = 255; // 注解 hover 功能，固定為 100% 不透明度

    if (isWireframeMode) {
      // Wireframe模式：使用色彩選擇器選擇的顏色

      // 第一次：繪製描邊（根據填充顏色亮度自動選擇黑色或白色）
      pg.noFill();
      if (wireframeStrokeColor) {
        pg.stroke(red(wireframeStrokeColor), green(wireframeStrokeColor), blue(wireframeStrokeColor), letterAlpha);
      } else {
        pg.stroke(0, 0, 0, letterAlpha); // 預設黑色
      }

      // 手機版 Wireframe + Custom 狀態：使用較細的描邊（視覺矯正）
      let strokeWeightValue = 5; // 預設 stroke weight
      if (isMobileMode && mobileElements && mobileElements.customAngleControls &&
          !mobileElements.customAngleControls.hasClass('hidden')) {
        strokeWeightValue = 4; // Custom 打開時使用較細的描邊
      }

      pg.strokeWeight(strokeWeightValue);
      pg.text(letter, 0, -offsetY);

      // 第二次：繪製填充顏色（來自色彩選擇器）
      if (wireframeColor) {
        pg.fill(red(wireframeColor), green(wireframeColor), blue(wireframeColor), letterAlpha);
      } else {
        pg.fill(255, 255, 255, letterAlpha); // 預設白色
      }
      pg.noStroke();
      pg.text(letter, 0, -offsetY);
    } else {
      // 一般模式：使用RGB顏色，無stroke
      // 結合 alphaMultiplier（頁面載入動畫）和 letterAlpha（hover 效果）
      let [r, g, b] = colors[colorIndex];
      let finalAlpha = alphaMultiplier * (letterAlpha / 255);
      pg.fill(r, g, b, finalAlpha);
      pg.noStroke();
      pg.text(letter, 0, -offsetY);
    }

    pg.pop();
    }
  }

  // 恢復混合模式和坐標系
  pg.blendMode(BLEND);
  pg.pop();
}

// --- 繪製中央圓圈的函數 ---
function drawCentralCircle(pg, alpha, diameter = 250) {
    pg.push();
    // 修正：統一使用畫布的中心 width/2, height/2
    pg.translate(width / 2, height / 2);
    // 根據模式設定圓圈顏色
    pg.fill(mode === "Inverse" ? 255 : 0, alpha);
    pg.noStroke();
    // 圓圈直徑（可自訂，預設 250）
    pg.circle(0, 0, diameter);
    pg.pop();
}

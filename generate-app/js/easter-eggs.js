// ========================================
// 特殊彩蛋模組（COOLGUY, CHILLGUY）
// 觸發 / UI 禁用 / 動畫狀態更新 / DOM 容器管理
// 依賴：variables.js（狀態變數）、mobile.js（mobileElements）
// ========================================

// --- 新彩蛋動畫函數（COOLGUY, CHILLGUY）---
function triggerSpecialEasterEgg() {
  // 設定動畫狀態
  specialEasterEggAnimating = true;
  specialEasterEggStartTime = millis();
  specialEasterEggAlpha = 0;
  specialEasterEggRotation = 0;
  specialEasterEggScale = 0;

  // 生成隨機的目標角度（-60 到 60 度）
  specialEasterEggTargetAngle = random(-60, 60);

  // 強制關閉鍵盤（使用多重策略確保在各種移動瀏覽器上都能工作）
  if (isMobileMode) {
    // 策略1: 先設為 readonly（對 iOS Safari 特別有效）
    if (inputBoxMobile) inputBoxMobile.attribute('readonly', '');

    // 策略2: 使用原生 DOM blur 當前活動元素
    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
      document.activeElement.blur();
    }

    // 策略3: 確保所有輸入框都失去焦點
    if (inputBoxMobile) inputBoxMobile.elt.blur();
    let mobileInputBoxBottom = select('#mobile-input-box-bottom');
    if (mobileInputBoxBottom) mobileInputBoxBottom.elt.blur();

    // 策略4: 短暫延遲後設置 disabled（給鍵盤關閉的時間）
    setTimeout(() => {
      if (inputBox) inputBox.attribute('disabled', '');
      if (inputBoxMobile) inputBoxMobile.attribute('disabled', '');
    }, 100);
  } else {
    // 桌面版：直接禁用
    if (inputBox) inputBox.attribute('disabled', '');
    if (inputBoxMobile) inputBoxMobile.attribute('disabled', '');
  }

  // 6 秒後（2s旋轉 + 2s停留 + 2s fade out）自動恢復
  setTimeout(() => {
    specialEasterEggAnimating = false;
    specialEasterEggType = null;
    specialEasterEggAlpha = 0;
    specialEasterEggScale = 0;

    // 恢復輸入框（移除所有限制屬性）
    if (inputBox) {
      inputBox.removeAttribute('disabled');
      inputBox.removeAttribute('readonly');
    }
    if (inputBoxMobile) {
      inputBoxMobile.removeAttribute('disabled');
      inputBoxMobile.removeAttribute('readonly');
    }

    // 自動 focus 輸入框，讓用戶可以無縫接續輸入
    // 手機版：需要延遲一點讓 readonly 完全移除後再 focus
    setTimeout(() => {
      if (isMobileMode) {
        // 手機版：focus 到手機版輸入框
        if (mobileElements && mobileElements.inputBox) {
          mobileElements.inputBox.elt.focus();
        } else if (inputBoxMobile) {
          inputBoxMobile.elt.focus();
        }
      } else {
        // 桌面版：focus 到桌面版輸入框
        if (inputBox) {
          inputBox.elt.focus();
        }
      }
    }, 100); // 100ms 延遲，確保屬性移除完成
  }, 6000);
}

// 禁用所有 UI 元素
function disableAllUI() {
  // 禁用輸入框
  if (inputBox) inputBox.attribute('disabled', '');
  if (inputBoxMobile) inputBoxMobile.attribute('disabled', '');

  // 禁用所有按鈕
  if (rotateButton) rotateButton.attribute('disabled', '');
  if (customButton) customButton.attribute('disabled', '');
  if (colormodeButton) colormodeButton.attribute('disabled', '');
  if (randomButton) randomButton.attribute('disabled', '');
  if (resetButton) resetButton.attribute('disabled', '');
  if (saveButton) saveButton.attribute('disabled', '');
  if (saveButtonMobile) saveButtonMobile.attribute('disabled', '');
  if (colorWheelPlayButton) colorWheelPlayButton.elt.setAttribute('disabled', '');

  // 禁用滑桿（使用陣列迴圈）
  sliders.forEach(slider => { if (slider) slider.attribute('disabled', ''); });
  mobileSliders.forEach(slider => { if (slider) slider.attribute('disabled', ''); });

  // 禁用手機版按鈕
  if (mobileRotateButton) mobileRotateButton.attribute('disabled', '');
  if (mobileCustomButton) mobileCustomButton.attribute('disabled', '');
  if (mobileRandomButton) mobileRandomButton.attribute('disabled', '');
  if (mobileResetButton) mobileResetButton.attribute('disabled', '');
}

// 恢復所有 UI 元素
function enableAllUI() {
  // 恢復輸入框
  if (inputBox) inputBox.removeAttribute('disabled');
  if (inputBoxMobile) inputBoxMobile.removeAttribute('disabled');

  // 恢復按鈕（根據當前狀態）
  if (letters.length > 0 && !isEasterEggActive) {
    if (rotateButton) rotateButton.removeAttribute('disabled');
    if (customButton) customButton.removeAttribute('disabled');
    if (randomButton) randomButton.removeAttribute('disabled');
    if (resetButton) resetButton.removeAttribute('disabled');
    if (mobileRotateButton) mobileRotateButton.removeAttribute('disabled');
    if (mobileCustomButton) mobileCustomButton.removeAttribute('disabled');
    if (mobileRandomButton) mobileRandomButton.removeAttribute('disabled');
    if (mobileResetButton) mobileResetButton.removeAttribute('disabled');
  }

  if (colormodeButton) colormodeButton.removeAttribute('disabled');
  if (saveButton) saveButton.removeAttribute('disabled');
  if (saveButtonMobile) saveButtonMobile.removeAttribute('disabled');
  if (colorWheelPlayButton) colorWheelPlayButton.elt.removeAttribute('disabled');

  // 恢復滑桿（使用陣列迴圈）
  if (!isAutoRotateMode && !isEasterEggActive && letters.length > 0) {
    sliders.forEach(slider => { if (slider) slider.removeAttribute('disabled'); });
    mobileSliders.forEach(slider => { if (slider) slider.removeAttribute('disabled'); });
  }
}

// 更新新彩蛋動畫狀態（在 draw() 中調用）
function updateSpecialEasterEggAnimation() {
  if (!specialEasterEggAnimating) return;

  let elapsed = millis() - specialEasterEggStartTime;

  // 階段 1: 0-2000ms，旋轉 3 圈加上隨機角度，同時放大和 fade in
  if (elapsed < 2000) {
    let progress = elapsed / 2000;
    // 使用 easeOutCubic 緩動函數（開始快，結束慢）
    let eased = 1 - pow(1 - progress, 3);
    // 直接旋轉到目標角度（3圈 + 隨機角度）
    specialEasterEggRotation = eased * (1080 + specialEasterEggTargetAngle);
    specialEasterEggAlpha = 255; // 立即顯示
    specialEasterEggScale = eased; // 從 0 放大到 1（使用相同的 easeOut 曲線）
  }
  // 階段 2: 2000-4000ms，保持在隨機角度
  else if (elapsed < 4000) {
    // 保持在目標角度不動
    specialEasterEggRotation = 1080 + specialEasterEggTargetAngle;
    specialEasterEggAlpha = 255;
    specialEasterEggScale = 1; // 保持完整大小
  }
  // 階段 3: 4000-6000ms，fade out
  else if (elapsed < 6000) {
    let progress = (elapsed - 4000) / 2000;
    specialEasterEggRotation = 1080 + specialEasterEggTargetAngle; // 保持在目標角度
    specialEasterEggAlpha = lerp(255, 0, progress);
    specialEasterEggScale = 1; // 保持完整大小
  }
}

// --- 創建新彩蛋圖片的 DOM 容器 ---
let specialEasterEggContainer = null;
let specialEasterEggOverlay = null; // 半透明背景圖層
let specialEasterEggImgElement = null;

function createSpecialEasterEggContainer() {
  // 創建一個覆蓋整個視窗的容器
  specialEasterEggContainer = document.createElement('div');
  specialEasterEggContainer.id = 'special-easter-egg-container';
  specialEasterEggContainer.style.position = 'fixed';
  specialEasterEggContainer.style.top = '0';
  specialEasterEggContainer.style.left = '0';
  specialEasterEggContainer.style.width = '100vw';
  // 使用 window.innerHeight 而非 100vh，確保在移動設備上正確居中（避免地址欄影響）
  specialEasterEggContainer.style.height = `${window.innerHeight}px`;
  specialEasterEggContainer.style.display = 'none'; // 預設隱藏
  specialEasterEggContainer.style.justifyContent = 'center';
  specialEasterEggContainer.style.alignItems = 'center';
  specialEasterEggContainer.style.zIndex = '9999'; // 確保在最上層
  specialEasterEggContainer.style.pointerEvents = 'none'; // 預設不阻擋事件，顯示時會改為 auto

  // 監聽視窗大小變化，動態更新容器高度（處理地址欄顯示/隱藏、螢幕旋轉等情況）
  const updateContainerHeight = () => {
    if (specialEasterEggContainer) {
      specialEasterEggContainer.style.height = `${window.innerHeight}px`;
    }
  };
  window.addEventListener('resize', updateContainerHeight);
  window.addEventListener('orientationchange', updateContainerHeight);

  // 創建半透明背景圖層（用於阻擋互動和提供視覺焦點）
  specialEasterEggOverlay = document.createElement('div');
  specialEasterEggOverlay.style.position = 'absolute';
  specialEasterEggOverlay.style.top = '0';
  specialEasterEggOverlay.style.left = '0';
  specialEasterEggOverlay.style.width = '100%';
  specialEasterEggOverlay.style.height = '100%';
  specialEasterEggOverlay.style.opacity = '0';
  specialEasterEggOverlay.style.transition = 'none'; // 由 JS 控制動畫
  specialEasterEggOverlay.style.pointerEvents = 'auto'; // 阻擋所有點擊事件
  specialEasterEggContainer.appendChild(specialEasterEggOverlay);

  // 創建圖片元素
  specialEasterEggImgElement = document.createElement('img');
  // 根據裝置類型設定不同大小
  if (isMobileMode) {
    specialEasterEggImgElement.style.width = '55vw'; // 手機版：35vw
    specialEasterEggImgElement.style.maxWidth = 'none'; // 手機版不限制最大寬度
  } else {
    specialEasterEggImgElement.style.width = '27.1vw'; // 桌面版：27.1vw
    specialEasterEggImgElement.style.maxWidth = '361px'; // 桌面版最大寬度 361px
  }
  specialEasterEggImgElement.style.height = 'auto'; // 高度自動，保持圖片比例
  specialEasterEggImgElement.style.objectFit = 'contain'; // 保持比例，不壓縮
  specialEasterEggImgElement.style.opacity = '0';
  specialEasterEggImgElement.style.transform = 'rotate(0deg) scale(0)'; // 初始縮放為 0
  specialEasterEggImgElement.style.transition = 'none'; // 由 JS 控制動畫，不使用 CSS transition
  specialEasterEggImgElement.style.position = 'relative'; // 確保圖片在背景層之上
  specialEasterEggImgElement.style.zIndex = '1';
  specialEasterEggContainer.appendChild(specialEasterEggImgElement);

  document.body.appendChild(specialEasterEggContainer);
}

// --- 更新新彩蛋圖片的顯示狀態 ---
function updateSpecialEasterEggDisplay() {
  if (!specialEasterEggContainer || !specialEasterEggImgElement || !specialEasterEggOverlay) return;

  if (specialEasterEggAnimating && specialEasterEggAlpha > 0) {
    // 顯示容器
    specialEasterEggContainer.style.display = 'flex';
    specialEasterEggContainer.style.pointerEvents = 'auto'; // 啟用事件阻擋

    // 根據當前模式設定背景圖層顏色
    let overlayColor;
    if (mode === "Inverse") {
      // Inverse 模式：黑色半透明
      overlayColor = 'rgba(0, 0, 0, 0.7)';
    } else if (mode === "Wireframe") {
      // Wireframe 模式：根據邊框顏色決定 overlay 顏色（與邊框相反）
      // 黑色邊框（深色背景）→ 白色 overlay
      // 白色邊框（淺色背景）→ 黑色 overlay
      const isWhiteBorder = wireframeStrokeColor && red(wireframeStrokeColor) > 128;
      overlayColor = isWhiteBorder ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)';
    } else {
      // Standard 模式：白色半透明
      overlayColor = 'rgba(255, 255, 255, 0.7)';
    }
    specialEasterEggOverlay.style.backgroundColor = overlayColor;

    // 背景圖層的透明度跟隨圖片透明度
    const overlayOpacity = (specialEasterEggAlpha / 255).toFixed(3);
    specialEasterEggOverlay.style.opacity = overlayOpacity;

    // 設定圖片來源
    if (specialEasterEggImgElement.src === '' || specialEasterEggImgElement.dataset.type !== specialEasterEggType) {
      const imgSrc = (specialEasterEggType === "COOLGUY") ? 'Easter Egg/Rex.png' : 'Easter Egg/KC.png';
      specialEasterEggImgElement.src = imgSrc;
      specialEasterEggImgElement.dataset.type = specialEasterEggType;
    }

    // 更新透明度、旋轉角度和縮放比例
    specialEasterEggImgElement.style.opacity = (specialEasterEggAlpha / 255).toFixed(3);
    specialEasterEggImgElement.style.transform = `rotate(${specialEasterEggRotation}deg) scale(${specialEasterEggScale})`;
  } else {
    // 隱藏容器
    specialEasterEggContainer.style.display = 'none';
    specialEasterEggContainer.style.pointerEvents = 'none'; // 停用事件阻擋
    specialEasterEggImgElement.src = '';
    specialEasterEggImgElement.dataset.type = '';
    specialEasterEggOverlay.style.opacity = '0';
  }
}

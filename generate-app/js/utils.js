// ====================================
// 工具函數模塊
// ====================================

// ====================================
// 輔助函數：狀態檢查
// ====================================

// 檢查是否有文字輸入
function hasText() {
  return letters && letters.length > 0;
}

// 檢查是否可以進行旋轉控制（有文字且非彩蛋模式）
function canControlRotation() {
  return hasText() && !isEasterEggActive;
}

// 檢查是否可以使用 Custom 模式（有文字、非彩蛋、非自動旋轉）
function canUseCustomMode() {
  return canControlRotation() && !isAutoRotateMode;
}

// ====================================
// 輔助函數：顏色和圖標
// ====================================

// 獲取禁用顏色（統一使用黑色25%不透明度）
function getDisabledColor() {
  return 'rgba(0, 0, 0, 0.25)'; // 黑色25%不透明度
}

// 獲取圖標後綴（根據模式決定黑色或白色版本）
function getIconSuffix(useTargetMode = false) {
  const currentMode = useTargetMode && typeof targetMode !== 'undefined' ? targetMode : mode;

  if (currentMode === "Wireframe") {
    const isWhiteIcon = wireframeStrokeColor && red(wireframeStrokeColor) > 128;
    return isWhiteIcon ? "_Inverse" : "";
  }
  return currentMode === "Inverse" ? "_Inverse" : "";
}

// 檢測手機模式
function checkMobileMode() {
  // 使用 matchMedia API 與CSS媒體查詢保持同步
  const mediaQuery = window.matchMedia('(max-width: 768px)');
  isMobileMode = mediaQuery.matches;
}

// 計算Canvas尺寸
function getCanvasSize() {
  if (isMobileMode) {
    // 手機版：根據 mobile-logo-container 的可用空間，計算最佳 canvas 尺寸
    // Logo 的理想比例是 1:1.05 (寬:高)
    const LOGO_ASPECT_RATIO = 1.05; // 高度 = 寬度 × 1.05

    const logoContainer = document.querySelector('.mobile-logo-container');
    if (logoContainer) {
      const rect = logoContainer.getBoundingClientRect();
      const availableWidth = rect.width;
      const availableHeight = rect.height;

      // 根據可用空間和 logo 比例，計算最大可能的 canvas 尺寸
      // 情況1: 寬度是限制因素（容器較窄）
      const widthBasedHeight = availableWidth * LOGO_ASPECT_RATIO;

      // 情況2: 高度是限制因素（容器較矮）
      const heightBasedWidth = availableHeight / LOGO_ASPECT_RATIO;

      let canvasWidth, canvasHeight;

      if (widthBasedHeight <= availableHeight) {
        // 寬度是瓶頸，使用全部寬度
        canvasWidth = availableWidth;
        canvasHeight = widthBasedHeight;
      } else {
        // 高度是瓶頸，使用全部高度
        canvasWidth = heightBasedWidth;
        canvasHeight = availableHeight;
      }

      return {
        width: Math.floor(canvasWidth),
        height: Math.floor(canvasHeight)
      };
    }

    // 如果無法取得 container，使用預設計算
    let availableWidth = window.innerWidth - 48; // 扣除左右 padding (1.5rem * 2 = 3rem = 48px)

    return {
      width: Math.floor(availableWidth),
      height: Math.floor(availableWidth * LOGO_ASPECT_RATIO)
    };
  } else {
    // 桌面版：固定尺寸 432x540，與 canvas-container 一致
    return {
      width: 432,
      height: 540
    };
  }
}

// 更新旋轉圖標（根據當前狀態）
function updateRotateIcon() {
  // 防禦性檢查：確保必要的變數已定義
  if (typeof letters === 'undefined' || typeof mode === 'undefined') {
    return;
  }

  const hasText = letters.length > 0;
  const suffix = getIconSuffix(true); // 使用 targetMode

  // 確保變數有定義
  const autoRotateMode = (typeof isAutoRotateMode !== 'undefined') ? isAutoRotateMode : false;
  const isRotating = (typeof autoRotate !== 'undefined') ? autoRotate : false;

  // 桌面版：使用 Auto/Custom 模式邏輯
  let desktopIconSrc = '';
  let desktopIsPlayIcon = false;

  if (!hasText) {
    // 沒有文字時：顯示 Rotate icon（disabled 狀態）
    desktopIconSrc = `Panel Icon/Rotate${suffix}.svg`;
  } else if (autoRotateMode) {
    // 有文字且在 Auto Rotate 模式
    if (isRotating) {
      // 正在自動旋轉：顯示 Pause icon
      desktopIconSrc = `Panel Icon/Pause${suffix}.svg`;
    } else {
      // Auto 模式但暫停：顯示 Play icon
      desktopIconSrc = `Panel Icon/Play${suffix}.svg`;
      desktopIsPlayIcon = true;
    }
  } else {
    // 有文字且在 Custom 模式：顯示 Rotate icon（disabled 狀態）
    desktopIconSrc = `Panel Icon/Rotate${suffix}.svg`;
  }

  // 手機版：使用與桌面版相同的 Auto/Custom 模式邏輯
  let mobileIconSrc = desktopIconSrc;
  let mobileIsPlayIcon = desktopIsPlayIcon;

  // 更新桌面版 icon
  if (rotateIcon) {
    rotateIcon.attribute('src', desktopIconSrc);
    // 添加或移除 play-icon class
    let rotateButton = select('.custom-button-rotate');
    if (rotateButton) {
      if (desktopIsPlayIcon) {
        rotateButton.addClass('play-icon');
      } else {
        rotateButton.removeClass('play-icon');
      }
    }
  }

  // 更新手機版 icon
  if (mobileRotateIcon) {
    mobileRotateIcon.attribute('src', mobileIconSrc);
    // 添加或移除 play-icon class（手機版）
    let mobileRotateButton = select('.mobile-rotate-btn');
    if (mobileRotateButton) {
      if (mobileIsPlayIcon) {
        mobileRotateButton.addClass('play-icon');
      } else {
        mobileRotateButton.removeClass('play-icon');
      }
    }
  }
}

// 更新所有圖標根據當前模式
function updateIconsForMode() {
  const isWireframeMode = targetMode === "Wireframe";
  const suffix = getIconSuffix(true); // 使用 targetMode

  // Colormode 圖標
  const colormodeIconSrc = getModeIconSrc();

  // Custom 圖標 - 統一使用當前模式的 icon，CSS 會根據 disabled 狀態調整 opacity
  const customIconSrc = `Panel Icon/Custom${suffix}.svg`;

  // Download 圖標 - 彩蛋模式下使用 Gift icon，否則使用 Download icon
  const downloadIconSrc = isEasterEggActive
    ? `Panel Icon/Gift${suffix}.svg`
    : `Panel Icon/Download${suffix}.svg`;

  // Random 和 Reset 圖標 - 統一使用當前模式的 icon
  const randomIconSrc = `Panel Icon/Random${suffix}.svg`;
  const resetIconSrc = `Panel Icon/Reset${suffix}.svg`;

  // 更新桌面版圖標
  if (customIcon) customIcon.attribute('src', customIconSrc);
  if (colormodeIcon) colormodeIcon.attribute('src', colormodeIconSrc);
  if (randomImg) randomImg.attribute('src', randomIconSrc);
  if (resetImg) resetImg.attribute('src', resetIconSrc);
  // 只在下載動畫未執行時更新下載按鈕icon（避免干擾動畫）
  if (saveImg && !isDownloading) saveImg.attribute('src', downloadIconSrc);

  // 更新手機版圖標
  if (mobileCustomIcon) mobileCustomIcon.attribute('src', customIconSrc);
  if (mobileRandomImg) mobileRandomImg.attribute('src', randomIconSrc);
  if (mobileResetImg) mobileResetImg.attribute('src', resetIconSrc);
  // 只在下載動畫未執行時更新下載按鈕icon（避免干擾動畫）
  if (saveImgMobile && !isDownloading) saveImgMobile.attribute('src', downloadIconSrc);

  // 更新 Rotate 圖標
  updateRotateIcon();

  // 更新 Color Wheel Play/Pause 圖標
  updateColorWheelIcon();

  // 更新手機版 Mode 按鈕圖標
  updateMobileModeIcon();

  // 更新橫向提示的 Rotate Phone 圖標
  const landscapeIcon = document.getElementById('landscape-overlay-icon');
  if (landscapeIcon) {
    const rotatePhoneIconSrc = `Panel Icon/Rotate_Phone${suffix}.svg`;
    landscapeIcon.src = rotatePhoneIconSrc;
  }

  // 更新手機版按鈕和面板的邊框顏色
  const borderColor = isWireframeMode ? getWireframeBorderColor() : null;
  const mobileElements = [
    ...selectAll('.mobile-bottom-btn'),
    ...selectAll('.mobile-panel'),
    select('.mobile-bento-container'),
    ...selectAll('.mobile-bento-button')
  ];
  updateElementsBorderColor(mobileElements, borderColor);
}

// 更新 Color Wheel Play/Pause 圖標
function updateColorWheelIcon() {
  const suffix = getIconSuffix();

  // 根據旋轉狀態選擇 Play 或 Pause icon
  let iconSrc = isColorWheelRotating
    ? `Panel Icon/Pause${suffix}.svg`
    : `Panel Icon/Play${suffix}.svg`;

  // 更新桌面版 icon
  if (colorWheelPlayIcon && colorWheelPlayButton) {
    colorWheelPlayIcon.attribute('src', iconSrc);

    // 添加或移除 is-play class（Play 狀態向右移 1px）
    if (isColorWheelRotating) {
      colorWheelPlayButton.removeClass('is-play');
    } else {
      colorWheelPlayButton.addClass('is-play');
    }
  }

  // 更新手機版 Color Wheel Play icon
  const mobileColorWheelPlayIcon = select('#mobile-colorwheel-play-icon');
  if (mobileColorWheelPlayIcon) {
    mobileColorWheelPlayIcon.attribute('src', iconSrc);
  }
}

// 獲取模式圖標路徑
function getModeIconSrc() {
  const isWireframeMode = mode === "Wireframe";

  if (isWireframeMode) {
    const isWhiteIcon = wireframeStrokeColor && red(wireframeStrokeColor) > 128;
    return isWhiteIcon ? `Panel Icon/Inverse_Wireframe.svg` : `Panel Icon/Standard_Wireframe.svg`;
  }

  return mode === "Inverse" ? `Panel Icon/Inverse_White.svg` : `Panel Icon/Standard.svg`;
}

// 獲取邊框顏色（Wireframe 模式專用）
function getWireframeBorderColor() {
  if (!wireframeStrokeColor) return null;
  return `rgb(${red(wireframeStrokeColor)}, ${green(wireframeStrokeColor)}, ${blue(wireframeStrokeColor)})`;
}

// 更新元素邊框顏色（Wireframe 模式）
function updateElementsBorderColor(elements, borderColor) {
  if (borderColor) {
    elements.forEach(el => {
      if (el) {
        el.style('border-color', borderColor);
        // 某些元素還需要更新文字顏色
        if (el.hasClass('mobile-bottom-btn') || el.hasClass('mobile-panel')) {
          el.style('color', borderColor);
        }
      }
    });
  } else {
    // 清除 inline style，讓 CSS 規則生效
    elements.forEach(el => {
      if (el) {
        el.style('border-color', '');
        el.style('color', '');
      }
    });
  }
}

// 更新手機版 Mode 按鈕圖標
function updateMobileModeIcon() {
  let mobileModeIcon = select("#mobile-mode-icon");
  if (!mobileModeIcon) return;

  mobileModeIcon.attribute('src', getModeIconSrc());
}

// 更新手機版輸入框的垂直置中
function updateMobileInputBoxVerticalAlignment(inputBox, text) {
  if (!isMobileMode || !mobileHiddenMeasurer || !inputBox) {
    return;
  }

  // 檢查是否有 custom-open class（Wireframe + Custom 最滿狀態）
  if (inputBox.elt.classList.contains('custom-open')) {
    inputBox.style('padding-top', '0');
    inputBox.style('padding-bottom', '0');
    return;
  }

  // 檢查是否處於鍵盤激活狀態（單行模式，高度受限）
  const inputArea = document.querySelector('.mobile-input-area');
  if (inputArea && inputArea.classList.contains('keyboard-active')) {
    inputBox.style('padding-top', '0');
    inputBox.style('padding-bottom', '0');
    return;
  }

  // 彩蛋模式現在也使用相同的垂直置中邏輯（SCCD 單行、全稱兩行都在 3 行容器中垂直置中）
  // 移除了彩蛋模式的特殊處理，讓它走正常的計算流程

  // 如果沒有文字，設置 padding 讓 placeholder 垂直居中
  if (!text || text.trim() === '') {
    // Placeholder 是一行文字 "TYPE AND ENTER"，需要垂直居中
    const containerHeight = inputBox.elt.offsetHeight;
    const currentFontSize = parseFloat(window.getComputedStyle(inputBox.elt).fontSize);
    const lineHeight = currentFontSize * 1.2; // line-height: 1.2

    // Placeholder 只有一行，計算一行的總高度
    const placeholderHeight = lineHeight * 1;
    // 使用 Math.round 取整，避免 subpixel 差異導致模式切換時位置偏移
    const paddingTop = Math.round(Math.max(0, (containerHeight - placeholderHeight) / 2));

    inputBox.style('padding-top', `${paddingTop}px`);
    inputBox.style('padding-bottom', '0');
    return;
  }

  // 檢查是否需要跳過重新計算（避免 Standard/Inverse 切換時文字跳動）
  // 如果輸入框已經有 padding-top，且文字內容和字體大小都沒有改變，則跳過
  const currentPaddingTop = parseFloat(inputBox.elt.style.paddingTop) || 0;
  const currentFontSize = window.getComputedStyle(inputBox.elt).fontSize;

  // 儲存上次的文字和字體大小
  if (typeof updateMobileInputBoxVerticalAlignment.lastText === 'undefined') {
    updateMobileInputBoxVerticalAlignment.lastText = '';
    updateMobileInputBoxVerticalAlignment.lastFontSize = '';
  }

  const textChanged = text !== updateMobileInputBoxVerticalAlignment.lastText;
  const fontSizeChanged = currentFontSize !== updateMobileInputBoxVerticalAlignment.lastFontSize;

  // 如果文字和字體大小都沒變，且已經有 padding，則跳過重新計算
  if (!textChanged && !fontSizeChanged && currentPaddingTop > 0) {
    return;
  }

  // 等待兩幀確保字體大小已經更新（第一幀更新 class，第二幀計算）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // 同步 hidden measurer 的字體大小（因為 small-text class 可能剛被加上/移除）
      const currentFontSize = window.getComputedStyle(inputBox.elt).fontSize;
      const lineHeight = parseFloat(currentFontSize) * 1.2;
      mobileHiddenMeasurer.style('font-size', currentFontSize);
      mobileHiddenMeasurer.style('line-height', '1.2');
      mobileHiddenMeasurer.style('width', inputBox.style('width'));

      // 設置 measurer 的內容（將換行轉為 <br>）
      const htmlContent = text.replace(/\n/g, '<br>');
      mobileHiddenMeasurer.html(htmlContent);

      // 獲取輸入框的固定高度和實際文字高度
      const containerHeight = inputBox.elt.offsetHeight;
      const textHeight = mobileHiddenMeasurer.elt.scrollHeight;

      // 計算文字行數（基於實際測量的高度）
      const estimatedLines = Math.round(textHeight / lineHeight);

      // 規則：
      // - 如果是三行文字，靠上對齊（padding-top: 0），確保三行都可見
      // - 如果是一行或兩行，垂直居中
      let paddingTop;
      if (estimatedLines >= 3) {
        // 三行文字：靠上對齊，避免第三行被切到
        paddingTop = 0;
        // 同時將 mobile-input-area 的對齊方式改為靠上（覆蓋 CSS 的 align-items: center）
        if (inputArea) {
          inputArea.style.alignItems = 'flex-start';
        }
      } else {
        // 一行或兩行：垂直居中
        // 使用 Math.round 取整，避免 subpixel 差異導致模式切換時位置偏移
        paddingTop = Math.round(Math.max(0, (containerHeight - textHeight) / 2));
        // 恢復 mobile-input-area 的垂直居中對齊
        if (inputArea) {
          inputArea.style.alignItems = 'center';
        }
      }

      // 應用 padding（只設置 top，讓文字自然從上往下排列）
      inputBox.style('padding-top', `${paddingTop}px`);
      inputBox.style('padding-bottom', '0');

      // 更新記錄
      updateMobileInputBoxVerticalAlignment.lastText = text;
      updateMobileInputBoxVerticalAlignment.lastFontSize = currentFontSize;
    });
  });
}

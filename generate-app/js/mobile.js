// ====================================
// 手機版專用邏輯
// ====================================
// 此文件只在手機模式下運行，與桌面版邏輯互通但 UI 獨立

// ====================================
// 統一的 Canvas Resize 處理機制
// ====================================
let pendingCanvasResize = false; // 標記是否有待處理的 resize
let resizeTransitionListener = null; // transitionend 監聽器引用
let lastResizeTime = 0; // 上次 resize 的時間戳
let resizeDebounceTimer = null; // 防抖計時器

/**
 * 請求 canvas resize（統一入口）
 * @param {boolean} immediate - 是否立即執行（跳過 transition 等待）
 * 使用 transitionend 事件確保在 CSS transition 結束後才執行
 */
function requestCanvasResize(immediate = false) {
  if (!isMobileMode || typeof resizeMobileCanvas !== 'function') return;

  const now = Date.now();
  const timeSinceLastResize = now - lastResizeTime;

  // 防抖：如果距離上次 resize 不到 300ms，延遲執行（即使 immediate=true）
  // 這可以避免在輸入文字時觸發 windowResized 導致抖動
  if (timeSinceLastResize < 300) {
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
    }
    resizeDebounceTimer = setTimeout(() => {
      requestCanvasResize(immediate);
    }, 300 - timeSinceLastResize); // 等待剩餘時間
    return;
  }

  const logoContainer = document.querySelector('.mobile-logo-container');
  if (!logoContainer || immediate) {
    // 如果沒有 logo container 或要求立即執行，直接執行 resize
    lastResizeTime = Date.now();
    resizeMobileCanvas();
    return;
  }

  // 標記有待處理的 resize
  pendingCanvasResize = true;

  // 移除舊的監聽器（避免重複）
  if (resizeTransitionListener) {
    logoContainer.removeEventListener('transitionend', resizeTransitionListener);
  }

  // 建立新的監聽器
  resizeTransitionListener = (event) => {
    // 只處理 width 的 transition（避免被其他屬性的 transition 觸發）
    if (event.propertyName === 'width' && pendingCanvasResize) {
      pendingCanvasResize = false;
      lastResizeTime = Date.now();
      resizeMobileCanvas();
      logoContainer.removeEventListener('transitionend', resizeTransitionListener);
      resizeTransitionListener = null;
    }
  };

  logoContainer.addEventListener('transitionend', resizeTransitionListener);

  // 保險機制：如果 500ms 後 transitionend 還沒觸發，強制執行
  setTimeout(() => {
    if (pendingCanvasResize) {
      pendingCanvasResize = false;
      lastResizeTime = Date.now();
      resizeMobileCanvas();
      if (resizeTransitionListener) {
        logoContainer.removeEventListener('transitionend', resizeTransitionListener);
        resizeTransitionListener = null;
      }
    }
  }, 500);
}

// 手機版 DOM 元素
let mobileElements = {
  // 底部按鈕列
  inputBtn: null,
  modeBtn: null,
  customBtn: null,
  rotateBtn: null,
  saveBtn: null,

  // 彈出面板
  inputPanel: null,
  colorpickerPanel: null,
  rotatePanel: null,

  // 輸入框
  inputBox: null,

  // Mode 圖標
  modeIcon: null,

  // Rotate 面板內的元素
  bentoCustomBtn: null,
  bentoPlayBtn: null,
  bentoCustomIcon: null,
  bentoPlayIcon: null,

  // Sliders (桌面版)
  rSlider: null,
  gSlider: null,
  bSlider: null,
  rAngleLabel: null,
  gAngleLabel: null,
  bAngleLabel: null,

  // 手機版 Custom 調整區
  customAngleControls: null,
  mobileRSlider: null,
  mobileGSlider: null,
  mobileBSlider: null,
  mobileRAngleLabel: null,
  mobileGAngleLabel: null,
  mobileBAngleLabel: null,
  mobileRandomBtn: null,
  mobileResetBtn: null,
  mobileRandomImg: null,
  mobileResetImg: null,

  // Random/Reset 按鈕
  randomBtn: null,
  resetBtn: null,
  randomIcon: null,
  resetIcon: null,

  // Color Picker (桌面版)
  colorpickerContainer: null,
  colorWheelPlayBtn: null,
  colorWheelPlayIcon: null,

  // 手機版 Color Picker Bar
  mobileColorpickerBar: null,
  mobileColorpickerContainer: null,
  mobileColorWheelPlayBtn: null,
  mobileColorWheelPlayIcon: null
};

// 初始化手機版 UI
function initMobileUI() {
  if (!isMobileMode) return;

  // 選取所有元素
  mobileElements.inputBtn = select('.mobile-input-btn');
  mobileElements.modeBtn = select('.mobile-mode-btn');
  mobileElements.customBtn = select('.mobile-custom-btn');
  mobileElements.rotateBtn = select('.mobile-rotate-btn');
  mobileElements.saveBtn = select('.mobile-save-btn');

  mobileElements.inputPanel = select('.mobile-input-panel');
  mobileElements.colorpickerPanel = select('.mobile-colorpicker-panel');
  mobileElements.rotatePanel = select('.mobile-rotate-panel');

  mobileElements.inputBox = select('#mobile-input-box');
  mobileElements.modeIcon = select('#mobile-mode-icon');

  // 創建隱藏的 div 用於測量文字高度（用於垂直置中）
  if (mobileElements.inputBox) {
    mobileHiddenMeasurer = createDiv('');
    mobileHiddenMeasurer.style('visibility', 'hidden');
    mobileHiddenMeasurer.style('position', 'absolute');
    mobileHiddenMeasurer.style('top', '-9999px');
    mobileHiddenMeasurer.style('left', '-9999px');
    mobileHiddenMeasurer.style('width', mobileElements.inputBox.style('width'));
    mobileHiddenMeasurer.style('font-family', mobileElements.inputBox.style('font-family'));
    mobileHiddenMeasurer.style('font-weight', mobileElements.inputBox.style('font-weight'));
    mobileHiddenMeasurer.style('font-size', mobileElements.inputBox.style('font-size'));
    mobileHiddenMeasurer.style('line-height', mobileElements.inputBox.style('line-height'));
    mobileHiddenMeasurer.style('white-space', 'pre-wrap');
    mobileHiddenMeasurer.style('word-wrap', 'break-word');
    mobileHiddenMeasurer.style('box-sizing', 'border-box');
  }

  mobileElements.bentoCustomBtn = select('.mobile-custom-button');
  mobileElements.bentoPlayBtn = select('.mobile-play-button');
  mobileElements.bentoCustomIcon = select('#mobile-custom-icon');
  mobileElements.bentoPlayIcon = select('#mobile-rotate-icon');

  mobileElements.rSlider = select('.mobile-r-slider');
  mobileElements.gSlider = select('.mobile-g-slider');
  mobileElements.bSlider = select('.mobile-b-slider');
  mobileElements.rAngleLabel = select('.mobile-r-angle-label');
  mobileElements.gAngleLabel = select('.mobile-g-angle-label');
  mobileElements.bAngleLabel = select('.mobile-b-angle-label');

  mobileElements.randomBtn = select('.mobile-random-button');
  mobileElements.resetBtn = select('.mobile-reset-button');
  mobileElements.randomIcon = select('.mobile-random-img');
  mobileElements.resetIcon = select('.mobile-reset-img');

  mobileElements.colorpickerContainer = select('#mobile-colorpicker-container');
  mobileElements.colorWheelPlayBtn = select('#mobile-colorwheel-play-button');
  mobileElements.colorWheelPlayIcon = select('#mobile-colorwheel-play-icon');

  // 手機版 Color Picker Bar 元素
  mobileElements.mobileColorpickerBar = select('.mobile-colorpicker-bar');
  mobileElements.mobileColorpickerContainer = select('#mobile-colorpicker-container');
  mobileElements.mobileColorWheelPlayBtn = select('#mobile-colorwheel-play-button');
  mobileElements.mobileColorWheelPlayIcon = select('#mobile-colorwheel-play-icon');

  // 手機版 Custom 調整區元素
  mobileElements.customAngleControls = select('.mobile-custom-angle-controls');
  mobileElements.mobileRSlider = select('#mobile-r-slider');
  mobileElements.mobileGSlider = select('#mobile-g-slider');
  mobileElements.mobileBSlider = select('#mobile-b-slider');
  mobileElements.mobileRAngleLabel = select('#mobile-r-angle-label');
  mobileElements.mobileGAngleLabel = select('#mobile-g-angle-label');
  mobileElements.mobileBAngleLabel = select('#mobile-b-angle-label');
  mobileElements.mobileRandomBtn = select('#mobile-random-button');
  mobileElements.mobileResetBtn = select('#mobile-reset-button');
  mobileElements.mobileRandomImg = select('#mobile-random-img');
  mobileElements.mobileResetImg = select('#mobile-reset-img');

  // 綁定事件
  bindMobileEvents();

  // 初始化 placeholder 的垂直置中
  if (mobileElements.inputBox) {
    updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, '');
  }

  console.log('手機版 UI 初始化完成');
}

// 綁定手機版事件
function bindMobileEvents() {
  // 輸入框事件
  if (mobileElements.inputBox) {
    mobileElements.inputBox.input(handleInput);

    // 阻擋空白鍵和 Enter 換行
    mobileElements.inputBox.elt.addEventListener('keydown', function(e) {
      // 阻擋空白鍵
      if (e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
      }
      // 阻擋 Enter 換行
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
      }
    });

    // 防止鍵盤彈出時自動滾動
    mobileElements.inputBox.elt.addEventListener('focus', function(e) {
      // 使用 scrollIntoView 防止自動滾動行為
      setTimeout(() => {
        mobileElements.inputBox.elt.scrollIntoView({
          behavior: 'instant',
          block: 'nearest',
          inline: 'nearest'
        });
      }, 0);
    }, { passive: true });
  }

  // 底部按鈕事件
  if (mobileElements.inputBtn) {
    mobileElements.inputBtn.mousePressed(toggleInputPanel);
  }

  if (mobileElements.modeBtn) {
    mobileElements.modeBtn.mousePressed(cycleModeButton);
  }

  if (mobileElements.customBtn) {
    mobileElements.customBtn.mousePressed(toggleMobileCustomPanel);
  }

  if (mobileElements.rotateBtn) {
    mobileElements.rotateBtn.mousePressed(toggleAutoRotate);
  }

  if (mobileElements.saveBtn) {
    mobileElements.saveBtn.mousePressed(() => {
      if (letters.length > 0 || isEasterEggActive) {
        saveTransparentPNG();
      }
    });
  }

  // Bento 面板按鈕事件
  if (mobileElements.bentoCustomBtn) {
    mobileElements.bentoCustomBtn.mousePressed(switchToCustomMode);
  }

  if (mobileElements.bentoPlayBtn) {
    mobileElements.bentoPlayBtn.mousePressed(toggleAutoRotate);
  }

  // Slider 事件
  if (mobileElements.rSlider) {
    mobileElements.rSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('r', mobileElements.rSlider.value());
      }
    });
  }

  if (mobileElements.gSlider) {
    mobileElements.gSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('g', mobileElements.gSlider.value());
      }
    });
  }

  if (mobileElements.bSlider) {
    mobileElements.bSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('b', mobileElements.bSlider.value());
      }
    });
  }

  // Random/Reset 按鈕
  if (mobileElements.randomBtn) {
    mobileElements.randomBtn.mousePressed(handleRandomButton);
  }

  if (mobileElements.resetBtn) {
    mobileElements.resetBtn.mousePressed(handleResetButton);
  }

  // 手機版 Color Wheel Play 按鈕
  if (mobileElements.mobileColorWheelPlayBtn) {
    mobileElements.mobileColorWheelPlayBtn.mousePressed(() => {
      if (mode === "Wireframe") {
        isColorWheelRotating = !isColorWheelRotating;
        updateColorWheelIcon();
      }
    });
  }

  // 手機版 Custom 調整區的 Slider 事件
  if (mobileElements.mobileRSlider) {
    mobileElements.mobileRSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('r', mobileElements.mobileRSlider.value());
      }
    });
  }

  if (mobileElements.mobileGSlider) {
    mobileElements.mobileGSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('g', mobileElements.mobileGSlider.value());
      }
    });
  }

  if (mobileElements.mobileBSlider) {
    mobileElements.mobileBSlider.input(() => {
      if (!isEasterEggActive && !autoRotate) {
        handleMobileSliderChange('b', mobileElements.mobileBSlider.value());
      }
    });
  }

  // 手機版 Random/Reset 按鈕
  if (mobileElements.mobileRandomBtn) {
    mobileElements.mobileRandomBtn.mousePressed(handleRandomButton);
  }

  if (mobileElements.mobileResetBtn) {
    mobileElements.mobileResetBtn.mousePressed(handleResetButton);
  }

  // Angle Label 事件（簡化版，只支援輸入數字）
  bindMobileAngleLabelEvents();
}

// 綁定角度輸入框事件
function bindMobileAngleLabelEvents() {
  const filterAngleInput = function(e) {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Home', 'End'];
    if (allowedKeys.includes(e.key)) return;
    if (!/^[0-9\-+]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  // 使用陣列迴圈設定事件監聽器
  const mobileAngleLabelElements = [
    { label: mobileElements.rAngleLabel, slider: mobileElements.rSlider, channel: 'r', index: 0 },
    { label: mobileElements.gAngleLabel, slider: mobileElements.gSlider, channel: 'g', index: 1 },
    { label: mobileElements.bAngleLabel, slider: mobileElements.bSlider, channel: 'b', index: 2 }
  ];

  mobileAngleLabelElements.forEach(({ label, slider, channel, index }) => {
    if (label) {
      label.elt.addEventListener('keydown', filterAngleInput);
      label.elt.addEventListener('input', function(e) {
        if (!isEasterEggActive && !autoRotate) {
          let angle = convertAngleInput(e.target.value);
          slider.value(angle);
          if (sliders[index]) sliders[index].value(angle);
          handleMobileSliderChange(channel, angle);
        }
      });
    }
  });
}

// 關閉所有面板
function closeAllMobilePanels() {
  if (mobileElements.inputPanel) mobileElements.inputPanel.removeClass('active');
  if (mobileElements.colorpickerPanel) mobileElements.colorpickerPanel.removeClass('active');
  if (mobileElements.rotatePanel) mobileElements.rotatePanel.removeClass('active');
}

// 切換 Input 面板
function toggleInputPanel() {
  if (mobileElements.inputPanel.hasClass('active')) {
    mobileElements.inputPanel.removeClass('active');
  } else {
    closeAllMobilePanels();
    mobileElements.inputPanel.addClass('active');
    // Focus 到輸入框
    if (mobileElements.inputBox) {
      setTimeout(() => {
        mobileElements.inputBox.elt.focus();
      }, 300);
    }
  }
}

// 切換 Rotate 面板
function toggleRotatePanel() {
  if (mobileElements.rotatePanel.hasClass('active')) {
    mobileElements.rotatePanel.removeClass('active');
  } else {
    closeAllMobilePanels();
    mobileElements.rotatePanel.addClass('active');
  }
}

// 循環切換模式（Mode 按鈕）
function cycleModeButton() {
  // 隨機旋轉 mode icon
  if (mobileElements.modeIcon) {
    animateModeIconRotation(mobileElements.modeIcon);
  }

  // 循環切換
  switch(targetMode) {
    case "Standard":
      targetMode = "Inverse";
      break;
    case "Inverse":
      targetMode = "Wireframe";
      break;
    case "Wireframe":
      targetMode = "Standard";
      break;
    default:
      targetMode = "Standard";
  }

  // 根據模式自動顯示/隱藏 Color Picker Bar
  const logoContainer = document.querySelector('.mobile-logo-container');
  const inputArea = document.querySelector('.mobile-input-area');

  if (mobileElements.mobileColorpickerBar) {
    if (targetMode === "Wireframe") {
      // 切換到 Wireframe 模式：顯示 Color Picker Bar
      mobileElements.mobileColorpickerBar.removeClass('hidden');

      // 為 logo 和 input-area 添加 has-colorpicker 類
      if (logoContainer) logoContainer.classList.add('has-colorpicker');
      if (inputArea) inputArea.classList.add('has-colorpicker');

      // 檢查是否需要調整輸入框（可能進入最滿狀態）
      setTimeout(() => checkInputOverflow(), 50);

      // 重新調整 canvas 尺寸（因為 logo-container 縮小了）
      requestCanvasResize();
    } else {
      // 切換到 Standard/Inverse 模式：隱藏 Color Picker Bar
      mobileElements.mobileColorpickerBar.addClass('hidden');

      // 移除 has-colorpicker 類
      if (logoContainer) logoContainer.classList.remove('has-colorpicker');
      if (inputArea) inputArea.classList.remove('has-colorpicker');

      // 離開最滿狀態，檢查輸入框
      setTimeout(() => checkInputOverflow(), 50);

      // 重新調整 canvas 尺寸（因為 logo-container 變大了）
      requestCanvasResize();
    }
  }

  // 處理 custom-open class（只在 Wireframe 模式且 Custom 打開時有效）
  if (targetMode !== 'Wireframe' && mobileElements.inputBox) {
    // 離開 Wireframe 模式：移除 custom-open class
    mobileElements.inputBox.removeClass('custom-open');
  } else if (targetMode === 'Wireframe' && mobileElements.inputBox &&
             mobileElements.customAngleControls &&
             !mobileElements.customAngleControls.hasClass('hidden')) {
    // 進入 Wireframe 模式且 Custom 區塊已打開：添加 custom-open class
    mobileElements.inputBox.addClass('custom-open');
  }

  updateUI();

  // 模式切換後，調整輸入框的 padding（延遲以等待 DOM 更新）
  if (mobileElements.inputBox) {
    setTimeout(() => {
      const currentText = mobileElements.inputBox.value();
      updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
    }, 350); // 等待模式切換動畫完成（300ms）+ 50ms 緩衝
  }
}

// 檢查輸入框文字是否溢出（用於最滿狀態：Wireframe + Custom + Color Picker）
function checkInputOverflow() {
  if (!mobileElements.inputBox) return;

  const inputElement = mobileElements.inputBox.elt;
  const logoContainer = document.querySelector('.mobile-logo-container');

  // 檢查是否為最滿狀態（同時有 has-custom 和 has-colorpicker）
  const isFullState = logoContainer &&
                      logoContainer.classList.contains('has-custom') &&
                      logoContainer.classList.contains('has-colorpicker');

  if (isFullState) {
    // 最滿狀態：移除任何 inline padding-top
    inputElement.style.paddingTop = '';

    // 檢查文字寬度是否超過容器寬度
    const isOverflowing = inputElement.scrollWidth > inputElement.clientWidth;

    if (isOverflowing) {
      // 文字溢出：左對齊，可滾動
      inputElement.classList.add('overflowing');
    } else {
      // 文字未溢出：置中顯示
      inputElement.classList.remove('overflowing');
    }
  } else {
    // 非最滿狀態：移除 overflowing class
    inputElement.classList.remove('overflowing');
  }
}

// 手機版：Toggle Custom 調整區
function toggleMobileCustomPanel() {
  if (letters.length === 0 || isEasterEggActive) return;

  // 檢查調整區當前是否顯示
  const isHidden = mobileElements.customAngleControls.hasClass('hidden');

  // 選取 logo 和 input-area 元素
  const logoContainer = document.querySelector('.mobile-logo-container');
  const inputArea = document.querySelector('.mobile-input-area');

  if (isHidden) {
    // 如果調整區隱藏，需要先切換到 Custom 模式（如果還在 Auto 模式）
    if (isAutoRotateMode) {
      switchToCustomMode();
    }
    // 顯示調整區
    mobileElements.customAngleControls.removeClass('hidden');

    // 為 logo 和 input-area 添加 has-custom 類
    if (logoContainer) logoContainer.classList.add('has-custom');
    if (inputArea) inputArea.classList.add('has-custom');

    // Wireframe 模式下，給輸入框添加 custom-open class（單行顯示）
    if (mode === 'Wireframe' && mobileElements.inputBox) {
      mobileElements.inputBox.addClass('custom-open');
      // 檢查是否需要滾動
      setTimeout(() => checkInputOverflow(), 50); // 延遲一點讓 CSS 生效
    }

    // Custom 開啟後，調整輸入框的 padding
    if (mobileElements.inputBox) {
      setTimeout(() => {
        const currentText = mobileElements.inputBox.value();
        updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
      }, 350); // 等待動畫完成
    }

    // 重新調整 canvas 尺寸（因為 logo-container 縮小了）
    requestCanvasResize();

    // 更新按鈕狀態
    updateCustomRotateButtonStates();
  } else {
    // 如果調整區顯示，隱藏它（但保持在 Custom 模式）
    mobileElements.customAngleControls.addClass('hidden');

    // 移除 has-custom 類
    if (logoContainer) logoContainer.classList.remove('has-custom');
    if (inputArea) inputArea.classList.remove('has-custom');

    // 移除 custom-open class，恢復原樣
    if (mobileElements.inputBox) {
      mobileElements.inputBox.removeClass('custom-open');
      mobileElements.inputBox.elt.classList.remove('overflowing');
    }

    // 離開最滿狀態，檢查輸入框
    setTimeout(() => checkInputOverflow(), 50);

    // Custom 關閉後，調整輸入框的 padding
    if (mobileElements.inputBox) {
      setTimeout(() => {
        const currentText = mobileElements.inputBox.value();
        updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
      }, 350); // 等待動畫完成
    }

    // 重新調整 canvas 尺寸（因為 logo-container 變大了）
    requestCanvasResize();

    // 更新按鈕狀態（custom 關閉後應該回到 inactive 狀態 60%）
    updateCustomRotateButtonStates();
  }
}


// 切換到 Custom 模式
function switchToCustomMode() {
  if (letters.length === 0 || isEasterEggActive) return;

  // 如果已經在 Custom 模式，不做任何事
  if (!isAutoRotateMode) return;

  // 切換到 Custom 模式
  isAutoRotateMode = false;
  autoRotate = false;

  // 正規化角度
  for (let i = 0; i < rotationAngles.length; i++) {
    if (rotationAngles[i] !== undefined) {
      rotationAngles[i] = normalizeAngle(rotationAngles[i]);
    }
  }

  // 計算回到 0° 的最短路徑（使用陣列迴圈）
  for (let i = 0; i < 3; i++) {
    const diff = getShortestRotation(rotationOffsets[i], 0);
    targetRotationOffsets[i] = rotationOffsets[i] + diff;
    targetSliderValues[i] = 0;
  }

  isEasingCustomRotation = true;
  isEasingSlider = true;
  shouldResetToZero = true;

  // 不自動顯示調整區，由用戶通過按鈕控制

  updateRotateIcon();
  updateUI();
}

// 切換自動旋轉（與桌面版相同的邏輯）
function toggleAutoRotate() {
  if (letters.length === 0 || isEasterEggActive) return;

  // 從 Custom 模式切換到 Auto 模式
  if (!isAutoRotateMode) {
    isAutoRotateMode = true;
    autoRotate = true;
    resetRotationOffsets();

    // 手機版：隱藏 Custom 調整區並清理 Layout
    if (isMobileMode && mobileElements.customAngleControls) {
      mobileElements.customAngleControls.addClass('hidden');

      // 移除 has-custom class，讓 Layout 調整
      const logoContainer = document.querySelector('.mobile-logo-container');
      const inputArea = document.querySelector('.mobile-input-area');
      if (logoContainer) logoContainer.classList.remove('has-custom');
      if (inputArea) inputArea.classList.remove('has-custom');

      // 移除 custom-open class
      if (mobileElements.inputBox) {
        mobileElements.inputBox.removeClass('custom-open');
        mobileElements.inputBox.elt.classList.remove('overflowing');
      }

      // 調整輸入框的 padding
      if (mobileElements.inputBox) {
        setTimeout(() => {
          const currentText = mobileElements.inputBox.value();
          updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
        }, 350); // 等待動畫完成
      }

      // 重新調整 canvas 尺寸（因為 logo-container 變大了）
      requestCanvasResize();

      // 更新按鈕狀態
      updateCustomRotateButtonStates();
    }
  } else {
    // 已經在 Auto 模式，只是 toggle
    autoRotate = !autoRotate;
    if (autoRotate) {
      resetRotationOffsets();
    }
  }

  updateRotateIcon();
  updateUI();

  // 更新按鈕狀態
  updateCustomRotateButtonStates();
}

// 處理 Slider 變化
function handleMobileSliderChange(channel, value) {
  // 停止 easing
  isEasingCustomRotation = false;
  isEasingSlider = false;

  // 根據 channel 決定陣列索引
  const channelIndex = { 'r': 0, 'g': 1, 'b': 2 }[channel];
  if (channelIndex === undefined) return;

  // 更新對應的 offset（使用陣列）
  rotationOffsets[channelIndex] = value;
  targetRotationOffsets[channelIndex] = value;
  currentSliderValues[channelIndex] = value;
  targetSliderValues[channelIndex] = value;

  // 同步桌面版 slider
  if (sliders[channelIndex]) sliders[channelIndex].value(value);

  updateUI();
}

// Random 按鈕
function handleRandomButton() {
  if (letters.length === 0 || autoRotate || isEasterEggActive) return;

  const letterCount = letters.length;

  // 使用陣列迴圈處理 R/G/B（簡化重複邏輯）
  for (let i = 0; i < 3; i++) {
    const newAngle = (letterCount >= MIN_LETTERS_FOR_CHANNELS[i]) ? floor(random(ROTATION_ANGLE_MIN, ROTATION_ANGLE_MAX)) : 0;
    const diff = getShortestRotation(rotationOffsets[i], newAngle);
    targetRotationOffsets[i] = rotationOffsets[i] + diff;
    targetSliderValues[i] = normalizeAngle(targetRotationOffsets[i]);
  }

  isEasingCustomRotation = true;
  isEasingSlider = true;
  updateUI();
}

// Reset 按鈕
function handleResetButton() {
  if (letters.length === 0 || autoRotate || isEasterEggActive) return;

  // 使用陣列迴圈處理 R/G/B（簡化重複邏輯）
  for (let i = 0; i < 3; i++) {
    const diff = getShortestRotation(rotationOffsets[i], 0);
    targetRotationOffsets[i] = rotationOffsets[i] + diff;
    targetSliderValues[i] = 0;
  }

  isEasingCustomRotation = true;
  isEasingSlider = true;
  updateUI();
}

// 更新手機版 UI 狀態
function updateMobileUI() {
  if (!isMobileMode) return;

  const hasText = letters.length > 0;
  const isWireframe = mode === "Wireframe";

  // 更新 Mode 圖標
  updateMobileModeIcon();

  // 更新 Rotate 圖標（使用共用函數）
  updateRotateIcon();

  // 更新 Sliders 狀態
  updateMobileSliders();

  // 更新按鈕狀態
  updateMobileButtons();

  // 更新圖標顏色
  updateMobileIcons();

  // 同步桌面版的 sliders（如果存在）
  syncDesktopSliders();
}

// 更新手機版 Sliders
function updateMobileSliders() {
  if (!mobileElements.rSlider) return;

  const hasText = letters.length > 0;
  const letterCount = letters.length;

  // 使用陣列迴圈處理 R/G/B 三個 slider（簡化重複邏輯）
  const sliderConfigs = [
    { slider: mobileElements.rSlider, label: mobileElements.rAngleLabel, minLetters: 1, offsetIndex: 0 }, // R
    { slider: mobileElements.gSlider, label: mobileElements.gAngleLabel, minLetters: 2, offsetIndex: 1 }, // G
    { slider: mobileElements.bSlider, label: mobileElements.bAngleLabel, minLetters: 3, offsetIndex: 2 }  // B
  ];

  sliderConfigs.forEach(({ slider, label, minLetters, offsetIndex }) => {
    const shouldEnable = hasText && letterCount >= minLetters && !autoRotate && !isEasterEggActive;

    if (shouldEnable) {
      slider.removeAttribute('disabled');
      slider.addClass('enabled');
      if (label) {
        label.addClass('enabled');
        label.value(Math.round(rotationOffsets[offsetIndex]));
      }
    } else {
      slider.attribute('disabled', '');
      slider.removeClass('enabled');
      if (label) {
        label.removeClass('enabled');
        label.value('0');
      }
    }
  });
}

// 更新 Custom 和 Rotate 按鈕的 active/inactive 狀態
function updateCustomRotateButtonStates() {
  if (!mobileElements.customBtn || !mobileElements.rotateBtn) return;

  const hasText = letters.length > 0;
  if (!hasText) return; // 沒有文字時不處理

  // 檢查 custom panel 是否打開
  const isCustomPanelOpen = mobileElements.customAngleControls &&
                            !mobileElements.customAngleControls.hasClass('hidden');

  if (isCustomPanelOpen) {
    // Custom panel 打開：custom active, rotate inactive
    mobileElements.customBtn.addClass('active');
    mobileElements.customBtn.removeClass('inactive');
    mobileElements.rotateBtn.addClass('inactive');
    mobileElements.rotateBtn.removeClass('active');
  } else {
    // Custom panel 關閉：rotate active, custom inactive
    mobileElements.customBtn.addClass('inactive');
    mobileElements.customBtn.removeClass('active');
    mobileElements.rotateBtn.addClass('active');
    mobileElements.rotateBtn.removeClass('inactive');
  }
}

// 更新手機版按鈕狀態
function updateMobileButtons() {
  const hasText = letters.length > 0;

  // 更新底部按鈕的 disabled 狀態
  // Mode 按鈕始終啟用

  // Rotation group 的顯示/隱藏狀態
  const rotationGroup = document.querySelector('.mobile-rotation-group');
  const bottomBar = document.querySelector('.mobile-bottom-bar');

  if (rotationGroup) {
    // SCCD 彩蛋時隱藏 rotation group，讓按鈕列只剩 mode 和 save
    if (isEasterEggActive) {
      rotationGroup.style.display = 'none';
      // 給底部按鈕列添加 easter-egg-active class，讓按鈕靠攏到中間
      if (bottomBar) bottomBar.classList.add('easter-egg-active');
    } else {
      rotationGroup.style.display = '';
      // 移除 easter-egg-active class，恢復正常布局
      if (bottomBar) bottomBar.classList.remove('easter-egg-active');
      // Rotation group 的 disabled 狀態（控制外框的 opacity）
      if (!hasText) {
        rotationGroup.classList.add('disabled');
      } else {
        rotationGroup.classList.remove('disabled');
      }
    }
  }

  // Custom 按鈕：手機版只在沒有文字時禁用（與桌面版不同）
  if (mobileElements.customBtn) {
    if (!hasText) {
      mobileElements.customBtn.elt.disabled = true;
      mobileElements.customBtn.removeClass('active');
      mobileElements.customBtn.removeClass('inactive');
    } else {
      mobileElements.customBtn.elt.disabled = false;
      // 更新 active/inactive 狀態
      updateCustomRotateButtonStates();
    }
  }

  // Rotate 按鈕：沒有文字時禁用
  if (mobileElements.rotateBtn) {
    if (!hasText) {
      mobileElements.rotateBtn.elt.disabled = true;
      mobileElements.rotateBtn.removeClass('active');
      mobileElements.rotateBtn.removeClass('inactive');
    } else {
      mobileElements.rotateBtn.elt.disabled = false;
      // 更新 active/inactive 狀態
      updateCustomRotateButtonStates();
    }
  }

  // Save 按鈕：啟用條件 - 有文字 或 彩蛋激活中
  if (mobileElements.saveBtn) {
    const canSave = hasText || isEasterEggActive;
    mobileElements.saveBtn.elt.disabled = !canSave;
  }

  // Custom/Play 按鈕的 active 狀態（Bento 面板內的按鈕）
  if (mobileElements.bentoCustomBtn) {
    if (!autoRotate && hasText) {
      mobileElements.bentoCustomBtn.addClass('active');
    } else {
      mobileElements.bentoCustomBtn.removeClass('active');
    }
  }

  if (mobileElements.bentoPlayBtn) {
    if (autoRotate && hasText) {
      mobileElements.bentoPlayBtn.addClass('active');
    } else {
      mobileElements.bentoPlayBtn.removeClass('active');
    }
  }
}

// 更新手機版圖標
function updateMobileIcons() {
  const isWireframe = mode === "Wireframe";
  const suffix = getIconSuffix();

  // Random/Reset 圖標（舊的 Bento 面板）
  if (mobileElements.randomIcon) {
    mobileElements.randomIcon.attribute('src', `Panel Icon/Random${suffix}.svg`);
  }
  if (mobileElements.resetIcon) {
    mobileElements.resetIcon.attribute('src', `Panel Icon/Reset${suffix}.svg`);
  }

  // Random/Reset 圖標（新的 Custom 調整區）
  if (mobileElements.mobileRandomImg) {
    mobileElements.mobileRandomImg.attribute('src', `Panel Icon/Random${suffix}.svg`);
  }
  if (mobileElements.mobileResetImg) {
    mobileElements.mobileResetImg.attribute('src', `Panel Icon/Reset${suffix}.svg`);
  }

  // Custom 圖標
  if (mobileElements.bentoCustomIcon) {
    mobileElements.bentoCustomIcon.attribute('src', `Panel Icon/Custom${suffix}.svg`);
  }

  // Play/Pause 圖標（Bento 面板）
  updateMobileBentoPlayIcon();

  // 更新邊框顏色
  const borderColor = isWireframe ? getWireframeBorderColor() : null;
  const elements = [
    ...selectAll('.mobile-bottom-btn'),
    select('.mobile-bento-container'),
    select('.mobile-bento-left'),
    ...selectAll('.mobile-bento-button')
  ];
  updateElementsBorderColor(elements, borderColor);
}

// 更新 Bento Play 圖標
function updateMobileBentoPlayIcon() {
  if (!mobileElements.bentoPlayIcon) return;

  const hasText = letters.length > 0;
  const suffix = getIconSuffix();

  let iconSrc = '';

  if (!hasText) {
    iconSrc = `Panel Icon/Rotate${suffix}.svg`;
  } else if (isAutoRotateMode) {
    if (autoRotate) {
      iconSrc = `Panel Icon/Pause${suffix}.svg`;
    } else {
      iconSrc = `Panel Icon/Play${suffix}.svg`;
    }
  } else {
    iconSrc = `Panel Icon/Rotate${suffix}.svg`;
  }

  mobileElements.bentoPlayIcon.attribute('src', iconSrc);
}

// 注意：getSuffixForMode 已移至 utils.js 的 getIconSuffix()

// 更新手機版邊框顏色（Wireframe 模式）
function updateMobileBorderColors() {
  const borderColor = getWireframeBorderColor();
  if (!borderColor) return;

  const elements = [
    ...selectAll('.mobile-bottom-btn'),
    select('.mobile-bento-container'),
    select('.mobile-bento-left'),
    ...selectAll('.mobile-bento-button')
  ];
  updateElementsBorderColor(elements, borderColor);
}

// 同步桌面版 Sliders
function syncDesktopSliders() {
  if (!sliders[0] || !sliders[1] || !sliders[2]) return;

  // 同步數值（使用陣列迴圈）
  const mobileSliderElements = [mobileElements.rSlider, mobileElements.gSlider, mobileElements.bSlider];
  mobileSliderElements.forEach((mobileSlider, i) => {
    if (mobileSlider && sliders[i]) {
      sliders[i].value(mobileSlider.value());
    }
  });
}

// 更新手機版 Mode 圖標（使用 utils.js 的共用函數）
function updateMobileModeIcon() {
  if (!mobileElements.modeIcon) return;
  mobileElements.modeIcon.attribute('src', getModeIconSrc());
}

// ====================================
// Visual Viewport API：處理鍵盤覆蓋行為
// ====================================
// 使用 Visual Viewport API 來偵測虛擬鍵盤的出現並動態調整佈局
// 策略：鍵盤出現時，只顯示 logo + 輸入框（單行），隱藏其他元素
if (window.visualViewport) {
  let initialHeight = window.visualViewport.height;

  window.visualViewport.addEventListener('resize', () => {
    if (!isMobileMode) return;

    const currentHeight = window.visualViewport.height;
    const keyboardHeight = initialHeight - currentHeight;

    const mainContainer = document.querySelector('.main-container');
    const mobileContentSection = document.querySelector('.mobile-content-section');
    const logoContainer = document.querySelector('.mobile-logo-container');
    const inputArea = document.querySelector('.mobile-input-area');
    const customControls = document.querySelector('.mobile-custom-angle-controls');
    const colorPickerBar = document.querySelector('.mobile-colorpicker-bar');
    const bottomBar = document.querySelector('.mobile-bottom-bar');

    // 鍵盤彈出時（viewport 高度減少超過 100px，避免誤判）
    if (keyboardHeight > 100) {
      // 1. 添加鍵盤激活狀態的 class
      if (mainContainer) mainContainer.classList.add('keyboard-active');
      if (inputArea) inputArea.classList.add('keyboard-active');

      // 2. 完全阻止滑動（防止用戶看到下方的空白區域）
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = `${initialHeight}px`; // 用固定值，不讓 body 跟著 viewport 縮小

      // 3. 隱藏所有額外元素
      if (customControls) customControls.style.setProperty('display', 'none', 'important');
      if (colorPickerBar) colorPickerBar.style.setProperty('display', 'none', 'important');
      if (bottomBar) bottomBar.style.setProperty('display', 'none', 'important');

      // 4. 鍵盤專屬 layout：使用原本的邏輯（paddingBottom 推上去）
      const topPadding = 20; // main-container 的 padding-top（減少讓 logo 往上）
      const logoInputGap = 6; // Logo 和輸入框之間的 gap（增加來保持輸入框位置）
      const availableHeight = currentHeight - topPadding;

      const inputHeight = 40; // 輸入框固定高度（單行）
      const idealLogoHeight = availableHeight * 0.75; // Logo 佔可視區域的 75%
      const totalContentHeight = idealLogoHeight + inputHeight;

      // 使用 paddingBottom 推內容上去，並額外增加一些 padding
      const inputBottomPadding = 10; // 輸入框下方額外的 padding
      const neededPaddingBottom = keyboardHeight + inputBottomPadding;

      // Debug: 輸出計算值
      console.log('=== 鍵盤佈局 ===');
      console.log('currentHeight:', currentHeight);
      console.log('topPadding:', topPadding);
      console.log('availableHeight:', availableHeight);
      console.log('idealLogoHeight:', idealLogoHeight);
      console.log('inputHeight:', inputHeight);
      console.log('totalContentHeight:', totalContentHeight);
      console.log('keyboardHeight:', keyboardHeight);
      console.log('neededPaddingBottom:', neededPaddingBottom);

      // 5. 設定 main-container 的 padding-top
      if (mainContainer) {
        mainContainer.style.setProperty('padding-top', `${topPadding}px`, 'important');
      }

      // 6. 設定 mobile-content-section 的佈局
      if (mobileContentSection) {
        mobileContentSection.style.setProperty('flex', 'none', 'important');
        mobileContentSection.style.setProperty('padding-top', '0', 'important');
        mobileContentSection.style.setProperty('padding-bottom', `${neededPaddingBottom}px`, 'important');
        mobileContentSection.style.setProperty('gap', `${logoInputGap}px`, 'important');
        mobileContentSection.style.setProperty('justify-content', 'center', 'important');
      }

      // 7. 設定 Logo 容器（用 !important 確保覆蓋 CSS）
      if (logoContainer) {
        logoContainer.style.setProperty('flex', 'none', 'important');
        logoContainer.style.setProperty('width', '65%', 'important');
        logoContainer.style.setProperty('height', `${idealLogoHeight}px`, 'important');
      }

      // 8. 設定輸入框為單行（用 !important 確保覆蓋 CSS）
      if (inputArea) {
        inputArea.style.setProperty('flex', 'none', 'important');
        inputArea.style.setProperty('height', `${inputHeight}px`, 'important');
        inputArea.style.setProperty('min-height', 'auto', 'important');
        inputArea.style.setProperty('margin-bottom', '0', 'important');
      }

      // 10. 重新計算 canvas 尺寸
      requestAnimationFrame(() => {
        if (typeof resizeMobileCanvas === 'function') {
          resizeMobileCanvas();
        }
      });

      // 11. 調整輸入框的 padding（單行居中）
      if (mobileElements.inputBox) {
        setTimeout(() => {
          const currentText = mobileElements.inputBox.value();
          updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
        }, 50);
      }

    } else {
      // 鍵盤收起時，恢復原本設定
      if (mainContainer) mainContainer.classList.remove('keyboard-active');
      if (inputArea) inputArea.classList.remove('keyboard-active');

      // 恢復滑動功能
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';

      // 恢復所有元素的顯示
      if (customControls) customControls.style.display = '';
      if (colorPickerBar) colorPickerBar.style.display = '';
      if (bottomBar) bottomBar.style.display = '';

      // 恢復佈局設定
      if (mainContainer) {
        mainContainer.style.paddingTop = ''; // 恢復 main-container 的 padding-top
      }

      if (mobileContentSection) {
        mobileContentSection.style.flex = '';
        mobileContentSection.style.height = ''; // 恢復高度
        mobileContentSection.style.paddingTop = '';
        mobileContentSection.style.paddingBottom = '';
        mobileContentSection.style.gap = '';
        mobileContentSection.style.justifyContent = '';
        mobileContentSection.style.backgroundColor = ''; // 移除測試背景色
      }

      if (logoContainer) {
        logoContainer.style.flex = '';
        logoContainer.style.width = '';  // 恢復寬度
        logoContainer.style.height = '';
      }

      if (inputArea) {
        inputArea.style.flex = '';
        inputArea.style.height = '';
        inputArea.style.minHeight = '';
        inputArea.style.marginBottom = '';
        inputArea.style.border = ''; // 移除測試用紅框
      }

      // 重新計算 canvas 尺寸（恢復正常大小）
      // Keyboard 使用 inline style（無 CSS transition），直接執行 resize
      // 使用 requestAnimationFrame 確保 DOM 已更新
      requestAnimationFrame(() => {
        if (typeof resizeMobileCanvas === 'function') {
          resizeMobileCanvas();
        }
      });

      // 調整輸入框的 padding（恢復正常狀態）
      // 等待 CSS transition 完成後再計算（font-size transition 是 0.2s）
      if (mobileElements.inputBox) {
        setTimeout(() => {
          const currentText = mobileElements.inputBox.value();
          updateMobileInputBoxVerticalAlignment(mobileElements.inputBox, currentText);
        }, 250); // 增加等待時間
      }
    }
  });

  // 偵測 scroll 事件，防止頁面被鍵盤推上去
  window.visualViewport.addEventListener('scroll', () => {
    if (!isMobileMode) return;
    // 強制回到原位
    window.scrollTo(0, 0);
  });
}

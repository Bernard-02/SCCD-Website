// ====================================
// SCCD Logo Generator - 主程式
// ====================================

// --- p5.js 預載入 ---
function preload() {
  // 載入必要的字體
  font = loadFont("Inter-Medium.ttf");

  // 預載入彩蛋顯示圖片（_2 版本），確保彩蛋激活時能即時顯示
  sccdBlackImg_2 = loadImage('Easter Egg/sccd_black_2.png');
  sccdWhiteImg_2 = loadImage('Easter Egg/sccd_white_2.png');
  sccdBlackWireframeImg_2 = loadImage('Easter Egg/SCCD_Black Wireframe_2.png');
  sccdWhiteWireframeImg_2 = loadImage('Easter Egg/SCCD_White Wireframe_2.png');

  // 新彩蛋圖片（COOLGUY, CHILLGUY）改為延遲載入（透過 HTML img.src），不再預載入
}

// --- 延遲載入彩蛋下載圖片（只在需要下載時載入）---
function loadEasterEggDownloadImages() {
  if (!sccdBlackImg) {
    sccdBlackImg = loadImage('Easter Egg/sccd_black.png');
    sccdWhiteImg = loadImage('Easter Egg/sccd_white.png');
    sccdBlackWireframeImg = loadImage('Easter Egg/SCCD_Black Wireframe.png');
    sccdWhiteWireframeImg = loadImage('Easter Egg/SCCD_White Wireframe.png');
  }
}

// --- 延遲載入 placeholder SVG（只在沒有文字時載入）---
function loadPlaceholderImages() {
  if (!placeholderR) {
    placeholderR = loadImage('Placeholder Logo/SCCD_R.svg');
    placeholderG = loadImage('Placeholder Logo/SCCD_G.svg');
    placeholderB = loadImage('Placeholder Logo/SCCD_B.svg');
    placeholderR_white = loadImage('Placeholder Logo/SCCD_R_white.svg');
    placeholderG_white = loadImage('Placeholder Logo/SCCD_G_white.svg');
    placeholderB_white = loadImage('Placeholder Logo/SCCD_B_white.svg');
  }
}

// --- 計算去飽和顏色（將 Saturation 設為 0）---
function calculateDesaturatedColor(r, g, b) {
  // 將 RGB 轉換為 HSL
  r = r / 255;
  g = g / 255;
  b = b / 255;

  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let l = (max + min) / 2;

  // Saturation = 0 時，RGB 都等於 Lightness 值
  let gray = Math.round(l * 255);
  return { r: gray, g: gray, b: gray };
}

// --- 初始化去飽和的 RGB 顏色 CSS 變數 ---
function initializeDesaturatedColors() {
  // R color: rgb(255, 68, 138)
  let rDesaturated = calculateDesaturatedColor(255, 68, 138);
  document.documentElement.style.setProperty('--r-color-desaturated', `rgb(${rDesaturated.r}, ${rDesaturated.g}, ${rDesaturated.b})`);

  // G color: rgb(0, 255, 128)
  let gDesaturated = calculateDesaturatedColor(0, 255, 128);
  document.documentElement.style.setProperty('--g-color-desaturated', `rgb(${gDesaturated.r}, ${gDesaturated.g}, ${gDesaturated.b})`);

  // B color: rgb(38, 188, 255)
  let bDesaturated = calculateDesaturatedColor(38, 188, 255);
  document.documentElement.style.setProperty('--b-color-desaturated', `rgb(${bDesaturated.r}, ${bDesaturated.g}, ${bDesaturated.b})`);
}

// --- p5.js 初始化設定 ---
function setup() {
  // 初始化去飽和顏色
  initializeDesaturatedColors();

  // 初始檢測手機模式
  checkMobileMode();

  // 根據設備選擇正確的 Canvas 容器
  // 桌面版使用 desktop-canvas-container，手機版使用 canvas-container
  let canvasContainerId = isMobileMode ? 'canvas-container' : 'desktop-canvas-container';
  canvasContainer = select('#' + canvasContainerId);

  // 根據模式創建合適尺寸的Canvas
  let canvasSize = getCanvasSize();
  let canvas = createCanvas(canvasSize.width, canvasSize.height);
  canvas.parent(canvasContainerId);

  // p5.js 繪圖設定
  textFont(font);
  // 根據 canvas 尺寸動態調整文字大小
  // 桌面版基準：432x540 canvas，textSize = 367.5
  // 手機版：按相同比例縮放，再縮小 4% 作為安全邊距確保不被裁切
  // 計算方式：(canvas寬度 / 432) × 367.5 × 0.96
  let baseTextSize = isMobileMode ? (canvasSize.width / 432) * 367.5 * 1.1 : 367.5;
  textSize(baseTextSize);
  textAlign(CENTER, CENTER);
  imageMode(CENTER); // <-- 新增：將圖片的繪製模式設定為中心對齊

  // --- 修正：使用 Class 選擇器來選取所有 UI 元素 ---
  inputBox = select("#input-box");

  rotateButton = select(".custom-button-rotate");
  customButton = select(".custom-button-custom");
  colormodeButton = select("#colormode-button");
  colormodeBox = select("#colormode-box"); // 選取整個 colormode-box 容器

  // 這些按鈕本身是 button，裡面的 img 只是圖示
  randomButton = select("#random-button");
  resetButton = select("#reset-button");
  saveButton = select("#save-button");
  saveBox = select("#save-box"); // 選取整個 save-box 容器

  randomImg = select('#random-img');
  resetImg = select('#reset-img');
  saveImg = select('#save-img');
  rotateIcon = select('#rotate-icon');
  customIcon = select('#custom-icon');
  colormodeIcon = select('#colormode-icon');

  // 使用陣列選取 sliders 和 labels
  sliders[0] = select("#r-slider");
  sliders[1] = select("#g-slider");
  sliders[2] = select("#b-slider");

  // 初始化 slider 的當前值和目標值（已在 variables.js 初始化為 [0,0,0]）

  angleLabels[0] = select("#r-angle-label");
  angleLabels[1] = select("#g-angle-label");
  angleLabels[2] = select("#b-angle-label");

  // --- 選取手機版元素 ---
  inputBoxMobile = select("#input-box-mobile");
  // 新的手機版底部輸入框（位於 logo 和按鈕列之間）
  let mobileInputBoxBottom = select("#mobile-input-box");
  saveButtonMobile = select("#save-button-mobile");
  saveImgMobile = select("#save-img-mobile");

  // 選取手機版按鈕
  mobileStandardButton = select(".mobile-standard");
  mobileInverseButton = select(".mobile-inverse");
  mobileRotateButton = select(".mobile-rotate");
  mobileCustomButton = select(".mobile-custom");
  mobileRandomButton = select(".mobile-random-button");
  mobileResetButton = select(".mobile-reset-button");
  let mobileColormodeIndicator = select(".mobile-colormode-indicator");

  // 使用陣列選取手機版滑桿和 labels
  mobileSliders[0] = select("#mobile-r-slider");
  mobileSliders[1] = select("#mobile-g-slider");
  mobileSliders[2] = select("#mobile-b-slider");
  mobileAngleLabels[0] = select("#mobile-r-angle-label");
  mobileAngleLabels[1] = select("#mobile-g-angle-label");
  mobileAngleLabels[2] = select("#mobile-b-angle-label");

  // 選取手機版圖片
  mobileRandomImg = select("#mobile-random-img");
  mobileResetImg = select("#mobile-reset-img");
  mobileRotateIcon = select("#mobile-rotate-icon");
  mobileCustomIcon = select("#mobile-custom-icon");

  // --- 手機版 UI 元素已移至 js/mobile.js 管理 ---

  // --- 選取下載提示框 ---
  downloadNotification = select("#download-notification");

  // --- 初始化色彩選擇器 ---
  colorPickerContainer = select("#colorpicker-container");
  colorPickerBox = select("#colorpicker-box");
  colorWheelPlayButton = select("#colorwheel-play-button");
  colorWheelPlayIcon = select("#colorwheel-play-icon");
  // Color picker initialization moved inline to draw() function

  // --- 綁定所有 UI 事件 ---
  inputBox.input(handleInput);
  // 阻擋空白鍵輸入
  inputBox.elt.addEventListener('keydown', function(e) {
    if (e.key === ' ' || e.keyCode === 32) {
      e.preventDefault();
    }
  });

  // --- 讓輸入框永遠保持 focus 狀態（桌面版）---
  // 頁面載入時自動 focus
  inputBox.elt.focus();

  // 當輸入框失去 focus 時，檢查新焦點是否為角度 label，如果不是則重新 focus
  inputBox.elt.addEventListener('blur', function() {
    // 使用 setTimeout 確保在事件循環後重新 focus
    setTimeout(() => {
      if (!isMobileMode) {
        // 檢查當前 focus 的元素是否為角度 label
        const activeElement = document.activeElement;
        const isAngleLabel = activeElement && (
          activeElement.id === 'r-angle-label' ||
          activeElement.id === 'g-angle-label' ||
          activeElement.id === 'b-angle-label'
        );

        // 如果當前焦點不是角度 label，則重新 focus 到輸入框
        if (!isAngleLabel) {
          inputBox.elt.focus();
        }
      }
    }, 0);
  });

  if (inputBoxMobile) {
    inputBoxMobile.input(handleInput);
    // 阻擋手機版空白鍵輸入
    inputBoxMobile.elt.addEventListener('keydown', function(e) {
      if (e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
      }
    });

    // --- 讓輸入框永遠保持 focus 狀態（手機版）---
    // 當輸入框失去 focus 時，立即重新 focus（確保 caret 永遠顯示）
    inputBoxMobile.elt.addEventListener('blur', function() {
      setTimeout(() => {
        // 如果正在播放彩蛋動畫，不要重新 focus，讓鍵盤保持關閉
        if (isMobileMode && !specialEasterEggAnimating) {
          inputBoxMobile.elt.focus();
        }
      }, 0);
    });
  }

  // --- 綁定新的手機版底部輸入框事件 ---
  if (mobileInputBoxBottom) {
    mobileInputBoxBottom.input(handleInput);
    // 阻擋空白鍵輸入
    mobileInputBoxBottom.elt.addEventListener('keydown', function(e) {
      if (e.key === ' ' || e.keyCode === 32) {
        e.preventDefault();
      }
    });

    // 手機版：鍵盤彈出檢測
    if (isMobileMode) {
      let initialHeight = window.innerHeight;

      // 監聽 focus 事件（鍵盤即將彈出）
      mobileInputBoxBottom.elt.addEventListener('focus', function() {
        // 給一點延遲讓鍵盤完全彈出
        setTimeout(() => {
          let currentHeight = window.innerHeight;
          let keyboardHeight = initialHeight - currentHeight;

          // 如果高度差異大於 150px，認為是鍵盤彈出
          if (keyboardHeight > 150) {
            console.log('鍵盤高度約為:', keyboardHeight + 'px');
            // 可以在這裡調整佈局
            adjustLayoutForKeyboard(keyboardHeight);
          }
        }, 300);
      });

      // 監聽 blur 事件（鍵盤收起）
      mobileInputBoxBottom.elt.addEventListener('blur', function() {
        setTimeout(() => {
          resetLayoutAfterKeyboard();
        }, 100);
      });

      // 監聽視窗大小變化（更精確的鍵盤檢測）
      window.visualViewport?.addEventListener('resize', () => {
        let currentHeight = window.visualViewport.height;
        let keyboardHeight = initialHeight - currentHeight;

        if (keyboardHeight > 150) {
          adjustLayoutForKeyboard(keyboardHeight);
        } else {
          resetLayoutAfterKeyboard();
        }
      });
    }
  }
  
  // 參考 ref.js:123
  rotateButton.mousePressed(() => {
    if (letters.length > 0 && !isEasterEggActive) {
      // 從 Custom 模式切換到 Auto 模式
      if (!isAutoRotateMode) {
        isAutoRotateMode = true;
        autoRotate = true;
        resetRotationOffsets();
      } else {
        // 已經在 Auto 模式，只是 toggle
        autoRotate = !autoRotate;
        if (autoRotate) {
          resetRotationOffsets();
        }
      }

      // 更新桌面版按鈕icon
      updateRotateIcon();

      updateUI();
    }
  });

  // 參考 ref.js:124
  customButton.mousePressed(() => {
    if (letters.length > 0 && !isEasterEggActive) {
      // 如果已經在 Custom 模式下，點擊不做任何事
      if (!isAutoRotateMode) {
        return;
      }

      // 從 Rotate 模式切換到 Custom 模式
      isAutoRotateMode = false;
      autoRotate = false;

      // 先將所有角度正規化到 -180° 到 180° 範圍（選擇最短路徑）
      for (let i = 0; i < rotationAngles.length; i++) {
        if (rotationAngles[i] !== undefined) {
          // 正規化到 -180° 到 180°（最短路徑）
          rotationAngles[i] = normalizeAngle(rotationAngles[i]);
        }
      }

      // 重置桌面版按鈕icon
      updateRotateIcon();

      // 使用新的 ease 系統平滑回到 0°（使用陣列迴圈）
      for (let i = 0; i < 3; i++) {
        const diff = getShortestRotation(rotationOffsets[i], 0);
        targetRotationOffsets[i] = rotationOffsets[i] + diff;
        targetSliderValues[i] = 0;
      }

      // 啟動新的 ease 動畫（Custom 模式的 ease）
      isEasingCustomRotation = true;
      isEasingSlider = true;
      // 同時標記需要 ease 回 0°（處理 rotationAngles）
      shouldResetToZero = true;

      updateUI();
    }
  });

  // 新增：Colormode 循環切換按鈕
  // Standard -> Inverse -> Wireframe -> Standard
  // 將事件綁定到整個 colormode-box，讓整個容器都可以點擊
  colormodeBox.mousePressed(() => {
    // 隨機旋轉 icon
    if (colormodeIcon) {
      animateModeIconRotation(colormodeIcon);
    }

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
    updateUI();
  });

  // Color Wheel Play/Pause 按鈕
  if (colorWheelPlayButton) {
    colorWheelPlayButton.mousePressed(() => {
      if (mode === "Wireframe") {
        // 切換 Play/Pause 狀態
        // Play 時：selectedHue 會在 draw() 中持續增加
        // Pause 時：selectedHue 停在當前位置，用戶可以點擊 bar 選擇新顏色
        isColorWheelRotating = !isColorWheelRotating;
        updateColorWheelIcon();

        // 如果從 Play 切換到 Pause，恢復 transition
        if (!isColorWheelRotating) {
          let body = select('body');
          let canvasContainer = select('#canvas-container');
          let desktopCanvasContainer = select('#desktop-canvas-container');

          if (body) {
            body.elt.style.transition = '';
          }
          if (canvasContainer) {
            canvasContainer.elt.style.transition = '';
          }
          if (desktopCanvasContainer) {
            desktopCanvasContainer.elt.style.transition = '';
          }
        }
      }
    });
  }

  // 參考 ref.js:126
  randomButton.mousePressed(() => {
      if (letters.length > 0 && !isAutoRotateMode && !isEasterEggActive) {
        const letterCount = letters.length;

        // 使用陣列迴圈處理 R/G/B（簡化重複邏輯）
        for (let i = 0; i < 3; i++) {
          const newAngle = (letterCount >= MIN_LETTERS_FOR_CHANNELS[i]) ? floor(random(ROTATION_ANGLE_MIN, ROTATION_ANGLE_MAX)) : 0;
          const diff = getShortestRotation(rotationOffsets[i], newAngle);
          targetRotationOffsets[i] = rotationOffsets[i] + diff;
          targetSliderValues[i] = normalizeAngle(targetRotationOffsets[i]);
        }

        // 啟動 ease 動畫
        isEasingCustomRotation = true;
        isEasingSlider = true;
        updateUI();
      }
  });

  // 參考 ref.js:128
  resetButton.mousePressed(() => {
      if (letters.length > 0 && !isAutoRotateMode && !isEasterEggActive) {
        // 使用陣列迴圈處理 R/G/B（簡化重複邏輯）
        for (let i = 0; i < 3; i++) {
          const diff = getShortestRotation(rotationOffsets[i], 0);
          targetRotationOffsets[i] = rotationOffsets[i] + diff;
          targetSliderValues[i] = 0;
        }

        // 啟動 ease 動畫
        isEasingCustomRotation = true;
        isEasingSlider = true;
        updateUI();
      }
  });

  // --- 為滑桿綁定 input 事件（使用陣列迴圈）---
  sliders.forEach(slider => {
    slider.input(() => {
      if (!isEasterEggActive && !isAutoRotateMode) {
        updateSliders();
        updateUI();
      }
    });
  });

  // --- 為角度輸入框綁定事件 ---
  // 限制輸入只能是數字、- 和 +
  const filterAngleInput = function(e) {
    // 允許控制鍵（Backspace, Delete, Arrow keys, Tab, Enter 等）
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Home', 'End'];
    if (allowedKeys.includes(e.key)) {
      return; // 允許這些按鍵
    }

    // 只允許數字、- 和 +
    if (!/^[0-9\-+]$/.test(e.key)) {
      e.preventDefault(); // 阻止其他字符輸入
    }
  };

  // 使用陣列迴圈處理 R/G/B 角度輸入（簡化重複邏輯）
  angleLabels.forEach((label, index) => {
    const handleAngleInput = function(e) {
      if (!isEasterEggActive && !isAutoRotateMode) {
        let normalizedAngle = convertAngleInput(e.target.value);
        if (sliders[index]) sliders[index].value(normalizedAngle);
        updateSliders();
        updateUI();
      }
    };

    label.elt.addEventListener('keydown', function(e) {
      filterAngleInput(e); // 先過濾輸入
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAngleInput(e);
        e.target.blur(); // 移除焦點，隱藏 caret
      }
    });

    label.elt.addEventListener('blur', handleAngleInput);
  });

  // --- 綁定手機版角度輸入框事件（使用陣列迴圈）---
  mobileAngleLabels.forEach((label, index) => {
    if (label) {
      label.elt.addEventListener('keydown', filterAngleInput); // 過濾輸入
      label.elt.addEventListener('input', function(e) {
        if (!isEasterEggActive && !isAutoRotateMode) {
          let normalizedAngle = convertAngleInput(e.target.value);
          if (mobileSliders[index]) {
            mobileSliders[index].value(normalizedAngle);
            if (sliders[index]) sliders[index].value(normalizedAngle);
          }
          updateSliders();
          updateUI();
        }
      });
    }
  });

  // --- 綁定手機版按鈕事件（同步桌面版） ---
  if (mobileStandardButton) {
    mobileStandardButton.mousePressed(() => {
      // 隨機旋轉手機版 mode icon
      const mobileModeIcon = select('#mobile-mode-icon');
      if (mobileModeIcon) {
        animateModeIconRotation(mobileModeIcon);
      }

      targetMode = "Standard";
      updateUI();
    });
  }

  if (mobileInverseButton) {
    mobileInverseButton.mousePressed(() => {
      // 隨機旋轉手機版 mode icon
      const mobileModeIcon = select('#mobile-mode-icon');
      if (mobileModeIcon) {
        animateModeIconRotation(mobileModeIcon);
      }

      targetMode = "Inverse";
      updateUI();
    });
  }

  if (mobileRotateButton) {
    mobileRotateButton.mousePressed(() => {
      if (letters.length > 0 && !isEasterEggActive) {
        if (!isAutoRotateMode) {
          isAutoRotateMode = true;
          autoRotate = true;
          resetRotationOffsets();
        } else {
          autoRotate = !autoRotate;
          if (autoRotate) {
            resetRotationOffsets();
          }
        }
        updateRotateIcon();
        updateUI();
      }
    });
  }

  if (mobileCustomButton) {
    mobileCustomButton.mousePressed(() => {
      if (letters.length > 0 && !isEasterEggActive) {
        // 如果已經在 Custom 模式下，點擊不做任何事
        if (!isAutoRotateMode) {
          return;
        }

        // 從 Rotate 模式切換到 Custom 模式
        isAutoRotateMode = false;
        autoRotate = false;
        for (let i = 0; i < rotationAngles.length; i++) {
          if (rotationAngles[i] !== undefined) {
            rotationAngles[i] = normalizeAngle(rotationAngles[i]);
          }
        }
        updateRotateIcon();
        // 使用陣列迴圈處理 R/G/B
        for (let i = 0; i < 3; i++) {
          const diff = getShortestRotation(rotationOffsets[i], 0);
          targetRotationOffsets[i] = rotationOffsets[i] + diff;
          targetSliderValues[i] = 0;
        }

        isEasingCustomRotation = true;
        isEasingSlider = true;
        shouldResetToZero = true;
        updateUI();
      }
    });
  }

  if (mobileRandomButton) {
    mobileRandomButton.mousePressed(() => {
      if (letters.length > 0 && !isAutoRotateMode && !isEasterEggActive) {
        const letterCount = letters.length;

        // 使用陣列迴圈處理 R/G/B
        for (let i = 0; i < 3; i++) {
          const newAngle = (letterCount >= MIN_LETTERS_FOR_CHANNELS[i]) ? floor(random(ROTATION_ANGLE_MIN, ROTATION_ANGLE_MAX)) : 0;
          const diff = getShortestRotation(rotationOffsets[i], newAngle);
          targetRotationOffsets[i] = rotationOffsets[i] + diff;
          targetSliderValues[i] = normalizeAngle(targetRotationOffsets[i]);
        }

        // 啟動 ease 動畫
        isEasingCustomRotation = true;
        isEasingSlider = true;

        // 立即更新 UI 以顯示目標角度
        updateUI();
      }
    });
  }

  if (mobileResetButton) {
    mobileResetButton.mousePressed(() => {
      if (letters.length > 0 && !isAutoRotateMode && !isEasterEggActive) {
        // 使用陣列迴圈處理 R/G/B
        for (let i = 0; i < 3; i++) {
          const diff = getShortestRotation(rotationOffsets[i], 0);
          targetRotationOffsets[i] = rotationOffsets[i] + diff;
          targetSliderValues[i] = 0;
        }

        // 啟動 ease 動畫
        isEasingCustomRotation = true;
        isEasingSlider = true;

        // 立即更新 UI 以顯示目標角度
        updateUI();
      }
    });
  }

  // --- 為手機版滑桿綁定事件 ---
  // 使用陣列迴圈綁定手機版 slider input 事件
  mobileSliders.forEach((mobileSlider, index) => {
    if (mobileSlider) {
      mobileSlider.input(() => {
        if (!isEasterEggActive && !isAutoRotateMode) {
          isEasingCustomRotation = false;
          isEasingSlider = false;
          const value = mobileSlider.value();
          rotationOffsets[index] = value;
          targetRotationOffsets[index] = value;
          currentSliderValues[index] = value;
          targetSliderValues[index] = value;
          if (sliders[index]) sliders[index].value(value);
          updateUI();
        }
      });
    }
  });

  // --- 綁定Save按鈕事件 ---
  // 將事件綁定到整個 save-box，讓整個容器都可以點擊
  saveBox.mousePressed(() => {
    if (letters.length > 0) {
      saveTransparentPNG();
    }
  });

  // --- 綁定手機版Save按鈕事件 ---
  if (saveButtonMobile) {
    saveButtonMobile.mousePressed(() => {
      if (letters.length > 0) {
        saveTransparentPNG();
      }
    });
  }

  // --- 初始化手機版 UI（使用 mobile.js）---
  initMobileUI();

  // 初始化響應式檢測
  checkMobileMode();

  // 監聽媒體查詢變化，確保與CSS保持同步
  const mediaQuery = window.matchMedia('(max-width: 768px)');
  mediaQuery.addListener(() => {
    setTimeout(() => {
      checkMobileMode();
      updateUI();
    }, 10);
  });

  // 初始 UI 狀態設定
  updateUI();

  // 強制更新手機版 Rotate icon（確保初始狀態正確）
  if (isMobileMode) {
    updateRotateIcon();
  }

  // 讓輸入框自動獲得焦點，使游標一直顯示並閃爍
  setTimeout(() => {
    if (isMobileMode && inputBoxMobile) {
      inputBoxMobile.elt.focus();
    } else {
      inputBox.elt.focus();
    }
  }, 100); // 稍微延遲以確保頁面完全載入

  // 初始化頁面載入動畫
  pageLoadStartTime = millis();
  // CSS 已經將所有元素預設為 opacity: 0，這裡不需要重複設定
  // placeholder 的 opacity 由 logoOpacity 變數控制，在 draw() 中處理

  // --- 禁用 Canvas 容器的右鍵菜單，防止直接下載 ---
  // 只在 canvas-container 上禁用，不影響其他區域
  if (canvasContainer) {
    canvasContainer.elt.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    });
  }

  // --- 啟動打字機動畫 ---
  startTypewriterAnimation();

  // --- 創建新彩蛋圖片的 DOM 容器（覆蓋在整個 window 上）---
  createSpecialEasterEggContainer();

  // --- 初始化 body class（確保背景色正確顯示）---
  let body = select('body');
  if (body) {
    // 根據初始模式設置 body class
    if (mode === "Wireframe") {
      body.addClass('wireframe-mode');
    } else if (mode === "Inverse") {
      body.addClass('inverse-mode');
    } else {
      body.addClass('standard-mode');
    }
  }

  // --- 監聽螢幕方向變化（使用 JS 控制 landscape 模式）---
  if (isMobileMode) {
    // 監聽方向和尺寸變化
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    // 初始化時調用一次
    setTimeout(handleOrientationChange, 100);
  }
}

// --- 處理螢幕方向變化（使用 JS 控制 landscape/portrait 模式）---
// Safari iOS 有嚴重的 display:none 問題，需要特殊處理
function handleOrientationChange() {
  if (!isMobileMode) return;

  const isLandscape = window.innerWidth > window.innerHeight;
  const landscapeOverlay = document.getElementById('landscape-overlay');
  const mainContainer = document.querySelector('.main-container');

  if (isLandscape) {
    // 進入橫向模式
    if (!landscapeOverlay) return;

    // 根據當前模式更新 CSS 變數（landscape overlay 會通過 CSS 自動使用這些變數）
    if (mode === "Standard") {
      document.documentElement.style.setProperty('--current-wireframe-bg', 'white');
      document.documentElement.style.setProperty('--current-wireframe-text', 'black');
    } else if (mode === "Inverse") {
      document.documentElement.style.setProperty('--current-wireframe-bg', 'black');
      document.documentElement.style.setProperty('--current-wireframe-text', 'white');
    } else if (mode === "Wireframe" && wireframeColor) {
      let r = red(wireframeColor);
      let g = green(wireframeColor);
      let b = blue(wireframeColor);
      let cssColor = `rgb(${r}, ${g}, ${b})`;

      let contrastColor = getContrastColor(wireframeColor);
      let borderR = red(contrastColor);
      let borderG = green(contrastColor);
      let borderB = blue(contrastColor);
      let borderCssColor = `rgb(${borderR}, ${borderG}, ${borderB})`;

      document.documentElement.style.setProperty('--current-wireframe-bg', cssColor);
      document.documentElement.style.setProperty('--current-wireframe-text', borderCssColor);
    }

    // 顯示 overlay（顏色由 CSS 變數控制）
    landscapeOverlay.style.display = 'flex';
    if (mainContainer) {
      mainContainer.style.display = 'none';
    }

  } else {
    // 回到直向模式
    if (landscapeOverlay) {
      landscapeOverlay.style.display = 'none';
    }
    if (mainContainer) {
      mainContainer.style.display = '';
    }

    // 重新調整 canvas 大小
    if (typeof resizeMobileCanvas === 'function') {
      resizeMobileCanvas();
    }
  }
}

// --- 打字機動畫函數 ---
function startTypewriterAnimation() {
  // 獲取原始 placeholder
  let placeholderText = inputBox.attribute('placeholder');

  // 根據是否為手機模式選擇不同的 placeholder
  if (isMobileMode && inputBoxMobile) {
    placeholderText = inputBoxMobile.attribute('placeholder');
  }

  // 將 placeholder 按換行符分割成行
  typewriterLines = placeholderText.split('\n');

  // 計算總字元數（不包含換行符）
  typewriterTotalChars = typewriterLines.reduce((sum, line) => sum + line.length, 0);

  // 初始化動畫參數
  typewriterCurrentLine = 0;
  typewriterCurrentChar = 0;
  typewriterStartTime = millis();
  typewriterActive = true;

  // 清空 placeholder 準備開始動畫
  inputBox.attribute('placeholder', '');
  if (inputBoxMobile) {
    inputBoxMobile.attribute('placeholder', '');
  }
}

// --- p5.js 繪圖迴圈 ---
function draw() {
  // 保持canvas透明，讓CSS控制頁面背景
  clear();

  // --- 更新新彩蛋動畫 ---
  updateSpecialEasterEggAnimation();

  // --- 更新新彩蛋顯示（DOM 元素）---
  updateSpecialEasterEggDisplay();

  // --- 描邊顏色 Lerp 動畫 ---
  if (mode === "Wireframe" && strokeColorLerpProgress < 1) {
    // 計算 lerp 進度
    let elapsedTime = millis() - strokeColorLerpStartTime;
    strokeColorLerpProgress = constrain(elapsedTime / strokeColorLerpDuration, 0, 1);

    // 使用 easing function（ease-out）
    let easedProgress = 1 - pow(1 - strokeColorLerpProgress, 3);

    // Lerp 顏色
    if (currentStrokeColor && targetStrokeColor) {
      wireframeStrokeColor = lerpColor(currentStrokeColor, targetStrokeColor, easedProgress);

      // 更新輸入框文字顏色和 icons（跟隨顏色變化）
      updateInputTextColor();
      updateIconsForMode();
    }
  }

  // --- 頁面載入動畫 ---
  let timeSinceLoad = millis() - pageLoadStartTime;

  // === 桌面版動畫 ===
  if (!isMobileMode) {
    // 1. 輸入框 fade in (0ms - fadeInDuration)
    if (timeSinceLoad < fadeInDuration) {
      inputBoxOpacity = map(timeSinceLoad, 0, fadeInDuration, 0, 1);
    } else {
      inputBoxOpacity = 1;
    }

    // 2. Logo 和 Control panel 在打字機動畫結束後 + fadeInDelay 延遲後同時 fade in
    // 打字機動畫持續時間：typewriterDuration (1200ms)
    // 延遲時間：fadeInDelay (400ms)
    // Logo 和 Panel 同時開始時間：typewriterDuration + fadeInDelay (1600ms)
    let logoAndPanelStartTime = typewriterDuration + fadeInDelay;

    // Logo fade in
    if (timeSinceLoad >= logoAndPanelStartTime && timeSinceLoad < logoAndPanelStartTime + fadeInDuration) {
      logoOpacity = map(timeSinceLoad, logoAndPanelStartTime, logoAndPanelStartTime + fadeInDuration, 0, 1);
    } else if (timeSinceLoad >= logoAndPanelStartTime + fadeInDuration) {
      logoOpacity = 1;
    }

    // Control panel fade in (與 Logo 同時開始)
    if (timeSinceLoad >= logoAndPanelStartTime && timeSinceLoad < logoAndPanelStartTime + fadeInDuration) {
      controlPanelOpacity = map(timeSinceLoad, logoAndPanelStartTime, logoAndPanelStartTime + fadeInDuration, 0, 1);
    } else if (timeSinceLoad >= logoAndPanelStartTime + fadeInDuration) {
      controlPanelOpacity = 1;
    }
  }
  // === 手機版動畫：依序 Logo → 輸入框 → Btn Bar ===
  else {
    // 1. Logo fade in (0ms - fadeInDuration)
    if (timeSinceLoad < fadeInDuration) {
      logoOpacity = map(timeSinceLoad, 0, fadeInDuration, 0, 1);
    } else {
      logoOpacity = 1;
    }

    // 2. 輸入框在 Logo 完成後 + fadeInDelay 延遲後 fade in
    let inputBoxStartTime = fadeInDuration + fadeInDelay;
    if (timeSinceLoad >= inputBoxStartTime && timeSinceLoad < inputBoxStartTime + fadeInDuration) {
      inputBoxOpacity = map(timeSinceLoad, inputBoxStartTime, inputBoxStartTime + fadeInDuration, 0, 1);
    } else if (timeSinceLoad >= inputBoxStartTime + fadeInDuration) {
      inputBoxOpacity = 1;
    } else {
      inputBoxOpacity = 0;
    }

    // 3. Btn Bar 在輸入框完成後 + fadeInDelay 延遲後 fade in
    let btnBarStartTime = inputBoxStartTime + fadeInDuration + fadeInDelay;
    if (timeSinceLoad >= btnBarStartTime && timeSinceLoad < btnBarStartTime + fadeInDuration) {
      controlPanelOpacity = map(timeSinceLoad, btnBarStartTime, btnBarStartTime + fadeInDuration, 0, 1);
    } else if (timeSinceLoad >= btnBarStartTime + fadeInDuration) {
      controlPanelOpacity = 1;
    } else {
      controlPanelOpacity = 0;
    }
  }

  // 應用透明度到 DOM 元素
  if (inputBox) inputBox.style('opacity', inputBoxOpacity.toString());
  if (inputBoxMobile) inputBoxMobile.style('opacity', inputBoxOpacity.toString());
  // 新的手機版底部輸入框也套用透明度
  let mobileInputBoxBottom = select("#mobile-input-box");
  if (mobileInputBoxBottom) mobileInputBoxBottom.style('opacity', inputBoxOpacity.toString());
  // 桌面版：輸入框容器跟隨輸入框透明度
  let inputContainer = select('.input-container');
  if (inputContainer && !isMobileMode) inputContainer.style('opacity', inputBoxOpacity.toString());
  // Canvas 容器跟隨 logo 透明度
  if (canvasContainer) canvasContainer.style('opacity', logoOpacity.toString());
  // 控制面板
  let controlPanel = select('.control-panel');
  if (controlPanel && !isMobileMode) controlPanel.style('opacity', controlPanelOpacity.toString());

  // 手機版：輸入框區域的滑入動畫
  let mobileInputArea = select('.mobile-input-area');
  if (mobileInputArea && isMobileMode) {
    let inputBoxStartTime = fadeInDuration + fadeInDelay;
    if (timeSinceLoad >= inputBoxStartTime && timeSinceLoad < inputBoxStartTime + fadeInDuration) {
      let progress = (timeSinceLoad - inputBoxStartTime) / fadeInDuration;
      // 使用 easeOutCubic 緩動函數讓動畫更自然
      let easeProgress = 1 - Math.pow(1 - progress, 3);
      let translateX = -100 + (easeProgress * 100); // 從 -100% 到 0%
      mobileInputArea.style('transform', `translateX(${translateX}%)`);
      mobileInputArea.style('opacity', progress.toString());
    } else if (timeSinceLoad >= inputBoxStartTime + fadeInDuration) {
      mobileInputArea.style('transform', 'translateX(0)');
      mobileInputArea.style('opacity', '1');
    } else {
      mobileInputArea.style('transform', 'translateX(-100%)');
      mobileInputArea.style('opacity', '0');
    }
  }

  // 手機版：底部按鈕列
  let mobileBottomBar = select('.mobile-bottom-bar');
  if (mobileBottomBar && isMobileMode) {
    mobileBottomBar.style('opacity', controlPanelOpacity.toString());
  }

  // --- 打字機動畫更新 ---
  if (typewriterActive) {
    let elapsed = millis() - typewriterStartTime;
    let progress = constrain(elapsed / typewriterDuration, 0, 1);

    // 計算當前應該已經打了多少個字元（總計）
    let targetTotalChars = floor(progress * typewriterTotalChars);

    // 計算目前已經打了多少字元
    let currentTotalChars = 0;
    for (let i = 0; i < typewriterCurrentLine; i++) {
      currentTotalChars += typewriterLines[i].length;
    }
    currentTotalChars += typewriterCurrentChar;

    // 如果需要前進
    if (targetTotalChars > currentTotalChars) {
      // 計算需要前進多少字元
      let charsToAdd = targetTotalChars - currentTotalChars;

      for (let i = 0; i < charsToAdd; i++) {
        // 檢查當前行是否已經打完
        if (typewriterCurrentChar >= typewriterLines[typewriterCurrentLine].length) {
          // 換到下一行
          typewriterCurrentLine++;
          typewriterCurrentChar = 0;

          // 檢查是否已經打完所有行
          if (typewriterCurrentLine >= typewriterLines.length) {
            typewriterActive = false;
            break;
          }
        } else {
          // 在當前行繼續打字
          typewriterCurrentChar++;
        }
      }

      // 構建當前要顯示的文字
      let displayText = '';
      for (let i = 0; i <= typewriterCurrentLine && i < typewriterLines.length; i++) {
        if (i < typewriterCurrentLine) {
          // 完整顯示之前的行
          displayText += typewriterLines[i];
          if (i < typewriterLines.length - 1) {
            displayText += '\n';
          }
        } else if (i === typewriterCurrentLine) {
          // 部分顯示當前行
          displayText += typewriterLines[i].substring(0, typewriterCurrentChar);
        }
      }

      // 更新 placeholder
      inputBox.attribute('placeholder', displayText);
      if (inputBoxMobile) {
        inputBoxMobile.attribute('placeholder', displayText);
      }
    }

    // 動畫完成
    if (progress >= 1 || !typewriterActive) {
      typewriterActive = false;
      // 顯示完整文字
      let fullText = typewriterLines.join('\n');
      inputBox.attribute('placeholder', fullText);
      if (inputBoxMobile) {
        inputBoxMobile.attribute('placeholder', fullText);
      }
    }
  }

  // 直接處理模式轉換，不需要漸變（CSS有transition效果）
  if (mode !== targetMode) {
    previousMode = mode; // 保存上一次的模式到全域變數

    // 所有模式切換都不使用 fade 效果，直接切換

    // 如果切換到 Wireframe 模式，重置色環以隨機選擇新顏色
    if (targetMode === "Wireframe" && previousMode !== "Wireframe") {
      if (colorPickerCanvas) {
        // 清理全局事件監聽器
        document.removeEventListener('mousemove', handleColorPickerMouseMove);
        document.removeEventListener('mouseup', handleColorPickerMouseUp);
        document.removeEventListener('touchend', handleColorPickerMouseUp);

        colorPickerCanvas.remove(); // 移除舊的 canvas
        colorPickerCanvas = null;
      }

      // 立即設定wireframe顏色（隨機色相），確保updateIconsForMode能使用正確的顏色
      selectedHue = random(0, 360);
      colorMode(HSB, 360, 100, 100);
      wireframeColor = color(selectedHue, 80, 100);
      colorMode(RGB, 255);

      // 啟動描邊顏色過渡動畫（而不是直接設置）
      let newStrokeColor = getContrastColor(wireframeColor);
      startStrokeColorTransition(newStrokeColor);

      // 先設置 body class 為 wireframe-mode，避免背景閃爍
      let body = select('body');
      if (body) {
        body.removeClass('standard-mode');
        body.removeClass('inverse-mode');
        body.addClass('wireframe-mode');
      }

      // 更新背景顏色（使用 CSS 變數）
      updateBackgroundColor(wireframeColor);

      // 更新輸入框文字顏色
      updateInputTextColor();
    }

    // 如果離開 Wireframe 模式，停止 color wheel 旋轉並重置背景顏色
    if (previousMode === "Wireframe" && targetMode !== "Wireframe") {
      isColorWheelRotating = false;
      updateColorWheelIcon();

      // 重置背景顏色為黑色或白色（根據目標模式）
      let resetColor = (targetMode === "Inverse") ? color(255) : color(0);
      updateBackgroundColor(resetColor);

      // 恢復 transition，確保切換模式時有 fade 效果
      let body = select('body');
      let canvasContainer = select('#canvas-container');
      let desktopCanvasContainer = select('#desktop-canvas-container');
      if (body) {
        body.elt.style.transition = '';
      }
      if (canvasContainer) {
        canvasContainer.elt.style.transition = '';
      }
      if (desktopCanvasContainer) {
        desktopCanvasContainer.elt.style.transition = '';
      }
    }

    mode = targetMode; // 立即切換模式

    // 如果切換到非 Wireframe 模式，確保恢復 transition（即使 wheel 正在旋轉）
    if (targetMode !== "Wireframe") {
      let body = select('body');
      let canvasContainer = select('#canvas-container');
      let desktopCanvasContainer = select('#desktop-canvas-container');
      if (body) {
        body.elt.style.transition = '';
      }
      if (canvasContainer) {
        canvasContainer.elt.style.transition = '';
      }
      if (desktopCanvasContainer) {
        desktopCanvasContainer.elt.style.transition = '';
      }
    }

    updateUI(); // 立即更新UI，包括body class（此時wireframeStrokeColor已經設定好了）
  }

  // --- Color Wheel 旋轉動畫 ---
  if (mode === "Wireframe" && isColorWheelRotating) {
    // 使用與 R slider 相同的旋轉速度 (baseSpeeds[0] = 0.125)
    // 直接更新 selectedHue，讓圓圈往右移動
    selectedHue += baseSpeeds[0];

    // Play 模式：允許 selectedHue 超出 0-360 範圍，實現循環效果
    // 當完成一個完整循環（超過一個週期）時才重置
    if (selectedHue >= 720) {
      selectedHue -= 360;
    } else if (selectedHue < -360) {
      selectedHue += 360;
    }

    // 更新背景顏色（使用 selectedHue 的 normalizedHue）
    let normalizedHue = selectedHue % 360;
    if (normalizedHue < 0) normalizedHue += 360;

    colorMode(HSB, 360, 100, 100);
    wireframeColor = color(normalizedHue, 80, 100);
    colorMode(RGB, 255);

    // 根據亮度決定描邊顏色
    let newStrokeColor = getContrastColor(wireframeColor);
    startStrokeColorTransition(newStrokeColor);

    // 更新背景顏色
    updateBackgroundColor(wireframeColor, true);

    // 計算 indicator 在色環上的位置（桌面版用 normalizedHue）
    let angleRad = radians(normalizedHue - 90); // -90 因為從頂部開始
    // 根據設備選擇正確的 container
    let containerId = isMobileMode ? 'mobile-colorpicker-container' : 'colorpicker-container';
    let container = select('#' + containerId);
    if (container) {
      let containerSize = Math.min(container.elt.clientWidth, container.elt.clientHeight);
      let outerRadius = containerSize / 2 - 2;
      let innerRadius = outerRadius * 0.55;
      let arcRadius = (outerRadius + innerRadius) / 2;

      // 將極坐標轉換為 0-1 範圍的 X, Y
      colorPickerIndicatorX = (cos(angleRad) * arcRadius + containerSize / 2) / containerSize;
      colorPickerIndicatorY = (sin(angleRad) * arcRadius + containerSize / 2) / containerSize;
    }

    // 更新輸入框文字顏色（即時更新，與背景同步）
    updateInputTextColor();

    // 更新所有 icon 顏色（包括 play/pause icon）
    updateIconsForMode();
  }

  // --- 色環繪製 (Wireframe 模式) ---
  if (mode === "Wireframe") {
    if (!colorPickerCanvas && colorPickerReady) {
      // 初始化色環（桌面版）或色條（手機版）
      // 根據設備選擇正確的 container
      let containerId = isMobileMode ? 'mobile-colorpicker-container' : 'colorpicker-container';
      let container = select('#' + containerId);
      if (container) {
        let containerWidth = container.elt.clientWidth;
        let containerHeight = container.elt.clientHeight;

        let canvasWidth, canvasHeight;

        if (isMobileMode) {
          // 手機版：使用實際容器尺寸（橫向長條）
          canvasWidth = containerWidth;
          canvasHeight = containerHeight;
        } else {
          // 桌面版：取較小值確保是正方形
          let containerSize = Math.min(containerWidth, containerHeight);
          canvasWidth = containerSize;
          canvasHeight = containerSize;
        }

        if (canvasWidth > 0 && canvasHeight > 0) {
          colorPickerCanvas = createGraphics(canvasWidth, canvasHeight);
          colorPickerCanvas.parent(containerId);

          // 設置 canvas 樣式 - 不要設置 width/height 為 100%，讓它保持原始尺寸
          colorPickerCanvas.elt.style.display = 'block';
          colorPickerCanvas.elt.style.margin = 'auto';

          // 設置初始 indicator 位置（使用已經設定好的 selectedHue）
          // selectedHue 已經在模式切換時設定好了，不需要重新隨機
          colorPickerIndicatorX = 0.5;
          colorPickerIndicatorY = 0.25;

          // wireframeColor 和 wireframeStrokeColor 已經在模式切換時設定好了
          // 不需要重新設定，避免閃爍

          // 綁定鼠標事件
          colorPickerCanvas.elt.addEventListener('mousedown', handleColorPickerMouseDown);
          colorPickerCanvas.elt.addEventListener('mousemove', handleColorPickerMouseMove);
          colorPickerCanvas.elt.addEventListener('mouseup', handleColorPickerMouseUp);

          // 添加 touch 事件支持（手機端）
          colorPickerCanvas.elt.addEventListener('touchstart', handleColorPickerTouchStart);
          colorPickerCanvas.elt.addEventListener('touchmove', handleColorPickerTouchMove);
          colorPickerCanvas.elt.addEventListener('touchend', handleColorPickerMouseUp);
          colorPickerCanvas.elt.addEventListener('touchcancel', handleColorPickerMouseUp);

          // 全局事件，確保在 canvas 外也能繼續拖曳和停止
          document.addEventListener('mousemove', handleColorPickerMouseMove);
          document.addEventListener('mouseup', handleColorPickerMouseUp);
          document.addEventListener('touchend', handleColorPickerMouseUp);

          // 繪製色環
          drawColorWheel();
        }
      }
    } else {
      // 每一幀重繪（因為 indicator 可能移動）
      drawColorWheel();
    }
  } 
  
  // --- 淡入淡出邏輯 ---
  let currentLogoAlpha = logoAlpha;
  let currentEasterEggAlpha = easterEggAlpha;

  if (isFading) {
    let elapsedTime = millis() - fadeStartTime;
    // 根據是否為模式切換使用不同的 duration
    let duration = isModeTransition ? modeTransitionDuration : fadeDuration;
    let fadeProgress = constrain(elapsedTime / duration, 0, 1);

    if (isEasterEggActive) {
      currentLogoAlpha = lerp(255, 0, fadeProgress);
      currentEasterEggAlpha = lerp(0, 255, fadeProgress);
    } else {
      // 模式切換或一般 fade：從 0 fade in 到 255
      currentLogoAlpha = lerp(0, 255, fadeProgress);
      currentEasterEggAlpha = lerp(255, 0, fadeProgress);
    }

    if (fadeProgress === 1) {
      isFading = false;
      isModeTransition = false; // 重置模式切換標記
      logoAlpha = currentLogoAlpha;
      easterEggAlpha = currentEasterEggAlpha;
    }
  } else {
      currentLogoAlpha = isEasterEggActive ? 0 : 255;
      currentEasterEggAlpha = isEasterEggActive ? 255 : 0;
  }
  
  // --- Placeholder SVG 繪製 ---
  // 非彩蛋模式時，當沒有文字或正在 fade out 時繪製（透明度由 placeholderAlpha 控制）
  if (!isEasterEggActive && (letters.length === 0 || placeholderAlpha > 1)) {
    // 延遲載入 placeholder 圖片（只在第一次需要時載入）
    loadPlaceholderImages();
    drawPlaceholder(this);
  }

  // --- Logo 繪製 ---
  // 只有在非彩蛋模式、有字母、且透明度大於 0 時才繪製動態 Logo
  if (!isEasterEggActive && letters.length > 0 && currentLogoAlpha > 0) {
    // 使用 push/pop 並設置全域透明度，讓整個 logo 作為一個整體 fade
    push();

    // 設置全域 alpha，這樣所有繪製操作都會受影響
    drawingContext.globalAlpha = currentLogoAlpha / 255;

    // 繪製 logo（內部 alpha 設為 255，因為透明度已在外層控制）
    drawLogo(this, 255);

    pop(); // 恢復 globalAlpha
  }

  // --- 彩蛋圖片繪製 ---
  if (isEasterEggActive && currentEasterEggAlpha > 0) {
    push();
    tint(255, currentEasterEggAlpha);
    // 根據模式選擇要顯示的彩蛋圖片 (使用 _2 版本)
    let imgToShow;
    if (mode === 'Wireframe') {
      // Wireframe 模式：根據描邊顏色選擇黑色或白色線框版本
      imgToShow = (wireframeStrokeColor && red(wireframeStrokeColor) > 128)
        ? sccdWhiteWireframeImg_2
        : sccdBlackWireframeImg_2;
    } else {
      // Standard/Inverse 模式
      imgToShow = (mode === 'Inverse') ? sccdWhiteImg_2 : sccdBlackImg_2;
    }

    // 動態計算彩蛋圖片大小，根據 canvas 尺寸縮放
    // 桌面版基準：432x540 canvas，圖片大小 378 (300 * 1.26)
    // 手機版和鍵盤模式：按照 canvas 寬度等比例縮放，並縮小 5% 避免裁切
    let easterEggSize = isMobileMode ? (width / 432) * 378 * 0.95 : 378 * 0.95;
    image(imgToShow, width / 2, height / 2, easterEggSize, easterEggSize);
    pop();
  }

  // --- 新彩蛋圖片繪製（COOLGUY, CHILLGUY）---
  // 注意：新彩蛋圖片不在這裡繪製，改用 DOM 元素覆蓋在整個 window 上
  // 參考 updateSpecialEasterEggDisplay() 函數
}

// --- 獲取當前活動的輸入框 ---
function getCurrentInputBox() {
    return isMobileMode ? inputBoxMobile : inputBox;
}

// --- 同步所有輸入框的內容 ---
function syncInputBoxes(sourceValue) {
    if (inputBox) {
        inputBox.value(sourceValue);
    }
    if (inputBoxMobile) {
        inputBoxMobile.value(sourceValue);
    }
    // 同步新的手機版底部輸入框
    let mobileInputBoxBottom = select("#mobile-input-box");
    if (mobileInputBoxBottom) {
        mobileInputBoxBottom.value(sourceValue);
    }
}

// --- 更新 letters 陣列的函數 (重新命名為 handleInput) ---
function handleInput(event) {
    // 確定是哪個輸入框觸發了事件
    let sourceInputBox = event ? event.target : getCurrentInputBox().elt;

    // textarea 使用 value
    let currentInput = sourceInputBox.value;

    // 獲取輸入框的內容，轉換為大寫，並移除所有非字母字元（保留空格和換行以便後續處理）
    let rawInput = currentInput.toUpperCase();
    let validInput = rawInput.replace(/[^A-Z \n]/g, "");

    // 移除開頭的所有空白字元（空格和換行）
    validInput = validInput.replace(/^[\s\n]+/, '');

    // 合併多個連續空格為單個空格
    validInput = validInput.replace(/ {2,}/g, ' ');
    let lines = validInput.split("\n");
    if (lines.length > 3) {
      validInput = lines.slice(0, 3).join("\n");
    }

    // 限制最大字元數為 40（計算純字母，不含空格換行）
    let pureLetters = validInput.replace(/[\s\n]/g, "");
    if (pureLetters.length > 40) {
        // 超過 40 字，需要截斷
        // 重新組裝，保留空格和換行，但只取前 40 個字母
        let letterCount = 0;
        let result = '';
        for (let char of validInput) {
            if (char === ' ' || char === '\n') {
                result += char; // 保留空格和換行
            } else if (letterCount < 40) {
                result += char;
                letterCount++;
            }
        }
        validInput = result;
    }

    // 同步更新兩個輸入框
    syncInputBoxes(validInput);

    // 根據字數調整手機版輸入框的字體大小
    let mobileInputBoxBottom = select("#mobile-input-box");
    if (mobileInputBoxBottom) {
        // 計算純字母數量（不含空格和換行）
        let pureLetterCount = validInput.replace(/[\s\n]/g, "").length;
        if (pureLetterCount > 6) {
            mobileInputBoxBottom.addClass('small-text');
        } else {
            mobileInputBoxBottom.removeClass('small-text');
        }

        // 等待 CSS transition 完成後再調整垂直置中（font-size transition 是 0.2s = 200ms）
        // 加上一點緩衝時間確保渲染完成，與桌面版一致
        setTimeout(() => {
            updateMobileInputBoxVerticalAlignment(mobileInputBoxBottom, validInput);
        }, 220);
    }

    // 彩蛋邏輯
    let previousEasterEggState = isEasterEggActive;
    let normalizedInput = validInput.toUpperCase().replace(/[\s\n]/g, "");
    isEasterEggActive = (normalizedInput === easterEggString || normalizedInput === "SCCD");

    // 手機版：設置彩蛋 data 屬性（用於 CSS 高度調整）
    if (isMobileMode) {
      const mobileInputBox = select('#mobile-input-box');
      if (mobileInputBox) {
        if (normalizedInput === "SCCD") {
          mobileInputBox.attribute('data-easter-egg', 'sccd');
        } else if (normalizedInput === easterEggString) {
          mobileInputBox.attribute('data-easter-egg', 'fullname');
        } else {
          mobileInputBox.removeAttribute('data-easter-egg');
        }
      }
    }

    // Bug fix：彩蛋觸發時自動關閉 Custom 面板（手機版）
    if (isMobileMode && isEasterEggActive && !previousEasterEggState) {
      // 彩蛋剛剛觸發（從 false 變成 true）
      if (mobileElements.customAngleControls && !mobileElements.customAngleControls.hasClass('hidden')) {
        // Custom 面板是打開的，需要關閉它
        mobileElements.customAngleControls.addClass('hidden');

        // 移除 has-custom class
        const logoContainer = document.querySelector('.mobile-logo-container');
        const inputArea = document.querySelector('.mobile-input-area');
        if (logoContainer) logoContainer.classList.remove('has-custom');
        if (inputArea) inputArea.classList.remove('has-custom');

        // 移除 custom-open class
        if (mobileElements.inputBox) {
          mobileElements.inputBox.removeClass('custom-open');
          mobileElements.inputBox.elt.classList.remove('overflowing');
        }

        // 重新調整 canvas 尺寸
        requestCanvasResize();

        // 更新按鈕狀態
        updateCustomRotateButtonStates();
      }
    }

    // 新彩蛋邏輯（COOLGUY, CHILLGUY）
    // 只有在不是動畫中時才檢測
    // 並且需要檢查是否真的有內容變化（避免按無效鍵觸發）
    if (!specialEasterEggAnimating) {
      // 儲存上一次的 normalizedInput 來比較
      if (typeof handleInput.previousNormalizedInput === 'undefined') {
        handleInput.previousNormalizedInput = '';
      }

      // 只有在內容真的改變時才檢查彩蛋
      if (normalizedInput !== handleInput.previousNormalizedInput) {
        if (normalizedInput === "COOLGUY") {
          specialEasterEggType = "COOLGUY";
          triggerSpecialEasterEgg();
        } else if (normalizedInput === "CHILLGUY") {
          specialEasterEggType = "CHILLGUY";
          triggerSpecialEasterEgg();
        }

        // 更新記錄
        handleInput.previousNormalizedInput = normalizedInput;
      }
    }

    // 顯示圖片已在 preload() 中載入，無需額外處理
  
    // --- UI 啟用/禁用邏輯 ---
    if (letters.length > 0 && !isEasterEggActive) {
        if (rotateButton.elt.hasAttribute('disabled')) {
            rotateButton.removeAttribute('disabled');
            customButton.removeAttribute('disabled');
            // 首次啟用時，預設進入 custom mode
            isCustomMode = true;
            updateUI();
        }
    } else {
        rotateButton.attribute('disabled', '');
        customButton.attribute('disabled', '');
        // 沒有文字時，關閉 custom mode
        isCustomMode = false;
        updateUI();
    }

    if (isEasterEggActive !== previousEasterEggState) {
        isFading = true;
        fadeStartTime = millis();
    }

    // 手機版：如果在 Wireframe + Custom 模式，檢查文字溢出狀態
    if (isMobileMode && mode === 'Wireframe' && typeof checkInputOverflow === 'function') {
        // 如果 custom 區塊是打開的
        const mobileInputBox = select('#mobile-input-box');
        if (mobileInputBox && mobileInputBox.hasClass('custom-open')) {
            setTimeout(() => checkInputOverflow(), 0); // 延遲執行以確保 DOM 更新
        }
    }
  
    // 最終，移除所有空格和換行符，得到用於生成 Logo 的純字母陣列
    let previousLettersLength = letters.length;
    letters = validInput.replace(/[\s\n]/g, "").split("");

    // 控制 Placeholder 的 fade in/out
    if (letters.length === 0) {
      targetPlaceholderAlpha = 255; // Fade in（沒有文字時顯示）

      // Bug fix: 刪除所有文字時，關閉手機版 Custom 面板並恢復 logo 大小
      if (isMobileMode && mobileElements && mobileElements.customAngleControls) {
        if (!mobileElements.customAngleControls.hasClass('hidden')) {
          // Custom 面板是打開的，需要關閉它
          mobileElements.customAngleControls.addClass('hidden');

          // 移除 has-custom class，讓 logo 恢復到 100%
          const logoContainer = document.querySelector('.mobile-logo-container');
          const inputArea = document.querySelector('.mobile-input-area');
          if (logoContainer) logoContainer.classList.remove('has-custom');
          if (inputArea) inputArea.classList.remove('has-custom');

          // 移除 custom-open class
          if (mobileElements.inputBox) {
            mobileElements.inputBox.removeClass('custom-open');
            mobileElements.inputBox.elt.classList.remove('overflowing');
          }

          // 重新調整 canvas 尺寸（因為 logo-container 變大了）
          requestCanvasResize();

          // 更新按鈕狀態
          updateCustomRotateButtonStates();
        }
      }
    } else if (previousLettersLength === 0 && letters.length > 0) {
      targetPlaceholderAlpha = 0; // Fade out（剛輸入文字時隱藏）
    }

    // 每次手動輸入文字時，都停止自動旋轉並重置角度
    if (!isEasterEggActive) {
      autoRotate = false;
      isAutoRotateMode = false; // 確保退出自動模式
      // 重置桌面版按鈕icon
      updateRotateIcon();
    }
    rotationAngles = new Array(letters.length).fill(0);
    originalRotationAngles = [...rotationAngles]; // 儲存一份乾淨的初始角度
  
    // 更新字體大小
    adjustInputFontSize();
  
    // 圓圈顯示邏輯 - 已移除
    // 清理任何待處理的 timeout
    if (circleFillTimeout) {
      clearTimeout(circleFillTimeout);
      circleFillTimeout = null;
    }

    // 確保圓圈始終不顯示
    showCircle = false;
    circleShrinking = false;
    circleAlpha = 0;

    // 在函數結尾呼叫 UI 更新
    updateUI();
}

// --- 繪製 Placeholder SVG Wireframe ---
function drawPlaceholder(pg) {
  // 檢查圖片是否已載入（防止手機版首次載入時圖片未完成載入）
  if (!placeholderR || !placeholderG || !placeholderB ||
      !placeholderR_white || !placeholderG_white || !placeholderB_white) {
    return; // 圖片尚未載入完成，跳過繪製
  }

  // 更新旋轉角度（使用 placeholderBaseSpeeds: [0.125, -0.125, 0.25] 對應 R, G, B，速度減緩75%）
  placeholderRotations[0] += placeholderBaseSpeeds[0]; // R: 0.125
  placeholderRotations[1] += placeholderBaseSpeeds[1]; // G: -0.125
  placeholderRotations[2] += placeholderBaseSpeeds[2]; // B: 0.25

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

// --- 新增：調整輸入框字體大小的函數 ---
function adjustInputFontSize() {
    // 在手機模式下，字體大小由CSS控制，不需要動態調整
    if (isMobileMode) return;

    let targetFontSize;

    // 計算字元數（移除空格和換行）
    let charCount = letters.length;

    // 根據字元數決定字體大小（彩蛋模式和正常模式使用相同邏輯）
    if (charCount === 0) {
        targetFontSize = largeFontSize; // 空白時使用 120px（配合 placeholder）
    } else if (charCount <= 3) {
        targetFontSize = extraLargeFontSize; // 1-3 字：180px
    } else if (charCount <= 15) {
        targetFontSize = largeFontSize; // 4-15 字：120px
    } else if (charCount <= 30) {
        targetFontSize = mediumFontSize; // 16-30 字：90px
    } else {
        targetFontSize = smallFontSize; // 31-40 字：60px
    }

    // 更新字體大小
    inputBox.style("font-size", targetFontSize);

    // 所有字體大小都使用統一的 line-height
    inputBox.style("line-height", "1.1");

    // 等待 CSS transition 完成後再測量（font-size transition 是 0.2s = 200ms）
    // 加上一點緩衝時間確保渲染完成
    setTimeout(() => {
        adjustTextareaHeight(targetFontSize);
    }, 220);
}

// --- 精確的垂直置中函數（使用 Canvas 測量實際文字渲染高度）---
function adjustTextareaHeight(fontSize) {
    if (isMobileMode || !inputBox) return;

    // 獲取當前內容
    let content = inputBox.value();

    // 如果沒有內容，padding-top 設為 0
    if (!content || content.length === 0) {
        inputBox.style('padding-top', '0px');
        return;
    }

    // 如果沒有傳入 fontSize，從 inputBox 讀取
    if (!fontSize) {
        fontSize = inputBox.style('font-size');
    }

    // 使用 Canvas 來精確測量文字高度（不受 textarea 游標影響）
    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');

    // 設定與 textarea 相同的字體樣式
    let fontSizeNum = parseFloat(fontSize);

    // 讀取 line-height（可能是純數字或帶單位的字串）
    let lineHeightValue = window.getComputedStyle(inputBox.elt).lineHeight;
    let lineHeight;
    if (lineHeightValue === 'normal') {
        lineHeight = 1.1; // 預設值
    } else if (lineHeightValue.includes('px')) {
        // 如果是 px 單位，轉換為相對於 fontSize 的倍數
        lineHeight = parseFloat(lineHeightValue) / fontSizeNum;
    } else {
        // 純數字
        lineHeight = parseFloat(lineHeightValue);
    }

    ctx.font = `${fontSize} ${inputBox.style('font-family')}`;

    // 取得 textarea 的實際寬度（textarea 沒有設定 padding，直接使用完整寬度）
    let textareaWidth = inputBox.elt.clientWidth;

    // 將文字按換行符分割
    let lines = content.split('\n');
    let totalLines = 0;

    // 對每一行進行寬度測量，計算實際需要多少行
    for (let line of lines) {
        if (line.length === 0) {
            // 空行也算一行
            totalLines += 1;
        } else {
            // 測量這一行的文字寬度
            let lineWidth = ctx.measureText(line).width;

            // 如果超過容器寬度，需要計算會自動換成幾行
            if (lineWidth > textareaWidth) {
                // 逐字測量，找出每行能放多少字
                let currentLineWidth = 0;
                let currentLineCount = 1;

                for (let i = 0; i < line.length; i++) {
                    let charWidth = ctx.measureText(line[i]).width;
                    currentLineWidth += charWidth;

                    if (currentLineWidth > textareaWidth) {
                        // 超出寬度，換行
                        currentLineCount++;
                        currentLineWidth = charWidth;
                    }
                }

                totalLines += currentLineCount;
            } else {
                // 不需要自動換行
                totalLines += 1;
            }
        }
    }

    // 計算總高度（行數 * 行高）
    let contentHeight = totalLines * (fontSizeNum * lineHeight);
    let containerHeight = 400;

    // 計算 padding-top（垂直置中）
    let paddingTop = Math.max(0, (containerHeight - contentHeight) / 2);

    // 設定 padding
    inputBox.style('padding-top', paddingTop + 'px');
}


// --- 新增：角度正規化函數（將角度正規化到 -180° 到 180° 之間）---
function normalizeAngle(angle) {
    angle = angle % 360;
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;
    return angle;
}

// --- 新增：處理角度輸入框的數值換算 ---
function convertAngleInput(value) {
    // 移除非數字字符（保留負號和數字）
    let numericValue = value.replace(/[^\d-]/g, '');

    // 如果是空字符串，返回 0
    if (numericValue === '' || numericValue === '-') {
        return 0;
    }

    // 轉換為數字
    let angle = parseInt(numericValue, 10);

    // 如果不是有效數字，返回 0
    if (isNaN(angle)) {
        return 0;
    }

    // 對 360 取餘數，保留負值
    angle = angle % 360;
    return angle;
}

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

// --- 新增：計算最短旋轉路徑 ---
function getShortestRotation(currentAngle, targetAngle) {
    // 計算差值
    let diff = targetAngle - currentAngle;
    // 正規化差值到 -180° 到 180°
    return normalizeAngle(diff);
}

// --- 新增：重設角度偏移的輔助函數 ---
function resetRotationOffsets() {
    // 使用陣列迴圈重置所有 sliders
    for (let i = 0; i < 3; i++) {
      if (sliders[i]) sliders[i].value(0);
    }
    updateSliders(); // 確保全域變數也被更新
}

// --- 新增：模式按鈕 icon 隨機旋轉動畫 ---
function animateModeIconRotation(iconElement) {
  if (!iconElement) return;

  const imgEl = iconElement.elt;

  // 生成隨機角度（-100 到 100 度之間）
  const randomAngle = Math.floor(Math.random() * 201) - 100;

  // 動畫持續時間
  const duration = 600; // 600ms

  // 使用平滑過渡旋轉到新的隨機角度
  imgEl.style.transition = `transform ${duration}ms ease-in-out`;
  imgEl.style.transform = `rotate(${randomAngle}deg)`;
}

// --- 新增：下載按鈕 icon 動畫（手機版用 CSS，桌面版用 JS）---
function animateSaveButton(button, iconElement) {
    if (!button || !iconElement) {
        return;
    }

    const rotateDuration = 800; // Generate icon 旋轉時長：800ms
    const fadeInOutDuration = 200; // 淡入淡出時間：200ms
    const scaleUpDuration = 100; // Generate icon 放大時間：100ms（快速出現）

    // 動態獲取當前的 icon 後綴（避免在動畫期間模式變更導致 icon 不匹配）
    const getCurrentSuffix = () => getIconSuffix();

    // 動態獲取 Generate icon 路徑
    const getGenerateIconSrc = () => `Panel Icon/Generate${getCurrentSuffix()}.svg`;

    // 動態獲取原始 icon 路徑（根據當前狀態決定）
    const getOriginalIconSrc = () => {
        const suffix = getCurrentSuffix();
        if (isEasterEggActive) {
            return `Panel Icon/Gift${suffix}.svg`;
        }
        return `Panel Icon/Download${suffix}.svg`;
    };

    // 獲取原生DOM元素
    const imgEl = iconElement.elt;

    // 檢查是否為手機版
    const isMobile = imgEl.id === 'save-img-mobile';

    if (isMobile) {
        // === 手機版：使用 CSS Animation ===
        // 確保 icon 是正確的 Download/Gift icon（防止重複點擊或狀態異常）
        iconElement.attribute('src', getOriginalIconSrc());

        // 清除所有可能存在的動畫和 inline 樣式
        imgEl.removeAttribute('style');
        imgEl.classList.remove('save-icon-animating');
        void imgEl.offsetHeight; // 強制重繪

        // 1. 縮小原 icon 並淡出
        imgEl.classList.add('save-icon-animating');
        imgEl.style.animation = `save-icon-shrink ${fadeInOutDuration}ms ease forwards`;

        // 2. fadeInOutDuration 後切換到 Generate icon，並快速放大
        setTimeout(() => {
            iconElement.attribute('src', getGenerateIconSrc()); // 動態獲取正確的 Generate icon
            imgEl.style.animation = `save-icon-grow ${scaleUpDuration}ms ease forwards`;

            // 放大完成後立即開始旋轉
            setTimeout(() => {
                imgEl.style.animation = `save-icon-rotate ${rotateDuration}ms linear forwards`;
            }, scaleUpDuration);
        }, fadeInOutDuration);

        // 3. 旋轉完成後立即縮小並消失（無停留）
        setTimeout(() => {
            imgEl.style.animation = `save-icon-shrink-rotated ${fadeInOutDuration}ms ease forwards`;
        }, fadeInOutDuration + scaleUpDuration + rotateDuration);

        // 4. Generate icon 縮小完成後，切換回原 icon 並放大
        setTimeout(() => {
            iconElement.attribute('src', getOriginalIconSrc()); // 使用函數動態獲取正確的 icon
            setTimeout(() => {
                imgEl.style.animation = `save-icon-grow ${fadeInOutDuration}ms ease forwards`;
                setTimeout(() => {
                    imgEl.style.animation = '';
                    imgEl.classList.remove('save-icon-animating');
                }, fadeInOutDuration);
            }, 10);
        }, fadeInOutDuration + scaleUpDuration + rotateDuration + fadeInOutDuration);
    } else {
        // === 桌面版：使用 JavaScript + CSS Transition ===
        // 確保 icon 是正確的 Download/Gift icon（防止重複點擊或狀態異常）
        iconElement.attribute('src', getOriginalIconSrc());

        // 清除任何可能存在的樣式
        imgEl.style.removeProperty('transform');
        imgEl.style.removeProperty('transition');
        imgEl.style.removeProperty('opacity');
        imgEl.style.transform = 'scale(1) rotate(0deg)';
        imgEl.style.transition = 'none';
        imgEl.style.opacity = '1';
        void imgEl.offsetHeight;

        // 1. 縮小原 icon 並淡出
        imgEl.style.transition = `transform ${fadeInOutDuration}ms ease, opacity ${fadeInOutDuration}ms ease`;
        requestAnimationFrame(() => {
            imgEl.style.transform = 'scale(0) rotate(0deg)';
            imgEl.style.opacity = '0';
        });

        // 2. fadeInOutDuration 後切換到 Generate icon，並快速放大
        setTimeout(() => {
            iconElement.attribute('src', getGenerateIconSrc()); // 動態獲取正確的 Generate icon
            imgEl.style.transition = `transform ${scaleUpDuration}ms ease, opacity ${scaleUpDuration}ms ease`;
            imgEl.style.transform = 'scale(1) rotate(0deg)';
            imgEl.style.opacity = '1';

            // 放大完成後立即開始旋轉
            setTimeout(() => {
                imgEl.style.transition = `transform ${rotateDuration}ms linear`;
                imgEl.style.transform = 'scale(1) rotate(360deg)';
            }, scaleUpDuration);
        }, fadeInOutDuration);

        // 3. 旋轉完成後立即縮小並消失（無停留）
        setTimeout(() => {
            imgEl.style.transition = `transform ${fadeInOutDuration}ms ease, opacity ${fadeInOutDuration}ms ease`;
            imgEl.style.transform = 'scale(0) rotate(360deg)';
            imgEl.style.opacity = '0';
        }, fadeInOutDuration + scaleUpDuration + rotateDuration);

        // 4. Generate icon 縮小完成後，重置旋轉為 0 度並切換回原 icon
        setTimeout(() => {
            imgEl.style.transition = 'none';
            imgEl.style.transform = 'scale(0) rotate(0deg)';
            imgEl.style.opacity = '0';

            setTimeout(() => {
                iconElement.attribute('src', getOriginalIconSrc()); // 使用函數動態獲取正確的 icon
                setTimeout(() => {
                    imgEl.style.transition = `transform ${fadeInOutDuration}ms ease, opacity ${fadeInOutDuration}ms ease`;
                    imgEl.style.transform = 'scale(1) rotate(0deg)';
                    imgEl.style.opacity = '1';

                    setTimeout(() => {
                        imgEl.style.removeProperty('transition');
                        imgEl.style.removeProperty('transform');
                        imgEl.style.removeProperty('opacity');
                    }, fadeInOutDuration);
                }, 10);
            }, 10);
        }, fadeInOutDuration + scaleUpDuration + rotateDuration + fadeInOutDuration);
    }

    // 總時長：淡出(200) + 快速放大(100) + 旋轉(800) + 淡出(200) + 重置(10) + 淡入(200) = 1510ms
    return fadeInOutDuration * 3 + scaleUpDuration + rotateDuration + 10;
}

// --- 完全參照 ref.js:278-346 重寫 updateUI ---
function updateUI() {
    const hasText = letters.length > 0;
    const isStandardTarget = (targetMode === "Standard");
    const isInverseTarget = (targetMode === "Inverse");
    const isInverseMode = mode === "Inverse";
    const activeColor = isInverseMode ? "white" : "black";
    const activeBorder = isInverseMode ? "2px solid white" : "2px solid black";
    const body = select('body');

    // 更新 disabledColor 根據當前模式
    disabledColor = getDisabledColor();

    // 更新 Body Class（使用 targetMode 而不是 mode，確保立即更新）
    const isWireframeMode = (targetMode === "Wireframe");

    if (isWireframeMode) {
        body.removeClass('standard-mode');
        body.removeClass('inverse-mode');
        body.addClass('wireframe-mode');
        // Wireframe 模式下，背景顏色使用 CSS 變數 --wireframe-bg
        // 確保在 window resize（如手機轉向）時也能保持當前的背景顏色
        if (wireframeColor) {
            updateBackgroundColor(wireframeColor);
        }

        // 淡入 color picker box（容器展開動畫 + 淡入）
        if (colorPickerBox) {
            // 步驟 1：設置 display: flex，初始狀態為 max-width: 0, padding: 0, opacity: 0
            colorPickerBox.style('display', 'flex');
            colorPickerBox.style('max-width', '0');
            colorPickerBox.style('padding', '0');
            colorPickerBox.style('opacity', '0');

            // 步驟 2：強制 reflow，然後設置 max-width、padding 和 opacity（觸發容器展開動畫 + 淡入）
            void colorPickerBox.elt.offsetHeight; // 強制瀏覽器重繪
            colorPickerBox.style('max-width', '500px'); // 設定足夠大的值
            colorPickerBox.style('padding', ''); // 恢復 CSS 中定義的 padding
            colorPickerBox.style('opacity', '1'); // 容器淡入（包括 border 和背景）

            // 步驟 3：等待容器完全展開（300ms），再立即創建 canvas 並顯示內容
            setTimeout(() => {
                // 立即創建 canvas（不等 draw() 執行）
                if (!colorPickerCanvas) {
                    // 根據設備選擇正確的 container
                    let containerId = isMobileMode ? 'mobile-colorpicker-container' : 'colorpicker-container';
                    let container = select('#' + containerId);
                    if (container) {
                        let containerWidth = container.elt.clientWidth;
                        let containerHeight = container.elt.clientHeight;

                        let canvasWidth, canvasHeight;

                        if (isMobileMode) {
                            // 手機版：使用實際容器尺寸（橫向長條）
                            canvasWidth = containerWidth;
                            canvasHeight = containerHeight;
                        } else {
                            // 桌面版：取較小值確保是正方形
                            let containerSize = Math.min(containerWidth, containerHeight);
                            canvasWidth = containerSize;
                            canvasHeight = containerSize;
                        }

                        if (canvasWidth > 0 && canvasHeight > 0) {
                            colorPickerCanvas = createGraphics(canvasWidth, canvasHeight);
                            colorPickerCanvas.parent(containerId);
                            colorPickerCanvas.elt.style.display = 'block';
                            colorPickerCanvas.elt.style.margin = 'auto';

                            colorPickerIndicatorX = 0.5;
                            colorPickerIndicatorY = 0.25;

                            // 綁定鼠標事件
                            colorPickerCanvas.elt.addEventListener('mousedown', handleColorPickerMouseDown);
                            colorPickerCanvas.elt.addEventListener('mousemove', handleColorPickerMouseMove);
                            colorPickerCanvas.elt.addEventListener('mouseup', handleColorPickerMouseUp);

                            // 添加 touch 事件支持（手機端）
                            colorPickerCanvas.elt.addEventListener('touchstart', handleColorPickerTouchStart);
                            colorPickerCanvas.elt.addEventListener('touchmove', handleColorPickerTouchMove);
                            colorPickerCanvas.elt.addEventListener('touchend', handleColorPickerMouseUp);
                            colorPickerCanvas.elt.addEventListener('touchcancel', handleColorPickerMouseUp);

                            // 全局事件，確保在 canvas 外也能繼續拖曳和停止
                            document.addEventListener('mousemove', handleColorPickerMouseMove);
                            document.addEventListener('mouseup', handleColorPickerMouseUp);
                            document.addEventListener('touchend', handleColorPickerMouseUp);

                            // 立即繪製色環
                            drawColorWheel();
                        }
                    }
                }

                // 允許創建 canvas 的標記（防止 draw() 重複創建）
                colorPickerReady = true;

                // 顯示內容（canvas 已經創建好了，可以立即顯示）
                if (colorPickerContainer) {
                    colorPickerContainer.style('opacity', '1');
                }
                if (colorWheelPlayButton) {
                    colorWheelPlayButton.style('opacity', '1');
                }
            }, 300); // 等待容器展開完成後立即顯示
        }
    } else {
        body.removeClass('wireframe-mode');
        if (isInverseTarget) {
            body.removeClass('standard-mode');
            body.addClass('inverse-mode');
        } else {
            body.removeClass('inverse-mode');
            body.addClass('standard-mode');
        }
        // Standard/Inverse 模式下，清除 Wireframe 的 CSS 變數，讓背景色恢復為黑/白
        // 這樣可以確保從 Wireframe 切換回來時，背景顏色會正確重置
        body.elt.style.removeProperty('--wireframe-bg');
        body.elt.style.removeProperty('--wireframe-border');
        body.elt.style.removeProperty('--wireframe-icon-opacity');

        // 同時清除 canvas container 的 CSS 變數
        let canvasContainer = select('#canvas-container');
        let desktopCanvasContainer = select('#desktop-canvas-container');
        if (canvasContainer) {
            canvasContainer.elt.style.removeProperty('--wireframe-bg');
            canvasContainer.elt.style.removeProperty('--wireframe-border');
        }
        if (desktopCanvasContainer) {
            desktopCanvasContainer.elt.style.removeProperty('--wireframe-bg');
            desktopCanvasContainer.elt.style.removeProperty('--wireframe-border');
        }

        // 平滑收起 color picker box（收起動畫）
        if (colorPickerBox) {
            // 步驟 1：先淡出內容
            if (colorPickerContainer) {
                colorPickerContainer.style('opacity', '0');
            }
            if (colorWheelPlayButton) {
                colorWheelPlayButton.style('opacity', '0');
            }

            // 步驟 2：收起容器（縮小 max-width、padding、opacity）
            colorPickerBox.style('max-width', '0');
            colorPickerBox.style('padding', '0');
            colorPickerBox.style('opacity', '0');
            colorPickerBox.removeClass('show'); // 移除 show class

            // 步驟 3：等待動畫完成後再隱藏（200ms）
            setTimeout(() => {
                colorPickerBox.style('display', 'none');

                // 重置標記
                colorPickerReady = false;
            }, 200); // 與 CSS transition 時間一致
        }
    }

    // 更新所有圖標根據當前模式
    updateIconsForMode();

    // 更新輸入框顏色
    // Wireframe 模式下使用對比色，Standard/Inverse 模式使用固定顏色
    let textColor = activeColor;
    if (isWireframeMode && wireframeStrokeColor) {
        // 使用與 logo 邊框相同的對比色
        let r = red(wireframeStrokeColor);
        let g = green(wireframeStrokeColor);
        let b = blue(wireframeStrokeColor);
        textColor = `rgb(${r}, ${g}, ${b})`;
    }

    inputBox.style("color", textColor);
    if (inputBoxMobile) {
        inputBoxMobile.style("color", textColor);
    }

    if (isEasterEggActive) {
        // --- 彩蛋模式 UI ---
        // 隱藏整個 rotation-box
        select('#rotation-box').style('display', 'none');

        colormodeButton.style('display', 'flex');
        saveButton.style('display', 'flex');

        // Colormode 按鈕在彩蛋模式下仍然可用
        colormodeButton.style('cursor', 'pointer');

        // 修復：設定正確的圖片元素
        saveButton.style('cursor', 'pointer');
        saveButton.elt.disabled = false;

    } else {
        // --- 正常模式 UI ---
        // 桌面版：顯示整個 rotation-box
        let rotationBox = select('#rotation-box');
        if (rotationBox) {
            rotationBox.style('display', 'flex');

            // 更新 rotation-box 的 disabled 狀態
            if (hasText) {
                rotationBox.removeClass('disabled');
            } else {
                rotationBox.addClass('disabled');
            }
        }

        // 更新 save-box 的 disabled 狀態
        let saveBox = select('#save-box');
        if (saveBox) {
            if (hasText) {
                saveBox.removeClass('disabled');
            } else {
                saveBox.addClass('disabled');
            }
        }

        // 桌面版按鈕（添加存在性檢查）
        if (rotateButton) rotateButton.style('display', 'flex');
        if (customButton) customButton.style('display', 'flex');

        // 更新 Auto/Custom 按鈕（添加存在性檢查）
        if (rotateButton) {
            rotateButton.elt.disabled = !hasText;
            rotateButton.style("color", !hasText ? disabledColor : isAutoRotateMode ? activeColor : disabledColor);
            rotateButton.style("cursor", !hasText ? 'not-allowed' : "pointer");

            // 使用 class 控制 active 狀態
            if (hasText && isAutoRotateMode) {
                rotateButton.addClass('active');
            } else {
                rotateButton.removeClass('active');
            }
        }

        // 更新 Rotate 按鈕 icon（使用統一函數）
        updateRotateIcon();

        if (customButton) {
            customButton.elt.disabled = !hasText;
            customButton.style("color", !hasText ? disabledColor : !isAutoRotateMode ? activeColor : disabledColor);
            customButton.style("cursor", !hasText ? 'not-allowed' : "pointer");

            // 使用 class 控制 active 狀態
            if (hasText && !isAutoRotateMode) {
                customButton.addClass('active');
                // 為 custom-area-wrapper 添加 custom-mode class，顯示邊框和 padding
                let customAreaWrapper = select('#custom-area-wrapper');
                if (customAreaWrapper) customAreaWrapper.addClass('custom-mode');
            } else {
                customButton.removeClass('active');
                // 移除 custom-mode class
                let customAreaWrapper = select('#custom-area-wrapper');
                if (customAreaWrapper) customAreaWrapper.removeClass('custom-mode');
            }
        }

        // 更新 Colormode 按鈕（循環切換，總是可用）
        if (colormodeButton) {
            colormodeButton.style('display', 'flex');
            colormodeButton.style('cursor', 'pointer');
        }

        // 更新 Custom 控制面板
        const customControlsEnabled = hasText && !isAutoRotateMode;
        const customControlsContainer = select('#custom-angle-controls');

        if (customControlsContainer) {
            if (customControlsEnabled) {
                // Custom 展開時：顯示 slider 和 icon 按鈕（使用平滑動畫）
                if (customButton) customButton.style('display', 'flex');
                customControlsContainer.addClass('show'); // 添加 show class 觸發動畫
                if (randomButton) randomButton.style('display', 'flex');
                if (resetButton) resetButton.style('display', 'flex');
            } else {
                // Custom 未展開時：顯示按鈕但 disabled
                if (customButton) customButton.style('display', 'flex');
                customControlsContainer.removeClass('show'); // 移除 show class 觸發收起動畫
                if (randomButton) randomButton.style('display', 'flex');
                if (resetButton) resetButton.style('display', 'flex');
            }
        }

        // 更新 Random/Reset 圖示（添加存在性檢查）
        if (randomButton) {
            randomButton.elt.disabled = !customControlsEnabled;
            randomButton.style('cursor', customControlsEnabled ? 'pointer' : 'not-allowed');
        }
        if (resetButton) {
            resetButton.elt.disabled = !customControlsEnabled;
            resetButton.style('cursor', customControlsEnabled ? 'pointer' : 'not-allowed');
        }
        
        // 更新滑桿（根據字母數量決定可用的 slider）
        const letterCount = letters.length;

        sliders.forEach((slider, i) => {
            // 決定這個 slider 是否應該啟用
            // i=0 (R): 需要至少 1 個字母
            // i=1 (G): 需要至少 2 個字母
            // i=2 (B): 需要至少 3 個字母
            let sliderEnabled = customControlsEnabled && letterCount > i;

            slider.elt.disabled = !sliderEnabled;
            if (sliderEnabled) {
                slider.addClass('enabled');
                angleLabels[i].addClass('enabled');

                // 決定 slider 和 label 的顏色
                if (mode === "Wireframe") {
                    // Wireframe 模式：不需要手動設定顏色，CSS 會自動使用 --wireframe-border
                    // 移除 inline style，讓 CSS 規則生效
                    slider.elt.style.removeProperty("--track-color");
                    slider.elt.style.removeProperty("--thumb-color");
                    angleLabels[i].elt.style.removeProperty("color");
                } else {
                    // Standard/Inverse 模式：使用 RGB 三種顏色
                    let sliderColor = `rgb(${colors[i].join(',')})`;
                    slider.elt.style.setProperty("--track-color", sliderColor);
                    slider.elt.style.setProperty("--thumb-color", sliderColor);
                    angleLabels[i].style("color", sliderColor);
                }
            } else {
                slider.removeClass('enabled');
                angleLabels[i].removeClass('enabled');

                if (mode === "Wireframe") {
                    // Wireframe 模式：移除 inline style，讓 CSS 規則生效
                    slider.elt.style.removeProperty("--track-color");
                    slider.elt.style.removeProperty("--thumb-color");
                    angleLabels[i].elt.style.removeProperty("color");
                } else {
                    // 其他模式：設為預設 disabled 顏色
                    angleLabels[i].style("color", disabledColor);
                }
            }
        });
        
        // 更新滑桿數值標籤，並加上正號（使用陣列迴圈）
        // 如果正在 ease，顯示目標角度（正規化後的）；否則顯示當前角度
        const vals = [0, 1, 2].map(i =>
          Math.round(isEasingCustomRotation ? normalizeAngle(targetRotationOffsets[i]) : rotationOffsets[i])
        );

        // 只在角度 label 沒有焦點時才更新它的值（避免干擾用戶編輯）
        const activeElement = document.activeElement;
        angleLabels.forEach((label, i) => {
          if (label && activeElement !== label.elt) {
            label.value((vals[i] > 0 ? "+" : "") + vals[i]);
          }
        });

        // 更新手機版 Custom 調整區的 slider 和 label
        if (isMobileMode && mobileElements.customAngleControls) {
            mobileSliders.forEach((slider, i) => {
                if (slider && mobileAngleLabels[i]) {
                    let sliderEnabled = customControlsEnabled && letterCount > i;
                    slider.elt.disabled = !sliderEnabled;

                    if (sliderEnabled) {
                        slider.addClass('enabled');
                        mobileAngleLabels[i].addClass('enabled');

                        // 決定 slider 和 label 的顏色
                        if (mode === "Wireframe") {
                            slider.elt.style.removeProperty("--track-color");
                            slider.elt.style.removeProperty("--thumb-color");
                            mobileAngleLabels[i].elt.style.removeProperty("color");
                        } else {
                            let sliderColor = `rgb(${colors[i].join(',')})`;
                            slider.elt.style.setProperty("--track-color", sliderColor);
                            slider.elt.style.setProperty("--thumb-color", sliderColor);
                            mobileAngleLabels[i].style("color", sliderColor);
                        }
                    } else {
                        slider.removeClass('enabled');
                        mobileAngleLabels[i].removeClass('enabled');

                        if (mode === "Wireframe") {
                            slider.elt.style.removeProperty("--track-color");
                            slider.elt.style.removeProperty("--thumb-color");
                            mobileAngleLabels[i].elt.style.removeProperty("color");
                        } else {
                            mobileAngleLabels[i].style("color", disabledColor);
                        }
                    }
                }
            });

            // 更新手機版 label 數值（使用陣列迴圈）
            mobileAngleLabels.forEach((label, i) => {
                if (label && activeElement !== label.elt) {
                    label.value((vals[i] > 0 ? "+" : "") + vals[i]);
                }
            });
        }

        // 更新 Save 按鈕（添加存在性檢查）
        if (saveButton) {
            saveButton.style('display', 'flex');
            // 彩蛋模式下也要啟用下載按鈕
            const canSave = hasText || isEasterEggActive;
            saveButton.elt.disabled = !canSave;
            saveButton.style('cursor', canSave ? 'pointer' : 'not-allowed');
        }
    }

    // 更新手機版 Save 按鈕
    if (saveButtonMobile && saveImgMobile) {
        // 彩蛋模式下也要啟用下載按鈕
        const canSave = hasText || isEasterEggActive;
        saveButtonMobile.elt.disabled = !canSave;
        saveButtonMobile.style('cursor', canSave ? 'pointer' : 'not-allowed');
    }
    
    // 手機版：更新UI（使用全域變數，不需要重新 select）
    let mobileCustomAngleControls = select('.mobile-custom-angle-controls');

    // 更新手機版 control-box 的 disabled 狀態
    let mobileRotationBox = select('.mobile-rotation-box');
    let mobileSaveContainer = select('.mobile-save-container');
    if (mobileRotationBox && mobileSaveContainer) {
        if (hasText) {
            mobileRotationBox.removeClass('disabled');
            mobileSaveContainer.removeClass('disabled');
        } else {
            mobileRotationBox.addClass('disabled');
            mobileSaveContainer.addClass('disabled');
        }
    }

    if (mobileStandardButton && mobileInverseButton) {
        mobileStandardButton.elt.disabled = isStandardTarget;
        mobileStandardButton.style("color", isStandardTarget ? activeColor : disabledColor);
        mobileStandardButton.style("cursor", isStandardTarget ? "default" : "pointer");

        mobileInverseButton.elt.disabled = isInverseTarget;
        mobileInverseButton.style("color", isInverseTarget ? activeColor : disabledColor);
        mobileInverseButton.style("cursor", isInverseTarget ? "default" : "pointer");
    }

    if (mobileRotateButton && mobileCustomButton) {
        mobileRotateButton.elt.disabled = !hasText;
        mobileRotateButton.style("color", !hasText ? disabledColor : isAutoRotateMode ? activeColor : disabledColor);
        mobileRotateButton.style("cursor", !hasText ? 'not-allowed' : "pointer");

        // 更新手機版 Rotate 按鈕 icon（使用統一函數）
        updateRotateIcon();

        if (hasText && isAutoRotateMode) {
            mobileRotateButton.addClass('active');
        } else {
            mobileRotateButton.removeClass('active');
        }

        mobileCustomButton.elt.disabled = !hasText;
        mobileCustomButton.style("color", !hasText ? disabledColor : !isAutoRotateMode ? activeColor : disabledColor);
        mobileCustomButton.style("cursor", !hasText ? 'not-allowed' : "pointer");
        if (hasText && !isAutoRotateMode) {
            mobileCustomButton.addClass('active');
            // 為手機版 rotation-box 添加 custom-mode class，顯示整體邊框
            if (mobileRotationBox) mobileRotationBox.addClass('custom-mode');
        } else {
            mobileCustomButton.removeClass('active');
            // 移除 custom-mode class
            if (mobileRotationBox) mobileRotationBox.removeClass('custom-mode');
        }
    }

    // 更新手機版 Custom 控制面板
    const customControlsEnabled = hasText && !isAutoRotateMode;

    // 手機版：當 Custom 展開時，隱藏 Custom 按鈕
    if (mobileCustomButton) {
        if (customControlsEnabled) {
            mobileCustomButton.style('display', 'none');
        } else {
            mobileCustomButton.style('display', 'flex');
        }
    }

    // 移除自動顯示/隱藏邏輯，改為只通過按鈕控制
    // 但當切換到 Auto 模式或沒有文字時，仍需要隱藏調整區
    if (mobileCustomAngleControls && (isAutoRotateMode || !hasText)) {
        mobileCustomAngleControls.addClass('hidden');
    }

    if (mobileRandomButton && mobileResetButton && mobileRandomImg && mobileResetImg) {
        mobileRandomButton.elt.disabled = !customControlsEnabled;
        mobileResetButton.elt.disabled = !customControlsEnabled;
        mobileRandomButton.style('cursor', customControlsEnabled ? 'pointer' : 'not-allowed');
        mobileResetButton.style('cursor', customControlsEnabled ? 'pointer' : 'not-allowed');
    }

    // 更新手機版底部按鈕狀態
    if (isMobileMode && mobileElements.customBtn) {
        mobileElements.customBtn.elt.disabled = !hasText;
        if (hasText && !isAutoRotateMode) {
            mobileElements.customBtn.addClass('active');
        } else {
            mobileElements.customBtn.removeClass('active');
        }
    }

    if (isMobileMode && mobileElements.rotateBtn) {
        mobileElements.rotateBtn.elt.disabled = !hasText;
        if (hasText && isAutoRotateMode) {
            mobileElements.rotateBtn.addClass('active');
        } else {
            mobileElements.rotateBtn.removeClass('active');
        }
    }

    // 更新手機版 Custom 調整區的 Random/Reset 按鈕
    if (isMobileMode && mobileElements.mobileRandomBtn && mobileElements.mobileResetBtn) {
        mobileElements.mobileRandomBtn.elt.disabled = !customControlsEnabled;
        mobileElements.mobileResetBtn.elt.disabled = !customControlsEnabled;
    }

    // 更新手機版滑桿
    // 手機版滑桿和標籤（使用全域陣列）
    if (mobileSliders[0] && mobileSliders[1] && mobileSliders[2] && mobileAngleLabels[0] && mobileAngleLabels[1] && mobileAngleLabels[2]) {
        const letterCount = letters.length;

        mobileSliders.forEach((slider, i) => {
            // 決定這個 slider 是否應該啟用（與桌面版相同邏輯）
            // i=0 (R): 需要至少 1 個字母
            // i=1 (G): 需要至少 2 個字母
            // i=2 (B): 需要至少 3 個字母
            let sliderEnabled = customControlsEnabled && letterCount > i;

            slider.elt.disabled = !sliderEnabled;
            if (sliderEnabled) {
                slider.addClass('enabled');
                mobileAngleLabels[i].addClass('enabled');

                // 決定 slider 和 label 的顏色
                let sliderColor, labelColor;
                if (mode === "Wireframe") {
                    // Wireframe 模式：使用對比色（黑色或白色）
                    if (wireframeStrokeColor) {
                        let r = red(wireframeStrokeColor);
                        let g = green(wireframeStrokeColor);
                        let b = blue(wireframeStrokeColor);
                        sliderColor = `rgb(${r}, ${g}, ${b})`;
                        labelColor = sliderColor;
                    } else {
                        sliderColor = 'rgb(0, 0, 0)'; // 預設黑色
                        labelColor = sliderColor;
                    }
                } else {
                    // Standard/Inverse 模式：使用 RGB 三種顏色
                    sliderColor = `rgb(${colors[i].join(',')})`;
                    labelColor = sliderColor;
                }

                // 動態設定滑桿顏色
                slider.elt.style.setProperty("--track-color", sliderColor);
                slider.elt.style.setProperty("--thumb-color", sliderColor);
                mobileAngleLabels[i].style("color", labelColor);
            } else {
                slider.removeClass('enabled');
                mobileAngleLabels[i].removeClass('enabled');
                mobileAngleLabels[i].style("color", disabledColor);
            }
        });

        // 同步滑桿數值（使用陣列迴圈）
        // 如果正在 ease，顯示目標角度（正規化後的）；否則顯示當前角度
        const vals = [0, 1, 2].map(i =>
          Math.round(isEasingCustomRotation ? normalizeAngle(targetRotationOffsets[i]) : rotationOffsets[i])
        );

        // 只在角度 label 沒有焦點時才更新它的值（避免干擾用戶編輯）
        const activeElement = document.activeElement;
        mobileAngleLabels.forEach((label, i) => {
          if (label && activeElement !== label.elt) {
            label.value((vals[i] > 0 ? "+" : "") + vals[i]);
          }
        });
    }

    // 更新手機版 UI（使用 mobile.js）
    updateMobileUI();
}

function updateSliders() {
    // 當用戶手動拖動滑桿時，取消 ease 動畫並立即更新
    isEasingCustomRotation = false;
    isEasingSlider = false;

    // 使用陣列迴圈更新 R/G/B（簡化重複邏輯）
    for (let i = 0; i < 3; i++) {
      if (sliders[i]) {
        const sliderValue = sliders[i].value();
        rotationOffsets[i] = sliderValue;
        targetRotationOffsets[i] = sliderValue;
        currentSliderValues[i] = sliderValue;
        targetSliderValues[i] = sliderValue;
      }
    }
}


function getRotationFor(layer, index) {
    // 使用陣列直接取得對應 layer 的旋轉偏移（簡化條件判斷）
    return rotationOffsets[layer] || 0;
}


// --- 視窗大小調整處理 ---
// --- 手機版鍵盤調整函數 ---
function adjustLayoutForKeyboard(keyboardHeight) {
  if (!isMobileMode) return;

  console.log('調整佈局以適應鍵盤，鍵盤高度:', keyboardHeight + 'px');

  // 鍵盤彈出時，mobile-logo-container 的可用空間可能改變，需要重新調整 canvas 尺寸
  // 延遲執行以確保 DOM 更新完成
  setTimeout(() => {
    if (typeof requestCanvasResize === 'function') {
      requestCanvasResize(true); // 立即執行
    }
  }, 100);
}

function resetLayoutAfterKeyboard() {
  if (!isMobileMode) return;

  console.log('重置佈局');

  // 鍵盤收起時，mobile-logo-container 的可用空間恢復，需要重新調整 canvas 尺寸
  // 延遲執行以確保 DOM 更新完成
  setTimeout(() => {
    if (typeof requestCanvasResize === 'function') {
      requestCanvasResize(true); // 立即執行
    }
  }, 100);
}

// --- 重新調整 Canvas 尺寸（手機版專用）---
function resizeMobileCanvas() {
  if (!isMobileMode) return;

  // 重新計算 canvas 尺寸（會根據當前 logo-container 的大小）
  let canvasSize = getCanvasSize();
  resizeCanvas(canvasSize.width, canvasSize.height, true); // noRedraw=true，防止自動重繪

  // 根據 canvas 尺寸動態調整 logo 文字大小
  let baseTextSize = (canvasSize.width / 432) * 367.5 * 1.1;
  textSize(baseTextSize);

  // --- 修復：手機螢幕旋轉後，確保 Wireframe 模式的背景顏色被重新應用 ---
  if (mode === 'Wireframe' && wireframeColor) {
    updateBackgroundColor(wireframeColor);
  }
}

function windowResized() {
    // 延遲處理響應式變化，確保CSS媒體查詢先生效
    setTimeout(() => {
        // 儲存舊的模式狀態
        let wasMobileMode = isMobileMode;

        // 更新響應式模式檢測
        checkMobileMode();

        // 根據新的模式重新計算並調整Canvas尺寸
        if (isMobileMode) {
            // 手機版：使用統一的 resize 機制（如果有的話）
            if (typeof requestCanvasResize === 'function') {
                requestCanvasResize(true); // 傳入 immediate=true，因為 window resize 沒有 CSS transition
            } else {
                // Fallback：直接執行
                let canvasSize = getCanvasSize();
                resizeCanvas(canvasSize.width, canvasSize.height, true); // noRedraw=true
                let baseTextSize = (canvasSize.width / 432) * 367.5 * 1.1;
                textSize(baseTextSize);
            }
        } else {
            // 桌面版：直接執行 resize
            let canvasSize = getCanvasSize();
            resizeCanvas(canvasSize.width, canvasSize.height, true); // noRedraw=true
            textSize(367.5);
            adjustInputFontSize(); // 這個函數內部會調用 adjustTextareaHeight()
        }

        // 如果模式切換了（桌面 <-> 手機），需要重新初始化 UI 狀態
        if (wasMobileMode !== isMobileMode) {
            // 強制重新繪製 placeholder（如果需要）
            if (letters.length === 0) {
                targetPlaceholderAlpha = 255;
                placeholderAlpha = 0; // 從 0 開始 fade in
            }

            // 更新所有 icon
            updateIconsForMode();
        }

        // 更新UI以反映可能的模式變化
        updateUI();
    }, 50); // 50ms延遲，讓CSS媒體查詢先生效
}

// --- 保存透明PNG函數 ---
function saveTransparentPNG() {
  // 防止重複點擊
  if (isDownloading) return;
  isDownloading = true;

  let animationDuration;

  if (isMobileMode) {
    // 手機版：播放 Save 按鈕動畫
    // 優先使用 mobileElements 中的元素，fallback 到 saveButtonMobile
    let mobileSaveBtn = (typeof mobileElements !== 'undefined' && mobileElements.saveBtn)
      ? mobileElements.saveBtn
      : saveButtonMobile;
    let mobileSaveImg = (typeof mobileElements !== 'undefined' && mobileElements.saveBtn)
      ? select('#save-img-mobile')
      : saveImgMobile;

    if (mobileSaveBtn && mobileSaveImg) {
      animationDuration = animateSaveButton(mobileSaveBtn, mobileSaveImg);
    }
  } else {
    // 桌面版：播放 Save 按鈕動畫
    animationDuration = animateSaveButton(saveButton, saveImg);
  }

  // 動畫結束後開始下載
  setTimeout(() => {
    performDownload();
    // 下載完成後重置狀態
    isDownloading = false;
    // 立即更新icon，確保恢復正確的狀態
    updateIconsForMode();
  }, animationDuration || 2310);
}

// --- 實際執行下載的函數 ---
function performDownload() {
  const saveSize = 1080;

  // 生成檔案名稱
  let fileName = generateFileName();

  if (isEasterEggActive) {
    // 延遲載入彩蛋下載圖片（只在需要下載時載入）
    loadEasterEggDownloadImages();

    // 彩蛋模式：直接保存圖片（已經是 1080x1080）
    let imgToSave;
    if (mode === 'Wireframe') {
      // Wireframe 模式：根據描邊顏色選擇黑色或白色線框版本
      imgToSave = (wireframeStrokeColor && red(wireframeStrokeColor) > 128)
        ? sccdWhiteWireframeImg
        : sccdBlackWireframeImg;
    } else {
      // Standard/Inverse 模式
      imgToSave = (mode === 'Inverse') ? sccdWhiteImg : sccdBlackImg;
    }
    if (imgToSave) {
      // 直接保存圖片，不需要調整大小
      save(imgToSave, fileName);
    }
  } else {
    // 正常模式：創建一個 1080x1080 的高解析度畫布來儲存
    let pg = createGraphics(saveSize, saveSize);
    const scaleFactor = 2; // 放大倍數

    // 設定繪圖參數（保持原本的參數）
    pg.textFont(font);
    pg.textSize(367.5); // 350 * 1.05 = 367.5
    pg.textAlign(CENTER, CENTER);
    pg.imageMode(CENTER);

    // 臨時保存全域的 width 和 height
    let tempWidth = width;
    let tempHeight = height;

    // 暫時修改全域變數為原始canvas尺寸（540），而不是saveSize（1080）
    // 這樣 drawLogo 和 drawCentralCircle 會使用 540/2 = 270 作為中心點
    width = saveSize / scaleFactor; // 540
    height = saveSize / scaleFactor; // 540

    pg.push();
    pg.scale(scaleFactor); // 將整個內容放大2倍

    // 圓圈功能已移除，不再在儲存時繪製圓圈
    // if (showCircle) {
    //   drawCentralCircle(pg, 255); // 使用預設直徑 250
    // }

    // 繪製logo（使用原本的參數）
    drawLogo(pg, 255);

    pg.pop();

    // 恢復原本的 width 和 height
    width = tempWidth;
    height = tempHeight;

    // 保存文件
    pg.save(fileName);
  }
}

// --- 生成檔案名稱的函數 ---
function generateFileName() {
  let textPart = '';

  if (isEasterEggActive) {
    // 彩蛋模式：使用 "SCCD"
    textPart = 'SCCD';
  } else {
    // 正常模式：使用輸入框的文字（移除空格和換行，轉為大寫）
    // 獲取當前活動的輸入框
    let currentInputBox = inputBox;
    if (isMobileMode) {
      // 手機版：直接選取實際的輸入框元素
      let mobileInput = select("#mobile-input-box");
      if (mobileInput) {
        currentInputBox = mobileInput;
      }
    }

    if (currentInputBox) {
      let inputText = currentInputBox.value();
      // 移除所有空格和換行符，轉為大寫
      textPart = inputText.replace(/[\s\n]/g, '').toUpperCase();
    }

    // 如果沒有文字，使用預設名稱
    if (!textPart) {
      textPart = 'LOGO';
    }
  }

  // 模式部分：Standard、Inverse 或 Wireframe
  let modePart = mode; // "Standard"、"Inverse" 或 "Wireframe"

  // 如果是 Wireframe 模式，根據描邊顏色添加 Black 或 White
  if (mode === "Wireframe") {
    // 根據 wireframeStrokeColor 判斷是黑色還是白色
    let strokeColorName = "Black"; // 預設黑色
    if (wireframeStrokeColor && red(wireframeStrokeColor) > 128) {
      strokeColorName = "White";
    }
    modePart = `${strokeColorName} Wireframe`;
  }

  // 組合檔案名稱：文字 - 模式.png
  return `${textPart} - ${modePart}.png`;
}

// --- 鍵盤事件處理 ---
function keyPressed() {
  // 檢查當前焦點是否在主輸入框上（桌面版或手機版）
  const activeElement = document.activeElement;
  const isInputBoxFocused = (activeElement === inputBox.elt) ||
                           (inputBoxMobile && activeElement === inputBoxMobile.elt);

  // 只有在主輸入框有焦點時才處理 Enter 和 Backspace
  if (!isInputBoxFocused) {
    return; // 如果焦點不在主輸入框，不處理按鍵事件
  }

  // 當按下 ENTER 鍵時
  if (keyCode === ENTER) {
    // 如果有字母且不在彩蛋模式，就觸發自動旋轉
    if (letters.length > 0 && !isEasterEggActive) {
      isAutoRotateMode = true;
      autoRotate = true;
      resetRotationOffsets();

      // 更新按鈕icon為 Pause
      updateRotateIcon();

      updateUI();
    }
    // 阻止瀏覽器預設行為 (例如在 textarea 中換行)
    return false;
  }
  else if (keyCode === BACKSPACE) {
    // 按下 BACKSPACE 時，停止自動旋轉並重設狀態
    autoRotate = false;
    isAutoRotateMode = false;
    resetRotationOffsets();
    rotationAngles = [...originalRotationAngles];
    if (circleFillTimeout) {
      clearTimeout(circleFillTimeout);
      circleFillTimeout = null;
    }
    // inputBox.input() 會在之後觸發，所以這裡只需更新樣式
    updateUI();
  }
}

// ========================================
// 色彩選擇器相關函數
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

// 恢復預設背景顏色（Standard/Inverse 模式）- 不再需要，CSS 會自動處理
// 這個函數現在是空的，因為 CSS 會根據 body class 自動切換背景色
function restoreDefaultBackground() {
  // CSS transition 會自動處理背景色切換，不需要 JS 操作
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
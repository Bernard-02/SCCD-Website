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

  // --- 通知 parent (generate.html) 初始 mode，讓 header 同步底色 ---
  if (window.parent && window.parent !== window) {
    if (mode === "Inverse") {
      window.parent.postMessage({ genMode: 'Inverse', bg: '#000000', text: '#ffffff' }, '*');
    } else if (mode === "Wireframe" && wireframeColor) {
      const r = red(wireframeColor), g = green(wireframeColor), b = blue(wireframeColor);
      const cssBg = `rgb(${r}, ${g}, ${b})`;
      const cc = getContrastColor(wireframeColor);
      const cssText = `rgb(${red(cc)}, ${green(cc)}, ${blue(cc)})`;
      window.parent.postMessage({ genMode: 'Wireframe', bg: cssBg, text: cssText }, '*');
    } else {
      window.parent.postMessage({ genMode: 'Standard', bg: '#ffffff', text: '#000000' }, '*');
    }
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

// 輸入處理（getCurrentInputBox / syncInputBoxes / handleInput）已移至 js/input-handling.js

// Logo 核心繪圖（drawPlaceholder / drawLogo / drawCentralCircle）已移至 js/draw-logo.js

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

// 特殊彩蛋（COOLGUY/CHILLGUY）相關函數已移至 js/easter-eggs.js

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

// UI 狀態機（updateUI / updateSliders / getRotationFor）已移至 js/ui-state.js

// --- 視窗大小調整處理 ---
// --- 手機版鍵盤調整函數 ---
function adjustLayoutForKeyboard(keyboardHeight) {
  if (!isMobileMode) return;

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

// 儲存/下載相關函數已移至 js/save-download.js

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

// 色彩選擇器相關函數已移至 js/color-picker.js


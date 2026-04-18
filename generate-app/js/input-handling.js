// ========================================
// 文字輸入處理模組
// 獲取當前輸入框 / 同步三個輸入框 / handleInput 主要事件處理（過濾、大寫、長度限制、彩蛋檢測）
// 依賴：variables.js、mobile.js、ui-state.js 內的 updateUI/updateRotateIcon/updateCustomRotateButtonStates、
//       easter-eggs.js 內的 triggerSpecialEasterEgg
// ========================================

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

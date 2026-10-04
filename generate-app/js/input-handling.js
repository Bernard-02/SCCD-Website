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
    let mobileInputBoxBottom = _p5.select("#mobile-input-box");
    if (mobileInputBoxBottom) {
        mobileInputBoxBottom.value(sourceValue);
    }
    updateFakeCaret();   // 程式改值（過濾／彩蛋清空）後假游標跟到字尾
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
    let mobileInputBoxBottom = _p5.select("#mobile-input-box");
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
      const mobileInputBox = _p5.select('#mobile-input-box');
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
        fadeStartTime = _p5.millis();
    }

    // 手機版：如果在 Wireframe + Custom 模式，檢查文字溢出狀態
    if (isMobileMode && mode === 'Wireframe' && typeof checkInputOverflow === 'function') {
        // 如果 custom 區塊是打開的
        const mobileInputBox = _p5.select('#mobile-input-box');
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

    // 在函數結尾呼叫 UI 更新
    updateUI();
}

// --- 桌面：輸入法開著（中文等）也能直接打英文（user 2026-10-04）---
// 網頁關不掉作業系統輸入法，但輸入法只接管「可編輯」欄位 → 滑鼠鍵盤裝置把桌面輸入框設 readonly（輸入法不啟動），
// 字母依實體鍵位 e.code（KeyA–KeyZ，與輸入法／鍵盤配置無關）自己填；Backspace／Delete／貼上／剪下同理自處理，
// 再發 input 事件走原本 handleInput（大寫／過濾／40 字／彩蛋）。Chrome／Safari 不在 readonly 畫游標 → 補假游標。
// ponytail: 游標固定字尾（方向鍵不動、點字中間不插入；反白選取可整段取代）——這欄只會往後打，要中間編輯再做游標位置模型
// 觸控（iPad）不套：readonly 叫不出螢幕鍵盤，維持原生輸入框。彩蛋結束還原屬性時要保留 readonly（easter-eggs.js 看 desktopKeyMap）
let desktopKeyMap = false;
let fakeCaret = null, caretMirror = null;

function initDesktopKeyMap() {
    desktopKeyMap = false;
    fakeCaret = caretMirror = null;
    if (!inputBox || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const ta = inputBox.elt;
    ta.readOnly = true;
    desktopKeyMap = true;
    fakeCaret = document.createElement('span');
    fakeCaret.className = 'create-fake-caret';
    caretMirror = document.createElement('div');
    caretMirror.className = 'create-caret-mirror';
    fakeCaret.setAttribute('aria-hidden', 'true');
    caretMirror.setAttribute('aria-hidden', 'true');
    ta.parentElement.append(fakeCaret, caretMirror);

    const commit = (next) => {
        ta.value = next;
        ta.setSelectionRange(next.length, next.length);
        ta.dispatchEvent(new Event('input', { bubbles: true }));   // → handleInput
        // 打字當下游標實心、停手才閃（同原生）：重播 blink
        fakeCaret.style.animation = 'none';
        void fakeCaret.offsetWidth;
        fakeCaret.style.animation = '';
    };
    // 有反白選取＝取代該段；否則一律在字尾（游標固定字尾）
    const edit = (insert, delBack) => {
        const { selectionStart: a, selectionEnd: b, value: v } = ta;
        if (a !== b) return v.slice(0, a) + insert + v.slice(b);
        return delBack ? v.slice(0, -1) : v + insert;
    };
    ta.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;   // 全選／複製等快捷鍵交給瀏覽器
        let next;
        if (/^Key[A-Z]$/.test(e.code)) next = edit(e.code[3], false);
        else if (e.code === 'Backspace') next = edit('', true);
        else if (e.code === 'Delete' && ta.selectionStart !== ta.selectionEnd) next = edit('', false);
        else return;
        e.preventDefault();
        commit(next);
    });
    ta.addEventListener('paste', (e) => {
        e.preventDefault();
        commit(edit(e.clipboardData?.getData('text') || '', false));   // handleInput 會濾成 A–Z、截 40 字
    });
    ta.addEventListener('cut', (e) => {
        if (ta.selectionStart === ta.selectionEnd) return;
        e.preventDefault();
        e.clipboardData?.setData('text/plain', ta.value.slice(ta.selectionStart, ta.selectionEnd));
        commit(edit('', false));
    });
    // 字級（1–3 字 180 ↔ 120…）／上方留白有 0.2s 過渡：過渡期間逐幀對位，游標跟著字一路縮放（原生游標行為）；
    // 只在 transitionend 對位＝過渡中停在大字位置、結束才跳回（user 2026-10-04）。getAnimations 空＝全部過渡跑完才停
    let caretRaf = 0;
    const followCaret = () => {
        updateFakeCaret();
        caretRaf = (fakeCaret?.isConnected && ta.getAnimations().length) ? requestAnimationFrame(followCaret) : 0;
    };
    ta.addEventListener('transitionrun', () => { if (!caretRaf) caretRaf = requestAnimationFrame(followCaret); });
    updateFakeCaret();
}

// 假游標＝字尾位置：同樣式的隱形鏡像 div 放同一份文字＋尾端標記，量標記位置
function updateFakeCaret() {
    if (!fakeCaret || !inputBox || !fakeCaret.isConnected) return;
    const ta = inputBox.elt;
    const cs = getComputedStyle(ta);
    const m = caretMirror;
    for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingLeft', 'paddingRight']) {
        m.style[k] = cs[k];
    }
    m.style.width = `${ta.clientWidth}px`;
    m.style.left = `${ta.offsetLeft}px`;
    m.style.top = `${ta.offsetTop}px`;
    m.textContent = ta.value;
    const mark = document.createElement('span');
    mark.textContent = '​';
    m.appendChild(mark);
    fakeCaret.style.left = `${ta.offsetLeft + mark.offsetLeft}px`;
    fakeCaret.style.top = `${ta.offsetTop + mark.offsetTop}px`;
    fakeCaret.style.height = `${mark.offsetHeight}px`;
}

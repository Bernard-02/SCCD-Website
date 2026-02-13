# SCCD 網站專案指南

## 專案概述
實踐大學媒體傳達設計系（SCCD - Shih Chien University Communications Design）官方網站

## 技術棧
- **前端框架**: 原生 HTML/CSS/JavaScript（無框架）
- **CSS 工具**: Tailwind CSS（使用 output.css）
- **設計系統**: CSS Variables（定義在 variables.css）
- **字體**: Inter (英文) + Noto Sans TC (中文)
- **圖示**: Font Awesome 6.5.1

## 專案結構
```
├── index.html              # 首頁
├── pages/                  # 所有內頁
│   ├── about.html
│   ├── faculty.html
│   ├── admission-detail.html
│   ├── degree-show-detail.html
│   └── ...
├── css/
│   ├── variables.css       # 設計系統變數（顏色、字型、間距等）
│   ├── input.css           # Tailwind 輸入文件
│   └── output.css          # 編譯後的 CSS
├── js/
│   └── main.js             # 主要 JavaScript 邏輯
├── images/                 # 圖片資源
├── data/                   # 資料文件
└── assets/                 # 其他靜態資源
```

## 設計系統

### 顏色規範
- **主色**: 黑色 (#000000) 和白色 (#FFFFFF)
- **輔助色**:
  - 綠色: #00FF80
  - 粉紅: #FF448A
  - 藍色: #26BCFF
- **灰階**: gray-0 到 gray-10（10 階層系統）

### 字體規範
- **標題**: H1 (8rem) 到 H6 (1.25rem)
- **內文**: P1 (1rem / 16px)
- **字重**: Regular (400), Semibold (600), Bold (700)

### 間距系統
- xs: 0.5rem (8px)
- sm: 1rem (16px)
- md: 1.5rem (24px)
- lg: 2rem (32px)
- xl: 3rem (48px)
- 2xl: 4rem (64px)
- 3xl: 6rem (96px)
- 4xl: 8rem (128px)

## 編碼規範

### HTML
- 語言設定為繁體中文：`lang="zh-Hant"`
- 語義化標籤優先
- 導航連結使用雙語顯示（英文+中文）

### CSS
- 優先使用 CSS Variables（定義在 variables.css）
- 使用 Tailwind 工具類別
- 客製化樣式遵循設計系統
- 修改設計系統變數時，需同步更新 variables.css

### JavaScript
- 使用原生 JavaScript（ES6+）
- 模組化結構
- 等待 DOM 完全載入後執行（DOMContentLoaded）
- 詳細註解說明邏輯

## 功能特性

### 導航系統
- Sticky header（固定在頂部）
- Mega menu（大型下拉選單）
- 自動高亮當前頁面
- 支援詳細頁對應到父層導航（如 admission-detail.html → admission.html）

### 響應式設計

### RWD 核心原則（Desktop-First）
**重要：手機版的任何修改都不能影響到桌面版**

- 使用 12 欄網格系統（grid-12）
- Container 最大寬度: 1200px
- 需支援桌面和行動裝置

### RWD 實現規範

#### 1. CSS Variables（設計系統層）
- 預設值 = 桌面版（絕對不修改）
- 手機版必須使用 `@media (max-width: 767px)` 覆蓋
- 範例：
  ```css
  :root {
    --font-size-h1: 8rem;  /* 桌面版預設，不可改 */
  }

  @media (max-width: 767px) {
    :root {
      --font-size-h1: 3rem;  /* 手機版覆蓋 */
    }
  }
  ```

#### 2. Tailwind Classes（佈局層）
- **只使用 `md:` prefix**（不使用 `sm:`）
- 預設 class = 手機版
- `md:` class = 桌面版（768px+）
- 範例：
  ```html
  <!-- ✅ 正確 -->
  <div class="col-span-12 md:col-span-2">
  <div class="hidden md:block">
  <img class="w-[100px] md:w-[180px]">

  <!-- ❌ 錯誤 -->
  <div class="sm:col-span-6 md:col-span-2">
  ```

#### 3. Hover 效果（桌面專用）
- **手機版不應有任何 hover 效果**
- 所有 hover 樣式必須包在 `@media (min-width: 768px)` 內
- 範例：
  ```css
  .nav-link {
    /* 基礎樣式（手機 + 桌面共用） */
  }

  @media (min-width: 768px) {
    .nav-link:hover {
      /* 只在桌面版生效 */
      font-weight: 700;
      transform: rotate(3deg);
    }
  }
  ```

#### 4. JavaScript（行為層）
- 使用條件式執行，避免互相干擾
- 桌面專用函數必須檢查 `if (!isDesktop()) return;`
- 手機專用函數必須檢查 `if (!isMobile()) return;`
- 範例：
  ```javascript
  function isMobile() {
    return window.innerWidth < 768;
  }

  function isDesktop() {
    return window.innerWidth >= 768;
  }

  function initDesktopAnimations() {
    if (!isDesktop()) return; // 手機版跳出
    // 桌面版專用邏輯
  }

  function initMobileMenu() {
    if (!isMobile()) return; // 桌面版跳出
    // 手機版專用邏輯
  }
  ```

#### 5. Breakpoint 定義
- `md`: 768px（桌面版起點）
- `lg`: 1024px（大桌面）
- `xl`: 1280px（超大桌面）
- **不使用 `sm`** 避免混淆

## 工作流程

### 開發流程
1. 修改 CSS 時，若涉及設計系統變數，請更新 variables.css
2. 修改 Tailwind 樣式時，需重新編譯（npm run build 或類似指令）
3. 測試時需檢查所有頁面的一致性
4. 確保導航系統在所有頁面正常運作

### Git 提交規範
- 使用繁體中文撰寫提交訊息
- 清楚描述修改內容
- 不要自動提交，等待明確指示

### 測試檢查清單

#### 桌面版測試
- [ ] 所有頁面樣式一致
- [ ] 導航高亮正確
- [ ] Mega menu 正常運作
- [ ] Hover 效果正常
- [ ] GSAP 動畫流暢
- [ ] 圖片和資源正確載入

#### 手機版測試
- [ ] 響應式佈局正常（375px, 414px, 768px）
- [ ] 無 hover 效果殘留
- [ ] 觸控操作流暢
- [ ] 漢堡選單正常運作
- [ ] 字體大小適中（最小 14px）
- [ ] 點擊區域足夠大（最小 44x44px）

#### RWD 互不影響測試
- [ ] 手機版修改不影響桌面版
- [ ] 媒體查詢正確包裹手機版樣式
- [ ] JavaScript 條件式執行正確

## 偏好設定

### 溝通方式
- 使用繁體中文溝通
- 簡潔清楚的說明
- 提供具體的檔案路徑和行號

### 程式碼風格
- 保持簡潔和可讀性
- 優先考慮可維護性
- 遵循現有的程式碼結構和命名慣例
- 不要過度工程化

### 修改原則
- 只修改必要的部分
- 保持與現有程式碼風格一致
- 修改前先閱讀相關檔案
- 優先編輯現有檔案而非創建新檔案

## 重要提醒
- 本專案使用原生 JavaScript，不使用 React、Vue 等框架
- 所有樣式修改需考慮設計系統的一致性
- 頁面間的共用元件（header、footer）需保持同步
- 雙語內容（中英文）需同時維護

### RWD 開發注意事項
- **絕對原則：手機版修改不能影響桌面版**
- 桌面版是預設基準，手機版只能用媒體查詢覆蓋
- 手機版沒有 hover 效果
- 使用 Desktop-First 方法（預設桌面，`md:` 以下才是手機）
- JavaScript 需條件式執行，避免手機和桌面邏輯衝突

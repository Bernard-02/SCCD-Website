# WordPress 主題開發計劃書

## 專案概述
- **目標**: 從零開始建立一個內容型網站，並轉換為 WordPress 主題
- **技術棧**: HTML, CSS, JavaScript → PHP + WordPress
- **後台需求**: 管理員可透過 WordPress CMS 修改文字與圖片內容

---

## 開發流程規劃

### 階段一：靜態網站開發 (HTML/CSS/JS)

#### 1.1 專案結構設定
```
SCCD-Website/
├── index.html           # 首頁
├── css/
│   ├── style.css       # 主要樣式
│   └── responsive.css  # 響應式設計
├── js/
│   └── main.js         # 主要 JavaScript
├── images/             # 圖片資源
└── assets/             # 其他資源（字型、圖示等）
```

#### 1.2 需要建立的頁面
- 首頁（Homepage）
- 關於我們（About）
- 文章列表頁（Blog/News）
- 文章詳情頁（Single Post）
- 聯絡我們（Contact）

#### 1.3 設計重點
- 響應式設計（手機、平板、桌面）
- 清晰的內容區塊劃分（方便後續轉換成 WordPress 區塊）
- 語義化 HTML 標籤

---

### 階段二：WordPress 主題轉換

#### 2.1 WordPress 主題結構
```
wp-content/themes/sccd-theme/
├── style.css           # 主題樣式表（必需，包含主題資訊）
├── index.php           # 主模板（必需）
├── functions.php       # 主題功能設定（必需）
├── header.php          # 頁首模板
├── footer.php          # 頁尾模板
├── sidebar.php         # 側邊欄模板
├── single.php          # 單篇文章模板
├── page.php            # 單一頁面模板
├── archive.php         # 文章列表模板
├── 404.php             # 404 錯誤頁面
├── screenshot.png      # 主題預覽圖（建議 1200x900px）
├── css/                # 樣式檔案
├── js/                 # JavaScript 檔案
├── images/             # 圖片資源
└── inc/                # 自訂功能模組
```

#### 2.2 核心檔案說明

**style.css（主題資訊）**
```css
/*
Theme Name: SCCD Theme
Theme URI: https://yoursite.com
Author: Your Name
Author URI: https://yoursite.com
Description: 實踐大學 SCCD 網站主題
Version: 1.0
License: GNU General Public License v2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html
Text Domain: sccd-theme
*/
```

**functions.php（主要功能）**
- 註冊選單位置
- 註冊小工具區域
- 加載樣式和腳本
- 設定特色圖片支援
- 自訂後台編輯器樣式

---

### 階段三：WordPress 動態化處理

#### 3.1 需要轉換成 PHP 的內容

**從 HTML 到 WordPress 模板標籤：**

| HTML 靜態內容 | WordPress 動態函數 |
|--------------|-------------------|
| `<title>網站標題</title>` | `<?php wp_title(); ?>` |
| 導航選單的 HTML | `<?php wp_nav_menu(); ?>` |
| 文章標題 | `<?php the_title(); ?>` |
| 文章內容 | `<?php the_content(); ?>` |
| 文章日期 | `<?php the_date(); ?>` |
| 文章作者 | `<?php the_author(); ?>` |
| 特色圖片 | `<?php the_post_thumbnail(); ?>` |
| 頁首/頁尾 | `<?php get_header(); ?>` / `<?php get_footer(); ?>` |

#### 3.2 需要加入的 WordPress 必要代碼

**在 `<head>` 中加入：**
```php
<?php wp_head(); ?>
```

**在 `</body>` 前加入：**
```php
<?php wp_footer(); ?>
```

**迴圈（The Loop）結構：**
```php
<?php if ( have_posts() ) : ?>
    <?php while ( have_posts() ) : the_post(); ?>
        <!-- 顯示文章內容 -->
    <?php endwhile; ?>
<?php endif; ?>
```

---

### 階段四：後台內容管理設定

#### 4.1 文字內容管理
- 使用 WordPress 內建編輯器
- 文章/頁面透過「新增文章」/「新增頁面」管理
- 導航選單透過「外觀 > 選單」管理

#### 4.2 圖片管理
- 使用「媒體庫」上傳和管理圖片
- 特色圖片設定（Featured Image）
- 在編輯器中插入圖片

#### 4.3 進階設定（選擇性）
- **自訂欄位（Custom Fields）**: 使用 Advanced Custom Fields (ACF) 外掛
- **小工具（Widgets）**: 在側邊欄新增自訂內容
- **主題自訂器（Customizer）**: 讓管理員調整顏色、Logo 等

---

## 開發步驟時間軸

### Step 1: 建立靜態網站
- [ ] 設計網站結構和頁面
- [ ] 撰寫 HTML 架構
- [ ] 製作 CSS 樣式
- [ ] 加入 JavaScript 互動效果
- [ ] 測試響應式設計

### Step 2: 準備 WordPress 環境
- [ ] 安裝本地 WordPress 測試環境（XAMPP/Local/MAMP）
- [ ] 建立主題資料夾結構
- [ ] 準備必要檔案（style.css, index.php, functions.php 等）

### Step 3: 轉換靜態頁面為 PHP 模板
- [ ] 拆分 HTML 為 header.php、footer.php、sidebar.php
- [ ] 將 index.html 轉換為 index.php
- [ ] 建立 single.php（文章詳情頁）
- [ ] 建立 archive.php（文章列表頁）
- [ ] 建立 page.php（一般頁面）

### Step 4: 加入 WordPress 函數
- [ ] 在 functions.php 中註冊功能
- [ ] 替換靜態內容為 WordPress 模板標籤
- [ ] 加入 The Loop
- [ ] 設定選單和小工具

### Step 5: 測試與優化
- [ ] 測試所有頁面顯示
- [ ] 測試後台內容修改功能
- [ ] 檢查手機、平板顯示
- [ ] 優化載入速度

### Step 6: 部署上線
- [ ] 將主題上傳至正式 WordPress 網站
- [ ] 啟用主題
- [ ] 匯入初始內容
- [ ] 最終測試

---

## 重要注意事項

### ✅ 必須做的事
1. **使用 PHP 而非純 HTML**：WordPress 需要 PHP 檔案來動態生成內容
2. **遵循 WordPress 編碼標準**：使用正確的模板標籤和函數
3. **安全性考量**：使用 `esc_html()`, `esc_url()` 等函數過濾輸出
4. **國際化準備**：使用 `__()` 和 `_e()` 函數包裹文字，方便未來翻譯

### ❌ 常見錯誤
1. 直接在 HTML 中寫死內容（應使用 WordPress 函數）
2. 忘記加入 `wp_head()` 和 `wp_footer()`
3. 沒有使用 The Loop 來顯示文章
4. CSS/JS 直接用 `<link>` 和 `<script>` 標籤（應用 `wp_enqueue_style()` 和 `wp_enqueue_script()`）

---

## 學習資源

### 官方文件
- [WordPress Theme Handbook](https://developer.wordpress.org/themes/)
- [Template Tags](https://developer.wordpress.org/themes/basics/template-tags/)
- [The Loop](https://developer.wordpress.org/themes/basics/the-loop/)

### 推薦工具
- **本地開發環境**: Local by Flywheel, XAMPP
- **程式碼編輯器**: VS Code（安裝 PHP Intelephense 擴充功能）
- **除錯工具**: Query Monitor（WordPress 外掛）

---

## 下一步行動

現在我們可以開始執行以下任一階段：

1. **先建立靜態網站**：設計 HTML/CSS/JS 版本
2. **直接建立 WordPress 主題結構**：從 WordPress 模板開始開發
3. **學習 WordPress 基礎**：先了解關鍵概念和函數

請告訴我你想從哪裡開始，我會協助你逐步完成！

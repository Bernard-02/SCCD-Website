/**
 * Legal Data Loader
 * 負責讀取 Privacy Policy 和 Terms and Conditions 的 JSON 資料
 */

export async function loadLegalData(pageName) {
  try {
    const response = await fetch(`/data/${pageName}.json`);
    const data = await response.json();

    // title 元素可能由頁面直接 hardcode（如 privacy-policy 為了 chip 樣式 + <br> 斷行），此時 ID 不存在 → null guard
    const titleEn = document.getElementById('legal-title-en');
    const titleZh = document.getElementById('legal-title-zh');
    if (titleEn) titleEn.textContent = data.titleEn;
    if (titleZh) titleZh.textContent = data.titleZh;
    document.getElementById('legal-content').innerHTML = data.content;
    document.getElementById('legal-updated-en').textContent = data.lastUpdatedEn;
    document.getElementById('legal-updated-zh').textContent = data.lastUpdatedZh;

  } catch (error) {
    console.error(`Error loading ${pageName} data:`, error);
  }
}
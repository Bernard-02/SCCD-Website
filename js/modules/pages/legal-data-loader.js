/**
 * Legal Data Loader
 * 負責讀取 Privacy Policy 和 Terms and Conditions 的 JSON 資料
 */

export async function loadLegalData(pageName) {
  try {
    const response = await fetch(`../data/${pageName}.json`);
    const data = await response.json();

    document.getElementById('legal-title-en').textContent = data.titleEn;
    document.getElementById('legal-title-zh').textContent = data.titleZh;
    document.getElementById('legal-content').innerHTML = data.content;
    document.getElementById('legal-updated-en').textContent = data.lastUpdatedEn;
    document.getElementById('legal-updated-zh').textContent = data.lastUpdatedZh;

  } catch (error) {
    console.error(`Error loading ${pageName} data:`, error);
  }
}
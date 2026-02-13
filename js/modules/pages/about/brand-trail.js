/**
 * Brand Trail Module (About Page)
 * 處理系友發展區塊的品牌 Logo 游標拖尾效果
 */

export function initBrandTrail() {
  const brandTrailArea = document.getElementById('brand-trail-area');

  if (!brandTrailArea) return;

  let lastX = 0;
  let lastY = 0;
  const distThreshold = 80; // 距離判斷 (px)，控制圖片生成密度
  const maxTrailImages = 15; // 最多同時顯示的圖片數量
  let trailImages = []; // 追蹤目前存在的圖片

  brandTrailArea.addEventListener('mousemove', (e) => {
    const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
    if (dist < distThreshold) return;

    lastX = e.clientX;
    lastY = e.clientY;

    // 如果已達上限，移除最舊的圖片
    if (trailImages.length >= maxTrailImages) {
      const oldestImg = trailImages.shift();
      oldestImg.remove();
    }

    // 動態建立圖片元素
    const img = document.createElement('img');
    // 注意：這裡的路徑是相對於 HTML 檔案
    img.src = '../images/SCCD-1-4-0.jpg'; 
    img.classList.add('brand-trail-img');

    // 設定位置在滑鼠座標
    img.style.left = `${e.pageX}px`;
    img.style.top = `${e.pageY}px`;

    document.body.appendChild(img);
    trailImages.push(img); // 加入追蹤陣列

    // GSAP Animation: Pop in
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(img,
        {
          scale: 0.5, // 初始大小
          opacity: 1,
          rotation: Math.random() * 30 - 15 // 隨機旋轉 -15 ~ 15 度
        },
        {
          duration: 0.5, // 快速彈出
          scale: 1, // 回復到正常大小
          ease: "power2.out"
        }
      );

      // 1秒後直接移除 (不淡出)
      gsap.delayedCall(1, () => {
        img.remove();
        // 從追蹤陣列中移除
        const index = trailImages.indexOf(img);
        if (index > -1) {
          trailImages.splice(index, 1);
        }
      });
    }
  });
}
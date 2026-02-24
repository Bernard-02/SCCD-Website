/**
 * Button Fill Hover Module
 * 為所有 .btn-fill 元素加入游標位置擴散填充的 hover 效果（桌面版）
 * 效果：hover 時從 cursor 位置向外擴散填滿黑色，文字變白；離開時收回
 */

export function applyBtnFillHover(btns) {
  if (typeof gsap === 'undefined') return;

  btns.forEach(btn => {
    // 插入 blob 元素（若尚未存在）
    if (!btn.querySelector('.btn-fill-blob')) {
      const blob = document.createElement('span');
      blob.className = 'btn-fill-blob';
      btn.prepend(blob);
    }

    const blob = btn.querySelector('.btn-fill-blob');

    btn.addEventListener('mouseenter', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 計算填滿 btn 所需的最大半徑
      const maxDist = Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y)
      );
      const diameter = maxDist * 2;

      gsap.killTweensOf([blob, btn]);
      gsap.set(blob, {
        width: diameter,
        height: diameter,
        left: x - diameter / 2,
        top: y - diameter / 2,
        scale: 0,
        opacity: 1,
      });
      gsap.to(blob, {
        scale: 1,
        duration: 0.5,
        ease: 'power2.out',
      });
      gsap.to(btn, {
        color: '#FFFFFF',
        duration: 0.15,
        ease: 'none',
      });
    });

    btn.addEventListener('mouseleave', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      gsap.killTweensOf([blob, btn]);
      gsap.set(blob, {
        left: x - blob.offsetWidth / 2,
        top: y - blob.offsetHeight / 2,
      });
      gsap.to(blob, {
        scale: 0,
        duration: 0.4,
        ease: 'power2.in',
      });
      gsap.to(btn, {
        color: '',
        duration: 0.2,
        ease: 'none',
      });
    });
  });
}

export function initBtnFillHover() {
  const btns = document.querySelectorAll('.btn-fill');
  if (btns.length === 0) return;
  applyBtnFillHover(btns);
}

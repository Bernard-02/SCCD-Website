/**
 * BFA Division Toggle Module
 * BFA 分組切換功能（Animation / Creative Media）
 */

export function initBFADivisionToggle() {
  const bfaDivisionButtons = document.querySelectorAll('.bfa-division-btn');
  const bfaDivisionContents = document.querySelectorAll('.bfa-division-content');

  if (bfaDivisionButtons.length === 0 || bfaDivisionContents.length === 0) return;

  bfaDivisionButtons.forEach(button => {
    button.addEventListener('click', function() {
      const targetDivision = this.getAttribute('data-division');

      // Update button states using helper
      SCCDHelpers.setActive(this, bfaDivisionButtons);

      // Update content visibility using helper
      SCCDHelpers.filterElements(bfaDivisionContents, targetDivision, 'block', 'data-division');
    });
  });
}

/**
 * BFA Division Toggle Module
 * Class 分組切換功能（Animation / Creative Media / MDES）
 */

export function initBFADivisionToggle() {
  const classDivisionButtons = document.querySelectorAll('.class-division-btn');
  const classDivisionContents = document.querySelectorAll('.class-division-content');

  if (classDivisionButtons.length === 0 || classDivisionContents.length === 0) return;

  classDivisionButtons.forEach(button => {
    button.addEventListener('click', function() {
      const targetDivision = this.getAttribute('data-division');

      // Update button states using helper
      SCCDHelpers.setActive(this, classDivisionButtons);

      // Update content visibility using helper
      SCCDHelpers.filterElements(classDivisionContents, targetDivision, 'block', 'data-division');
    });
  });
}

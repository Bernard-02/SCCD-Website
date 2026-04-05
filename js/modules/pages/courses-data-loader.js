/**
 * Courses Data Loader
 * 負責讀取課程 JSON 資料並渲染到頁面上
 */

import { animateCards } from '../ui/scroll-animate.js';

export async function loadCourses(program) {
  try {
    const response = await fetch('/data/courses.json');
    const data = await response.json();
    const courses = data[program]; // 'bfa' or 'mdes'

    if (!courses) return;

    // 渲染必修課程 (Required)，初始可見，以年級 block 為單位進場
    renderCourseGroup(courses, 'required', program);
    // 支援新版（data-program）和舊版（無 data-program）選取器
    const requiredSelector = document.querySelector(`.courses-year-group[data-year="required"][data-program="${program}"]`)
      ? `.courses-year-group[data-year="required"][data-program="${program}"] .course-animate`
      : `.courses-year-group[data-year="required"] .course-animate`;
    const requiredBlocks = document.querySelectorAll(requiredSelector);
    animateCards(requiredBlocks, true, { fadeIn: true });

    // 渲染選修課程 (Elective)，預設隱藏，不加 ScrollTrigger
    renderCourseGroup(courses, 'elective', program);

  } catch (error) {
    console.error('Error loading courses:', error);
  }
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function renderCourseGroup(courses, type, program) {
  // 支援新版（data-program）和舊版（無 data-program）選取器
  const container = document.querySelector(`.courses-year-group[data-year="${type}"][data-program="${program}"] .flex-col`)
    || document.querySelector(`.courses-year-group[data-year="${type}"] .flex-col`);
  if (!container) return;

  container.innerHTML = ''; // 清空現有內容

  // 定義年級順序與顯示標題
  let grades = [];
  if (program === 'bfa') {
    grades = [
      { key: 'freshman', title: 'Freshman 一年級' },
      { key: 'sophomore', title: 'Sophomore 二年級' },
      { key: 'junior', title: 'Junior 三年級' },
      { key: 'senior', title: 'Senior 四年級' }
    ];
  } else {
    grades = [
      { key: 'year1', title: '1st Year 一年級' },
      { key: 'year2', title: '2nd Year 二年級' }
    ];
  }

  // 依序渲染每個年級
  grades.forEach((gradeInfo, gradeIndex) => {
    // 篩選出符合「目前類別 (type)」與「目前年級 (grade)」的課程
    // 這就是模擬 WordPress Tag 的篩選邏輯
    let gradeCourses = courses.filter(c => c.type === type && c.grade === gradeInfo.key);

    if (gradeCourses.length > 0) {
      const gradeSection = document.createElement('div');
      gradeSection.className = 'course-animate flex flex-col md:flex-row items-start';

      let coursesHtml = '';
      gradeCourses.forEach((course, index) => {
         const isLastCourse = index === gradeCourses.length - 1;
         const borderClass = isLastCourse ? '' : 'border-b-4 border-black';

         // Build content: parts array or single description
         let contentHtml = '';
         if (course.parts && course.parts.length > 0) {
           contentHtml += `<div class="grid pt-xs" style="grid-template-columns: max-content 1fr; column-gap: var(--spacing-xl); row-gap: var(--spacing-xs);">`;
           course.parts.forEach(part => {
             contentHtml += `
               <div>
                 <p class="text-p2 font-bold">${part.titleEn}</p>
                 <p class="text-p2 font-bold">${part.titleZh}</p>
               </div>
               <div>
                 <p class="text-p2">${part.descriptionEn}</p>
                 <p class="text-p2 mt-xs">${part.descriptionZh}</p>
               </div>
             `;
           });
           contentHtml += `</div>`;
         } else {
           contentHtml = `
             <div class="pt-xs">
               <p class="text-p2">${course.descriptionEn}</p>
               <p class="text-p2 mt-xs">${course.descriptionZh}</p>
             </div>
           `;
         }

         const courseId = slugify(course.titleEn);
         coursesHtml += `
           <div class="course-item overflow-hidden ${borderClass}" id="course-${courseId}">
             <div class="course-header flex items-center justify-between py-md cursor-pointer">
               <div>
                 <h5>${course.titleEn}</h5>
                 <h5>${course.titleZh}</h5>
               </div>
               <i class="fa-solid fa-chevron-down text-p2 transition-transform duration-300"></i>
             </div>
             <div class="course-content h-0 overflow-hidden px-md">
               <div class="pb-md">
                 ${contentHtml}
               </div>
             </div>
           </div>
         `;
      });

      gradeSection.innerHTML = `
        <h5 class="w-full md:flex-[0_0_calc(25%_-_0.625rem)] pt-md font-bold mb-md md:mb-0">${gradeInfo.title}</h5>
        <div class="flex flex-col w-full md:flex-1">
          ${coursesHtml}
        </div>
      `;

      container.appendChild(gradeSection);

      // 判斷是否為最後一個年級（最後一個不需要分割線）
      const isLastGrade = gradeIndex === grades.length - 1;
      if (!isLastGrade) {
        const divider = document.createElement('div');
        divider.className = 'course-animate border-b-4 border-black';
        container.appendChild(divider);
      }
    }
  });
}

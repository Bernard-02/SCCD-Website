/**
 * Courses Data Loader
 * 負責讀取課程 JSON 資料並渲染到頁面上
 */

export async function loadCourses(program) {
  try {
    const response = await fetch('../data/courses.json');
    const data = await response.json();
    const courses = data[program]; // 'bfa' or 'mdes'

    if (!courses) return;

    // 渲染必修課程 (Required)
    renderCourseGroup(courses, 'required', program);
    // 渲染選修課程 (Elective)
    renderCourseGroup(courses, 'elective', program);

  } catch (error) {
    console.error('Error loading courses:', error);
  }
}

function renderCourseGroup(courses, type, program) {
  // 找到對應的容器 (必修或選修)
  const container = document.querySelector(`.courses-year-group[data-year="${type}"] .flex-col`);
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
      
      // 判斷是否為最後一個年級 (樣式調整：最後一個不需要底線)
      const isLastGrade = gradeIndex === grades.length - 1;
      gradeSection.className = isLastGrade 
        ? 'flex flex-col md:flex-row items-start' 
        : 'flex flex-col md:flex-row items-start border-b border-gray-9 pb-xl mb-xl';

      let coursesHtml = '';
      gradeCourses.forEach((course, index) => {
         const isLastCourse = index === gradeCourses.length - 1;
         const borderClass = isLastCourse ? '' : 'border-b border-gray-9';
         
         coursesHtml += `
           <div class="course-item overflow-hidden ${borderClass}">
             <div class="course-header flex items-center justify-between py-md cursor-pointer">
               <div>
                 <h5>${course.titleEn}</h5>
                 <h5>${course.titleZh}</h5>
               </div>
               <i class="fa-solid fa-chevron-down text-p1 transition-transform duration-300"></i>
             </div>
             <div class="course-content h-0 overflow-hidden">
               <div class="pt-xs pb-md">
                 <p>${course.descriptionEn}</p>
                 <p class="mt-sm">${course.descriptionZh}</p>
               </div>
             </div>
           </div>
         `;
      });

      gradeSection.innerHTML = `
        <h5 class="w-full md:flex-[0_0_calc(25%_-_0.625rem)] pt-sm font-regular mb-md md:mb-0">${gradeInfo.title}</h5>
        <div class="flex flex-col w-full md:flex-1">
          ${coursesHtml}
        </div>
      `;
      
      container.appendChild(gradeSection);
    }
  });
}

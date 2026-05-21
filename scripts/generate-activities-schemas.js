// 一次性 helper：產 9 個 activities CPT schema（全套 list-component 範本，砍 content + attachments）
// 跑完即可刪此檔。CPT slug 已縮在 20 chars 內。

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'sccd-theme', 'schemas');

// menu_order 對齊 activities.html nav btn 順序：
// hero(1) / exhibition-special(2) / exhibition-permanent(3, 獨立 schema 不在此 batch)
// / workshop(4) / degree-show(5, 獨立) / lecture(6) / visit-out(7) / visit-in(8)
// / competition(9) / conference(10) / students-present(11) / industry(12)
const CPTS = [
  { cpt: 'sccd_act_exhi_sp',    endpoint: 'activities-exhibition-special', menu_name: '特設展演',  add_new: '新增特設展演',  all_items: '特設展演',  icon: 'dashicons-art',         menu_order: 2 },
  { cpt: 'sccd_act_workshop',   endpoint: 'activities-workshop',           menu_name: '工作坊',    add_new: '新增工作坊',    all_items: '工作坊',    icon: 'dashicons-hammer',      menu_order: 4 },
  { cpt: 'sccd_act_lecture',    endpoint: 'activities-lecture',            menu_name: '講座',      add_new: '新增講座',      all_items: '講座',      icon: 'dashicons-megaphone',   menu_order: 6 },
  { cpt: 'sccd_act_visit_out',  endpoint: 'activities-visit-outbound',     menu_name: '出訪',      add_new: '新增出訪',      all_items: '出訪',      icon: 'dashicons-airplane',    menu_order: 7 },
  { cpt: 'sccd_act_visit_in',   endpoint: 'activities-visit-inbound',      menu_name: '來訪',      add_new: '新增來訪',      all_items: '來訪',      icon: 'dashicons-admin-users', menu_order: 8 },
  { cpt: 'sccd_act_competition',endpoint: 'activities-competition',        menu_name: '競賽',      add_new: '新增競賽',      all_items: '競賽',      icon: 'dashicons-awards',      menu_order: 9 },
  { cpt: 'sccd_act_conference', endpoint: 'activities-conference',         menu_name: '研討會',    add_new: '新增研討會',    all_items: '研討會',    icon: 'dashicons-groups',      menu_order: 10 },
  { cpt: 'sccd_act_std_present',endpoint: 'activities-students-present',   menu_name: '學生參與',  add_new: '新增學生參與',  all_items: '學生參與',  icon: 'dashicons-welcome-learn-more', menu_order: 11 },
  { cpt: 'sccd_act_industry',   endpoint: 'activities-industry',           menu_name: '產學',      add_new: '新增產學',      all_items: '產學',      icon: 'dashicons-businessman', menu_order: 12 },
];

const LIST_COMPONENT_FIELDS = [
  { id: 'titleEn', name: '主標題 EN', type: 'text' },
  { id: 'subtitleEn', name: '副標題 EN', type: 'text' },
  { id: 'subtitleZh', name: '副標題 中', type: 'text' },
  {
    id: 'dates', name: '時間（可加多筆）', type: 'group', item_label: '時間',
    fields: [
      { id: 'startYear', name: '起始年', type: 'year' },
      { id: 'startMonth', name: '起始月', type: 'month' },
      { id: 'startDay', name: '起始日', type: 'day' },
      { id: 'endYear', name: '結束年', type: 'year' },
      { id: 'endMonth', name: '結束月', type: 'month' },
      { id: 'endDay', name: '結束日', type: 'day' },
    ],
  },
  {
    id: 'locations', name: '地點（可加多個，前臺用 / 串接，第一個地點國家會渲染為標題國旗）',
    type: 'group', item_label: '地點',
    fields: [
      { id: 'nameEn', name: '地點 EN', type: 'text' },
      { id: 'nameZh', name: '地點 中', type: 'text' },
      { id: 'country', name: '國家', type: 'country' },
    ],
  },
  {
    id: 'guests', name: '人物（可加多位）', type: 'group', item_label: '人物',
    fields: [
      { id: 'nameEn', name: '人物 EN', type: 'text' },
      { id: 'nameZh', name: '人物 中', type: 'text' },
      { id: 'country', name: '人物國家', type: 'country' },
      { id: 'orgEn', name: '單位/職業 EN', type: 'text' },
      { id: 'orgZh', name: '單位/職業 中', type: 'text' },
      { id: 'orgCountry', name: '單位之國家', type: 'country' },
      { id: 'isAlumni', name: '系友', type: 'checkbox' },
    ],
  },
  { id: 'descriptionEn', name: '簡介 EN', type: 'textarea' },
  { id: 'descriptionZh', name: '簡介 中', type: 'textarea' },
  { id: 'poster', name: '主視覺', type: 'image' },
  { id: 'images', name: '相簿圖片（可一次選多張）', type: 'image_list' },
  {
    id: 'videoLinks', name: '影片連結（YouTube / 外部 URL，可加多筆）',
    type: 'group', item_label: '影片連結',
    fields: [{ id: 'url', name: '影片 URL', type: 'text' }],
  },
  { id: 'videoFiles', name: '上傳影片檔案（可一次選多個）', type: 'video_list' },
];

for (const c of CPTS) {
  const schema = {
    cpt: c.cpt,
    endpoint: c.endpoint,
    menu_order: c.menu_order,
    labels: {
      name: c.menu_name,
      singular_name: c.menu_name,
      menu_name: c.menu_name,
      add_new: c.add_new,
      add_new_item: c.add_new,
      edit_item: '編輯' + c.menu_name,
      all_items: c.all_items,
    },
    menu_group: {
      slug: 'sccd-activities',
      label: '活動 Activities',
      icon: 'dashicons-calendar-alt',
    },
    menu_icon: c.icon,
    supports: ['title'],
    fields: LIST_COMPONENT_FIELDS,
  };
  const out = path.join(OUT_DIR, c.endpoint + '.json');
  fs.writeFileSync(out, JSON.stringify(schema, null, 2), 'utf8');
  console.log('✓', out, '(cpt:', c.cpt, ')');
}

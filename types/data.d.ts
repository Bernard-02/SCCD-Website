/**
 * JSON 資料結構型別定義
 * 對應 /data/ 下各 JSON 檔
 */

// ===== Courses（courses.json）=====
export interface CoursePart {
  titleEn: string;
  titleZh: string;
  descriptionEn?: string;
  descriptionZh?: string;
}

export interface CourseItem {
  titleEn: string;
  titleZh: string;
  type: 'required' | 'elective';
  grade?: 'freshman' | 'sophomore' | 'junior' | 'senior' | string;
  parts?: CoursePart[];
  descriptionEn?: string;
  descriptionZh?: string;
}

export interface CoursesData {
  bfa: CourseItem[];
  mdes: CourseItem[];
}

// ===== Awards / Records（records.json）=====
export interface AwardItem {
  id: string;          // e.g. "a-2024-01"
  flag?: string;       // e.g. "tw", "jp", "kr"
  location_en?: string;
  competition: string;
  competition_en?: string;
  award: string;
  award_en?: string;
  rank: string;
  rank_en?: string;
  winner: string;
  winner_en?: string;
}

export interface AwardYearGroup {
  year: number;
  items: AwardItem[];
}

export interface RecordsData {
  awardsImages: string[];
  records: AwardYearGroup[];
}

// ===== Faculty（faculty.json）=====
export interface FacultySection {
  titleEn: string;
  titleZh: string;
  type: 'education' | 'experience' | 'awards' | 'courses' | 'parttime' | 'admin' | string;
  items?: any[]; // 每種 type 的 items 結構不同
  content?: string;
}

export interface FacultyItem {
  id: string;
  type: 'fulltime' | 'parttime' | 'admin';
  image: string;
  nameEn: string;
  nameZh: string;
  titleEn: string;
  titleZh: string;
  sections: FacultySection[];
}

// ===== Library Files（library.json）=====
export interface LibraryFileItem {
  id: string;
  titleEn: string;
  titleZh: string;
  year: string;
  cover: string;
  pdfUrl: string;
  categories: string[];
}

// ===== Press（press.json）=====
export interface PressItem {
  id: string;
  year: number;
  category?: string;
  titleEn: string;
  titleZh: string;
  subtitleEn?: string;
  subtitleZh?: string;
  date?: string;
  image?: string;
  pdfUrl?: string;
  videoUrl?: string;
}

// ===== Album / Album-others =====
export interface AlbumItem {
  id?: string;
  title_en?: string;
  title_zh?: string;
  cover: string;
  images?: string[];
  poster?: string;
}

export interface AlbumYearGroup {
  year: number;
  items: AlbumItem[];
}

// ===== Activities 通用結構（exhibitions, lectures, workshops, 等）=====
export interface ActivityItem {
  id?: string;
  title: string;
  title_en?: string;
  description?: string;
  descriptionZh?: string;
  date?: string;
  date_en?: string;
  location?: string;
  location_zh?: string;
  poster?: string;
  images?: string[];
  videos?: string[];
  albums?: {
    date: string;
    location: string;
    location_zh?: string;
    images: string[];
  }[];
}

export interface ActivityYearGroup {
  year: number | string;
  items: ActivityItem[];
}

// ===== Timeline（timeline.json）=====
export interface TimelineYear {
  year: number;
  image: string;
  descriptions: string[];
}

export interface TimelineEra {
  era: string;
  label: string;
  years: TimelineYear[];
}

// ===== Resources（resources.json）=====
export interface ResourceItem {
  title: string;
  image: string;
  textEn: string;
  textZh: string;
}

// ===== News / Marquee =====
export interface NewsData {
  marquee: string;
  newsUrl: string;
  videoUrl?: string;
}

// ===== Floating Pool Entry（首頁漂浮元素內部型別）=====
export interface FloatingPoolEntry {
  type: 'image' | 'text' | 'video-thumb' | 'circle';
  src?: string;
  url?: string | null;
  textEn?: string;
  textZh?: string;
}

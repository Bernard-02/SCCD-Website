/**
 * Industry-Academia Data Loader
 * 比照 lectures，讀取 industry.json 並渲染列表
 */

import { loadGeneralActivitiesInto, buildInitialScrollTrigger } from './general-activities-data-loader.js';

export async function loadIndustryInto(containerId) {
  return loadGeneralActivitiesInto(containerId, null, '../data/industry.json', false);
}

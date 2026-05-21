<?php
if (!defined('ABSPATH')) exit;

/**
 * 讀 schemas/*.json，回傳 [cpt_key => schema_array]
 * Single source of truth：CPT/CMB2/import/endpoint 全部從這裡 derive
 */
function sccd_load_schemas() {
    static $cache = null;
    if ($cache !== null) return $cache;
    $list = [];
    foreach (glob(SCCD_SCHEMAS_DIR . '/*.json') as $f) {
        $raw = file_get_contents($f);
        $schema = json_decode($raw, true);
        if (!$schema || empty($schema['cpt'])) continue;
        $list[] = $schema;
    }
    // 按 menu_order 升序（default 100 維持載入順序，PHP 8.0+ usort stable）
    usort($list, fn($a, $b) => ($a['menu_order'] ?? 100) - ($b['menu_order'] ?? 100));
    $cache = [];
    foreach ($list as $schema) {
        $cache[$schema['cpt']] = $schema;
    }
    return $cache;
}

/**
 * 從 cpt key 拿 endpoint name
 * 優先用 schema 內 `endpoint` override；否則去 sccd_ + underscore→dash
 */
function sccd_endpoint_name($cpt) {
    $schema = sccd_load_schemas()[$cpt] ?? null;
    if (!empty($schema['endpoint'])) return $schema['endpoint'];
    return str_replace('_', '-', preg_replace('/^sccd_/', '', $cpt));
}

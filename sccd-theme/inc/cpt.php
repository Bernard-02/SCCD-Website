<?php
if (!defined('ABSPATH')) exit;

/**
 * 從 schemas/*.json 動態註冊所有 CPT
 * 若 schema 有 menu_group → show_in_menu 用 parent slug，3 個 CPT 自動收進同一個 parent menu
 */
add_action('init', function () {
    foreach (sccd_load_schemas() as $cpt => $schema) {
        // WP register_post_type 寫死 slug 上限 20 chars，超過 silent fail（不會 register 也不報錯）
        // 早期 catch 避免後台 sub-menu silent 消失難 debug
        if (strlen($cpt) > 20) {
            if (function_exists('add_action')) {
                add_action('admin_notices', function () use ($cpt) {
                    echo '<div class="notice notice-error"><p>SCCD schema 錯誤：CPT slug <code>' . esc_html($cpt) . '</code> 超過 20 字元（WP 限制），未註冊。請縮短 schema 的 cpt 欄位。</p></div>';
                });
            }
            continue;
        }
        $labels = $schema['labels'] ?? ['name' => $cpt, 'singular_name' => $cpt];
        $show_in_menu = !empty($schema['menu_group']['slug']) ? $schema['menu_group']['slug'] : true;
        register_post_type($cpt, [
            'labels' => $labels,
            'public' => true,
            'show_ui' => true,
            'show_in_menu' => $show_in_menu,
            'show_in_rest' => true,
            'menu_icon' => $schema['menu_icon'] ?? 'dashicons-admin-post',
            'supports' => $schema['supports'] ?? ['title'],
            'has_archive' => false,
            'rewrite' => ['slug' => str_replace('sccd_', '', $cpt) . 's'],
        ]);
    }
});

/**
 * 收集 schemas 內 unique menu_group → 註冊 parent menu page
 * Priority 9 早於 WP 內建 CPT sub-menu register（default 10）
 */
add_action('admin_menu', function () {
    $groups = [];
    foreach (sccd_load_schemas() as $cpt => $schema) {
        if (!empty($schema['menu_group']['slug'])) {
            $slug = $schema['menu_group']['slug'];
            if (!isset($groups[$slug])) {
                $groups[$slug] = $schema['menu_group'];
            }
        }
    }
    foreach ($groups as $slug => $group) {
        add_menu_page(
            $group['label'] ?? $slug,
            $group['label'] ?? $slug,
            'edit_posts',
            $slug,
            '',
            $group['icon'] ?? 'dashicons-admin-generic',
            $group['position'] ?? null
        );
    }
}, 9);

/**
 * max_posts hard limit：CPT 達上限時 hide「新增」sub-menu
 * （save_post guard 是後續可加的 backup）
 */
add_action('admin_menu', function () {
    foreach (sccd_load_schemas() as $cpt => $schema) {
        if (empty($schema['max_posts'])) continue;
        $counts = wp_count_posts($cpt);
        $total = ($counts->publish ?? 0) + ($counts->draft ?? 0) + ($counts->pending ?? 0);
        if ($total >= $schema['max_posts']) {
            $parent = $schema['menu_group']['slug'] ?? 'edit.php?post_type=' . $cpt;
            remove_submenu_page($parent, 'post-new.php?post_type=' . $cpt);
        }
    }
}, 100);

/**
 * 後台 list 頁頂顯示 max_posts 進度 hint
 */
add_action('admin_notices', function () {
    $screen = get_current_screen();
    if (!$screen || $screen->base !== 'edit') return;
    $schema = sccd_load_schemas()[$screen->post_type] ?? null;
    if (empty($schema['max_posts'])) return;
    $counts = wp_count_posts($screen->post_type);
    $total = ($counts->publish ?? 0) + ($counts->draft ?? 0) + ($counts->pending ?? 0);
    $max = $schema['max_posts'];
    $cls = $total >= $max ? 'notice-warning' : 'notice-info';
    echo "<div class='notice {$cls}'><p>此類別上限 <strong>{$max}</strong> 筆，目前 <strong>{$total}</strong> 筆"
        . ($total >= $max ? '（已達上限，無法新增）' : '') . '</p></div>';
});

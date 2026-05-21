<?php
if (!defined('ABSPATH')) exit;

/**
 * Schema-driven admin columns + dropdown filters
 * 每個 CPT 在 list 頁自動展開 schema.fields[] 內 type=select 的 column + 上方 dropdown filter
 * 改 schema options 即即時反映後台 list view
 */
add_action('admin_init', function () {
    foreach (sccd_load_schemas() as $cpt => $schema) {
        $select_fields = array_filter($schema['fields'] ?? [], fn($f) => ($f['type'] ?? '') === 'select');
        if (empty($select_fields)) continue;

        // 1. 加 column header（cb + title 後 / date 前）
        add_filter("manage_{$cpt}_posts_columns", function ($cols) use ($select_fields) {
            $new = [];
            if (isset($cols['cb'])) $new['cb'] = $cols['cb'];
            if (isset($cols['title'])) $new['title'] = $cols['title'];
            foreach ($select_fields as $f) {
                $new[$f['id']] = $f['name'];
            }
            if (isset($cols['date'])) $new['date'] = $cols['date'];
            return $new;
        });

        // 2. 印每筆 column 值（option label 不是 raw value）
        add_action("manage_{$cpt}_posts_custom_column", function ($column, $post_id) use ($select_fields) {
            foreach ($select_fields as $f) {
                if ($column !== $f['id']) continue;
                $val = get_post_meta($post_id, $f['id'], true);
                $label = $f['options'][$val] ?? $val;
                echo esc_html($label);
                return;
            }
        }, 10, 2);

        // 3. 列表頁上方 dropdown filter
        add_action('restrict_manage_posts', function () use ($cpt, $select_fields) {
            global $typenow;
            if ($typenow !== $cpt) return;
            foreach ($select_fields as $f) {
                $current = $_GET[$f['id']] ?? '';
                echo '<select name="' . esc_attr($f['id']) . '">';
                echo '<option value="">' . esc_html('全部 ' . $f['name']) . '</option>';
                foreach ($f['options'] as $key => $label) {
                    $selected = selected($current, $key, false);
                    echo '<option value="' . esc_attr($key) . '" ' . $selected . '>' . esc_html($label) . '</option>';
                }
                echo '</select>';
            }
        });

        // 4. 套用 filter 到 query
        add_filter('parse_query', function ($query) use ($cpt, $select_fields) {
            global $pagenow, $typenow;
            if ($pagenow !== 'edit.php' || $typenow !== $cpt || !$query->is_main_query()) return $query;
            $meta_query = [];
            foreach ($select_fields as $f) {
                if (!empty($_GET[$f['id']])) {
                    $meta_query[] = ['key' => $f['id'], 'value' => sanitize_text_field($_GET[$f['id']])];
                }
            }
            if ($meta_query) $query->set('meta_query', $meta_query);
            return $query;
        });
    }
});

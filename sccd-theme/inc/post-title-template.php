<?php
if (!defined('ABSPATH')) exit;

/**
 * Schema-driven post_title 自動 derive
 * schema 加 `"post_title_template": "{fieldA} - {fieldB}"` → save_post 後從 CMB2 meta combine 出 post_title
 * Priority 20 確保 CMB2 (priority 10/11) save 完 meta 後才讀
 */
add_action('save_post', function ($post_id, $post, $update) {
    if (wp_is_post_revision($post_id)) return;
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;

    $schema = sccd_load_schemas()[$post->post_type] ?? null;
    if (!$schema || empty($schema['post_title_template'])) return;

    $title = preg_replace_callback('/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/', function ($m) use ($post_id) {
        return get_post_meta($post_id, $m[1], true) ?: '';
    }, $schema['post_title_template']);

    $title = trim(preg_replace('/\s+/', ' ', $title)) ?: 'Untitled';
    if ($title === $post->post_title) return;

    remove_action('save_post', __FUNCTION__, 20);
    wp_update_post(['ID' => $post_id, 'post_title' => $title]);
    add_action('save_post', __FUNCTION__, 20, 3);
}, 20, 3);

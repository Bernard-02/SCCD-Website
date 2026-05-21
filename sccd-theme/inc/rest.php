<?php
if (!defined('ABSPATH')) exit;

/**
 * REST endpoint: /wp-json/sccd/v1/<name>
 * 把 CPT + CMB2 meta 重組成跟現有 data/<name>.json 一致的 shape
 */
add_action('rest_api_init', function () {
    // PoC 階段 CORS open；production 應限縮到實際前端 origin
    remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');
    add_filter('rest_pre_serve_request', function ($value) {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Access-Control-Allow-Credentials: false');
        return $value;
    });

    foreach (sccd_load_schemas() as $cpt => $schema) {
        $endpoint = sccd_endpoint_name($cpt);
        register_rest_route('sccd/v1', '/' . $endpoint, [
            'methods' => 'GET',
            'permission_callback' => '__return_true',
            'callback' => function ($req) use ($cpt, $schema) {
                return sccd_endpoint_handler($cpt, $schema);
            },
        ]);
    }
});

function sccd_endpoint_handler($cpt, $schema) {
    $posts = get_posts([
        'post_type' => $cpt,
        'numberposts' => -1,
        'post_status' => 'publish',
        'orderby' => 'menu_order date',
        'order' => 'ASC',
    ]);
    // Singleton：吐第一筆 entry object（前端 fetch().then(data => data.X) 直接用）
    if (!empty($schema['singleton'])) {
        if (empty($posts)) return (object) [];
        return sccd_serialize_post($posts[0], $schema);
    }
    // 預設輸出 array of entries；若 schema 有 serialize_dict_key 則 group 成 dict by 該 field
    if (!empty($schema['serialize_dict_key'])) {
        $key_field = $schema['serialize_dict_key'];
        $out = [];
        foreach ($posts as $p) {
            $entry = sccd_serialize_post($p, $schema);
            $key = $entry[$key_field] ?? null;
            if ($key) {
                unset($entry[$key_field]); // grouping key 不放進 entry
                $out[$key] = $entry;
            }
        }
        return (object) $out; // 保證 JSON 出 dict 不是 array（即使空也是 {}）
    }
    return array_map(fn($p) => sccd_serialize_post($p, $schema), $posts);
}

function sccd_serialize_post($post, $schema) {
    $out = [];
    foreach ($schema['fields'] as $f) {
        $val = get_post_meta($post->ID, $f['id'], true);
        if ($val === '' || $val === null) continue;
        $out[$f['id']] = $val;
    }
    // post_title 是 WP 內建 source；以它為 titleZh（user 改頂上 title input 即時反映前端）
    if ($post->post_title) {
        $out['titleZh'] = $post->post_title;
    }
    return $out;
}


<?php
if (!defined('ABSPATH')) exit;

/**
 * 從 schemas/*.json 動態註冊 CMB2 metaboxes
 * 依賴 CMB2 plugin（或之後 bundle 的 vendor/cmb2/）
 */
add_action('cmb2_admin_init', function () {
    foreach (sccd_load_schemas() as $cpt => $schema) {
        $box = new_cmb2_box([
            'id' => $cpt . '_metabox',
            'title' => ($schema['labels']['singular_name'] ?? $cpt) . ' 欄位',
            'object_types' => [$cpt],
            'context' => 'normal',
            'priority' => 'high',
        ]);

        foreach ($schema['fields'] ?? [] as $field) {
            sccd_add_field($box, $field, $cpt);
        }
    }
});

function sccd_add_field($box, $field, $cpt) {
    // group: repeater，遞迴 register subfields
    if (($field['type'] ?? '') === 'group') {
        $group_args = [
            'id' => $field['id'],
            'name' => $field['name'] ?? $field['id'],
            'type' => 'group',
            'options' => array_merge([
                'group_title' => ($field['item_label'] ?? '項目') . ' {#}',
                'add_button' => '新增' . ($field['item_label'] ?? '項目'),
                'remove_button' => '移除',
                'sortable' => true,
            ], $field['options'] ?? []),
        ];
        $group_id = $box->add_field($group_args);
        foreach ($field['fields'] ?? [] as $sub) {
            $box->add_group_field($group_id, sccd_build_field_args($sub));
        }
        return;
    }

    $box->add_field(sccd_build_field_args($field));
}

/**
 * 共用 field config 轉換：把 schema field 轉成 CMB2 add_field args
 * 處理 textarea → textarea_small / image → file 兩個 type map
 */
function sccd_build_field_args($field) {
    $args = [
        'name' => $field['name'] ?? $field['id'],
        'id' => $field['id'],
        'type' => $field['type'],
    ];
    if (isset($field['options'])) $args['options'] = $field['options'];
    if (isset($field['default'])) $args['default'] = $field['default'];
    if (isset($field['desc'])) $args['desc'] = $field['desc'];
    if (isset($field['rows'])) $args['attributes'] = ['rows' => $field['rows']];

    // 用 switch 避免 image/video → file 後又被「file」branch 重覆套用蓋掉 query_args / text
    switch ($field['type']) {
        case 'textarea':
            $args['type'] = 'textarea_small';
            break;
        case 'image':
            $args['type'] = 'file';
            $args['text'] = ['add_upload_file_text' => '選擇 / 上傳圖片'];
            $args['query_args'] = ['type' => 'image'];
            $args['preview_size'] = 'medium';
            break;
        case 'video':
            $args['type'] = 'file';
            $args['text'] = ['add_upload_file_text' => '選擇 / 上傳影片'];
            $args['query_args'] = ['type' => 'video'];
            // 對 video 沒 thumbnail preview，僅顯示檔名 + URL link
            break;
        case 'image_list':
            // CMB2 file_list：一次選多張、batch upload、sortable；存 meta 為 array { attachment_id => url }
            $args['type'] = 'file_list';
            $args['text'] = ['add_upload_files_text' => '選擇 / 上傳多張圖片'];
            $args['query_args'] = ['type' => 'image'];
            $args['preview_size'] = 'medium';
            break;
        case 'video_list':
            // CMB2 file_list 限 video mime：一次選多個影片檔
            $args['type'] = 'file_list';
            $args['text'] = ['add_upload_files_text' => '選擇 / 上傳多個影片檔'];
            $args['query_args'] = ['type' => 'video'];
            break;
        case 'file':
            // schema "type: file" = 不限 mime attachment（PDF / docx / zip 等）
            $args['type'] = 'file';
            $args['text'] = ['add_upload_file_text' => '選擇 / 上傳附件'];
            // 不傳 query_args 預設允許所有 mime
            break;
        case 'wysiwyg':
            // CMB2 內建 wysiwyg（WP TinyMCE），存進 DB 是 HTML 字串
            $args['type'] = 'wysiwyg';
            $args['options'] = array_merge([
                'media_buttons' => true,
                'textarea_rows' => 10,
            ], $args['options'] ?? []);
            break;
        case 'country':
            // schema "type: country" = ISO 3166-1 alpha-2 dropdown（值小寫對齊既有 data 慣例）
            // 前端 render 用 `<span class="fi fi-${code}">` 配 flag-icons CSS 自動顯示國旗
            // options 帶 emoji flag preview 給後台辨識
            $args['type'] = 'select';
            $args['options'] = array_merge([
                '' => '— 選擇國家 —',
            ], sccd_country_options());
            $args['show_option_none'] = false;
            break;
        case 'year':
            // 1950 - 2040 年份 dropdown；需要更多範圍未來在 sccd_year_options() 改
            $args['type'] = 'select';
            $args['options'] = array_merge([
                '' => '— 年 —',
            ], sccd_year_options());
            $args['show_option_none'] = false;
            break;
        case 'month':
            $args['type'] = 'select';
            $args['options'] = array_merge([
                '' => '— 月 —',
            ], sccd_month_options());
            $args['show_option_none'] = false;
            break;
        case 'day':
            $args['type'] = 'select';
            $args['options'] = array_merge([
                '' => '— 日 —',
            ], sccd_day_options());
            $args['show_option_none'] = false;
            break;
    }
    return $args;
}

/** 年份 options 1950-2040（升序） */
function sccd_year_options() {
    $opts = [];
    for ($y = 1950; $y <= 2040; $y++) {
        $opts[(string)$y] = (string)$y;
    }
    return $opts;
}

/** 月份 options 1-12（補 0） */
function sccd_month_options() {
    $opts = [];
    for ($m = 1; $m <= 12; $m++) {
        $key = str_pad((string)$m, 2, '0', STR_PAD_LEFT);
        $opts[$key] = $key;
    }
    return $opts;
}

/** 日 options 1-31（補 0；不按月校驗，user 自負責） */
function sccd_day_options() {
    $opts = [];
    for ($d = 1; $d <= 31; $d++) {
        $key = str_pad((string)$d, 2, '0', STR_PAD_LEFT);
        $opts[$key] = $key;
    }
    return $opts;
}

/**
 * 常用國家 ISO code → 顯示用 label（emoji + 中英）
 * 排序：學校常合作的亞太優先；新增國家直接 append
 */
function sccd_country_options() {
    return [
        'tw' => '🇹🇼 TW 台灣',
        'jp' => '🇯🇵 JP 日本',
        'kr' => '🇰🇷 KR 韓國',
        'cn' => '🇨🇳 CN 中國',
        'hk' => '🇭🇰 HK 香港',
        'sg' => '🇸🇬 SG 新加坡',
        'my' => '🇲🇾 MY 馬來西亞',
        'th' => '🇹🇭 TH 泰國',
        'vn' => '🇻🇳 VN 越南',
        'ph' => '🇵🇭 PH 菲律賓',
        'id' => '🇮🇩 ID 印尼',
        'in' => '🇮🇳 IN 印度',
        'au' => '🇦🇺 AU 澳洲',
        'nz' => '🇳🇿 NZ 紐西蘭',
        'us' => '🇺🇸 US 美國',
        'ca' => '🇨🇦 CA 加拿大',
        'mx' => '🇲🇽 MX 墨西哥',
        'br' => '🇧🇷 BR 巴西',
        'gb' => '🇬🇧 GB 英國',
        'fr' => '🇫🇷 FR 法國',
        'de' => '🇩🇪 DE 德國',
        'it' => '🇮🇹 IT 義大利',
        'es' => '🇪🇸 ES 西班牙',
        'nl' => '🇳🇱 NL 荷蘭',
        'be' => '🇧🇪 BE 比利時',
        'ch' => '🇨🇭 CH 瑞士',
        'at' => '🇦🇹 AT 奧地利',
        'se' => '🇸🇪 SE 瑞典',
        'no' => '🇳🇴 NO 挪威',
        'dk' => '🇩🇰 DK 丹麥',
        'fi' => '🇫🇮 FI 芬蘭',
        'pl' => '🇵🇱 PL 波蘭',
        'cz' => '🇨🇿 CZ 捷克',
        'ru' => '🇷🇺 RU 俄羅斯',
        'tr' => '🇹🇷 TR 土耳其',
        'il' => '🇮🇱 IL 以色列',
        'ae' => '🇦🇪 AE 阿聯',
        'za' => '🇿🇦 ZA 南非',
        'eg' => '🇪🇬 EG 埃及',
    ];
}

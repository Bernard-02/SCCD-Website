<?php
if (!defined('ABSPATH')) exit;
if (!defined('WP_CLI') || !WP_CLI) return;

/**
 * WP-CLI command: wp sccd import
 * 從 data-source/output/*.json 灌進對應 CPT
 *
 * Usage:
 *   wp sccd import              # import 所有 schemas
 *   wp sccd import courses      # 只 import courses
 *   wp sccd import --reset      # 先刪光舊 posts 再 import
 */
class SCCD_Import_Command {

    /**
     * Import JSON data into CPTs.
     *
     * ## OPTIONS
     *
     * [<name>]
     * : Schema name (e.g. courses). Omit to import all.
     *
     * [--reset]
     * : Delete all existing posts of that CPT before importing.
     *
     * ## EXAMPLES
     *
     *     wp sccd import
     *     wp sccd import courses
     *     wp sccd import courses --reset
     */
    public function __invoke($args, $assoc_args) {
        $schemas = sccd_load_schemas();
        $only = $args[0] ?? null;
        $reset = isset($assoc_args['reset']);

        foreach ($schemas as $cpt => $schema) {
            $endpoint = sccd_endpoint_name($cpt);
            if ($only && $only !== $endpoint && $only !== str_replace('sccd_', '', $cpt)) continue;

            // realpath 解析 symlink，回到 SCCD Website 真實根目錄
            $theme_real = realpath(SCCD_THEME_DIR);
            $json_path = dirname($theme_real) . '/data-source/output/' . $endpoint . '.json';
            if (!file_exists($json_path)) {
                WP_CLI::warning("Skip {$cpt}: not found {$json_path}");
                continue;
            }

            if ($reset) {
                $this->reset_cpt($cpt);
            }

            $data = json_decode(file_get_contents($json_path), true);
            // Singleton schema → JSON 是 object（1 筆 entry），包成 array 給 importer 統一處理
            if (!empty($schema['singleton']) && is_array($data) && !isset($data[0])) {
                $data = [$data];
            }
            $count = $this->import_data($cpt, $schema, $data);
            WP_CLI::success("Imported {$count} {$cpt} posts");
        }
    }

    private function reset_cpt($cpt) {
        $posts = get_posts(['post_type' => $cpt, 'numberposts' => -1, 'post_status' => 'any']);
        foreach ($posts as $p) wp_delete_post($p->ID, true);
        WP_CLI::log("Reset {$cpt}: deleted " . count($posts) . " posts");
    }

    private function import_data($cpt, $schema, $data) {
        $count = 0;
        foreach ($data as $entry) {
            // post_title 來源 priority：
            //   1. _post_title (parser 顯式指定，繞過 schema 無 titleZh field 的 fallback rot)
            //   2. titleZh / titleEn (legacy schema 有此 field 的)
            //   3. 'Untitled'
            $title = $entry['_post_title'] ?? $entry['titleZh'] ?? $entry['titleEn'] ?? 'Untitled';
            $post_id = wp_insert_post([
                'post_type' => $cpt,
                'post_title' => $title,
                'post_status' => 'publish',
            ]);
            if (is_wp_error($post_id)) {
                WP_CLI::warning("Insert failed: " . $post_id->get_error_message());
                continue;
            }
            foreach ($entry as $key => $val) {
                // _post_title 是 parser-only convention 不寫進 meta
                if ($key === '_post_title') continue;
                update_post_meta($post_id, $key, $val);
            }
            $count++;
        }
        return $count;
    }
}

WP_CLI::add_command('sccd import', 'SCCD_Import_Command');

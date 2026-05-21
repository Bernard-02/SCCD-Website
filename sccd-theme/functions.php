<?php
/**
 * SCCD Theme bootstrap
 * Schema-driven CPT + CMB2 fields + REST endpoint + WP-CLI import
 */

if (!defined('ABSPATH')) exit;

define('SCCD_THEME_DIR', get_template_directory());
define('SCCD_SCHEMAS_DIR', SCCD_THEME_DIR . '/schemas');

require_once SCCD_THEME_DIR . '/inc/schema-loader.php';
require_once SCCD_THEME_DIR . '/inc/cpt.php';
require_once SCCD_THEME_DIR . '/inc/cmb2-register.php';
require_once SCCD_THEME_DIR . '/inc/post-title-template.php';
require_once SCCD_THEME_DIR . '/inc/admin-columns.php';
require_once SCCD_THEME_DIR . '/inc/rest.php';

if (defined('WP_CLI') && WP_CLI) {
    require_once SCCD_THEME_DIR . '/inc/cli.php';
}

// CMB2: PoC 階段假設 user 已裝 CMB2 plugin。後續 bundle 進 vendor/cmb2/
add_action('admin_notices', function () {
    if (!defined('CMB2_LOADED')) {
        echo '<div class="notice notice-error"><p><strong>SCCD Theme</strong> 需要 CMB2 plugin。請到 Plugins → Add New 搜尋並安裝 <code>CMB2</code> 後啟用。</p></div>';
    }
});

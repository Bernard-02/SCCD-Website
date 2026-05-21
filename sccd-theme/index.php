<?php
/**
 * Theme entry. PoC 階段只放最小可動 placeholder。
 * 前端 SPA template 之後再接（會 echo SCCD Website 的 index.html 內容並 wp_head/wp_footer）
 */
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<title><?php bloginfo('name'); ?></title>
<?php wp_head(); ?>
</head>
<body>
<h1>SCCD Theme (PoC)</h1>
<p>Theme installed. 後台 CPT / CMB2 / REST 已 active。前端 template 之後接前端 SPA。</p>
<?php wp_footer(); ?>
</body>
</html>

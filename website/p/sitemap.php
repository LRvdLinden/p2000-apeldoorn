<?php
declare(strict_types=1);
// /sitemap-p2000.xml: the pages made from the alerts. Alerts of brandweer, politie and traumaheli of the last 30
// days, the places and units that occur in them, the stations and the fixed pages. Never ambulance alerts.
require __DIR__ . '/_lib.php';

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=900');
$urls = [['/statistieken', null], ['/afkortingen', null]];
$plaatsen = []; $eenheden = [];
$before = null; $grens = time() - 30 * 86400;
for ($i = 0; $i < 6; $i++) {
  $ms = ap_api('/v1/meldingen?limit=1000' . ($before ? '&before=' . rawurlencode($before) : ''), 900);
  if (!is_array($ms) || !$ms) break;
  foreach ($ms as $m) {
    if (!is_array($m) || empty($m['guid'])) continue;
    $t = strtotime((string)($m['datum_tijd'] ?? '')) ?: 0;
    if ($t < $grens) break 2;
    if (!empty($m['stad'])) $plaatsen[ap_slug($m['stad'])] = max($plaatsen[ap_slug($m['stad'])] ?? 0, $t);
    foreach ($m['eenheden'] ?? [] as $u) if (is_array($u) && ($c = preg_replace('/\D/', '', (string)($u['code'] ?? ''))) !== '') $eenheden[$c] = max($eenheden[$c] ?? 0, $t);
    if (($m['dienst'] ?? '') === 'ambulance') continue;
    $urls[] = [ap_melding_url($m), $t];
  }
  $before = (string)end($ms)['datum_tijd'];
  if (count($ms) < 1000) break;
}
foreach ($plaatsen as $s => $t) if ($s !== '') $urls[] = ['/plaats/' . $s, $t];
foreach ($eenheden as $c => $t) $urls[] = ['/eenheid/' . $c, $t];
$k = json_decode((string)@file_get_contents(__DIR__ . '/../assets/kazernes.json'), true);
foreach (is_array($k) ? $k : [] as $p) if (!empty($p['id'])) $urls[] = ['/post/' . $p['id'], null];
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as [$u, $t]) echo '  <url><loc>' . ap_h(AP_SITE . $u) . '</loc>' . ($t ? '<lastmod>' . gmdate('Y-m-d', $t) . '</lastmod>' : '') . "</url>\n";
echo "</urlset>\n";

<?php
declare(strict_types=1);
/**
 * Pages of a-alerts.nl made on the server (PHP), so Google and link previews get the real content in the HTML:
 * /melding/{dienst}/{guid}, /plaats/{naam}, /eenheid/{capcode}, /post/{id}, /statistieken, /afkortingen and the
 * sitemap of those pages. The data comes from api.a-alerts.nl (public routes only, no keys on this site), cached here
 * for a minute. Ambulance alerts: the page works with the link but is never indexed, and in lists of a place or unit an
 * ambulance alert is shown without street or house number.
 */

const AP_API = 'https://api.a-alerts.nl';
require_once dirname(__DIR__) . '/_token.php';
const AP_SITE = 'https://a-alerts.nl';
const AP_DIENST = ['brandweer' => 'Brandweer', 'ambulance' => 'Ambulance', 'politie' => 'Politie', 'traumaheli' => 'Traumaheli', 'lifeliner' => 'Traumaheli'];
const AP_KLEUR = ['brandweer' => '#E30613', 'ambulance' => '#F4C400', 'politie' => '#15428B', 'traumaheli' => '#9333EA', 'lifeliner' => '#9333EA'];

function ap_h(mixed $s): string { return htmlspecialchars((string)($s ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

/** GET on the API (JSON), cached for $ttl seconds in .cache next to this file. Null on an error or 404. */
function ap_api(string $pad, int $ttl = 60): mixed {
  $dir = __DIR__ . '/.cache'; if (!is_dir($dir)) @mkdir($dir, 0750, true);
  $f = $dir . '/' . md5($pad) . '.json';
  if (is_file($f) && time() - filemtime($f) < $ttl) { $j = json_decode((string)file_get_contents($f), true); if ($j !== null) return $j; }
  $ch = curl_init(AP_API . $pad);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_ENCODING => '',
    CURLOPT_HTTPHEADER => array_values(array_filter(['Accept: application/json', 'User-Agent: a-alerts.nl pagina', ($t = aa_token('a')) !== '' ? 'X-AAlerts-Token: ' . $t : null]))]);
  $b = curl_exec($ch); $c = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($c !== 200 || !is_string($b)) {
    // Stale copy rather than an error page when the API hiccups.
    if (is_file($f)) { $j = json_decode((string)file_get_contents($f), true); if ($j !== null) return $j; }
    return null;
  }
  $j = json_decode($b, true); if ($j === null) return null;
  @file_put_contents($f . '.tmp', $b); @rename($f . '.tmp', $f);
  if (mt_rand(1, 200) === 1) foreach (glob($dir . '/*.json') ?: [] as $o) if (time() - filemtime($o) > 86400) @unlink($o);
  return $j;
}

function ap_slug(mixed $s): string {
  $s = mb_strtolower(trim((string)($s ?? '')));
  $s = (string)preg_replace('/\p{Mn}/u', '', (string)Normalizer::normalize($s, Normalizer::FORM_D));
  return trim((string)preg_replace('/[^a-z0-9]+/', '-', $s), '-');
}
function ap_tijd(mixed $iso, bool $metJaar = true): string {
  if (!$iso) return '';
  try { $t = (new DateTimeImmutable((string)$iso))->setTimezone(new DateTimeZone('Europe/Amsterdam')); } catch (Throwable) { return ''; }
  $m = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  return $t->format('j') . ' ' . $m[(int)$t->format('n') - 1] . ($metJaar ? ' ' . $t->format('Y') : '') . ', ' . $t->format('H:i');
}
function ap_dienst(mixed $d): string { return AP_DIENST[(string)$d] ?? 'P2000'; }
function ap_melding_url(array $m): string { return '/melding/' . rawurlencode((string)(($m['dienst'] ?? '') ?: 'melding')) . '/' . rawurlencode((string)$m['guid']); }

/** The text of an alert in a list: for an ambulance without street, house number or postcode. */
function ap_lijsttekst(array $m): string {
  $t = trim((string)($m['title'] ?? ''));
  if (($m['dienst'] ?? '') === 'ambulance') {
    $loc = trim((string)($m['locatie'] ?? ''));
    if ($loc !== '' && mb_strtolower($loc) !== mb_strtolower((string)($m['stad'] ?? ''))) {
      $straat = trim((string)preg_replace('/\s+\d+\s*[a-zA-Z]?(\s*-\s*\d+)?$/u', '', $loc));
      foreach (array_unique([$loc, $straat]) as $x) if (mb_strlen($x) >= 3) $t = (string)preg_replace('/' . preg_quote($x, '/') . '(\s+\d+\s*[a-zA-Z]?\b)?/iu', '', $t);
    }
    $t = (string)preg_replace('/\b\d{4}\s?[A-Z]{2}\b/u', '', $t);
    $t = trim((string)preg_replace('/\s{2,}/u', ' ', $t));
  }
  return $t;
}

function ap_kop(array $o): void {
  $titel = $o['titel']; $desc = $o['omschrijving'] ?? ''; $url = AP_SITE . ($o['pad'] ?? '/');
  $beeld = $o['beeld'] ?? AP_SITE . '/og/pager.jpg'; $index = $o['index'] ?? true;
  header('Content-Type: text/html; charset=utf-8');
  header('Cache-Control: public, max-age=60');
  if (!$index) header('X-Robots-Tag: noindex, follow');
  ?><!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= ap_h($titel) ?> | A-Alerts</title>
<meta name="description" content="<?= ap_h($desc) ?>">
<link rel="canonical" href="<?= ap_h($url) ?>">
<meta name="robots" content="<?= $index ? 'index, follow' : 'noindex, follow' ?>">
<meta name="theme-color" content="#cf0a1e">
<meta property="og:type" content="<?= ap_h($o['og_type'] ?? 'website') ?>">
<meta property="og:site_name" content="A-Alerts">
<meta property="og:locale" content="nl_NL">
<meta property="og:title" content="<?= ap_h($o['og_titel'] ?? $titel) ?>">
<meta property="og:description" content="<?= ap_h($desc) ?>">
<meta property="og:url" content="<?= ap_h($url) ?>">
<meta property="og:image" content="<?= ap_h($beeld) ?>">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<?= ap_h($o['og_titel'] ?? $titel) ?>">
<meta name="twitter:description" content="<?= ap_h($desc) ?>">
<meta name="twitter:image" content="<?= ap_h($beeld) ?>">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" href="/assets/img/aalerts-icon-32.png">
<link rel="apple-touch-icon" href="/assets/img/aalerts-icon-180.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/assets/css/base.css?v=59">
<link rel="stylesheet" href="/assets/css/pagina.css?v=1">
<?php if (!empty($o['ld'])): ?><script type="application/ld+json"><?= json_encode($o['ld'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?></script>
<?php endif; ?>
<script src="/config.js?v=61"></script>
<script src="/assets/js/consent.js?v=59" defer></script>
</head>
<body>
<header class="pk">
  <a href="/" class="pk-merk"><span class="shield appmark"><img src="/assets/img/aalerts-icon-180.png" alt="" width="36" height="36"></span>A-Alerts</a>
  <nav aria-label="A-Alerts"><a href="/pager/">Live pager</a><a href="/statistieken"<?= ($o['nav'] ?? '') === 'stat' ? ' aria-current="page"' : '' ?>>Statistieken</a><a href="/afkortingen"<?= ($o['nav'] ?? '') === 'afk' ? ' aria-current="page"' : '' ?>>Afkortingen</a><a href="/nieuws/">Nieuws</a><a href="/hulp/">Hulp</a></nav>
</header>
<main class="pm">
<?php
}

function ap_voet(): void {
  ?>
</main>
<footer class="pv">A-Alerts · Bel bij nood altijd 112 · P2000 is openbaar; A-Alerts toont de berichten zoals ze zijn uitgezonden · <a href="/disclaimer/">Disclaimer</a> · <a href="/">a-alerts.nl</a></footer>
<script type="module">import { trackVisit } from "/assets/js/core.js?v=65"; trackVisit();</script>
</body>
</html>
<?php
}

/** A bar chart in plain HTML/CSS (no script): values with labels. */
function ap_balken(array $waarden, array $labels, string $kleur = 'var(--red)', ?array $tonen = null): string {
  $max = max(1, ...array_map('intval', $waarden ?: [0]));
  $o = '<div class="pb" role="img" aria-label="' . ap_h(implode(', ', array_map(fn($l, $v) => "$l: $v", $labels, $waarden))) . '">';
  foreach ($waarden as $i => $v) {
    $hgt = (int)round(100 * (int)$v / $max);
    $lab = $tonen === null || in_array($i, $tonen, true) ? ap_h($labels[$i] ?? '') : '';
    $o .= '<div class="pb-k" title="' . ap_h(($labels[$i] ?? '') . ': ' . $v) . '"><div class="pb-s" style="height:' . max($v ? 3 : 0, $hgt) . '%;background:' . $kleur . '"></div><span>' . $lab . '</span></div>';
  }
  return $o . '</div>';
}

/** A list of alerts as links. */
function ap_lijst(array $ms, bool $metPlaats = true): string {
  if (!$ms) return '<p class="pg">Geen meldingen in deze periode.</p>';
  $o = '<ul class="pl">';
  foreach ($ms as $m) {
    if (!is_array($m) || empty($m['guid'])) continue;
    $d = (string)($m['dienst'] ?? '');
    $o .= '<li><a href="' . ap_h(ap_melding_url($m)) . '"><span class="pl-d" style="--k:' . (AP_KLEUR[$d] ?? '#DC2626') . '">' . ap_h(ap_dienst($d)) . (($m['prioriteit'] ?? '') ? ' · ' . ap_h($m['prioriteit']) : '') . '</span>'
      . '<span class="pl-t">' . ap_h(ap_lijsttekst($m)) . '</span>'
      . '<span class="pl-m">' . ap_h(ap_tijd($m['datum_tijd'] ?? null)) . ($metPlaats && !empty($m['stad']) ? ' · ' . ap_h($m['stad']) : '') . '</span></a></li>';
  }
  return $o . '</ul>';
}

function ap_niet_gevonden(string $wat): never {
  http_response_code(404);
  ap_kop(['titel' => 'Niet gevonden', 'omschrijving' => $wat, 'pad' => $_SERVER['REQUEST_URI'] ?? '/', 'index' => false]);
  echo '<article class="pa"><h1>Niet gevonden</h1><p>' . ap_h($wat) . '</p><p><a class="pk-knop" href="/pager/">Naar de live pager</a></p></article>';
  ap_voet(); exit;
}

/** Terms from /v1/afkortingen that occur in a text (whole word; capitals exactly where the list asks for it). */
function ap_afkortingen_in(string $tekst): array {
  $lijst = ap_api('/v1/afkortingen', 3600)['items'] ?? [];
  $uit = [];
  foreach ($lijst as $a) {
    $t = (string)($a['term'] ?? ''); if ($t === '') continue;
    $re = '/(?<![\p{L}\d])' . preg_quote($t, '/') . '(?![\p{L}\d])/u' . (!empty($a['hoofdletters']) ? '' : 'i');
    if (preg_match($re, $tekst)) $uit[$t] = $a;
  }
  return array_values($uit);
}

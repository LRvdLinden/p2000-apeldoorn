<?php
declare(strict_types=1);
// /post/{id}: a fire station, ambulance post or police station with its units and how often it is called out.
require __DIR__ . '/_lib.php';

$id = (string)preg_replace('/[^\w-]/', '', (string)($_GET['id'] ?? ''));
if (strlen($id) < 3 || strlen($id) > 60) ap_niet_gevonden('Deze post kennen we niet.');
$p = ap_api('/v1/posten/' . rawurlencode($id), 300);
if (!is_array($p) || empty($p['id'])) ap_niet_gevonden('Deze post kennen we niet.');
$soort = (string)($p['soort'] ?? '');
$naam = (string)($p['naam'] ?? $id);
$omschr = "$naam in " . ($p['plaats'] ?? '') . ': ' . (int)($p['inzetten'] ?? 0) . ' inzetten in het afgelopen jaar, met de eenheden en voertuigen die A-Alerts in P2000 zag.';
ap_kop(['titel' => $naam, 'omschrijving' => $omschr, 'pad' => '/post/' . $p['id'],
  'ld' => ['@context' => 'https://schema.org', '@type' => $soort === 'brandweer' ? 'FireStation' : ($soort === 'politie' ? 'PoliceStation' : 'EmergencyService'),
    'name' => $naam, 'address' => ['@type' => 'PostalAddress', 'addressLocality' => $p['plaats'] ?? null, 'addressCountry' => 'NL'],
    'geo' => ['@type' => 'GeoCoordinates', 'latitude' => $p['lat'] ?? null, 'longitude' => $p['lon'] ?? null]]]);
?>
<article class="pa">
  <p class="pa-d" style="--k:<?= AP_KLEUR[$soort] ?? '#DC2626' ?>"><?= ap_h(ap_dienst($soort)) ?> · <?= ap_h($p['plaats'] ?? '') ?></p>
  <h1><?= ap_h($naam) ?></h1>
  <div class="ps">
    <div><b><?= (int)($p['inzetten'] ?? 0) ?></b><span>inzetten<?= !empty($p['sinds']) ? ' sinds ' . ap_h(ap_tijd($p['sinds'])) : '' ?></span></div>
    <?php if (!empty($p['laatste'])): ?><div><b><?= ap_h(ap_tijd($p['laatste'], false)) ?></b><span>laatste inzet</span></div><?php endif; ?>
  </div>
  <?php if (!empty($p['per_uur'])): ?><h2>Per uur van de dag</h2><?= ap_balken($p['per_uur'], array_map(fn($u) => sprintf('%02d:00', $u), range(0, 23)), AP_KLEUR[$soort] ?? 'var(--red)', [0, 6, 12, 18, 23]) ?><?php endif; ?>
  <?php if (!empty($p['capcodes'])): ?>
  <h2>Eenheden</h2>
  <ul class="pe"><?php foreach ($p['capcodes'] as $c): ?><li><a href="/eenheid/<?= ap_h(preg_replace('/\D/', '', (string)$c['code'])) ?>"><span class="pe-c"><?= ap_h($c['code']) ?></span> <?= ap_h($c['naam']) ?></a></li><?php endforeach; ?></ul>
  <?php endif; ?>
  <?php if (!empty($p['voertuigen'])): ?>
  <h2>Voertuigen</h2>
  <ul class="pe"><?php foreach ($p['voertuigen'] as $v): ?><li><span class="pe-c"><?= ap_h($v['nr']) ?></span> <?= ap_h($v['label']) ?></li><?php endforeach; ?></ul>
  <?php endif; ?>
  <p class="pg">Eenheden en voertuigen zoals ze in de P2000-berichten voorkwamen. <a href="/plaats/<?= ap_h(ap_slug($p['plaats'] ?? '')) ?>">Meldingen in <?= ap_h($p['plaats'] ?? '') ?></a></p>
</article>
<?php ap_voet();

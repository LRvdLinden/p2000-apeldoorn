<?php
declare(strict_types=1);
// /plaats/{naam}: the alerts of one place, with the figures of the last 28 days.
require __DIR__ . '/_lib.php';

$slug = ap_slug($_GET['s'] ?? '');
if ($slug === '' || strlen($slug) > 60) ap_niet_gevonden('Deze plaats kennen we niet.');
$ms = ap_api('/v1/meldingen?limit=60&plaats=' . rawurlencode($slug), 60);
$st = ap_api('/v1/statistiek?dagen=28&plaats=' . rawurlencode($slug), 600);
if (!is_array($ms) || !$ms) {
  if (!is_array($st) || !($st['totaal'] ?? 0)) ap_niet_gevonden('Er zijn geen meldingen voor deze plaats.');
}
$naam = (string)(($ms[0]['stad'] ?? '') ?: ucwords(str_replace('-', ' ', $slug)));
$tot = (int)($st['totaal'] ?? 0);
$omschr = "P2000-meldingen in $naam: brandweer, ambulance en politie live, met de cijfers van de laatste 28 dagen ($tot meldingen).";
ap_kop(['titel' => "P2000 $naam: meldingen van brandweer, ambulance en politie", 'og_titel' => "P2000 $naam", 'omschrijving' => $omschr, 'pad' => '/plaats/' . $slug,
  'ld' => ['@context' => 'https://schema.org', '@type' => 'CollectionPage', 'name' => "P2000 $naam", 'url' => AP_SITE . '/plaats/' . $slug, 'inLanguage' => 'nl-NL']]);
?>
<article class="pa">
  <h1>P2000 <?= ap_h($naam) ?></h1>
  <p class="pa-m">Meldingen van brandweer, ambulance en politie in <?= ap_h($naam) ?>. <a href="/pager/">Live volgen in de pager</a>.</p>
  <?php if (is_array($st)): ?>
  <div class="ps">
    <div><b><?= $tot ?></b><span>meldingen in 28 dagen</span></div>
    <?php foreach (['brandweer', 'ambulance', 'politie'] as $d): ?><div><b><?= (int)($st['per_dienst'][$d] ?? 0) ?></b><span><?= ap_h(ap_dienst($d)) ?></span></div><?php endforeach; ?>
  </div>
  <h2>Per uur van de dag</h2>
  <?= ap_balken($st['per_uur'] ?? [], array_map(fn($u) => sprintf('%02d:00', $u), range(0, 23)), 'var(--red)', [0, 6, 12, 18, 23]) ?>
  <?php endif; ?>
  <h2>Laatste meldingen</h2>
  <?= ap_lijst(is_array($ms) ? $ms : [], false) ?>
  <p class="pg"><a href="/statistieken">Alle statistieken</a> · Ambulancemeldingen staan hier zonder straat of huisnummer.</p>
</article>
<?php ap_voet();

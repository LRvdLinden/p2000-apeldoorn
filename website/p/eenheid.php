<?php
declare(strict_types=1);
// /eenheid/{capcode}: all calls of one unit (capcode) with its figures of the last 28 days.
require __DIR__ . '/_lib.php';

$code = substr((string)preg_replace('/\D/', '', (string)($_GET['c'] ?? '')), 0, 12);
if (strlen($code) < 5) ap_niet_gevonden('Deze eenheid kennen we niet.');
$ms = ap_api('/v1/meldingen?limit=60&eenheid=' . $code, 60);
$st = ap_api('/v1/statistiek?dagen=28&eenheid=' . $code, 600);
if ((!is_array($ms) || !$ms) && (!is_array($st) || !($st['totaal'] ?? 0))) ap_niet_gevonden('Er zijn geen meldingen voor deze eenheid.');
$naam = $code; $dienst = '';
foreach (is_array($ms) ? $ms : [] as $m) foreach ($m['eenheden'] ?? [] as $u) if (is_array($u) && preg_replace('/\D/', '', (string)($u['code'] ?? '')) === $code) { $naam = (string)($u['naam'] ?? $code); $dienst = mb_strtolower((string)($u['type'] ?? '')); break 2; }
$dienst = str_contains($dienst, 'brandweer') ? 'brandweer' : (str_contains($dienst, 'ambulance') ? 'ambulance' : (str_contains($dienst, 'politie') ? 'politie' : (string)($ms[0]['dienst'] ?? '')));
$tot = (int)($st['totaal'] ?? 0);
$omschr = "Alle P2000-inzetten van $naam (capcode $code): $tot meldingen in de laatste 28 dagen, per uur en per weekdag.";
ap_kop(['titel' => "$naam (capcode $code)", 'omschrijving' => $omschr, 'pad' => '/eenheid/' . $code,
  'ld' => ['@context' => 'https://schema.org', '@type' => 'CollectionPage', 'name' => $naam, 'url' => AP_SITE . '/eenheid/' . $code, 'inLanguage' => 'nl-NL']]);
?>
<article class="pa">
  <p class="pa-d" style="--k:<?= AP_KLEUR[$dienst] ?? '#DC2626' ?>"><?= ap_h(ap_dienst($dienst)) ?> · capcode <?= ap_h($code) ?></p>
  <h1><?= ap_h($naam) ?></h1>
  <?php if (is_array($st)): ?>
  <div class="ps">
    <div><b><?= $tot ?></b><span>inzetten in 28 dagen</span></div>
    <div><b><?= (int)($st['gisteren']['totaal'] ?? 0) ?></b><span>gisteren</span></div>
    <div><b><?= ap_h(number_format((float)($st['gisteren']['gemiddeld'] ?? 0), 1, ',', '')) ?></b><span>gemiddeld per dag</span></div>
  </div>
  <h2>Per uur van de dag</h2>
  <?= ap_balken($st['per_uur'] ?? [], array_map(fn($u) => sprintf('%02d:00', $u), range(0, 23)), AP_KLEUR[$dienst] ?? 'var(--red)', [0, 6, 12, 18, 23]) ?>
  <h2>Per weekdag</h2>
  <?= ap_balken($st['per_weekdag'] ?? [], ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'], AP_KLEUR[$dienst] ?? 'var(--red)') ?>
  <?php endif; ?>
  <h2>Laatste inzetten</h2>
  <?= ap_lijst(is_array($ms) ? $ms : []) ?>
  <p class="pg">Een capcode is het adres van een pieper. <a href="/afkortingen">Wat betekenen de afkortingen?</a></p>
</article>
<?php ap_voet();

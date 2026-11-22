<?php
declare(strict_types=1);
// /afkortingen: what the abbreviations and terms in P2000 alerts mean, with a search field.
require __DIR__ . '/_lib.php';

$a = ap_api('/v1/afkortingen', 3600);
$items = $a['items'] ?? [];
$groep = ['ambulance' => [], 'brandweer' => [], 'politie' => [], '' => []];
foreach ($items as $i) $groep[(string)($i['dienst'] ?? '')][] = $i;
$titels = ['' => 'Algemeen', 'ambulance' => 'Ambulance', 'brandweer' => 'Brandweer', 'politie' => 'Politie'];
$ld = ['@context' => 'https://schema.org', '@type' => 'DefinedTermSet', 'name' => 'Afkortingen in P2000-meldingen', 'url' => AP_SITE . '/afkortingen',
  'hasDefinedTerm' => array_map(fn($i) => ['@type' => 'DefinedTerm', 'name' => $i['term'], 'description' => $i['uitleg']], $items)];
ap_kop(['titel' => 'Afkortingen in P2000-meldingen', 'omschrijving' => 'Wat betekenen A1, P2, VWS, TS, BMI, OvD en GRIP? Alle afkortingen en termen uit P2000-meldingen van brandweer, ambulance en politie, kort uitgelegd.',
  'pad' => '/afkortingen', 'nav' => 'afk', 'ld' => $ld]);
?>
<article class="pa">
  <h1>Afkortingen</h1>
  <p class="pa-m">Wat betekenen de afkortingen en termen in P2000-meldingen? In de apps en op de meldingpagina's staat de uitleg ook bij de melding zelf.</p>
  <p><input type="search" id="zoek" class="pz" placeholder="Zoek een afkorting of woord" aria-label="Zoek een afkorting"></p>
  <?php foreach (['', 'ambulance', 'brandweer', 'politie'] as $g): if (!$groep[$g]) continue; ?>
  <section class="pg-s"><h2><?= ap_h($titels[$g]) ?></h2>
    <dl class="pd"><?php foreach ($groep[$g] as $i): ?><div class="pd-r" id="<?= ap_h(ap_slug($i['term'])) ?>"><dt><?= ap_h($i['term']) ?></dt><dd><?= ap_h($i['uitleg']) ?></dd></div><?php endforeach; ?></dl>
  </section>
  <?php endforeach; ?>
  <?php if (!$items): ?><p>De lijst is nu niet beschikbaar. Probeer het straks opnieuw.</p><?php endif; ?>
</article>
<script>
document.getElementById("zoek").addEventListener("input", function () {
  var q = this.value.trim().toLowerCase();
  document.querySelectorAll(".pd-r").forEach(function (r) { r.hidden = q !== "" && r.textContent.toLowerCase().indexOf(q) < 0; });
  document.querySelectorAll(".pg-s").forEach(function (s) { s.hidden = !s.querySelector(".pd-r:not([hidden])"); });
});
</script>
<?php ap_voet();

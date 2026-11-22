<?php
declare(strict_types=1);
// /statistieken: the P2000 figures of the last 28 days (or ?dagen=7/90), made from the stored alerts.
require __DIR__ . '/_lib.php';

$dagen = (int)($_GET['dagen'] ?? 28); if (!in_array($dagen, [7, 28, 90], true)) $dagen = 28;
$st = ap_api('/v1/statistiek?dagen=' . $dagen, 600);
ap_kop(['titel' => "P2000-statistieken: de laatste $dagen dagen", 'omschrijving' => "Hoeveel meldingen van brandweer, ambulance en politie waren er de laatste $dagen dagen? Per uur, per weekdag, per dienst en prioriteit, de drukste plaatsen en eenheden.",
  'pad' => '/statistieken' . ($dagen !== 28 ? "?dagen=$dagen" : ''), 'nav' => 'stat', 'index' => $dagen === 28]);
?>
<article class="pa">
  <h1>Statistieken</h1>
  <p class="pa-m">P2000-meldingen van de laatste <?= $dagen ?> dagen. Test- en oefenmeldingen tellen niet mee.
    <span class="pt"><?php foreach ([7, 28, 90] as $d): ?><a href="/statistieken<?= $d !== 28 ? "?dagen=$d" : '' ?>"<?= $d === $dagen ? ' aria-current="page"' : '' ?>><?= $d ?> dagen</a><?php endforeach; ?></span></p>
  <?php if (!is_array($st)): ?>
  <p>De cijfers zijn nu niet beschikbaar. Probeer het straks opnieuw.</p>
  <?php else: $pd = $st['per_dienst'] ?? []; ?>
  <div class="ps">
    <div><b><?= (int)$st['totaal'] ?></b><span>meldingen</span></div>
    <div><b><?= (int)($st['gisteren']['totaal'] ?? 0) ?></b><span>gisteren (gemiddeld <?= ap_h(number_format((float)($st['gisteren']['gemiddeld'] ?? 0), 1, ',', '')) ?>)</span></div>
    <?php foreach (['brandweer', 'ambulance', 'politie', 'traumaheli'] as $d): if (!isset($pd[$d])) continue; ?><div><b><?= (int)$pd[$d] ?></b><span><?= ap_h(ap_dienst($d)) ?></span></div><?php endforeach; ?>
  </div>
  <?php if (!empty($st['gegevens_sinds']) && strtotime($st['gegevens_sinds']) > time() - $dagen * 86400): ?>
  <p class="pg">A-Alerts bewaart meldingen sinds <?= ap_h(ap_tijd($st['gegevens_sinds'])) ?>; de cijfers gaan over die periode.</p>
  <?php endif; ?>
  <h2>Per dag</h2>
  <?php $pdag = $st['per_dag'] ?? []; echo ap_balken(array_column($pdag, 'totaal'), array_map(fn($d) => date('j-n', strtotime($d['datum'])), $pdag), 'var(--red)', [0, (int)floor(count($pdag) / 2), count($pdag) - 1]); ?>
  <h2>Per uur van de dag</h2>
  <?= ap_balken($st['per_uur'] ?? [], array_map(fn($u) => sprintf('%02d:00', $u), range(0, 23)), 'var(--red)', [0, 6, 12, 18, 23]) ?>
  <h2>Per weekdag</h2>
  <?= ap_balken($st['per_weekdag'] ?? [], ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']) ?>
  <?php $pp = $st['per_prioriteit'] ?? []; if ($pp): ?>
  <h2>Per prioriteit</h2>
  <?= ap_balken(array_values($pp), array_keys($pp)) ?>
  <?php endif; ?>
  <div class="pk2">
    <section><h2>Drukste plaatsen</h2><ol class="pr"><?php foreach ($st['top_plaatsen'] ?? [] as $p): ?><li><a href="/plaats/<?= ap_h(ap_slug($p['plaats'])) ?>"><?= ap_h($p['plaats']) ?></a><b><?= (int)$p['aantal'] ?></b></li><?php endforeach; ?></ol></section>
    <section><h2>Drukste eenheden</h2><ol class="pr"><?php foreach ($st['top_eenheden'] ?? [] as $e): ?><li><a href="/eenheid/<?= ap_h($e['code']) ?>"><?= ap_h($e['naam']) ?></a><b><?= (int)$e['aantal'] ?></b></li><?php endforeach; ?></ol></section>
  </div>
  <?php if (!empty($st['helikopters']['inzetten'])): ?>
  <h2>Traumahelikopter</h2>
  <p><?= (int)$st['helikopters']['inzetten'] ?> P2000-meldingen voor een traumahelikopter<?php $pt = $st['helikopters']['per_toestel'] ?? []; if ($pt): ?>: <?= ap_h(implode(', ', array_map(fn($t) => $t['naam'] . ' ' . $t['aantal'] . '×', $pt))) ?><?php endif; ?>.</p>
  <?php endif; ?>
  <p class="pg">Bijgewerkt <?= ap_h(ap_tijd($st['bijgewerkt'] ?? null)) ?>. Bron: P2000.</p>
  <?php endif; ?>
</article>
<?php ap_voet();

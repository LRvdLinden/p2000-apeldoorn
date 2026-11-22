<?php
declare(strict_types=1);
// /melding/{dienst}/{guid}: one P2000 alert with everything A-Alerts knows about it. The link opens in the app when
// that is installed (universal links); here the same alert as a page. Ambulance: noindex.
require __DIR__ . '/_lib.php';

$guid = (string)preg_replace('/[^\w-]/', '', (string)($_GET['g'] ?? ''));
if (strlen($guid) < 8 || strlen($guid) > 64) ap_niet_gevonden('Deze melding bestaat niet.');
$m = ap_api('/v1/meldingen/' . rawurlencode($guid), 60);
if (!is_array($m) || empty($m['guid'])) ap_niet_gevonden('Deze melding bestaat niet (meer).');

$dienst = (string)($m['dienst'] ?? '');
$ambu = $dienst === 'ambulance';
$naam = ap_dienst($dienst);
$prio = trim((string)($m['prioriteit'] ?? ''));
$stad = trim((string)($m['stad'] ?? ''));
$tekst = trim((string)($m['title'] ?? ''));
$tijd = ap_tijd($m['datum_tijd'] ?? null);
$pad = ap_melding_url($m);
$beeld = AP_API . '/v1/meldingen/' . rawurlencode($m['guid']) . '/afbeelding.png?formaat=og';

$verloop = ap_api('/v1/meldingen/' . rawurlencode($m['guid']) . '/verloop', 60);
$gekoppeld = array_values(array_filter($verloop['meldingen'] ?? [], fn($o) => is_array($o) && ($o['guid'] ?? '') !== $m['guid']));
$afk = ap_afkortingen_in($tekst . ' ' . $prio);

$kop = $naam . ($prio !== '' ? " $prio" : '') . ($stad !== '' ? " in $stad" : '');
$omschr = $naam . ($prio !== '' ? " ($prio)" : '') . ($stad !== '' ? " in $stad" : '') . ($tijd !== '' ? ", $tijd" : '') . ': ' . ($ambu ? ap_lijsttekst($m) : $tekst);
$ld = ['@context' => 'https://schema.org', '@type' => 'WebPage', 'name' => $kop, 'description' => $omschr, 'url' => AP_SITE . $pad, 'inLanguage' => 'nl-NL',
  'datePublished' => $m['datum_tijd'] ?? null, 'isPartOf' => ['@id' => AP_SITE . '/#website'], 'primaryImageOfPage' => $beeld];

ap_kop(['titel' => $kop . ($tijd !== '' ? " – $tijd" : ''), 'og_titel' => $kop, 'omschrijving' => $omschr, 'pad' => $pad, 'beeld' => $beeld, 'index' => !$ambu, 'og_type' => 'article', 'ld' => $ambu ? null : $ld]);
?>
<article class="pa">
  <p class="pa-d" style="--k:<?= AP_KLEUR[$dienst] ?? '#DC2626' ?>"><?= ap_h($naam) ?><?php if ($prio !== ''): ?> <b><?= ap_h($prio) ?></b><?php endif; ?></p>
  <h1><?= ap_h($tekst) ?></h1>
  <p class="pa-m">
    <?php if ($tijd !== ''): ?><time datetime="<?= ap_h($m['datum_tijd']) ?>"><?= ap_h($tijd) ?></time><?php endif; ?>
    <?php if ($stad !== ''): ?> · <a href="/plaats/<?= ap_h(ap_slug($stad)) ?>"><?= ap_h($stad) ?></a><?php endif; ?>
    <?php if (!empty($m['regio'])): ?> · <?= ap_h($m['regio']) ?><?php endif; ?>
  </p>
  <?php if (!empty($m['hm']['tekst'])): ?><p class="pa-hm">Hectometerpaal <b><?= ap_h($m['hm']['tekst']) ?></b><?php if (empty($m['hm']['zijde'])): ?> (rijbaan niet genoemd)<?php endif; ?></p><?php endif; ?>
  <p class="pa-knoppen">
    <a class="pk-knop" href="/pager/?melding=<?= ap_h(rawurlencode($m['guid'])) ?>">Bekijk live in de pager</a>
    <a class="pk-knop pk-licht" href="<?= ap_h($beeld) ?>" download>Afbeelding</a>
    <a class="pk-knop pk-licht" href="<?= ap_h(AP_API . '/v1/meldingen/' . rawurlencode($m['guid']) . '/afbeelding.png?formaat=vierkant') ?>" download>Instagram</a>
    <a class="pk-knop pk-licht" href="<?= ap_h(AP_API . '/v1/meldingen/' . rawurlencode($m['guid']) . '/afbeelding.png?formaat=staand') ?>" download>Story</a>
  </p>
  <img class="pa-beeld" src="<?= ap_h($beeld) ?>" alt="<?= ap_h($kop) ?>" width="1200" height="630" loading="lazy">

  <?php if (!empty($m['eenheden'])): ?>
  <h2>Opgeroepen eenheden</h2>
  <ul class="pe">
    <?php foreach ($m['eenheden'] as $u): if (!is_array($u) || empty($u['code'])) continue; ?>
    <li><a href="/eenheid/<?= ap_h(preg_replace('/\D/', '', (string)$u['code'])) ?>"><span class="pe-c"><?= ap_h($u['code']) ?></span> <?= ap_h($u['naam'] ?? '') ?></a></li>
    <?php endforeach; ?>
  </ul>
  <?php endif; ?>
  <?php $vt = array_values(array_filter(array_map(fn($v) => is_array($v) ? ($v['label'] ?? '') : (string)$v, $m['voertuigen'] ?? []))); if ($vt): ?>
  <h2>Voertuigen</h2><ul class="pe"><?php foreach ($vt as $v): ?><li><?= ap_h($v) ?></li><?php endforeach; ?></ul>
  <?php endif; ?>

  <?php if ($gekoppeld): ?>
  <h2>Hoort mogelijk bij dezelfde inzet</h2>
  <p class="pg">Meldingen met hetzelfde rit- of GMS-nummer, op hetzelfde adres of met dezelfde eenheid, kort na elkaar.</p>
  <?= ap_lijst($gekoppeld) ?>
  <?php endif; ?>

  <?php if ($afk): ?>
  <h2>Wat betekent het?</h2>
  <dl class="pd"><?php foreach ($afk as $a): ?><dt><?= ap_h($a['term']) ?></dt><dd><?= ap_h($a['uitleg']) ?></dd><?php endforeach; ?></dl>
  <p class="pg"><a href="/afkortingen">Alle afkortingen</a></p>
  <?php endif; ?>

  <p class="pg">Bron: P2000, het openbare alarmeringsnet van de hulpdiensten. Kaart in de afbeelding: PDOK/Kadaster. Bel bij nood altijd 112.</p>
</article>
<?php ap_voet();

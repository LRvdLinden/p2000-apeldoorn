<?php
declare(strict_types=1);
/** Token for the A-Alerts API (X-AAlerts-Token). The key sits in _private/sleutel.php (written at deploy from the GitHub secret AALERTS_KEY, never in the repo). */
function aa_sleutel(): string {
  static $k = null;
  if ($k === null) { $f = __DIR__ . '/_private/sleutel.php'; $k = is_file($f) ? (string)(include $f) : ''; }
  return $k;
}
function aa_token(string $soort = 'w'): string {
  $k = aa_sleutel(); if ($k === '') return '';
  $p = $soort . '.' . time();
  return $p . '.' . hash_hmac('sha256', $p, $k);
}

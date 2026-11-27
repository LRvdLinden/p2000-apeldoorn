<?php
declare(strict_types=1);
// Short-lived token for the scripts of this site (valid 2 hours); the key itself never goes to the browser.
require __DIR__ . '/_token.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '' && !preg_match('#^https://(www\.)?(a-alerts|p2000-apeldoorn)\.nl$#', $origin)) { http_response_code(403); echo '{"t":""}'; exit; }
if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? 'same-origin') === 'cross-site') { http_response_code(403); echo '{"t":""}'; exit; }
echo json_encode(['t' => aa_token('w'), 'ttl' => 6600]);

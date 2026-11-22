<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$storageFile = __DIR__ . '/dashboard_layout.json';

function sanitizeLang($rawLang): string {
    $clean = strtolower(preg_replace('/[^a-zA-Z-]/', '', (string) $rawLang));
    $short = substr(explode('-', $clean)[0] ?? '', 0, 5);
    return $short !== '' ? $short : 'de';
}

function sanitizeIdList($rawList): array {
    if (!is_array($rawList)) {
        return [];
    }
    $clean = [];
    foreach ($rawList as $item) {
        if (!is_string($item)) {
            continue;
        }
        $id = preg_replace('/[^a-zA-Z0-9_-]/', '', $item);
        if ($id !== '' && strlen($id) <= 100 && !in_array($id, $clean, true)) {
            $clean[] = $id;
        }
    }
    return array_slice($clean, 0, 100);
}

function sanitizeColumns($rawColumns): array {
    if (!is_array($rawColumns)) {
        return [];
    }
    $columns = [];
    $seen = [];
    foreach (array_slice($rawColumns, 0, 6) as $col) {
        $cleanCol = [];
        foreach (sanitizeIdList($col) as $id) {
            if (!isset($seen[$id])) {
                $seen[$id] = true;
                $cleanCol[] = $id;
            }
        }
        $columns[] = $cleanCol;
    }
    return $columns;
}

function normalizeLayoutEntry($entry): array {
    if (!is_array($entry)) {
        return ['columns' => [], 'hidden' => []];
    }
    return [
        'columns' => sanitizeColumns($entry['columns'] ?? []),
        'hidden'  => sanitizeIdList($entry['hidden'] ?? []),
    ];
}

function loadStore(string $storageFile): array {
    if (!file_exists($storageFile)) {
        return ['locales' => []];
    }
    $raw = file_get_contents($storageFile);
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['locales' => []];
    }

    if (isset($decoded['locales']) && is_array($decoded['locales'])) {
        $cleanLocales = [];
        foreach ($decoded['locales'] as $localeKey => $localeData) {
            $safeLocale = sanitizeLang($localeKey);
            $cleanLocales[$safeLocale] = normalizeLayoutEntry($localeData);
        }
        return ['locales' => $cleanLocales];
    }

    // Abwärtskompatibilität für altes Format ohne "locales"
    if (isset($decoded['columns']) || isset($decoded['hidden'])) {
        return [
            'locales' => [
                'de' => normalizeLayoutEntry($decoded),
            ],
        ];
    }

    return ['locales' => []];
}

function saveStore(string $storageFile, array $store): bool {
    $payload = json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($payload === false) {
        return false;
    }
    return file_put_contents($storageFile, $payload . PHP_EOL, LOCK_EX) !== false;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $lang = sanitizeLang($_GET['lang'] ?? 'de');
    $store = loadStore($storageFile);
    $entry = $store['locales'][$lang] ?? ['columns' => [], 'hidden' => []];

    echo json_encode([
        'lang'    => $lang,
        'columns' => $entry['columns'],
        'hidden'  => $entry['hidden'],
    ]);
    exit;
}

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid payload']);
        exit;
    }

    $lang = sanitizeLang($input['lang'] ?? ($_GET['lang'] ?? 'de'));
    $store = loadStore($storageFile);

    if (!empty($input['reset'])) {
        unset($store['locales'][$lang]);

        if (empty($store['locales'])) {
            if (file_exists($storageFile) && @unlink($storageFile) === false) {
                http_response_code(500);
                echo json_encode(['ok' => false, 'error' => 'Failed to delete layout']);
                exit;
            }
        } elseif (!saveStore($storageFile, $store)) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'Failed to update layout']);
            exit;
        }

        echo json_encode(['ok' => true, 'lang' => $lang, 'columns' => [], 'hidden' => []]);
        exit;
    }

    if (!array_key_exists('columns', $input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing columns']);
        exit;
    }

    $entry = [
        'columns' => sanitizeColumns($input['columns']),
        'hidden'  => sanitizeIdList($input['hidden'] ?? []),
    ];
    $store['locales'][$lang] = $entry;

    if (!saveStore($storageFile, $store)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Failed to write layout']);
        exit;
    }

    echo json_encode([
        'ok'      => true,
        'lang'    => $lang,
        'columns' => $entry['columns'],
        'hidden'  => $entry['hidden'],
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
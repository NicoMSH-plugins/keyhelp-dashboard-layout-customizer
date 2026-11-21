<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$storageFile = __DIR__ . '/dashboard_layout.json';

function sanitizeIdList($rawList): array {
    if (!is_array($rawList)) { return []; }$clean = [];
    foreach ($rawList as$item) {
        if (!is_string($item)) {
            continue;
        }
        $id = preg_replace('/[^a-zA-Z0-9_-]/', '',$item);
        if ($id !== '' && strlen($id) <= 100 && !in_array($id,$clean, true)) {
            $clean[] =$id;
        }
    }
    return array_slice($clean, 0, 100);
}

function sanitizeColumns($rawColumns): array {
    if (!is_array($rawColumns)) {
        return [];
    }
    $columns = [];$seen = [];
    foreach (array_slice($rawColumns, 0, 6) as $col) {$cleanCol = [];
        foreach (sanitizeIdList($col) as$id) {
            if (!isset($seen[$id])) {
                $seen[$id] = true;
                $cleanCol[] =$id;
            }
        }
        $columns[] =$cleanCol;
    }
    return $columns;
}

function normalizeLayoutData($decoded): array {
    if (!is_array($decoded)) {
        return ['columns' => [], 'hidden' => []];
    }
    return [
        'columns' => sanitizeColumns($decoded['columns'] ?? []),
        'hidden'  => sanitizeIdList($decoded['hidden'] ?? []),
    ];
}

$method =$_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    if (!file_exists($storageFile)) {
        echo json_encode(['columns' => [], 'hidden' => []]);
        exit;
    }
    $raw = file_get_contents($storageFile);
    $decoded = json_decode($raw, true);
    echo json_encode(normalizeLayoutData($decoded));
    exit;
}

if ($method === 'POST') {$input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid payload']);
        exit;
    }

    if (!empty($input['reset'])) {
        if (file_exists($storageFile) && @unlink($storageFile) === false) {
            http_response_code(500);
            echo json_encode(['ok' => false, 'error' => 'Failed to delete layout']);
            exit;
        }
        echo json_encode(['ok' => true, 'columns' => [], 'hidden' => []]);
        exit;
    }

    if (!array_key_exists('columns', $input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing columns']);
        exit;
    }

    $data = [
        'columns' => sanitizeColumns($input['columns']),
        'hidden'  => sanitizeIdList($input['hidden'] ?? []),
    ];

    $payload = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

    if ($payload === false || file_put_contents($storageFile,$payload . PHP_EOL, LOCK_EX) === false) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Failed to write layout']);
        exit;
    }

    echo json_encode(array_merge(['ok' => true], $data));
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed']);

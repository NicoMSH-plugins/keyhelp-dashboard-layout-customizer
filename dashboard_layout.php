<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const LAYOUT_PLUGIN_VERSION = '1.0.4';
const LAYOUT_GITHUB_REPO    = 'NicoMSH-plugins/keyhelp-dashboard-layout-customizer';

$storageFile = __DIR__ . '/dashboard_layout.json';
$repoDir     = __DIR__;

$sessionName = (string)ini_get('session.name');
if ($sessionName === '') {
    $sessionName = 'PHPSESSID';
}
$hasSessionCookie =
    (isset($_COOKIE[$sessionName]) && is_string($_COOKIE[$sessionName]) && $_COOKIE[$sessionName] !== '')
    || (isset($_COOKIE['KEYHELP_SESSION_ID']) && is_string($_COOKIE['KEYHELP_SESSION_ID']) && $_COOKIE['KEYHELP_SESSION_ID'] !== '');

if (
    $hasSessionCookie
    && isset($_COOKIE['KEYHELP_SESSION_ID'])
    && is_string($_COOKIE['KEYHELP_SESSION_ID'])
    && $_COOKIE['KEYHELP_SESSION_ID'] !== ''
    && $sessionName !== 'KEYHELP_SESSION_ID'
) {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        @session_name('KEYHELP_SESSION_ID');
    }
}

$csrfToken = null;
$sessionHasCsrf = false;

if ($hasSessionCookie) {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        @session_start();
    }
    if (session_status() === PHP_SESSION_ACTIVE && session_id() !== '') {
        $sessionHasCsrf = isset($_SESSION['kh_layout_csrf'])
            && is_string($_SESSION['kh_layout_csrf'])
            && $_SESSION['kh_layout_csrf'] !== '';
        if (!$sessionHasCsrf) {
            $_SESSION['kh_layout_csrf'] = bin2hex(random_bytes(32));
        }
        $csrfToken = $_SESSION['kh_layout_csrf'];
    }
}

function isSameOriginRequest(): bool {
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($host === '') {
        return false;
    }
    $origin  = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
    $checkUrl = $origin !== '' ? $origin : $referer;
    if ($checkUrl === '') {
        return true;
    }
    $parsedHost = strtolower((string)(parse_url($checkUrl, PHP_URL_HOST) ?? ''));
    $parsedPort = parse_url($checkUrl, PHP_URL_PORT);
    $candidate  = $parsedHost . ($parsedPort ? ':' . $parsedPort : '');
    return hash_equals($host, $candidate) || hash_equals($host, $parsedHost);
}

function requireValidCsrfAndOrigin(bool $hasSessionCookie, bool $sessionHasCsrf, array $input = []): bool {
    if (!$hasSessionCookie || !$sessionHasCsrf || session_status() !== PHP_SESSION_ACTIVE) {
        return false;
    }
    if (!isSameOriginRequest()) {
        return false;
    }
    $headerToken = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $bodyToken   = is_string($input['csrf_token'] ?? null) ? (string)$input['csrf_token'] : '';
    $token       = $headerToken !== '' ? $headerToken : $bodyToken;
    $expected    = (string)($_SESSION['kh_layout_csrf'] ?? '');
    return $token !== '' && $expected !== '' && hash_equals($expected, $token);
}

function findGitBinary(): ?string {
    $candidates = ['/usr/bin/git', '/usr/local/bin/git', '/bin/git'];
    foreach ($candidates as $bin) {
        if (is_file($bin) && is_executable($bin)) {
            return $bin;
        }
    }
    return null;
}

function runGitCommand(string $gitBin, string $repoDir, array $args): array {
    $cmdParts = [
        escapeshellarg($gitBin),
        '-c',
        escapeshellarg('safe.directory=' . $repoDir),
        '-C',
        escapeshellarg($repoDir),
    ];
    foreach ($args as $arg) {
        $cmdParts[] = escapeshellarg($arg);
    }
    $cmd = implode(' ', $cmdParts) . ' 2>&1';
    $output = [];
    $code   = 1;
    @exec($cmd, $output, $code);
    return [
        'code'   => $code,
        'output' => trim(implode("\n", $output)),
    ];
}

function isMatchingGitRepo(string $gitBin, string $repoDir): bool {
    if (!is_dir($repoDir . '/.git')) {
        return false;
    }
    $remoteRes = runGitCommand($gitBin, $repoDir, ['remote', 'get-url', 'origin']);
    if ($remoteRes['code'] !== 0 || $remoteRes['output'] === '') {
        return false;
    }
    return stripos($remoteRes['output'], 'keyhelp-dashboard-layout-customizer') !== false;
}

function getLatestGithubReleaseInfo(bool $forceFetch = false): ?array {
    $cacheFile = sys_get_temp_dir() . '/kh_layout_self_release.json';
    $cacheTtl  = 600;

    if (!$forceFetch && file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
        $cached = @json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($cached) && !empty($cached['latest_version'])) {
            return $cached;
        }
    }

    if (!function_exists('curl_init')) {
        return null;
    }

    $apiUrl  = 'https://api.github.com/repos/' . LAYOUT_GITHUB_REPO . '/releases/latest';
    $headers = [
        'User-Agent: KeyHelp-Dashboard-Layout',
        'Accept: application/vnd.github+json',
    ];

    $ch = curl_init($apiUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_TIMEOUT        => 6,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    $raw      = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($raw === false || !is_string($raw) || $httpCode >= 400) {
        return null;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || empty($decoded['tag_name'])) {
        return null;
    }

    $info = [
        'latest_version' => (string)$decoded['tag_name'],
        'release_url'    => (string)($decoded['html_url'] ?? 'https://github.com/' . LAYOUT_GITHUB_REPO . '/releases'),
    ];
    @file_put_contents($cacheFile, json_encode($info));
    return $info;
}

function getGitStatusInfo(string $repoDir, bool $forceFetch = false): ?array {
    $gitBin     = function_exists('exec') ? findGitBinary() : null;
    $hasOwnGit  = ($gitBin !== null) && isMatchingGitRepo($gitBin, $repoDir);

    if (!$hasOwnGit) {
        $currentVersion = LAYOUT_PLUGIN_VERSION;
        $relInfo        = getLatestGithubReleaseInfo($forceFetch);
        $latestVersion  = $relInfo['latest_version'] ?? $currentVersion;
        $releaseUrl     = $relInfo['release_url'] ?? 'https://github.com/' . LAYOUT_GITHUB_REPO . '/releases';

        $cleanCur  = ltrim($currentVersion, 'vV');
        $cleanLat  = ltrim($latestVersion, 'vV');
        $hasUpdate = ($cleanCur !== '' && $cleanLat !== '' && version_compare($cleanLat, $cleanCur, '>'));

        return [
            'mode'            => 'wget',
            'current_version' => $currentVersion,
            'latest_version'  => $hasUpdate ? $latestVersion : $currentVersion,
            'commits_behind'  => $hasUpdate ? 1 : 0,
            'has_update'      => $hasUpdate,
            'commits'         => [],
            'release_url'     => $releaseUrl,
        ];
    }

    $headRes = runGitCommand($gitBin, $repoDir, ['rev-parse', '--short', 'HEAD']);
    if ($headRes['code'] !== 0 || $headRes['output'] === '') {
        return null;
    }
    $localCommit = $headRes['output'];

    $tagRes = runGitCommand($gitBin, $repoDir, ['describe', '--tags', '--abbrev=0']);
    $currentVersion = ($tagRes['code'] === 0 && $tagRes['output'] !== '')
        ? $tagRes['output']
        : $localCommit;

    $fetchCacheFile = sys_get_temp_dir() . '/kh_layout_git_fetch_' . hash('sha256', $repoDir) . '.json';
    $fetchTtl = 600;
    $remoteInfo = null;

    if (!$forceFetch && file_exists($fetchCacheFile) && (time() - filemtime($fetchCacheFile)) < $fetchTtl) {
        $cached = @json_decode((string)@file_get_contents($fetchCacheFile), true);
        if (is_array($cached) && array_key_exists('commits', $cached)) {
            $remoteInfo = $cached;
        }
    }

    if ($remoteInfo === null) {
        $fetchRes = runGitCommand($gitBin, $repoDir, ['fetch', 'origin', '--tags', '--prune', '--quiet']);
        $behindCount = 0;
        $latestTag = $currentVersion;
        $commits = [];

        if ($fetchRes['code'] === 0) {
            $countRes = runGitCommand($gitBin, $repoDir, ['rev-list', '--count', 'HEAD..origin/main']);
            if ($countRes['code'] === 0 && is_numeric($countRes['output'])) {
                $behindCount = (int)$countRes['output'];
            }

            if ($behindCount > 0) {
                $logRes = runGitCommand($gitBin, $repoDir, ['log', '--oneline', '-n', '10', 'HEAD..origin/main']);
                if ($logRes['code'] === 0 && $logRes['output'] !== '') {
                    $commits = array_values(array_filter(
                        preg_split('/\R+/', trim($logRes['output'])) ?: [],
                        static fn(string $line): bool => $line !== ''
                    ));
                }
            }

            $tagsRes = runGitCommand($gitBin, $repoDir, ['tag', '--sort=-v:refname']);
            if ($tagsRes['code'] === 0 && $tagsRes['output'] !== '') {
                $tagsList = preg_split('/\R+/', trim($tagsRes['output'])) ?: [];
                if (!empty($tagsList[0])) {
                    $latestTag = $tagsList[0];
                }
            }
        }

        $remoteInfo = [
            'behind'     => $behindCount,
            'latest_tag' => $latestTag,
            'commits'    => $commits,
        ];
        @file_put_contents($fetchCacheFile, json_encode($remoteInfo));
    }

    $behindCount = (int)($remoteInfo['behind'] ?? 0);
    $latestTag   = (string)($remoteInfo['latest_tag'] ?? $currentVersion);
    $commits     = is_array($remoteInfo['commits'] ?? null) ? $remoteInfo['commits'] : [];
    $hasUpdate   = $behindCount > 0;

    return [
        'mode'            => 'git',
        'current_version' => $currentVersion,
        'latest_version'  => $hasUpdate ? $latestTag : $currentVersion,
        'commits_behind'  => $behindCount,
        'has_update'      => $hasUpdate,
        'commits'         => $hasUpdate ? $commits : [],
    ];
}

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
        return ['columns' => [], 'hidden' => [], 'full_width_top' => [], 'full_width_bottom' => []];
    }
    $legacyFull = sanitizeIdList($entry['full_width'] ?? []);
    $topList    = sanitizeIdList($entry['full_width_top'] ?? $legacyFull);
    $bottomList = sanitizeIdList($entry['full_width_bottom'] ?? []);

    $seen = [];
    $cleanTop = [];
    foreach ($topList as $id) {
        if (!isset($seen[$id])) {
            $seen[$id] = true;
            $cleanTop[] = $id;
        }
    }
    $cleanBottom = [];
    foreach ($bottomList as $id) {
        if (!isset($seen[$id])) {
            $seen[$id] = true;
            $cleanBottom[] = $id;
        }
    }

    return [
        'columns'           => sanitizeColumns($entry['columns'] ?? []),
        'hidden'            => sanitizeIdList($entry['hidden'] ?? []),
        'full_width_top'    => $cleanTop,
        'full_width_bottom' => $cleanBottom,
    ];
}

function loadStore(string $storageFile): array {
    if (!file_exists($storageFile)) {
        return ['locales' => []];
    }
    $raw = file_get_contents($storageFile);
    if (!is_string($raw)) {
        return ['locales' => []];
    }
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

    if (
        isset($decoded['columns'])
        || isset($decoded['hidden'])
        || isset($decoded['full_width_top'])
        || isset($decoded['full_width_bottom'])
        || isset($decoded['full_width'])
    ) {
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

if ($method === 'POST' && ($_GET['action'] ?? '') === 'update') {
    if (!requireValidCsrfAndOrigin($hasSessionCookie, $sessionHasCsrf)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Invalid session, CSRF token, or origin.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $cooldownFile = sys_get_temp_dir() . '/kh_layout_update_lock_' . hash('sha256', $repoDir) . '.txt';
    $cooldownSec  = 20;
    if (file_exists($cooldownFile) && (time() - filemtime($cooldownFile)) < $cooldownSec) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'Update cooldown active. Please wait a moment.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    @touch($cooldownFile);

    $gitBin = function_exists('exec') ? findGitBinary() : null;
    if ($gitBin === null || !isMatchingGitRepo($gitBin, $repoDir)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Git repository not available.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $pullRes = runGitCommand($gitBin, $repoDir, ['pull', '--ff-only', 'origin', 'main']);
    if ($pullRes['code'] !== 0) {
        http_response_code(500);
        echo json_encode([
            'ok'    => false,
            'error' => $pullRes['output'] !== '' ? $pullRes['output'] : 'git pull failed.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    foreach (glob(sys_get_temp_dir() . '/kh_layout_*') ?: [] as $tmpFile) {
        @unlink($tmpFile);
    }
    getGitStatusInfo($repoDir, true);

    echo json_encode([
        'ok'     => true,
        'output' => $pullRes['output'],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET') {
    $forceRefresh = (($_GET['refresh'] ?? '') === '1');
    $lang = sanitizeLang($_GET['lang'] ?? 'de');
    $store = loadStore($storageFile);
    $entry = $store['locales'][$lang] ?? ['columns' => [], 'hidden' => [], 'full_width_top' => [], 'full_width_bottom' => []];

    echo json_encode([
        'lang'              => $lang,
        'columns'           => $entry['columns'],
        'hidden'            => $entry['hidden'],
        'full_width_top'    => $entry['full_width_top'],
        'full_width_bottom' => $entry['full_width_bottom'],
        'git'               => getGitStatusInfo($repoDir, $forceRefresh),
        'csrf_token'        => $csrfToken,
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

    if (!requireValidCsrfAndOrigin($hasSessionCookie, $sessionHasCsrf, $input)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Invalid session, CSRF token, or origin']);
        exit;
    }

    $writeLockFile = sys_get_temp_dir() . '/kh_dashboard_layout_lock_' . hash('sha256', $storageFile) . '.txt';
    $writeCooldownSec = 2;
    if (file_exists($writeLockFile) && (time() - filemtime($writeLockFile)) < $writeCooldownSec) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'Too many requests. Please wait a moment.']);
        exit;
    }
    @touch($writeLockFile);

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

        echo json_encode([
            'ok'                => true,
            'lang'              => $lang,
            'columns'           => [],
            'hidden'            => [],
            'full_width_top'    => [],
            'full_width_bottom' => [],
            'csrf_token'        => $csrfToken,
        ]);
        exit;
    }

    if (!array_key_exists('columns', $input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing columns']);
        exit;
    }

    $entry = normalizeLayoutEntry([
        'columns'           => $input['columns'],
        'hidden'            => $input['hidden'] ?? [],
        'full_width_top'    => $input['full_width_top'] ?? ($input['full_width'] ?? []),
        'full_width_bottom' => $input['full_width_bottom'] ?? [],
    ]);
    $store['locales'][$lang] = $entry;

    if (!saveStore($storageFile, $store)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Failed to write layout']);
        exit;
    }

    echo json_encode([
        'ok'                => true,
        'lang'              => $lang,
        'columns'           => $entry['columns'],
        'hidden'            => $entry['hidden'],
        'full_width_top'    => $entry['full_width_top'],
        'full_width_bottom' => $entry['full_width_bottom'],
        'csrf_token'        => $csrfToken,
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
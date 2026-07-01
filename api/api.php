<?php
/* ============================================================================
   API  ·  alle Server-Endpunkte. Aufruf: api/api.php?action=...
   Du musst hier normalerweise nichts ändern (Pflege läuft über config.php).
   ============================================================================ */

date_default_timezone_set('Europe/Berlin');

/* Login bleibt ~1 Tag erhalten – übersteht Neuladen, Tab-Schließen und
   längere Pausen (Tablet liegt kurz ungenutzt). */
$SESSION_LIFETIME = 86400; // 24 Stunden
ini_set('session.gc_maxlifetime', (string) $SESSION_LIFETIME);   // serverseitig nicht früher aufräumen
ini_set('session.cookie_lifetime', (string) $SESSION_LIFETIME);
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
           (!empty($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) ||
           (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');

session_set_cookie_params([
    'lifetime' => $SESSION_LIFETIME,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Strict',
    'secure'   => $isHttps,
]);
session_start();

if (isset($_SESSION['role'])) {
    setcookie(session_name(), session_id(), [
        'expires'  => time() + $SESSION_LIFETIME,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Strict',
        'secure'   => $isHttps,
    ]);
}
// Konfiguration laden. Geheimnisse (Passwörter/DB) kommen aus der .env,
// die config.php liest sie ein. Ohne .env: Demo-Modus (changeme, SQLite).
require __DIR__ . '/config.php';
require __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

/* ---- RATE-LIMITING (gegen Brute-Force) ------------------------------------ */
function checkRateLimit($action, $maxAttempts = 5, $windowSeconds = 900) {
    $dataDir = __DIR__ . '/../data';
    @mkdir($dataDir, 0775, true);
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $lockFile = $dataDir . '/ratelimit_' . md5($action . '_' . $ip) . '.json';

    $now = time();
    $data = ['attempts' => 0, 'first_at' => $now, 'locked_until' => 0];

    if (file_exists($lockFile)) {
        $data = json_decode(file_get_contents($lockFile), true) ?: $data;
    }

    if ($data['locked_until'] > $now) {
        $remaining = $data['locked_until'] - $now;
        return ['allowed' => false, 'message' => "Zu viele Versuche. Bitte in $remaining Sekunden erneut versuchen."];
    }

    if ($now - $data['first_at'] > $windowSeconds) {
        $data = ['attempts' => 0, 'first_at' => $now, 'locked_until' => 0];
    }

    $data['attempts']++;
    if ($data['attempts'] > $maxAttempts) {
        $data['locked_until'] = $now + $windowSeconds;
        file_put_contents($lockFile, json_encode($data));
        return ['allowed' => false, 'message' => "Login-Versuch gesperrt. Bitte 15 Minuten warten."];
    }

    file_put_contents($lockFile, json_encode($data));
    return ['allowed' => true];
}

/* ---- kleine Helfer ---------------------------------------------------------- */
function out($data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}
function role(): ?string
{
    return $_SESSION['role'] ?? null;
}
function requireRole(array $allowed): void
{
    $r = role();
    if ($r === null) out(['error' => 'not_logged_in'], 401);

    // KEINE strikte IP-Bindung mehr: Bei mobilem Netz, WLAN-Wechsel oder VPN
    // ändert sich die IP laufend – das hätte die Sitzung sonst ständig beendet
    // ("session_hijack"). Die Anmeldung schützt weiterhin das Session-Cookie.
    $_SESSION['last_activity'] = time();

    if ($r === 'admin') {
        // Admin bleibt so lange gültig wie die Session insgesamt (~24 h),
        // kein kurzes Auto-Logout mehr mitten im Fest.
        return;
    }

    if (!in_array($r, $allowed, true)) out(['error' => 'forbidden'], 403);
}
function today(): string
{
    return date('Y-m-d');
}

/* Baut aus angefragten Positionen die gültigen Items + Gesamtsumme.
   Preise & Pfand IMMER serverseitig aus der Datenbank (manipulationssicher).
   $drinkMap: [name => ['price'=>.., 'pfand'=>..]]. Rückgabe: [items, total].
   total enthält Preis + Pfand. */
function buildItems(array $reqItems, array $drinkMap): array
{
    $items = [];
    $total = 0.0;
    foreach ($reqItems as $it) {
        $name = $it['name'] ?? '';
        $qty  = (int) ($it['qty'] ?? 0);
        if (!isset($drinkMap[$name]) || $qty <= 0) continue;
        $price = (float) $drinkMap[$name]['price'];
        $pfand = (float) $drinkMap[$name]['pfand'];
        $items[] = ['name' => $name, 'qty' => $qty, 'price' => $price, 'pfand' => $pfand];
        $total += $qty * ($price + $pfand);
    }
    return [$items, $total];
}

$store = new Store($DATA_DIR, $DB ?? null);
$store->seedDrinks($GETRAENKE);   // beim ersten Start aus config.php befüllen

// Einmalig: vorhandene Standard-Getränke auf die Bild-Icons umstellen.
if ($store->metaGet('icons_img_v1') === null) {
    $imgMap = [];
    foreach ($GETRAENKE as $g) {
        if (!empty($g['icon'])) $imgMap[mb_strtolower($g['name'])] = $g['icon'];
    }
    $store->applyIconMap($imgMap);
    $store->metaSet('icons_img_v1', '1');
}

$action = $_GET['action'] ?? '';

switch ($action) {

    /* ---- LOGIN ------------------------------------------------------------- */
    case 'login': {
        // DISABLED: Rate-limiting for testing
        // $rateCheck = checkRateLimit('login');
        // if (!$rateCheck['allowed']) out(['error' => $rateCheck['message']], 429);

        $b = body();
        $reqRole = $b['role'] ?? '';
        $pw = (string) ($b['password'] ?? '');
        if (!isset($PASSWORTE[$reqRole])) out(['error' => 'unknown_role'], 400);
        if (!hash_equals($PASSWORTE[$reqRole], $pw)) out(['error' => 'wrong_password'], 401);

        $firstName = (string) ($b['firstName'] ?? '');
        $lastName = (string) ($b['lastName'] ?? '');
        $name = '';

        if ($reqRole !== 'admin') {
            if (!$firstName || !$lastName) out(['error' => 'name_required'], 400);
            if (!preg_match('/^[a-zA-Z0-9äöüßÄÖÜ\s\-\.]{1,30}$/', $firstName)) {
                out(['error' => 'invalid_first_name'], 400);
            }
            if (!preg_match('/^[a-zA-Z0-9äöüßÄÖÜ\s\-\.]{1,30}$/', $lastName)) {
                out(['error' => 'invalid_last_name'], 400);
            }
            $firstName = mb_substr(trim(strip_tags($firstName)), 0, 30);
            $lastName = mb_substr(trim(strip_tags($lastName)), 0, 30);
            $name = $firstName . ' ' . $lastName;
        }

        session_regenerate_id(true);
        $_SESSION['role'] = $reqRole;
        $_SESSION['name'] = $name;
        $_SESSION['firstName'] = $firstName;
        $_SESSION['lastName'] = $lastName;
        $_SESSION['ip_address'] = $_SERVER['REMOTE_ADDR'] ?? '';
        out(['ok' => true, 'role' => $reqRole, 'name' => $name]);
    }

    /* ---- LOGOUT ------------------------------------------------------------ */
    case 'logout': {
        $_SESSION = [];
        session_destroy();
        out(['ok' => true]);
    }

    /* ---- SESSION prüfen ---------------------------------------------------- */
    case 'session': {
        out(['role' => role(), 'name' => $_SESSION['name'] ?? '']);
    }

    /* ---- STATUS (nur Admin): welcher Speicher ist aktiv? ------------------- */
    case 'status': {
        requireRole(['admin']);
        out(['storage' => $store->getDriver(), 'drinks' => count($store->drinksAll())]);
    }

    /* ---- CONFIG (Getränke + Festname) für die Oberfläche ------------------- */
    case 'config': {
        requireRole(['kasse', 'bar', 'admin']);
        out(['drinks' => $store->drinksAll(), 'festName' => ($store->metaGet('festName') ?: $FEST_NAME), 'role' => role(), 'name' => $_SESSION['name'] ?? '']);
    }

    /* ---- ÖFFENTLICH: Fest-Name + Impressum (Start- & Impressumseite) ------- */
    case 'public_info': {
        out([
            'festName'   => ($store->metaGet('festName') ?: $FEST_NAME),
            'impressum'  => ($store->metaGet('impressum') ?? ''),
            'footerText' => ($store->metaGet('footerText') ?? ''),
            'kicker'     => ($store->metaGet('kicker') ?? ''),
            'slogan'     => ($store->metaGet('slogan') ?? ''),
        ]);
    }

    /* ---- ADMIN: Seite anpassen (Fest-Name, Impressum) --------------------- */
    case 'site_update': {
        requireRole(['admin']);
        $b = body();
        if (array_key_exists('festName', $b)) {
            $fn = trim((string) $b['festName']);
            if ($fn !== '') $store->metaSet('festName', mb_substr($fn, 0, 60));
        }
        if (array_key_exists('impressum', $b)) {
            $store->metaSet('impressum', mb_substr((string) $b['impressum'], 0, 8000));
        }
        if (array_key_exists('footerText', $b)) {
            $store->metaSet('footerText', mb_substr((string) $b['footerText'], 0, 200));
        }
        if (array_key_exists('kicker', $b)) {
            $store->metaSet('kicker', mb_substr((string) $b['kicker'], 0, 40));
        }
        if (array_key_exists('slogan', $b)) {
            $store->metaSet('slogan', mb_substr((string) $b['slogan'], 0, 200));
        }
        out(['ok' => true]);
    }

    /* ---- ADMIN: Hintergrundbild hochladen (überschreibt hintergrund.jpg) --- */
    case 'bg_upload': {
        requireRole(['admin']);
        if (empty($_FILES['image'])) out(['error' => 'no_file'], 400);
        $file = $_FILES['image'];
        if ($file['error'] !== UPLOAD_ERR_OK) out(['error' => 'upload_error', 'code' => $file['error']], 400);
        if ($file['size'] > 8 * 1024 * 1024) out(['error' => 'file_too_large'], 400);
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!preg_match('/^(jpe?g|png|webp)$/i', $ext)) out(['error' => 'bad_file_type'], 400);
        $dir = __DIR__ . '/../assets/img';
        @mkdir($dir, 0775, true);
        $dest = $dir . '/hintergrund.jpg';
        if (!move_uploaded_file($file['tmp_name'], $dest)) out(['error' => 'move_failed'], 500);
        @chmod($dest, 0644);
        out(['ok' => true]);
    }

    /* ---- KATEGORIEN verwalten (nur Admin) --------------------------------- */
    case 'categories': {
        requireRole(['admin']);
        $catJson = $store->metaGet('categories');
        $categories = $catJson ? json_decode($catJson, true) : ['Softdrinks', 'Bier', 'Alkoholische Mischgetränke', 'Kurze', 'Sonstiges'];
        out(['categories' => $categories]);
    }
    case 'categories_update': {
        requireRole(['admin']);
        $b = body();
        $categories = (array) ($b['categories'] ?? []);
        $categories = array_values(array_unique(array_filter(array_map('trim', $categories))));
        if (count($categories) === 0) {
            $categories = ['Sonstiges'];
        }
        $store->metaSet('categories', json_encode($categories, JSON_UNESCAPED_UNICODE));
        out(['ok' => true, 'categories' => $categories]);
    }

    /* ---- GETRÄNKE verwalten (nur Admin) ----------------------------------- */
    case 'drinks': {
        requireRole(['admin']);
        out(['drinks' => $store->drinksAll()]);
    }
    /* verfügbare Getränke-Bilder (für den Icon-Auswähler) */
    case 'drink_images': {
        requireRole(['admin']);
        $dir = __DIR__ . '/../bilder/Getränke';
        $imgs = [];
        if (is_dir($dir)) {
            foreach (scandir($dir) as $f) {
                if (preg_match('/\.(png|jpe?g|webp|gif|svg)$/i', $f)) {
                    $imgs[] = 'bilder/Getränke/' . $f;
                }
            }
        }
        sort($imgs);
        out(['images' => $imgs]);
    }
    case 'drink_image_upload': {
        requireRole(['admin']);
        $dir = __DIR__ . '/../bilder/Getränke';
        @mkdir($dir, 0775, true);
        if (empty($_FILES['image'])) out(['error' => 'no_file'], 400);
        $file = $_FILES['image'];
        if ($file['error'] !== UPLOAD_ERR_OK) out(['error' => 'upload_error', 'code' => $file['error']], 400);
        if ($file['size'] > 5 * 1024 * 1024) out(['error' => 'file_too_large'], 400);
        $name = pathinfo($file['name'], PATHINFO_FILENAME);
        $name = preg_replace('/[^a-z0-9_-]/i', '_', $name);
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!preg_match('/^(png|jpe?g|webp|gif|svg)$/i', $ext)) out(['error' => 'bad_file_type'], 400);
        $filename = $name . '.' . $ext;
        $filepath = $dir . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $filepath)) out(['error' => 'move_failed'], 500);
        @chmod($filepath, 0644);
        out(['ok' => true, 'path' => 'bilder/Getränke/' . $filename]);
    }
    case 'drink_add': {
        requireRole(['admin']);
        $b = body();
        $name = trim((string) ($b['name'] ?? ''));
        $price = (float) ($b['price'] ?? 0);
        $pfand = (float) ($b['pfand'] ?? 0);
        $icon = trim((string) ($b['icon'] ?? ''));
        $category = trim((string) ($b['category'] ?? 'Sonstiges'));
        $type = (($b['type'] ?? 'drink') === 'food') ? 'food' : 'drink';
        if ($name === '') out(['error' => 'name_required'], 400);
        if ($price < 0 || $pfand < 0) out(['error' => 'bad_price'], 400);
        if ($icon === '') $icon = $store->guessIcon($name);
        $sort = count($store->drinksAll());
        $drink = $store->addDrink($name, $price, $pfand, $icon, $sort, $category, $type);
        out(['ok' => true, 'drink' => $drink]);
    }
    case 'drink_update': {
        requireRole(['admin']);
        $b = body();
        $id = (int) ($b['id'] ?? 0);
        $name = trim((string) ($b['name'] ?? ''));
        $price = (float) ($b['price'] ?? 0);
        $pfand = (float) ($b['pfand'] ?? 0);
        $icon = trim((string) ($b['icon'] ?? ''));
        $category = trim((string) ($b['category'] ?? 'Sonstiges'));
        if ($id <= 0) out(['error' => 'bad_id'], 400);
        if ($name === '') out(['error' => 'name_required'], 400);
        if ($price < 0 || $pfand < 0) out(['error' => 'bad_price'], 400);
        if ($icon === '') $icon = $store->guessIcon($name);
        $ok = $store->updateDrink($id, $name, $price, $pfand, $icon, $category);
        out(['ok' => $ok]);
    }
    case 'drink_delete': {
        requireRole(['admin']);
        $b = body();
        $id = (int) ($b['id'] ?? 0);
        if ($id <= 0) out(['error' => 'bad_id'], 400);
        out(['ok' => $store->deleteDrink($id)]);
    }

    /* ---- BESTELLUNG anlegen ------------------------------------------------ */
    case 'order': {
        requireRole(['kasse']);
        $b = body();
        $reqItems = $b['items'] ?? [];
        $pfandReturn = (float) ($b['pfandReturn'] ?? 0);
        if (!is_array($reqItems) || count($reqItems) === 0) out(['error' => 'empty_order'], 400);

        [$items, $total] = buildItems($reqItems, $store->drinkMap());
        if (count($items) === 0) out(['error' => 'no_valid_items'], 400);

        $seller = (string) ($_SESSION['name'] ?? '');
        $finalTotal = round($total - $pfandReturn, 2);
        $order = $store->createOrder($items, max(0, $finalTotal), today(), $seller, $pfandReturn);
        out(['ok' => true, 'order' => $order]);
    }

    /* ---- OFFENE Bestellungen (Ausschank-Polling) --------------------------- */
    case 'open': {
        requireRole(['bar', 'kasse', 'admin']);
        out(['orders' => $store->openOrders()]);
    }

    /* ---- LETZTE Bestellungen des Tages (Kasse: korrigieren/löschen) -------- */
    case 'recent': {
        requireRole(['kasse', 'admin']);
        $limit = (int) ($_GET['limit'] ?? 20);
        if ($limit < 1 || $limit > 100) $limit = 20;
        out(['orders' => $store->recentOrders(today(), $limit)]);
    }

    /* ---- Bestellung ÄNDERN -------------------------------------------------- */
    case 'update': {
        requireRole(['kasse', 'admin']);
        $b = body();
        $id = (int) ($b['id'] ?? 0);
        $reqItems = $b['items'] ?? [];
        $pfandReturn = (float) ($b['pfandReturn'] ?? 0);
        if ($id <= 0) out(['error' => 'bad_id'], 400);
        if (!is_array($reqItems)) out(['error' => 'bad_items'], 400);
        if ($store->getOrder($id) === null) out(['error' => 'not_found'], 404);

        [$items, $total] = buildItems($reqItems, $store->drinkMap());
        if (count($items) === 0) out(['error' => 'no_valid_items'], 400);

        $finalTotal = round($total - $pfandReturn, 2);
        $ok = $store->updateOrder($id, $items, max(0, $finalTotal), $pfandReturn);
        out(['ok' => $ok, 'order' => $store->getOrder($id)]);
    }

    /* ---- Bestellung LÖSCHEN ------------------------------------------------- */
    case 'delete': {
        requireRole(['kasse', 'admin']);
        $b = body();
        $id = (int) ($b['id'] ?? 0);
        if ($id <= 0) out(['error' => 'bad_id'], 400);
        $ok = $store->deleteOrder($id);
        out(['ok' => $ok]);
    }

    /* ---- Bestellung ERLEDIGT ---------------------------------------------- */
    case 'done': {
        requireRole(['bar', 'admin']);
        $b = body();
        $id = (int) ($b['id'] ?? 0);
        if ($id <= 0) out(['error' => 'bad_id'], 400);
        $ok = $store->markDone($id);
        out(['ok' => $ok]);
    }

    /* ---- STATISTIK (nur Admin) -------------------------------------------- */
    case 'stats': {
        requireRole(['admin']);
        $day = $_GET['day'] ?? today();
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) $day = today();
        out($store->stats($day));
    }

    /* ---- ADMIN: Bestellungen eines Users löschen ---- */
    case 'admin_delete_user': {
        requireRole(['admin']);
        $b = body();
        $seller = trim((string) ($b['seller'] ?? ''));
        if (!$seller) out(['error' => 'seller_required'], 400);
        $count = $store->deleteOrdersByUser($seller);
        out(['ok' => true, 'deleted' => $count, 'message' => "Bestellungen von $seller gelöscht."]);
    }

    /* ---- ADMIN: Passwort ändern ---- */
    case 'admin_set_password': {
        requireRole(['admin']);
        $b = body();
        $role = $b['role'] ?? '';
        $newPassword = (string) ($b['password'] ?? '');
        if (!$role || !isset($PASSWORTE[$role])) out(['error' => 'invalid_role'], 400);
        if (!$newPassword || strlen($newPassword) < 3) out(['error' => 'password_too_short'], 400);
        if (!preg_match('/^[a-zA-Z0-9äöüß!@#$%\-_.]{3,30}$/', $newPassword)) {
            out(['error' => 'invalid_password_chars'], 400);
        }
        $PASSWORTE[$role] = $newPassword;
        // Passwort in die .env schreiben (bei Bedarf aus .env.example erzeugen).
        $envMap  = ['kasse' => 'KASSE_PASSWORT', 'bar' => 'BAR_PASSWORT', 'admin' => 'ADMIN_PASSWORT'];
        $envKey  = $envMap[$role];
        $envPath = __DIR__ . '/../.env';
        if (!file_exists($envPath) && file_exists(__DIR__ . '/../.env.example')) {
            @copy(__DIR__ . '/../.env.example', $envPath);
        }
        $envContent = file_exists($envPath) ? file_get_contents($envPath) : '';
        $newLine = $envKey . '=' . $newPassword;
        if (preg_match('/^\s*' . $envKey . '\s*=.*$/m', $envContent)) {
            $envContent = preg_replace('/^\s*' . $envKey . '\s*=.*$/m', $newLine, $envContent);
        } else {
            $envContent = rtrim($envContent) . "\n" . $newLine . "\n";
        }
        file_put_contents($envPath, $envContent);
        out(['ok' => true, 'message' => "Passwort für '" . $role . "' geändert."]);
    }

    /* ---- ADMIN: Datenbank zurücksetzen (ALLES löschen) ---- */
    case 'admin_reset_database': {
        requireRole(['admin']);
        $b = body();
        $confirm = $b['confirm'] ?? false;
        if (!$confirm) out(['error' => 'reset_not_confirmed'], 400);
        $store->resetDatabase($GETRAENKE);
        out(['ok' => true, 'message' => 'Datenbank komplett zurückgesetzt. Alle Bestellungen und Getränk-Anpassungen gelöscht.']);
    }

    /* ---- ADMIN: Nur Bestellungen löschen ---- */
    case 'admin_reset_orders': {
        requireRole(['admin']);
        $b = body();
        $confirm = $b['confirm'] ?? false;
        if (!$confirm) out(['error' => 'reset_not_confirmed'], 400);
        $count = $store->resetOrders();
        out(['ok' => true, 'deleted' => $count, 'message' => "$count Bestellungen gelöscht."]);
    }

    default:
        out(['error' => 'unknown_action'], 404);
}

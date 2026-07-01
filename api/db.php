<?php
/* ============================================================================
   SPEICHERUNG  ·  SQLite (bevorzugt) mit automatischem JSON-Fallback.
   Du musst hier nichts anpassen. Der Ordner /data wird automatisch angelegt.
   ============================================================================ */

class Store
{
    private $pdo = null;        // PDO (MySQL oder SQLite), wenn verfügbar
    private $jsonFile = null;   // Fallback-Datei
    private $dataDir;
    private $driver = 'json';   // 'mysql' | 'sqlite' | 'json'

    public function __construct($dataDir, $dbConfig = null)
    {
        $this->dataDir = $dataDir;
        if (!is_dir($dataDir)) {
            @mkdir($dataDir, 0775, true);
        }

        // 1) MySQL (Live-Webspace), wenn in config.php konfiguriert und erreichbar
        if ($this->pdo === null && is_array($dbConfig) && !empty($dbConfig['host']) && !empty($dbConfig['name'])
            && class_exists('PDO') && in_array('mysql', PDO::getAvailableDrivers(), true)) {
            try {
                $dsn = 'mysql:host=' . $dbConfig['host'] . ';dbname=' . $dbConfig['name'] . ';charset=utf8mb4';
                $this->pdo = new PDO($dsn, $dbConfig['user'] ?? '', $dbConfig['pass'] ?? '', [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_TIMEOUT => 4,
                ]);
                $this->driver = 'mysql';
                $this->initSchema();
            } catch (Exception $e) {
                $this->pdo = null; // nicht erreichbar -> auf SQLite/JSON ausweichen
            }
        }

        // 2) SQLite (lokal / Docker), wenn die Erweiterung vorhanden ist
        if ($this->pdo === null && class_exists('PDO') && in_array('sqlite', PDO::getAvailableDrivers(), true)) {
            try {
                $this->pdo = new PDO('sqlite:' . $dataDir . '/strassenfest.sqlite');
                $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
                $this->pdo->exec('PRAGMA journal_mode = WAL;');
                $this->driver = 'sqlite';
                $this->initSchema();
            } catch (Exception $e) {
                $this->pdo = null; // auf JSON-Fallback umschalten
            }
        }

        // 3) JSON-Datei als letzter Fallback
        if ($this->pdo === null) {
            $this->driver = 'json';
            $this->jsonFile = $dataDir . '/strassenfest.json';
            if (!file_exists($this->jsonFile)) {
                $this->writeJson(['seq' => 0, 'orders' => [], 'drinkSeq' => 0, 'drinks' => [], 'meta' => []]);
            }
        }
    }

    /* Welcher Speicher ist aktiv? (mysql/sqlite/json) – zur Kontrolle im Admin. */
    public function getDriver(): string { return $this->driver; }

    /* Tabellen anlegen – funktioniert für MySQL und SQLite. */
    private function initSchema(): void
    {
        $mysql  = $this->driver === 'mysql';
        $autoId = $mysql ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        $eng    = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';

        $this->pdo->exec(
            "CREATE TABLE IF NOT EXISTS orders (
                id     $autoId,
                ts     BIGINT       NOT NULL,
                items  TEXT         NOT NULL,
                total  DOUBLE       NOT NULL,
                status VARCHAR(16)  NOT NULL DEFAULT 'open',
                day    VARCHAR(10)  NOT NULL,
                seller VARCHAR(40)  NOT NULL DEFAULT ''
            )$eng"
        );
        // Migration: seller ergänzen, falls ältere DB ohne sie
        try { $this->pdo->exec("ALTER TABLE orders ADD COLUMN seller VARCHAR(40) NOT NULL DEFAULT ''"); } catch (Exception $e) { /* existiert bereits */ }

        $this->pdo->exec(
            "CREATE TABLE IF NOT EXISTS drinks (
                id    $autoId,
                name  VARCHAR(60)  NOT NULL,
                price DOUBLE       NOT NULL,
                pfand DOUBLE       NOT NULL DEFAULT 0,
                icon  VARCHAR(255) NOT NULL DEFAULT '🍹',
                sort  INT          NOT NULL DEFAULT 0
            )$eng"
        );
        // Migration: pfand ergänzen, falls ältere DB ohne sie
        try { $this->pdo->exec('ALTER TABLE drinks ADD COLUMN pfand DOUBLE NOT NULL DEFAULT 0'); } catch (Exception $e) { /* existiert bereits */ }
        // Migration: category hinzufügen, falls ältere DB ohne sie
        try { $this->pdo->exec("ALTER TABLE drinks ADD COLUMN category VARCHAR(40) NOT NULL DEFAULT 'Sonstiges'"); } catch (Exception $e) { /* existiert bereits */ }
        // Migration: type (drink|food) hinzufügen, falls ältere DB ohne sie
        try { $this->pdo->exec("ALTER TABLE drinks ADD COLUMN type VARCHAR(16) NOT NULL DEFAULT 'drink'"); } catch (Exception $e) { /* existiert bereits */ }

        $this->pdo->exec("CREATE TABLE IF NOT EXISTS meta (k VARCHAR(64) PRIMARY KEY, v TEXT)$eng");
    }

    /* ========================================================================
       GETRÄNKE  ·  in der Datenbank, damit der Admin sie live ändern kann
       ======================================================================== */

    /* Beim ersten Start aus der config.php befüllen (nur wenn noch leer). */
    public function seedDrinks(array $seed): void
    {
        if (count($this->drinksAll()) > 0) return;
        $i = 0;
        foreach ($seed as $g) {
            $icon = $g['icon'] ?? $this->guessIcon($g['name']);
            $this->addDrink($g['name'], (float) $g['price'], (float) ($g['pfand'] ?? 0), $icon, $i++,
                            $g['category'] ?? 'Sonstiges', $g['type'] ?? 'drink');
        }
    }

    /* Standard-Icon anhand des Namens erraten. */
    public function guessIcon(string $name): string
    {
        $n = mb_strtolower($name);
        if (strpos($n, 'radler') !== false) return '🍻';
        if (strpos($n, 'bier') !== false || strpos($n, 'pils') !== false || strpos($n, 'hell') !== false) return '🍺';
        if (strpos($n, 'cola') !== false && (strpos($n, 'jack') !== false || strpos($n, 'whisk') !== false)) return '🥃';
        if (strpos($n, 'bacardi') !== false || strpos($n, 'rum') !== false) return '🍹';
        if (strpos($n, 'cola') !== false) return '🥤';
        if (strpos($n, 'fanta') !== false || strpos($n, 'orange') !== false) return '🧃';
        if (strpos($n, 'sprite') !== false || strpos($n, 'limo') !== false) return '🥤';
        if (strpos($n, 'wasser') !== false || strpos($n, 'sprudel') !== false) return '💧';
        if (strpos($n, 'wein') !== false) return '🍷';
        if (strpos($n, 'sekt') !== false || strpos($n, 'prosecco') !== false) return '🥂';
        if (strpos($n, 'kaffee') !== false || strpos($n, 'cafe') !== false) return '☕';
        if (strpos($n, 'shot') !== false || strpos($n, 'schnaps') !== false) return '🥃';
        return '🍹';
    }

    public function drinksAll(): array
    {
        if ($this->pdo) {
            $rows = $this->pdo->query('SELECT * FROM drinks ORDER BY sort ASC, id ASC')->fetchAll(PDO::FETCH_ASSOC);
            return array_map(function ($r) {
                return ['id' => (int) $r['id'], 'name' => $r['name'], 'price' => (float) $r['price'],
                        'pfand' => (float) ($r['pfand'] ?? 0), 'icon' => $r['icon'], 'sort' => (int) $r['sort'],
                        'category' => $r['category'] ?? 'Sonstiges', 'type' => $r['type'] ?? 'drink'];
            }, $rows);
        }
        $data = $this->readJson();
        $d = $data['drinks'] ?? [];
        foreach ($d as &$x) { $x['pfand'] = (float) ($x['pfand'] ?? 0); }
        unset($x);
        usort($d, fn($a, $b) => ($a['sort'] <=> $b['sort']) ?: ($a['id'] <=> $b['id']));
        return $d;
    }

    public function addDrink(string $name, float $price, float $pfand, string $icon, int $sort = 0, string $category = 'Sonstiges', string $type = 'drink'): array
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('INSERT INTO drinks (name, price, pfand, icon, sort, category, type) VALUES (:n,:p,:pf,:i,:s,:c,:t)');
            $stmt->execute([':n' => $name, ':p' => $price, ':pf' => $pfand, ':i' => $icon, ':s' => $sort, ':c' => $category, ':t' => $type]);
            $id = (int) $this->pdo->lastInsertId();
        } else {
            $data = $this->readJson();
            $id = ($data['drinkSeq'] = ($data['drinkSeq'] ?? 0) + 1);
            $data['drinks'][] = ['id' => $id, 'name' => $name, 'price' => $price, 'pfand' => $pfand, 'icon' => $icon, 'sort' => $sort, 'category' => $category, 'type' => $type];
            $this->writeJson($data);
        }
        return ['id' => $id, 'name' => $name, 'price' => $price, 'pfand' => $pfand, 'icon' => $icon, 'sort' => $sort, 'category' => $category, 'type' => $type];
    }

    public function updateDrink(int $id, string $name, float $price, float $pfand, string $icon, string $category = 'Sonstiges'): bool
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('UPDATE drinks SET name=:n, price=:p, pfand=:pf, icon=:i, category=:c WHERE id=:id');
            $stmt->execute([':n' => $name, ':p' => $price, ':pf' => $pfand, ':i' => $icon, ':c' => $category, ':id' => $id]);
            return $stmt->rowCount() >= 0;
        }
        $data = $this->readJson();
        $found = false;
        foreach ($data['drinks'] as &$d) {
            if ($d['id'] === $id) { $d['name'] = $name; $d['price'] = $price; $d['pfand'] = $pfand; $d['icon'] = $icon; $d['category'] = $category; $found = true; break; }
        }
        unset($d);
        if ($found) $this->writeJson($data);
        return $found;
    }

    public function deleteDrink(int $id): bool
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('DELETE FROM drinks WHERE id=:id');
            $stmt->execute([':id' => $id]);
            return $stmt->rowCount() > 0;
        }
        $data = $this->readJson();
        $before = count($data['drinks']);
        $data['drinks'] = array_values(array_filter($data['drinks'], fn($d) => $d['id'] !== $id));
        $changed = count($data['drinks']) !== $before;
        if ($changed) $this->writeJson($data);
        return $changed;
    }

    /* Name -> [preis, pfand] (für serverseitige Summenberechnung) */
    public function drinkMap(): array
    {
        $map = [];
        foreach ($this->drinksAll() as $d) {
            $map[$d['name']] = ['price' => (float) $d['price'], 'pfand' => (float) ($d['pfand'] ?? 0)];
        }
        return $map;
    }

    /* ---- Meta (kleine Schlüssel-Wert-Ablage, z. B. für einmalige Migrationen) ---- */
    public function metaGet(string $key): ?string
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('SELECT v FROM meta WHERE k = :k');
            $stmt->execute([':k' => $key]);
            $v = $stmt->fetchColumn();
            return $v === false ? null : (string) $v;
        }
        $data = $this->readJson();
        return $data['meta'][$key] ?? null;
    }

    public function metaSet(string $key, string $value): void
    {
        if ($this->pdo) {
            if ($this->driver === 'mysql') {
                $stmt = $this->pdo->prepare('INSERT INTO meta (k, v) VALUES (:k, :v)
                    ON DUPLICATE KEY UPDATE v = :v2');
                $stmt->execute([':k' => $key, ':v' => $value, ':v2' => $value]);
            } else {
                $stmt = $this->pdo->prepare('INSERT INTO meta (k, v) VALUES (:k, :v)
                    ON CONFLICT(k) DO UPDATE SET v = :v');
                $stmt->execute([':k' => $key, ':v' => $value]);
            }
            return;
        }
        $data = $this->readJson();
        $data['meta'][$key] = $value;
        $this->writeJson($data);
    }

    /* Einmalige Umstellung: vorhandene Standard-Getränke auf Bild-Icons setzen.
       $nameToIcon: [kleingeschriebener Name => Icon-Pfad]. */
    public function applyIconMap(array $nameToIcon): void
    {
        foreach ($this->drinksAll() as $d) {
            $key = mb_strtolower(trim($d['name']));
            if (isset($nameToIcon[$key]) && $d['icon'] !== $nameToIcon[$key]) {
                $this->updateDrink($d['id'], $d['name'], (float) $d['price'], (float) ($d['pfand'] ?? 0), $nameToIcon[$key]);
            }
        }
    }

    /* ---- Bestellung anlegen; gibt die fertige Bestellung (inkl. id) zurück ---- */
    public function createOrder(array $items, float $total, string $day, string $seller = '', float $pfandReturn = 0): array
    {
        $ts = (int) round(microtime(true) * 1000);
        $itemsJson = json_encode($items, JSON_UNESCAPED_UNICODE);

        if ($this->pdo) {
            $stmt = $this->pdo->prepare(
                "INSERT INTO orders (ts, items, total, status, day, seller)
                 VALUES (:ts, :items, :total, 'open', :day, :seller)"
            );
            $stmt->execute([':ts' => $ts, ':items' => $itemsJson, ':total' => $total, ':day' => $day, ':seller' => $seller]);
            $id = (int) $this->pdo->lastInsertId();
        } else {
            $data = $this->readJson();
            $id = ++$data['seq'];
            $data['orders'][] = [
                'id' => $id, 'ts' => $ts, 'items' => $items,
                'total' => $total, 'status' => 'open', 'day' => $day, 'seller' => $seller, 'pfandReturn' => $pfandReturn,
            ];
            $this->writeJson($data);
        }

        return ['id' => $id, 'ts' => $ts, 'items' => $items, 'total' => $total, 'status' => 'open', 'day' => $day, 'seller' => $seller, 'pfandReturn' => $pfandReturn];
    }

    /* ---- alle offenen Bestellungen (älteste zuerst) ---- */
    public function openOrders(): array
    {
        if ($this->pdo) {
            $rows = $this->pdo->query("SELECT * FROM orders WHERE status = 'open' ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);
            return array_map([$this, 'hydrate'], $rows);
        }
        $data = $this->readJson();
        $open = array_values(array_filter($data['orders'], fn($o) => $o['status'] === 'open'));
        usort($open, fn($a, $b) => $a['id'] <=> $b['id']);
        return $open;
    }

    /* ---- letzte Bestellungen eines Tages (alle Status, neueste zuerst) ----
       Für die Kasse: gesendete Bestellungen korrigieren/löschen. */
    public function recentOrders(string $day, int $limit = 20): array
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('SELECT * FROM orders WHERE day = :day ORDER BY id DESC LIMIT :lim');
            $stmt->bindValue(':day', $day);
            $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
            $stmt->execute();
            return array_map([$this, 'hydrate'], $stmt->fetchAll(PDO::FETCH_ASSOC));
        }
        $data = $this->readJson();
        $rows = array_values(array_filter($data['orders'], fn($o) => $o['day'] === $day));
        usort($rows, fn($a, $b) => $b['id'] <=> $a['id']);
        return array_slice($rows, 0, $limit);
    }

    /* ---- Positionen + Summe einer Bestellung ändern ---- */
    public function updateOrder(int $id, array $items, float $total, float $pfandReturn = 0): bool
    {
        $itemsJson = json_encode($items, JSON_UNESCAPED_UNICODE);
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('UPDATE orders SET items = :items, total = :total WHERE id = :id');
            $stmt->execute([':items' => $itemsJson, ':total' => $total, ':id' => $id]);
            return $stmt->rowCount() > 0;
        }
        $data = $this->readJson();
        $found = false;
        foreach ($data['orders'] as &$o) {
            if ($o['id'] === $id) { $o['items'] = $items; $o['total'] = $total; $o['pfandReturn'] = $pfandReturn; $found = true; break; }
        }
        unset($o);
        if ($found) $this->writeJson($data);
        return $found;
    }

    /* ---- Bestellung komplett löschen ---- */
    public function deleteOrder(int $id): bool
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('DELETE FROM orders WHERE id = :id');
            $stmt->execute([':id' => $id]);
            return $stmt->rowCount() > 0;
        }
        $data = $this->readJson();
        $before = count($data['orders']);
        $data['orders'] = array_values(array_filter($data['orders'], fn($o) => $o['id'] !== $id));
        $changed = count($data['orders']) !== $before;
        if ($changed) $this->writeJson($data);
        return $changed;
    }

    /* ---- eine einzelne Bestellung holen ---- */
    public function getOrder(int $id): ?array
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('SELECT * FROM orders WHERE id = :id');
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            return $row ? $this->hydrate($row) : null;
        }
        $data = $this->readJson();
        foreach ($data['orders'] as $o) {
            if ($o['id'] === $id) return $o;
        }
        return null;
    }

    /* ---- Bestellung als erledigt markieren ---- */
    public function markDone(int $id): bool
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare("UPDATE orders SET status = 'done' WHERE id = :id");
            $stmt->execute([':id' => $id]);
            return $stmt->rowCount() > 0;
        }
        $data = $this->readJson();
        $found = false;
        foreach ($data['orders'] as &$o) {
            if ($o['id'] === $id) { $o['status'] = 'done'; $found = true; break; }
        }
        unset($o);
        if ($found) $this->writeJson($data);
        return $found;
    }

    /* ---- Tages-Statistik ---- */
    public function stats(string $day): array
    {
        $orders = $this->ordersForDay($day);

        $count = count($orders);
        $revenue = 0.0;   // nur Getränke (ohne Pfand)
        $pfand   = 0.0;   // hinterlegtes Pfand
        $perDrink = []; // name => [qty, sum]
        $hours = [];    // stunde => [count, revenue, total]
        $perSeller = []; // person => [count, revenue, total]
        foreach ($orders as $o) {
            $oDrink = 0.0; $oPfand = 0.0;
            foreach ($o['items'] as $it) {
                $name = $it['name'];
                $qty = (int) $it['qty'];
                $price = isset($it['price']) ? (float) $it['price'] : 0.0;
                $pf = isset($it['pfand']) ? (float) $it['pfand'] : 0.0;
                if (!isset($perDrink[$name])) $perDrink[$name] = ['name' => $name, 'qty' => 0, 'sum' => 0.0];
                $perDrink[$name]['qty'] += $qty;
                $perDrink[$name]['sum'] += $qty * $price;
                $oDrink += $qty * $price;
                $oPfand += $qty * $pf;
            }
            $revenue += $oDrink;
            $pfand   += $oPfand;
            // pro Person (Verkäufer)
            $seller = trim((string) ($o['seller'] ?? ''));
            if ($seller === '') $seller = '—';
            if (!isset($perSeller[$seller])) $perSeller[$seller] = ['name' => $seller, 'count' => 0, 'revenue' => 0.0, 'total' => 0.0];
            $perSeller[$seller]['count']   += 1;
            $perSeller[$seller]['revenue'] += $oDrink;
            $perSeller[$seller]['total']   += $oDrink + $oPfand;
            // Stunde der Bestellung (lokale Zeit)
            $h = (int) date('G', intdiv((int) $o['ts'], 1000));
            if (!isset($hours[$h])) $hours[$h] = ['count' => 0, 'revenue' => 0.0, 'total' => 0.0];
            $hours[$h]['count']  += 1;
            $hours[$h]['revenue'] += $oDrink;
            $hours[$h]['total']  += $oDrink + $oPfand;
        }
        // nach Menge absteigend sortieren
        $perDrinkList = array_values($perDrink);
        usort($perDrinkList, fn($a, $b) => $b['qty'] <=> $a['qty']);

        // pro Person nach Gesamt absteigend
        $perSellerList = array_values(array_map(function ($s) {
            $s['revenue'] = round($s['revenue'], 2);
            $s['total'] = round($s['total'], 2);
            return $s;
        }, $perSeller));
        usort($perSellerList, fn($a, $b) => $b['total'] <=> $a['total']);

        // Tagesverlauf: durchgehende Stunden von der ersten bis zur letzten mit Umsatz
        $byHour = [];
        if (!empty($hours)) {
            $min = min(array_keys($hours));
            $max = max(array_keys($hours));
            for ($h = $min; $h <= $max; $h++) {
                $row = $hours[$h] ?? ['count' => 0, 'revenue' => 0.0, 'total' => 0.0];
                $byHour[] = [
                    'hour'    => $h,
                    'count'   => (int) $row['count'],
                    'revenue' => round($row['revenue'], 2),
                    'total'   => round($row['total'], 2),
                ];
            }
        }

        return [
            'day'      => $day,
            'count'    => $count,
            'revenue'  => round($revenue, 2),
            'pfand'    => round($pfand, 2),
            'total'    => round($revenue + $pfand, 2),
            'perDrink' => $perDrinkList,
            'perSeller' => $perSellerList,
            'byHour'   => $byHour,
            'days'     => $this->availableDays(),
        ];
    }

    /* ---- Bestellungen eines Tages (alle Status) ---- */
    private function ordersForDay(string $day): array
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('SELECT * FROM orders WHERE day = :day ORDER BY id ASC');
            $stmt->execute([':day' => $day]);
            return array_map([$this, 'hydrate'], $stmt->fetchAll(PDO::FETCH_ASSOC));
        }
        $data = $this->readJson();
        return array_values(array_filter($data['orders'], fn($o) => $o['day'] === $day));
    }

    /* ---- Liste aller Tage mit Daten (neueste zuerst) ---- */
    private function availableDays(): array
    {
        if ($this->pdo) {
            $rows = $this->pdo->query('SELECT DISTINCT day FROM orders ORDER BY day DESC')->fetchAll(PDO::FETCH_COLUMN);
            return $rows ?: [];
        }
        $data = $this->readJson();
        $days = array_values(array_unique(array_map(fn($o) => $o['day'], $data['orders'])));
        rsort($days);
        return $days;
    }

    /* ---- Hilfen ---- */
    private function hydrate(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['ts'] = (int) $row['ts'];
        $row['total'] = (float) $row['total'];
        $row['items'] = json_decode($row['items'], true) ?: [];
        $row['seller'] = $row['seller'] ?? '';
        return $row;
    }

    private function readJson(): array
    {
        $fp = fopen($this->jsonFile, 'r');
        if ($fp) { flock($fp, LOCK_SH); }
        $raw = file_get_contents($this->jsonFile);
        if ($fp) { flock($fp, LOCK_UN); fclose($fp); }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : ['seq' => 0, 'orders' => []];
    }

    private function writeJson(array $data): void
    {
        $fp = fopen($this->jsonFile, 'c+');
        if ($fp) {
            flock($fp, LOCK_EX);
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            fflush($fp);
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }

    /* ---- ADMIN: Bestellungen eines Users löschen ---- */
    public function deleteOrdersByUser(string $seller): int
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('DELETE FROM orders WHERE seller = :seller');
            $stmt->execute([':seller' => $seller]);
            return $stmt->rowCount();
        }
        $data = $this->readJson();
        $before = count($data['orders']);
        $data['orders'] = array_values(array_filter($data['orders'], fn($o) => $o['seller'] !== $seller));
        $deleted = $before - count($data['orders']);
        if ($deleted > 0) $this->writeJson($data);
        return $deleted;
    }

    /* ---- ADMIN: Alle Bestellungen löschen ---- */
    public function resetOrders(): int
    {
        if ($this->pdo) {
            $stmt = $this->pdo->prepare('DELETE FROM orders');
            $stmt->execute();
            $n = $stmt->rowCount();
            // Nummerierung wieder bei 1 beginnen lassen
            try {
                if ($this->driver === 'mysql') {
                    $this->pdo->exec('ALTER TABLE orders AUTO_INCREMENT = 1');
                } else {
                    $this->pdo->exec("DELETE FROM sqlite_sequence WHERE name = 'orders'");
                }
            } catch (Exception $e) { /* nicht kritisch */ }
            return $n;
        }
        $data = $this->readJson();
        $count = count($data['orders']);
        $data['orders'] = [];
        $data['seq'] = 0;
        if ($count > 0) $this->writeJson($data);
        return $count;
    }

    /* ---- ADMIN: Getränke auf Original zurücksetzen ---- */
    public function resetDrinks(array $seedDrinks): void
    {
        if ($this->pdo) {
            $this->pdo->exec('DELETE FROM drinks');
            $this->seedDrinks($seedDrinks);
        } else {
            $data = $this->readJson();
            $data['drinks'] = [];
            $data['drinkSeq'] = 0;
            $this->writeJson($data);
            $this->seedDrinks($seedDrinks);
        }
    }

    /* ---- ADMIN: Komplette Datenbank zurücksetzen ---- */
    public function resetDatabase(array $seedDrinks): void
    {
        $this->resetOrders();
        $this->resetDrinks($seedDrinks);
    }
}

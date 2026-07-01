<?php
/* ============================================================================
   KONFIGURATION
   Geheimnisse (Passwörter, DB-Zugang) stehen in der  .env  im Projekt-
   Wurzelverzeichnis – NICHT in dieser Datei. Diese Datei liest die .env ein
   und enthält sonst nur Nicht-Geheimnisse (Erst-Befüllung der Getränke).

   Einrichtung:   cp .env.example .env   und Werte eintragen.
   Ohne .env: Demo-Modus (Passwörter = changeme, SQLite).
   ============================================================================ */

/* ---- Mini-.env-Loader (kein Framework nötig) ---- */
if (!function_exists('sf_load_env')) {
    function sf_load_env($path)
    {
        $vars = [];
        if (!is_file($path)) return $vars;
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') continue;
            $pos = strpos($line, '=');
            if ($pos === false) continue;
            $key = trim(substr($line, 0, $pos));
            $val = trim(substr($line, $pos + 1));
            // umschließende Anführungszeichen entfernen
            if (strlen($val) >= 2 && ($val[0] === '"' || $val[0] === "'") && substr($val, -1) === $val[0]) {
                $val = substr($val, 1, -1);
            }
            $vars[$key] = $val;
        }
        return $vars;
    }
}

/* .env aus dem Projekt-Wurzelverzeichnis (eine Ebene über api/) laden */
$ENV = sf_load_env(__DIR__ . '/../.env');
if (!function_exists('sf_env')) {
    function sf_env($key, $default = '')
    {
        global $ENV;
        return (isset($ENV[$key]) && $ENV[$key] !== '') ? $ENV[$key] : $default;
    }
}

/* ---------------------------------------------------------------------------
   1) PASSWÖRTER  ·  aus der .env (Fallback: changeme für den Demo-Modus)
   Ändern in der .env oder bequem im Admin-Bereich (schreibt in die .env).
   --------------------------------------------------------------------------- */
$PASSWORTE = [
    'kasse' => sf_env('KASSE_PASSWORT', 'changeme'),
    'bar'   => sf_env('BAR_PASSWORT',   'changeme'),
    'admin' => sf_env('ADMIN_PASSWORT', 'changeme'),
];

/* ---------------------------------------------------------------------------
   2) DATENBANK (MySQL)  ·  aus der .env. Leer = automatisch SQLite (Demo/lokal).
   --------------------------------------------------------------------------- */
$DB = [
    'host' => sf_env('DB_HOST', ''),
    'name' => sf_env('DB_NAME', ''),
    'user' => sf_env('DB_USER', ''),
    'pass' => sf_env('DB_PASS', ''),
];

/* ---------------------------------------------------------------------------
   3) NAME DES FESTS  ·  Fallback aus der .env (im Admin-Bereich überschreibbar)
   --------------------------------------------------------------------------- */
$FEST_NAME = sf_env('FEST_NAME', 'Straßenfest');

/* ---------------------------------------------------------------------------
   4) GETRÄNKE & PREISE  ·  NUR die Erst-Befüllung beim allerersten Start!
   Danach pflegst du Getränke, Preise und Icons bequem im ADMIN-Bereich.
   name = Anzeigetext, price = Euro (Punkt!), pfand = Pfand in Euro (0 = kein Pfand),
   icon = Bildpfad oder Emoji. Kein Geheimnis → bleibt hier. Frei anpassen.
   --------------------------------------------------------------------------- */
$GETRAENKE = [
    ['name' => 'Bier',            'price' => 4.00, 'pfand' => 2.00, 'category' => 'Biere',      'icon' => 'bilder/Getränke/Bier.png'],
    ['name' => 'Radler',          'price' => 4.00, 'pfand' => 2.00, 'category' => 'Biere',      'icon' => 'bilder/Getränke/Radler.png'],
    ['name' => 'Cola',            'price' => 3.00, 'pfand' => 2.00, 'category' => 'Softdrinks', 'icon' => 'bilder/Getränke/Cola.png'],
    ['name' => 'Fanta',           'price' => 3.00, 'pfand' => 2.00, 'category' => 'Softdrinks', 'icon' => 'bilder/Getränke/Fanta.png'],
    ['name' => 'Wasser',          'price' => 2.50, 'pfand' => 2.00, 'category' => 'Softdrinks', 'icon' => 'bilder/Getränke/Wasser.png'],
    ['name' => 'Apfelschorle',    'price' => 3.00, 'pfand' => 2.00, 'category' => 'Softdrinks', 'icon' => 'bilder/Getränke/Apfelschorle.png'],
    ['name' => 'Jacky-Cola',      'price' => 7.50, 'pfand' => 0, 'category' => 'Longdrinks', 'icon' => 'bilder/Getränke/Jacky-Cola.png'],
    ['name' => 'Bacardi-Cola',    'price' => 7.50, 'pfand' => 0, 'category' => 'Longdrinks', 'icon' => 'bilder/Getränke/Bacardi-Cola.png'],
    ['name' => 'Aperol Spritz',   'price' => 6.50, 'pfand' => 0, 'category' => 'Specials',   'icon' => 'bilder/Getränke/Aperol-Spritz.png'],
    ['name' => 'Jägermeister',    'price' => 3.00, 'pfand' => 0, 'category' => 'Kurze',      'icon' => 'bilder/Getränke/Kurze.png'],
    ['name' => 'Schnaps',         'price' => 3.00, 'pfand' => 0, 'category' => 'Kurze',      'icon' => 'bilder/Getränke/Wodka.png'],
];

/* ---------------------------------------------------------------------------
   (Technisch) Speicherort der Daten (SQLite/JSON-Fallback). Normalerweise
   nichts ändern. In Docker wird SF_DATA_DIR gesetzt (Daten via Volume).
   --------------------------------------------------------------------------- */
$DATA_DIR = getenv('SF_DATA_DIR') ?: (__DIR__ . '/../data');

<?php
/* ============================================================================
   KONFIGURATION (Vorlage)  ·  Hier pflegst du ALLES, was sich am Fest ändern kann.

   >>> ERSTE EINRICHTUNG <<<
   Kopiere diese Datei nach  api/config.php  und trage deine echten Werte ein:
       cp api/config.example.php api/config.php
   Die echte  config.php  ist per .gitignore vom Repo ausgeschlossen und wird
   niemals mit hochgeladen/committet.

   Ohne config.php läuft die App im Demo-Modus (SQLite, Platzhalter-Passwörter).
   ============================================================================ */

/* ---------------------------------------------------------------------------
   1) PASSWÖRTER  ·  je ein eigenes Passwort pro Rolle
      >>> VOR DEM EINSATZ UNBEDINGT ÄNDERN! <<<
   --------------------------------------------------------------------------- */
$PASSWORTE = [
    'kasse' => 'changeme',   // Bestellannahme / Kasse
    'bar'   => 'changeme',   // Bar / Ausschank
    'admin' => 'changeme',   // Admin (sieht alles + Statistik)
];

/* ---------------------------------------------------------------------------
   2) GETRÄNKE & PREISE  ·  NUR die Erst-Befüllung beim allerersten Start!
   Danach pflegst du Getränke, Preise und Icons bequem im ADMIN-Bereich
   (Tab „Getränke") – Änderungen wirken sofort, ohne neu zu bauen.
   name = Anzeigetext, price = Euro (Punkt!), pfand = Pfand in Euro (0 = kein Pfand),
   icon = Bildpfad oder Emoji (optional)

   Die folgende Liste ist nur eine Beispiel-Demo – frei anpassen oder leeren.
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
   3) NAME DES FESTS  ·  erscheint oben in der Kopfzeile (im Admin änderbar)
   --------------------------------------------------------------------------- */
$FEST_NAME = 'Straßenfest';

/* ---------------------------------------------------------------------------
   4) DATENBANK (MySQL)  ·  für den Live-Betrieb auf einem PHP-Webspace.
   Ist 'host' ausgefüllt UND erreichbar, nutzt die App diese MySQL-Datenbank.
   Sonst (z. B. lokal/Docker oder leer gelassen) wird automatisch SQLite verwendet
   – ideal zum Ausprobieren, ganz ohne Datenbank-Einrichtung.
   Host/Name/User bekommst du vom Hoster (oft 'localhost').
   --------------------------------------------------------------------------- */
$DB = [
    'host' => '',   // z. B. 'localhost' – leer lassen für SQLite-Demo
    'name' => '',   // Datenbankname
    'user' => '',   // Datenbank-Benutzer
    'pass' => '',   // Datenbank-Passwort
];

/* ---------------------------------------------------------------------------
   (Technisch) Speicherort der Daten (SQLite/JSON-Fallback). Normalerweise
   nichts ändern. In Docker wird SF_DATA_DIR gesetzt (Daten via Volume).
   --------------------------------------------------------------------------- */
$DATA_DIR = getenv('SF_DATA_DIR') ?: (__DIR__ . '/../data');

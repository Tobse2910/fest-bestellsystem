# Straßenfest-Bestell-App – Design & Spec

**Datum:** 2026-06-14
**Hosting:** beliebiger PHP-Webspace (Upload via FTP) oder lokal per Docker

## Ziel
Browserbasierte Web-App für ein Straßenfest, die Getränkebestellungen von der
Kasse an den Ausschank ("Bar") weitergibt. Läuft auf Tablets im Querformat,
ohne Installation. Echtzeit über Polling (kein WebSocket, da klassisches Shared
PHP-Hosting genügen soll). Zusätzlich Admin-Bereich mit Tages-Statistik.

## Rollen & Login
Moderne Startseite mit 3 großen Buttons. Jede Rolle ist mit einem eigenen,
in `config.php` gepflegten Passwort geschützt (PHP-Session merkt die Rolle):

- **Bestellannahme (Kasse)** – Bestellungen aufnehmen & senden.
- **Bar (Kipper)** – eingehende Bestellungen abarbeiten.
- **Admin** – sieht Kasse + Ausschank + Statistik.

## Technische Architektur
- **Frontend:** statisches HTML/CSS/JS pro Ansicht. Keine Build-Tools.
- **Backend:** PHP-API (`api/api.php`) mit JSON-Endpunkten.
- **Echtzeit:** Polling alle ~2 s per `fetch` (Ausschank + Admin).
- **Speicherung:** SQLite-Datei (`data/strassenfest.sqlite`). Fallback auf
  JSON-Datei, falls PDO-SQLite auf dem Host fehlt.
- **Preise serverseitig:** Umsatz wird aus serverseitigen Preisen berechnet,
  nie aus Browser-Werten → manipulationssicher.

### Datenmodell (Tabelle `orders`)
| Feld    | Typ     | Bedeutung                                  |
|---------|---------|--------------------------------------------|
| id      | INTEGER | fortlaufende Bestellnummer (PK)            |
| ts      | INTEGER | Zeitstempel (Unix, ms)                      |
| items   | TEXT    | JSON: `[{name, qty, price}]`               |
| total   | REAL    | Gesamtsumme der Bestellung (€)             |
| status  | TEXT    | `open` \| `done`                            |
| day     | TEXT    | `YYYY-MM-DD` (lokaler Festtag) für Statistik|

### API-Endpunkte (`api/api.php?action=...`)
- `POST login`     {role, password} → setzt Session, 200/401
- `POST logout`    → Session leeren
- `GET  config`    → {drinks:[{name,price}]} (für die Kassen-Buttons)
- `GET  session`   → {role} (Login-Status prüfen)
- `POST order`     {items:[{name,qty}]} → legt Bestellung an (Preise serverseitig)
- `GET  open`      → offene Bestellungen (für Ausschank-Polling)
- `POST done`      {id} → Bestellung auf `done`
- `GET  stats`     {day?} → {count, revenue, perDrink:[{name,qty,sum}], days:[]}

Zugriffsschutz: `order`-Senden = Rolle kasse/admin; `open`/`done` = bar/admin;
`stats` = admin. `config`/`session` = jede eingeloggte Rolle.

## Ordnerstruktur
```
(webroot)/
├── index.html              Startseite + Rollen-Login
├── kasse.html
├── ausschank.html
├── admin.html
├── assets/
│   ├── css/style.css       Design-Tokens Navy+Gold, Lade-Animation
│   ├── js/app.js           gemeinsame Helfer (api(), eur(), guard())
│   ├── js/kasse.js
│   ├── js/ausschank.js
│   └── js/admin.js
└── api/
    ├── config.php          Passwörter + Getränke + Preise  ← hier pflegen
    ├── db.php              Storage (SQLite, JSON-Fallback)
    ├── api.php             Endpunkte
    └── .htaccess           schützt config/db vor Direktaufruf
data/                        SQLite-/JSON-Datei (per .htaccess geschützt)
```

## Design
- **Farben:** Navy-Hintergrund, Gold-Akzent, hoher Kontrast.
  Tokens: `--navy #0A1A33`, `--navy-2 #0E2347`, `--gold #FFC529`,
  `--gold-2 #E0A400`, `--text #F4F6FB`, `--green #2BD27E`, `--red #FF5A47`.
- Große Buttons, touchfreundlich, Querformat optimiert, minimale Animationen
  im Betrieb.
- **Lade-Animation:** beim Aufruf der Startseite kurzer, moderner Intro
  (Logo/Wortmarke fadet + skaliert ein, Gold-Shine), danach Rollen-Buttons.

## Admin-Statistik
- Tag wählbar (Default heute). Anzeige: Anzahl Bestellungen, Gesamt-Umsatz,
  Tabelle „verkaufte Menge + Umsatz pro Getränk". Darunter eingebettet die
  Live-Ausschank-Ansicht (read + erledigt) und optional Kasse.

## Konfiguration (`config.php`)
```php
$PASSWORTE = ['kasse'=>'...', 'bar'=>'...', 'admin'=>'...'];
$GETRAENKE = [['name'=>'Bier','price'=>3.50], ...];
```

## Deployment (PHP-Webspace)
1. Alle Dateien per FTP in den Webspace-Root laden.
2. Sicherstellen, dass der `data/`-Ordner beschreibbar ist (chmod 755/775).
3. Passwörter & Getränke in `api/config.php` anpassen.
4. Tablets im selben WLAN → Browser auf die Domain → Rolle wählen.

## Nicht im Scope (YAGNI)
- Echter Gewinn mit Einkaufspreisen (nur Umsatz gewünscht).
- Benutzerkonten / Mehrbenutzer-Verwaltung.
- WebSocket / Push (Polling reicht).

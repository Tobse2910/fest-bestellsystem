# Fest-Bestellsystem

![Fest-Bestellsystem](assets/img/Anwendung.png)

Browserbasierte Bestell-App für Straßenfeste, Vereinsfeiern & Co. Läuft auf
Tablets/Handys ohne Installation – klassisches PHP/Apache genügt, kein Node.js.
Drei Rollen mit Passwort-Login:

- **Bestellannahme (Kasse)** – Getränke antippen, Bestellung senden, Pfand-Rückgabe verrechnen.
- **Bar / Ausschank** – eingehende Bestellungen sehen und abhaken (auch per Wischen).
- **Admin** – sieht Kasse + Bar, die Tages-Statistik und verwaltet die ganze App
  (Getränke, Kategorien, Preise, Bilder, Titel, Hintergrund, Impressum, Fußzeile).

Echtzeit zwischen den Geräten läuft über Polling (Aktualisierung alle ~2 s).
Speicherung wahlweise in MySQL (Live-Webspace) oder automatisch SQLite
(lokal/Docker, mit JSON-Fallback) – ganz ohne Datenbank-Einrichtung zum Ausprobieren.

> **Vor dem echten Einsatz die Standard-Passwörter ändern** – in der `.env`
> (Vorlage `.env.example`) oder direkt im Admin-Bereich.

---

## Schnellstart (lokal mit Docker)

> Die App braucht einen PHP-Server – HTML nur doppelklicken (file://) funktioniert nicht.

1. Docker Desktop installieren & starten.
2. Repository klonen und Terminal in den Projektordner öffnen (dort liegt `docker-compose.yml`).
3. `docker compose up -d --build`
4. Browser: **http://localhost:8095**
5. Andere Geräte im WLAN: Rechner-IP (`ipconfig` / `ip a`) → `http://<IP>:8095`.

Stoppen: `docker compose down` (Daten bleiben im Volume). Zurücksetzen: `docker compose down -v`.
Ohne eigene Konfiguration läuft die App im Demo-Modus (SQLite + Beispiel-Getränke).

---

## Konfiguration – `.env`

Geheimnisse liegen in einer `.env` im Projekt-Wurzelverzeichnis. Beim ersten Setup
die Vorlage kopieren und Werte eintragen:

```bash
cp .env.example .env
```

Die echte `.env` ist per `.gitignore` vom Repo ausgeschlossen **und** per `.htaccess`
vor dem Aufruf im Browser geschützt – Geheimnisse bleiben geheim. Ohne `.env` startet
die App im Demo-Modus (Standard-Passwörter aus `.env.example`, SQLite).

In der `.env` pflegst du:

- **Passwörter** je Rolle (`KASSE_PASSWORT`, `BAR_PASSWORT`, `ADMIN_PASSWORT`),
- **DB-Zugang** (`DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASS` – leer lassen = SQLite-Demo),
- **Fest-Name** (`FEST_NAME`, Fallback – im Admin überschreibbar).

Die **Erst-Befüllung der Getränke** (`$GETRAENKE`) steht weiterhin in `api/config.php`
(kein Geheimnis). Preise mit Punkt als Dezimaltrenner (`3.50`). Getränke/Preise/Kategorien
pflegt man danach normalerweise bequem im Admin (Datenbank), nicht mehr im Code.

---

## Bedienung am Fest

1. Jedes Gerät öffnet die Domain → Startseite → Station wählen.
2. Kasse: Passwort + Vor-/Nachname → Getränke antippen → ggf. Leergut über den
   Becher-/Flaschen-Zähler abziehen → Senden.
3. Bar: Passwort → Bestellungen erscheinen automatisch (neue golden markiert) →
   Erledigt tippen oder nach links wischen.
4. Admin: Passwort → Statistik (Umsatz, Pfand, Mengen, pro Person & Stunde);
   Tabs Getränke, Verwaltung, Bar, Kasse.

---

## Verwaltung im Admin (ohne Datei-Upload)

Der Admin pflegt fast alles live im Browser – Änderungen wirken sofort:

- Getränke: hinzufügen, umbenennen, Preis/Pfand/Kategorie ändern, löschen.
  Bild je Getränk aus dem Ordner `bilder/Getränke/` wählen oder eigenes hochladen.
- Kategorien anlegen/entfernen (z. B. Bier, Softdrinks, Longdrinks …) –
  sie erscheinen als Filter-Tabs an der Kasse.
- Seite anpassen: Titel/Fest-Name, Hintergrundbild (Start & alle Bereiche),
  Fußzeile und Impressum – alles in der Datenbank gespeichert, übersteht Updates.
- Verwaltung: Passwörter ändern, Verkäufe einer Person löschen,
  Bestellungen zurücksetzen (löscht nur Verkaufsdaten – Getränke & Bilder bleiben).

---

## Aufbau

```
.env.example        Vorlage für Geheimnisse (kopieren nach .env)
index.html          Startseite (Rollenauswahl + Login, Titel/Fußzeile dynamisch)
kasse.html          Bestellannahme (Kategorie-Tabs, Warenkorb, Pfand-Zähler)
ausschank.html      Bar / Ausschank
admin.html          Admin (Statistik, Getränke, Verwaltung, Bar/Kasse eingebettet)
impressum.html      Impressum (Inhalt aus dem Admin)
assets/
  css/style.css     Design (Navy + Gold), responsive Breakpoints
  js/app.js         gemeinsame Helfer (api, Login, Namens-Formatierung, Icon-Picker)
  js/kasse.js       Logik Kasse (Warenkorb, Pfand-Becher/Flaschen-Zähler)
  js/queue.js       Warteschlange + Polling + Wischen (Bar & Admin)
  js/admin.js       Statistik, Getränke-/Kategorie-Verwaltung, Seite anpassen
  img/              hintergrund.jpg (per Admin überschreibbar), Rollen-Icons
bilder/Getränke/    Getränke-Bilder (Auswahl + Upload-Ziel im Admin)
api/
  config.php          liest die .env, enthält den Getränke-Seed (kein Geheimnis)
  db.php              Speicherung (MySQL/SQLite/JSON) – nichts ändern nötig
  api.php             Server-Logik / Endpunkte – nichts ändern nötig
  .htaccess           schützt config.php / db.php vor Direktaufruf
data/               SQLite/JSON-Datei + Rate-Limit-Dateien (per .htaccess geschützt)
```

---

## Deployment auf einem PHP-Webspace

- Alle Dateien per FTP in den gewünschten Webspace-Ordner laden.
- `.env.example` nach `.env` kopieren und Passwörter + DB-Zugang eintragen.
- Der Ordner `data/` muss beschreibbar sein (Rechte 775/755).
- Nach Code-Änderungen im Browser `Strg+Shift+R` (Cache); `admin.html` nutzt zusätzlich `?v=`.

---

## Sicherheit / Hinweise

- Passwörter liegen im Klartext in der `.env` bzw. der DB – ausreichend fürs Fest,
  keine sensiblen Passwörter wiederverwenden. Die `.env` ist per `.htaccess` vor
  Browser-Zugriff geschützt und wird nie ins Repo committet.
- Preise & Pfand werden bei jeder Bestellung serverseitig aus der Datenbank berechnet
  (manipulationssicher), unabhängig vom Browser.
- Keine strikte IP-Bindung der Sitzung (stabil bei WLAN-Wechsel/mobilem Netz/VPN);
  Login gilt ~24 h.

---

## Kurz-Fehlersuche

| Problem | Lösung |
|--------|--------|
| „Server nicht erreichbar" | Liegt die App auf einem PHP-Server (nicht file://)? Läuft PHP? |
| Änderung nicht sichtbar | `Strg+Shift+R` (Cache). Admin lädt über `?v=` frisch. |
| Bilder fehlen | Zeigt das Icon auf eine existierende Datei in `bilder/Getränke/`? |
| Bestellungen kommen nicht an der Bar an | Alle Geräte auf derselben Domain? `data/` beschreibbar? |
| Statistik leer | Richtigen Tag oben gewählt? Zeitzone Europe/Berlin. |

---

## Lizenz

MIT – siehe [LICENSE](LICENSE). Frei nutz- und anpassbar, auch kommerziell.

Änderungsverlauf siehe [CHANGELOG.md](CHANGELOG.md).

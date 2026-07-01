# Änderungsverlauf

## 2026-07-01 – Wiederherstellung & großes Funktions-Update

### Notfall: Seite war komplett weiß
- Ein fehlerhaftes Deploy-/„Chunk"-Tool hatte alle Kern-Dateien in PHP-Loader-Stubs
  zerlegt (`index.html` & Co. gaben nur `<?php … ?>`-Text aus → leere Seite, API tot).
- Alle Dateien aus den `chunk_*`-Teilen **rekonstruiert**, an die richtigen Stellen
  hochgeladen, 47 Chunk-/`.bak`-Reste gelöscht. Seite lief wieder.
- Später gefundenes Folgeproblem: In `assets/js/admin.js` war bei der Rekonstruktion
  eine **überzählige `}`** entstanden → Admin-JavaScript lief gar nicht („nichts klickbar").
  Behoben; alle JS-Dateien per Syntax-Check geprüft.

### Getränke-Bilder
- Bilder wurden nicht angezeigt, weil die DB auf `assets/img/drinks/…` zeigte, die
  Dateien aber fehlten. Alle Icons auf den zentralen Ordner **`bilder/Getränke/`**
  vereinheitlicht (dort wählt/lädt auch der Admin) und Bilder hochgeladen.
- Karten zeigen das **ganze Bild** (`contain` statt `cover`), dezentere Abdunklung.

### Kategorien
- Bug behoben: `db.php` → `drinksAll()` gab das Feld `category` nicht zurück, dadurch
  landete alles unter „Sonstiges". Jetzt korrekt.
- Kategorie-Filter an der Kasse als **vertikale Tab-Leiste** (statt seitlicher Spalten),
  bei vielen Kategorien **scrollbar**; im Hochformat automatisch waagerechte Scroll-Leiste.
- Kategorien: Bier, Softdrinks, Alkoholische Mischgetränke, Kurze, **Flaschen**, **Wein**.

### Sortiment erweitert
- Neue Produkte angelegt (Preis 1 € als Platzhalter, im Admin anpassbar):
  Cola/Fanta/Wasser/Apfelschorle **(Flasche)**, Rotwein/Weißwein/Rosé je **Glas & Flasche**,
  **Shots**.
- Doppeltes „Bier" entfernt, „Wodka" echtes Bild zugewiesen – keine Emoji-/„??"-Platzhalter mehr.

### Pfand / Leergut
- Neue **Becher-/Flaschen-Zählung** statt Euro-Eingabefeld: Anzahl mit `−/+`,
  Betrag = Anzahl × Pfand-Satz (automatisch abgeleitet).
- Einheit passt sich an: „Becher" bzw. „Flasche(n)" – je nachdem, was Pfand hat.

### Verkäufer-Name
- Login mit **Vor- und Nachname**; Anzeige sauber formatiert (Groß-/Kleinschreibung),
  eigenes Personen-Icon statt Emoji, hübschere Badges (Kasse, Bar, „Letzte Bestellungen").

### Admin: Seite anpassen (in der Datenbank gespeichert)
- **Titel/Fest-Name** editierbar → wirkt in Kopfzeilen, Startseiten-Überschrift,
  Fußzeile und Browser-Titeln.
- **Hintergrundbild** hochladbar (überschreibt `hintergrund.jpg`, wirkt überall).
- **Impressum** als Textfeld → wird 1:1 auf der Impressum-Seite angezeigt.
- **Fußzeile** frei editierbar (leer = automatisch „© [Titel] · Bestellsystem";
  Impressum-Link bleibt immer).
- Neuer öffentlicher Endpunkt `public_info` (Titel/Impressum/Fußzeile ohne Login lesbar).
- Admin-Icon-Auswahl: generische **Emoji-Icons entfernt** – nur echte Bilder wählen/hochladen.

### Sitzung / Stabilität
- **Strikte IP-Bindung entfernt** und **1-Stunden-Admin-Timeout** aufgehoben – die Sitzung
  überlebt jetzt WLAN-Wechsel/mobiles Netz/VPN. Login gilt ~24 h.

### „Datenbank zurücksetzen" entschärft
- Der rote Button löscht jetzt **nur die eingegebenen Bestellungen/Verkäufe**.
  Getränke, Preise, Kategorien und Bilder **bleiben erhalten** (kein Werksreset mehr).

### Responsiv & Cache
- Layout-Breakpoints geprüft/ausgebessert (v. a. Kategorie-Leiste im Hochformat).
- `admin.html` bindet CSS/JS mit `?v=`-Cache-Buster ein (manche Webspaces liefern keine no-cache-Header).

# game/

Die spielbare Demo von Züri-Trade: Handel auf dem Zürichsee im Browser.

## Starten

Das Spiel lädt seine Zahlen aus `data/*.json` und braucht deshalb einen kleinen lokalen Webserver (als Datei per Doppelklick geöffnet, blockiert der Browser das Laden). Python genügt, sonst ist nichts zu installieren.

- **Windows:** `spielen.bat` im Hauptordner doppelklicken. Der Browser öffnet sich mit dem Spiel.
- **Von Hand:** im Hauptordner `python -m http.server 8000` starten und `http://localhost:8000/game/` öffnen.

## Was die Demo kann

- Seekarte des Zürichsees mit acht Seegemeinden von Zürich bis Schmerikon, Durchfahrt am Seedamm
- Marktübersicht jeder Stadt in der Seitenleiste: Lager, Kauf- und Verkaufspreis, bestes Gebot in einer anderen Stadt. Grosse Mengen verschieben den Preis (Mengeneffekt).
- **Steuerung mit der Maus:** Klick auf den See, und das gewählte Schiff segelt dorthin (auch Kurswechsel unterwegs). Klick auf eine Stadt, und es legt dort an. Der Weg führt automatisch über Wasser, zum Obersee durch den Seedamm.
- **Handelsfenster:** öffnet sich bei der Ankunft im Hafen (oder per Klick auf die Stadt, in der das Schiff liegt) und hält die Zeit an. Darin auch die Option, direkt zu einem anderen Hafen zu segeln, und der Schiffskauf.
- Eigene Schiffe (Nauen): Laderaum 120, Unterhalt pro Tag, weitere Schiffe kaufbar
- 45 KI-Händler handeln mit, als graue Punkte auf dem See sichtbar
- Ereignisse (Missernte, Seuche, Chilbi, Föhnsturm) verändern Angebot und Nachfrage
- Echtzeit mit Pause in drei Tempostufen, Leertaste hält an, auf Wunsch Halt bei jeder Ankunft

Noch nicht dabei: Spielziel, Speichern, Stadtausbau, Diplomatie, Kampf (siehe `docs/roadmap.md`).

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Seite und Stil (Pergament und Seekarte, siehe `docs/optik.md`) |
| `src/daten.js` | lädt `data/*.json` |
| `src/wirtschaft.js` | Wirtschaftsmodell: Preise, Städte, KI-Händler, Ereignisse. Entspricht `tools/sim/wirtschaft_sim.py` |
| `src/spiel.js` | Spielerzustand: Geld, Schiffe, Fahrten, Handel, Kalender |
| `src/navigation.js` | Wegsuche über Wasser für die frei gesteuerten Schiffe |
| `src/karte.js` | Seekarte als SVG |
| `src/oberflaeche.js` | Seitenleiste (Flotte, Marktübersicht), Handelsfenster, Meldungen |
| `src/main.js` | Einstieg und Zeitsteuerung |
| `src/zufall.js` | reproduzierbarer Zufallsgenerator |
| `test/wirtschaft_test.mjs` | Test ohne Browser (`node game/test/wirtschaft_test.mjs`) |

Reines JavaScript (ES-Module), ohne Build-Schritt und ohne Pakete. Wirtschaft und Spielerzustand greifen nicht auf das DOM zu und laufen deshalb auch unter Node.

## Regeln für Änderungen

- Zahlen gehören nach `data/`. Startwerte und Tempo der Demo stehen in `data/spiel.json`, die Karte in `data/karte.json`.
- Die Schiffe des Spielers fahren stufenlos und frei, die KI-Händler in ganzen Tagen auf festen Wegen wie in der Simulation.
- `src/wirtschaft.js` und `tools/sim/wirtschaft_sim.py` müssen dieselbe Logik haben. Wer eine Seite ändert, ändert die andere mit und lässt beide Tests laufen. Der Spieltest prüft dieselben Balance-Checks wie die Simulation.

## Engine

Für die Demo ist ein Web-Spiel gewählt (siehe `docs/entscheidungen.md`): läuft ohne Installation, lässt sich mit Node automatisch testen und teilt die Daten direkt mit der Simulation. Godot 4 bleibt eine Option für später, falls eine 3D-Stadtansicht kommt. Die Daten in `data/` und das Referenzmodell in `tools/sim/` wären dann weiter nutzbar.

# CLAUDE.md: Züri-Trade

Handels- und Managementspiel (Zürichsee, 17. Jahrhundert), Hobbyprojekt. Details: `README.md` und `docs/`.

## Sprache

Dokumentation, Kommentare, Commit-Nachrichten und Gespräche auf Deutsch. Bezeichner im Code dürfen Deutsch oder Englisch sein, aber innerhalb einer Datei einheitlich. Dateinamen ohne Umlaute.

## Befehle

```bash
python3 tools/sim/wirtschaft_sim.py                  # Wirtschaftssimulation, Standardlauf
python3 tools/sim/wirtschaft_sim.py --seed 2         # anderer Zufallslauf
python3 tools/sim/wirtschaft_sim.py --no-events      # ohne Ereignisse
python3 tools/sim/wirtschaft_sim.py --csv preise.csv # Preisverlauf exportieren
python3 tools/sim/wirtschaft_sim.py --jahr 1900     # Simulation in einer späteren Epoche (nur Information, Checks gelten für 1650)
python3 tools/daten/bilanz.py                        # Datenbilanz je Zone (Angebot gegen Bedarf, Regel 7)
node game/test/wirtschaft_test.mjs                   # Test der Spielwirtschaft (gleiche Checks, dauert rund eine Viertelstunde)
NUR=zonen node game/test/wirtschaft_test.mjs         # nur ein Abschnitt (Teil des Titels)
node tools/sim/spieler_bot.mjs 6000                  # Bot spielt 6000 Tage (Wachstum von Vermögen und Rang)
node tools/sim/zeitsprung_mess.mjs 365               # Rechenzeit eines Spieltags je Teilsystem (Zeitsprünge, Ruckler)
python tools/spielserver.py                          # Spiel starten (ohne Browser-Cache), dann http://localhost:8000/game/
```

Exit-Code 0 = alle Balance-Checks bestanden, 1 = mindestens ein Check durchgefallen.

## Regeln

1. **Zahlen gehören in `data/`, nicht in den Code.** Waren, Preise, Städte, Rezepte, Parameter, Gebäude sind JSON-Dateien. Nur Logik kommt in den Code.
2. **Nach jeder Änderung an `data/` oder an der Wirtschaftslogik die Simulation laufen lassen**, mit mindestens drei Seeds (1, 2, 3), und das Ergebnis prüfen. Ein durchgefallener Check ist ein Befund, den man erklärt oder behebt. Schwellenwerte werden nicht angepasst, nur damit ein Check besteht. Aussagekräftig sind nur Läufe mit der Standarddauer von 720 Tagen: Kurze Läufe zeigen noch den Einschwingeffekt am Anfang (zu hohe Rendite). Zusätzlich `node game/test/wirtschaft_test.mjs` laufen lassen.
3. **Das Konzept hat Vorrang vor Einfällen.** Schwerpunkte sind Handel, Management, Diplomatie. Der Kampf bleibt klein (statische Ansicht). Neue Systeme erst, wenn sie im Konzept stehen oder der Nutzer sie entscheidet.
4. **Entscheidungen festhalten** in `docs/entscheidungen.md` (Datum, Entscheidung, Begründung). Offene Fragen dort ebenfalls führen.
5. **Keine Originalmaterialien** aus Port Royale oder anderen kommerziellen Spielen: keine Dateien, Grafiken, Screenshots, Modelle, Symbole, Texte, Namen von Schiffen oder Charakteren, keine ausgelesenen Daten. Der Grafikstil darf sich an Port Royale 3 orientieren (siehe `docs/optik.md`), aber keine konkreten Bilder übernehmen oder nachzeichnen. Referenzbilder nur lokal in `referenzen_lokal/` (steht in `.gitignore`). Fremde Assets nur mit passender Lizenz und Quellenangabe.
6. **Kleine, nachvollziehbare Commits.** Eine Änderung pro Commit, mit kurzer Begründung.
7. **Datenkonsistenz beachten (je Zone):** Pro Ware soll die Gesamtproduktion etwas über dem Gesamtbedarf liegen (ca. +3-8 %), und Rohstoff und Werkstatt sollen nicht überall in derselben Stadt liegen, sonst gibt es nichts zu handeln. Die Simulation deckt solche Fehler auf.

## Wichtige Dateien

- `data/params.json`: Stellschrauben. Wichtigste Balance-Schraube: `TARGET_DAYS_USE` / `TARGET_DAYS_PROD` (Zielbestand in Tagen)
- `data/cities.json`, `goods.json`, `recipes.json`, `consumption.json`: Wirtschaftsdaten
- `data/events.json`: Zufallsereignisse, `data/karte.json`: Seeteile, Ufer, Durchfahrt und Distanzen über Wasser (nach Änderungen an Ufern oder Städten `node tools/karte/distanzen.mjs`), `data/spiel.json`: Startwerte der Demo
- `data/buildings.json`: Betriebe und Kontor für den Stadtausbau im Spiel (von der Simulation noch nicht gelesen)
- `data/schiffe.json`: Schiffstypen (auch Kriegsschiffe), Kampfwerte und Bootshandel des Spielers. Der Nauen muss dem KI-Schiff in `params.json` entsprechen (Test prüft das)
- `data/zonen.json`: Zonen (Seen, Flüsse, Landzonen), Verbindungen mit Ausbaustufen, Netze, Kanäle, Preisniveau je Zone. `data/epochen.json`: Kurven über die Jahre. `data/ziel.json`, `kapitaene.json`, `risiko.json`, `zoll.json`: Rang und Ratssitze, Kapitäne, Risiko-Ereignisse, Zoll (nur im Spiel)
- `data/fraktionen.json`: Stände, Krieg und Frieden, Ruf, Kaperbriefe (nur im Spiel, `game/src/diplomatie.js` und `kampf.js`)
- `tools/sim/wirtschaft_sim.py`: Simulation (Datenabschnitt, Modell, Tagesschleife, Bericht), das Referenzmodell
- `game/src/wirtschaft.js`: dieselbe Wirtschaftslogik im Spiel. Änderungen an der Logik immer in beiden Dateien

## Offene Punkte (Stand erste Demo)

Engine langfristig (Demo im Browser, Godot später möglich), Zeitmodell bestätigen (Demo: Echtzeit mit Pause), Spielziel, Diplomatie-Details. Siehe `docs/entscheidungen.md`.

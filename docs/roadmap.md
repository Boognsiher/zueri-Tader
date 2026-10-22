# Roadmap

Grundsatz: **Erst Spielspass im Kern beweisen, dann Inhalt und Optik ausbauen.**

## Meilensteine

- [x] **M1 Wirtschaftsprototyp ohne Grafik:** Waren, Städte, Preisformel, KI-Händler, Ereignisse, Balance-Checks (`tools/sim/`)
- [x] **M2 Daten ausgelagert:** JSON in `data/`, Simulation liest sie, Exit-Code für automatische Tests
- [ ] **M3 Stadtmodell in der Simulation:** Bevölkerung mit Wachstum, Gebäude-Slots, Zufriedenheit mit Folgen (siehe `docs/stadtausbau.md`)
- [ ] **M4 Diplomatie-Prototyp in der Simulation:** Beziehungswerte, Verträge, Embargos, Folgen für Preise und Routen (siehe `docs/diplomatie.md`)
- [x] **M5 Engine wählen und Grundgerüst:** Web (reines JavaScript), Daten aus `data/` laden, Wirtschaft als Port der Simulation mit Test
- [x] **M6 Minimale Oberfläche:** Karte, Stadtansicht, Handelsfenster. Ein Schiff, eine Route, ein Handel. Erste spielbare Demo in `game/`, vorgezogen vor M3 und M4
- [ ] **M7 Vertical Slice:** kleine, komplette Spielrunde mit wenigen Städten, Flotte, einer Nation und einer Kampfbegegnung
- [ ] **M8 Kampf:** statische Ansicht, Auflösung aus Schiffswerten, Risiko für Ladung und Schiff
- [ ] **M9 Ausbau und Politur:** mehr Städte und Waren, Balance, Sound, Menüs, Speichern und Laden

## Hinweise zur Reihenfolge

- M3 und M4 laufen zuerst in der Simulation. Dort sind Änderungen billig und messbar, bevor eine Oberfläche existiert.
- Der wichtigste Schritt für M3 ist, die Stadtdaten von Anfang an um Bevölkerung, Bedarf und Gebäude zu erweitern. Dann ist der Ausbau später eine Erweiterung, kein Umbau.
- M5 und M6 wurden auf Wunsch des Projektinhabers vor M3 und M4 gebaut, um früh etwas Spielbares zu haben. Neue Systeme kommen trotzdem zuerst in die Simulation.

## Als GitHub-Issues anlegen

Jeder Meilenstein eignet sich als Issue oder GitHub-Milestone. Kleinere Aufgaben darunter, zum Beispiel für M3:

- Einwohnerwachstum nach einfacher Regel
- Gebäude aus `data/buildings.json` in der Simulation lesen
- Slots pro Stadtgrösse
- Gebäude verändern Produktion, Werkstattkapazität und Bedarf
- Simulations-Checks für Ausbau erweitern (z. B. Amortisation von Gebäuden)

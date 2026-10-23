# Züri-Trade

Ein Handels- und Managementspiel am Zürichsee im 17. Jahrhundert: mit Nauen und Ledischiffen Waren günstig kaufen und teuer verkaufen, Städte ausbauen und sich politisch zwischen den eidgenössischen Orten bewegen.

Hobbyprojekt, inspiriert von der Spielidee der Port-Royale-Reihe, aber mit eigenem Namen, eigenen Grafiken und eigenen Texten. **Züri-Trade ist ein Arbeitstitel.**

## Schwerpunkte

1. **Handel und Wirtschaft:** Angebot und Nachfrage setzen die Preise, Produktionsketten verbinden die Städte.
2. **Management:** Flotte, Stadtausbau, Gebäude.
3. **Diplomatie:** Ruf, Verträge, Konflikte zwischen den Nationen.
4. **Kampf:** bewusst klein gehalten, statische Gefechtsansicht, keine 3D-Schlachten.

## Status

Erste spielbare Demo im Browser. Die Wirtschaft ist als Simulation vorhanden und getestet, das Spiel nutzt dieselben Daten und dieselbe Logik.

| Bereich | Stand |
|---|---|
| Konzept | ausgearbeitet, siehe `docs/` |
| Wirtschaftssimulation | läuft, alle Balance-Checks bestanden |
| Stadtausbau | Entwurf (`docs/stadtausbau.md`, `data/buildings.json`), noch nicht in der Simulation |
| Diplomatie | Entwurf (`docs/diplomatie.md`) |
| Spiel / Oberfläche | spielbare Demo im Browser: Karte, Markt, Flotte, KI-Händler, Ereignisse (`game/`) |

## Schnellstart

Voraussetzung: Python 3.8 oder neuer, keine weiteren Pakete.

**Spielen:** unter Windows `spielen.bat` doppelklicken, sonst im Hauptordner `python tools/spielserver.py` starten und `http://localhost:8000/game/` öffnen. Details in [`game/README.md`](game/README.md).

**Simulation:**

```bash
python3 tools/sim/wirtschaft_sim.py                      # Standardlauf, 720 Tage
python3 tools/sim/wirtschaft_sim.py --ships 40 --k 0.6   # andere Parameter
python3 tools/sim/wirtschaft_sim.py --no-events          # ohne Zufallsereignisse
python3 tools/sim/wirtschaft_sim.py --csv preise.csv     # Preisverlauf für Diagramme
```

Die Simulation lässt die Wirtschaft ohne Spieler laufen (Städte produzieren und verbrauchen, KI-Händler handeln) und prüft am Ende, ob sie stabil und spielbar ist. Der Exit-Code ist 0, wenn alle Checks bestehen, sonst 1. Daher läuft sie auch automatisch als Test (`.github/workflows/sim.yml`), zusammen mit dem Test der Spielwirtschaft (`node game/test/wirtschaft_test.mjs`, braucht Node 18 oder neuer).

## Projektstruktur

```
zueri-trade/
├─ README.md
├─ CLAUDE.md            Projektregeln für Claude Code
├─ docs/                Konzept, Wirtschaft, Stadtausbau, Diplomatie, Entscheidungen, Roadmap
├─ data/                alle Spielzahlen als JSON (Waren, Städte, Rezepte, Parameter, Gebäude)
├─ tools/sim/           Wirtschaftssimulation (Balancing-Labor)
├─ game/                das Spiel (Browser-Demo, reines JavaScript)
├─ spielen.bat          startet die Demo unter Windows
└─ .github/workflows/   automatischer Balance-Test
```

**Grundprinzip: datengetriebenes Design.** Waren, Preise, Städte, Rezepte und Parameter stehen in `data/*.json`, nicht im Code. Balance-Änderungen sind reine Datenänderungen. Simulation und späteres Spiel lesen dieselben Dateien.

## Dokumentation

- [`docs/konzept.md`](docs/konzept.md): Vision, Säulen, Kernschleife, Umfang
- [`docs/wirtschaft.md`](docs/wirtschaft.md): Waren, Preisformel, Simulation, Balance-Erkenntnisse
- [`docs/stadtausbau.md`](docs/stadtausbau.md): Slot-System, Gebäude, Zufriedenheit
- [`docs/diplomatie.md`](docs/diplomatie.md): Entwurf des Diplomatiesystems
- [`docs/entscheidungen.md`](docs/entscheidungen.md): was entschieden ist und was offen ist
- [`docs/roadmap.md`](docs/roadmap.md): Meilensteine
- [`docs/optik.md`](docs/optik.md): Grafikrichtung (angelehnt an Port Royale 3) und Umgang mit Bildmaterial
- [`docs/referenzen.md`](docs/referenzen.md): verwandte Open-Source-Projekte

## Rechtliches

Eigener Name, eigene Grafiken, eigene Texte. Es werden keine Dateien, Grafiken, Texte oder ausgelesenen Daten aus Port Royale oder anderen kommerziellen Spielen verwendet. Spielmechaniken (Handel, Wirtschaft) sind frei, das Originalmaterial nicht. Die Grafik orientiert sich im Stil am Vorbild (siehe `docs/optik.md`), übernimmt aber keine Bilder, Screenshots oder Modelle. Eine Lizenz für dieses Repo ist noch nicht festgelegt.

## Arbeiten mit Claude Code

Im Hauptordner starten. `CLAUDE.md` enthält die Projektregeln, unter anderem: Balance-Änderungen in `data/`, danach die Simulation laufen lassen und die Checks prüfen, Entscheidungen in `docs/entscheidungen.md` festhalten.

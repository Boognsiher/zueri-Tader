# game/

Hier entsteht das eigentliche Spiel, sobald die Engine gewählt ist (Meilenstein M5, siehe `docs/roadmap.md`). Bis dahin ist der Ordner ein Platzhalter.

## Engine-Entscheidung (offen)

| Weg | Stärke | Schwäche |
|---|---|---|
| **Godot 4** | kostenlos, sehr gutes UI-System, starke 2D-Unterstützung, leichter Einstieg | eigene Skriptsprache (GDScript, Python-ähnlich) |
| **Web (TypeScript)** | sehr flexible Oberflächen, einfach zu teilen, direkt im Browser testbar | weniger Spielgefühl, Performance bei grossen Simulationen |

Eine Unity-Variante wurde erwogen, aber wegen Gewicht und Lizenzfragen zurückgestellt.

**Unreal Engine 5** ist technisch möglich, für ein oberflächenlastiges Verwaltungsspiel aber nicht empfohlen: Der Aufbau von Fenstern und Tabellen ist umständlich, Projekte bestehen weitgehend aus Binärdateien (schlecht für Git und für Claude Code), und der Aufwand ist für ein Hobbyprojekt hoch. Sinnvoll nur, wenn eine aufwändige 3D-Optik der Kern des Spiels werden soll.

## Optik

Die Grafikrichtung (angelehnt an Port Royale 3, vereinfacht) steht in `docs/optik.md`. Karte und Oberfläche in 2D, die Stadtansicht zunächst einfach und später optional in 3D mit festen Bauplätzen. Godot kann 2D und 3D, das spricht für Godot.

## Anforderungen an das Spiel

- liest alle Spielzahlen aus `data/*.json` (dieselben Dateien wie die Simulation)
- Wirtschaftslogik soll mit der Simulation in `tools/sim/` übereinstimmen. Die Simulation bleibt das Referenzmodell zum Balancieren.
- Oberfläche vor Grafik: Karte, Stadtansicht, Handelsfenster, stimmiger UI-Stil (Seekarte, Pergament, Kontor)
- Kampf als statische Ansicht, keine 3D-Schlachten

## Entscheidungshilfe

Wenn das Spiel eher wie ein richtiges Spiel wirken soll: Godot. Wenn es eher ein Werkzeug-artiges Erlebnis mit sehr flexibler Oberfläche sein darf und einfach teilbar sein soll: Web.

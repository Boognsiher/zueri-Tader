# Optik

Entschieden am 22.10.2026: Der Grafikansatz **orientiert sich an Port Royale 3** (der "alte" Look dieser Spielreihe), wird aber bewusst vereinfacht und etwas poliert. Ziel ist nicht, die Grafik des Vorbilds zu erreichen, sondern einen **stimmigen, einheitlichen Stil** in diesem Geist.

## Was am Vorbild gefällt (Orientierung)

Nach den gefundenen Quellen kombiniert Port Royale 3 mehrere Darstellungsarten:

| Bereich | Vorbild | Plan für Züri-Trade |
|---|---|---|
| Weltkarte | 2D-Übersichtskarte der Karibik | 2D-Karte, Städte als Knoten, Seewege |
| Siedlungen | 3D-Ansicht, Gebäude nur auf Rasterplätzen | zunächst einfache Stadtansicht (Kacheln oder Illustration), später optional 3D mit festen Bauplätzen (passt zum Slot-System) |
| Seeschlachten | 3D | statische Ansicht, bewusst einfach |
| Oberfläche | 2D-Fenster, laut Review unübersichtlich mit unbeschrifteten Symbolen | 2D-Fenster im Seekarten-, Pergament- oder Kontor-Stil, klar beschriftet |

Quellen: Review auf Gaming Nexus (Karte 2D, Siedlungen 3D, Menüs unübersichtlich) und offizielle Spielbeschreibung (3D-Seeschlachten).

## Grundsätze

1. **Stimmig vor detailliert.** Ein einheitlicher, einfacher Stil wirkt besser als halbfertiger Realismus.
2. **Oberfläche zuerst.** Pergament- und Seekarten-Look, gute Schriften, klar beschriftete Symbole bringen viel bei wenig Aufwand. Hier lässt sich das Vorbild sogar verbessern.
3. **Platzhalter zuerst, Grafik später.** Daten und Wirtschaft sind von der Darstellung getrennt. Das Spiel kann zuerst mit einfachen Kacheln und Listen laufen, die schöne Optik kommt dazu, sobald der Kern Spass macht.
4. **Lesbarkeit vor Atmosphäre.** Ein Verwaltungsspiel lebt davon, dass man Zahlen und Optionen schnell erfasst.

## Referenzen und Urheberrecht

Allgemeiner Hinweis, keine Rechtsberatung:

- **Stil und Stimmung als Vorbild sind in Ordnung** (alter Look, 2D-Karte, 3D-Siedlung mit Raster).
- **Konkrete Bilder, Modelle, Texturen, Symbole, Schiffsdesigns und Karten aus Port Royale 3 oder anderen Spielen werden nicht übernommen**, nicht nachgezeichnet und nicht als direkte Vorlage kopiert. Dazu zählen auch Screenshots aus dem Internet.
- **Bildmaterial aus dem Internet** darf man privat ansehen, um Stimmung, Farben und Aufbau von Menüs zu verstehen. Es gehört nicht ins Repo und nicht ins Spiel. Dafür gibt es den lokalen Ordner `referenzen_lokal/`, der in `.gitignore` steht, damit nichts versehentlich eingecheckt wird.

**Rechtssichere Quellen für eigene Grafik:**

- Selbst gezeichnete oder in Blender gebaute Assets
- Freie Asset-Sammlungen mit passender Lizenz (z. B. CC0). Die Lizenz vor jeder Verwendung prüfen, besonders vor einer Veröffentlichung.
- Alte Seekarten und Stiche aus dem 17. Jahrhundert für Karte und Oberfläche. Die Originale sind in der Regel gemeinfrei, die Lizenz der jeweiligen Sammlung oder des Scans aber prüfen.

Sobald das erste fremde Asset dazukommt, eine Liste mit Quelle und Lizenz anlegen (z. B. `docs/assets-lizenzen.md`).

## Kartengrundlage

Die Seekontur, die Lage der Städte, der Greifensee und der Pfäffikersee sind von Hand nach einer historischen Karte des Zürichsees aus dem 19. Jahrhundert übertragen (vom Projektinhaber gestellt). Solche Karten sind in der Regel gemeinfrei; das Bild selbst liegt nicht im Repo, nur die übertragenen Koordinaten in `data/karte.json`.

## Offene Fragen

- Stadtansicht: dauerhaft 2D (gemalte Illustration oder Kacheln) oder später 3D mit festen Bauplätzen?
- Genauer Stil der Oberfläche (Pergament, Seekarte, Kontor) und Farbwelt
- Schriftart und Symbolsatz
- Wie viel Polierung ist für die erste Veröffentlichung nötig?

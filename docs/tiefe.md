# Spieltiefe und Erweiterung

Stand: 23.10.2026, Entwurf nach Rückmeldung zur Demo. Umgesetzt sind bisher, alles in ersten Fassungen: Kapitäne (`game/src/kapitaene.js`), Spielziel mit Rang und Ratssitzen (`game/src/ziel.js`), Risiko-Ereignisse mit Versicherung (`game/src/risiko.js`), Zoll und Verträge (`game/src/zoll.js`) sowie Zonen, Verbindungen und Bahn (`game/src/zonen.js`, `data/zonen.json`). Das Übrige ist Entwurf.

## Befund

Der heutige Verlauf ist: Schiffe kaufen, auf Automatik stellen, ertragreiche Betriebe kaufen, warten. Das Geld wächst von selbst, weil nichts den Spieler fordert und nichts das Wachstum bremst. Es fehlen ein Ziel, Reibung und Entscheidungen, die sich unterscheiden.

## Vier Hebel (alle vom Projektinhaber gewünscht)

1. **Spielziel und Aufstieg:** Etappen statt Endlosgeld, zum Beispiel Rang des Handelshauses, Titel und Ratssitz in einem Stand, Monopol auf eine Ware. Das Ziel gibt dem Geld einen Zweck. Konkrete Etappen sind noch offen.
2. **Diplomatie mit Folgen:** Zölle, Embargos, Handelsverträge und Lizenzen. Kriege sollen die Preise treffen (heute nicht, damit die Simulation gültig bleibt). Details in [diplomatie.md](diplomatie.md).
3. **Risiko und Ereignisse:** Die Automatik darf nicht blind laufen. Eigene Ereignisse für Schiffe und Betriebe (Sturm, Föhn, Schmuggler, Verderb), dazu Versicherung und Geleit.
4. **Personal und Stadtausbau:** Kapitäne und Verwalter mit Lohn und Eigenschaften, Bürger mit Forderungen und Zufriedenheit, die Ruf und Spanne beeinflussen. Details in [stadtausbau.md](stadtausbau.md).

## Kapitäne mit Stufen

Idee des Projektinhabers: Kapitäne steigen auf, je mehr sie handeln.

- Jedes Schiff (oder jede Automatikroute) bekommt einen Kapitän mit Namen, Stufe und Erfahrung.
- Erfahrung wächst mit Handelsumsatz und gefahrenen Strecken, im Gefecht zusätzlich mit Kampferfahrung.
- Eine höhere Stufe bringt Vorteile: schneller, besserer Umschlag, mehr Laderaum nutzbar, bessere Fluchtchance, bessere Kampfwerte. Eigenschaften (zum Beispiel «Kenner des Obersees», «Zöllnerschreck») geben Unterschiede.
- Kapitäne kosten Lohn, steigen mit der Stufe und können abgeworben werden. Das macht die Automatik zu einer Entscheidung: wen setze ich worauf.
- Entschieden: Kapitäne werden in den Wirtshäusern angeheuert und sterben nicht. Sinkt das Schiff, sind sie Monate verschollen und kehren dann zurück.
- Offen: Kündigung bei schlechter Behandlung oder zu niedrigem Lohn? Eigenschaften mit mehr Wirkung? Alle Zahlen gehören in `data/kapitaene.json` und sind noch zu balancieren.

## Erweiterung: weitere Seen, verbunden durch Flüsse (umgesetzt)

Jeder See ist eine **Zone** mit eigenen Städten, eigenem Wasser, eigenen KI-Händlern, eigener Balance und einem eigenen Preisniveau je Ware (`preisfaktor`). Alle Zonen liegen schematisch auf einer grossen Karte, die Kamera und die Seenwahl oben links springen von einem See zum anderen.

| Zone | Städte | Rang zum Erschliessen | Gebühr |
|---|---|---|---|
| Zürichsee | Zürich, Küsnacht, Meilen, Horgen, Wädenswil, Rapperswil, Lachen, Schmerikon | offen | – |
| Walensee | Weesen, Betlis, Murg, Walenstadt | Handelsherr (ab 1665) | 60'000 |
| Hochrhein | Schaffhausen, Laufenburg, Rheinfelden, Basel (Terminal der Flussfahrt) | Grosskaufmann (ab 1690) | 120'000 |
| Bodensee | Konstanz, Meersburg, Arbon, Rorschach, Bregenz, Lindau | Zunftmeister (ab 1720) | 250'000 |
| Genfersee | Genf, Nyon, Lausanne, Vevey | Ratsherr (ab 1755) | 400'000 |

**Verbindungen** (`data/zonen.json`): Waren reisen von Kontor zu Kontor, nicht mit dem Schiff. Wer eine Zone erschliesst, bekommt am Ziel einer Verbindung ein Kontor, dort lassen sich Schiffe kaufen. Fracht und Zoll der Zielstadt werden beim Absenden bezahlt, nach der Laufzeit liegt die Ware im Zielkontor, dort handeln Schiffe und Kontor weiter. Linth (Schmerikon-Weesen), Limmat und Aare (Zürich-Basel), Rheinfall (Konstanz-Schaffhausen), Sarganserland (Walenstadt-Rorschach, Fuhrweg), Jurafuss-Strasse (Genf-Basel, Fuhrweg). **Bahnen** (Zürich-Basel, Zürich-Konstanz, Lausanne-Basel) ab Rang Handelsfürst und ab 1847 gegen einen Einmalpreis (0,8 bis 1,5 Mio.).

Offen: Historische Machbarkeit (Flussläufe und Schiffbarkeit im 17. Jahrhundert, die Bahn gab es erst ab 1847), Karten mit mehr Städten je See, Ereignisse an den Zonengrenzen (Schmuggler, Zollkontrolle), Preisunterschiede zwischen den Zonen nachmessen.

## Vorgeschlagene Reihenfolge

1. **Kapitäne mit Stufen** und **Risiko-Ereignisse** für Schiffe: erste Fassungen im Spiel. Offen: Ereignisse für Betriebe und Kontore (Brand, Verderb, Diebstahl), Schmuggler und Zollkontrolle, sobald es Zoll gibt.
2. **Spielziel:** Rang und Ratssitz in Städten, im Spiel. Freischaltung von Rängen, Seen und Bahn nach Rang, Ratssitzen und Kalenderjahr, abgestimmt auf rund 25 Stunden (siehe `docs/entscheidungen.md`). Offen: mit echtem Spielen prüfen, wie viele Spieltage pro Stunde vergehen (Feld «Ansehen») und `ab_jahr` in `data/ziel.json` und `data/zonen.json` danach schieben; Freischaltung weiterer Schiffstypen und Gebäude.
3. **Zoll und Verträge** auf der bestehenden Karte (Zölle zwischen den Ständen), zuerst in der Simulation.
4. **Walensee als zweite Karte** mit Flussstädten als Zoll- und Handelstor.

Jeder Schritt läuft wie bei der Wirtschaft: erst Daten und Simulation, dann Spiel, dann Balance-Checks mit drei Seeds.

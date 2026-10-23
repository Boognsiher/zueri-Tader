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

## Epochenwandel vom Schiff zu Schiene und Strasse (Entscheide vom 23.10.2026, noch nicht umgesetzt)

Der Projektinhaber will, dass sich das Spiel mit den Epochen wandelt, das Handelsprinzip aber bleibt.

**Entschieden**
- **Zeit:** läuft unverändert weiter, kein Tempowechsel nach 1850. Ob das Endgame so lang genug ist, wird beim Spielen geprüft.
- **Seeverkehr:** Die Seen werden mit der Zeit unrentabel, Bahn und später LKW übernehmen. Als Nische bleiben grosse Mengen schwerer Güter (Kies, Steine). Der Schiffsverkehr über **Basel** (Rhein Richtung Holland und Deutschland) und ab **Genf** Richtung Frankreich wird wichtiger.
- **Strassen:** Zuerst werden sie selbst gebaut, später können **Autobahnen** finanziert oder gekauft werden, mit **Mautsystem**.
- **Karte:** Die **Schweiz** wird, wenn die Engine es trägt, eine Zone, sonst vier Teile (Zonen). Später kommen **Deutschland** und **Holland** dazu.
- **Grossprojekte:** Man kann **Kanäle zwischen den Seen** bauen. Das braucht riesige Mengen Baumaterial, viel Geld und viel Zeit, bietet danach aber auch im Endgame einen lohnenden Schiffsverkehr.
- **Schiffe entwickeln sich:** bis zu **Dampfschiffen** und weiter. Die Flotte muss mit der Zeit erneuert werden (veraltete Schiffe verlieren an Wert und Tempo oder lohnen sich nicht mehr).

**Was «Linien auf der Karte» hiess:** Zwei Möglichkeiten, Verkehrswege zu bauen. (a) Der Spieler **zeichnet** die Strecke selbst auf der Karte (Punkte und Linien setzen, Länge und Gelände bestimmen den Preis), wie ein Gleis- oder Strassenplaner. (b) Er **wählt aus vorgegebenen Verbindungen** und baut sie über ein Menü aus, wie die Verbindungen heute. Für die Schweiz als Zone empfehle ich (b) mit einem Netz aus vorgegebenen Knoten (Städte, Pässe, Tunnel), das der Spieler nach und nach ausbaut: Das ist ein Planungs- und Verwaltungsspiel ohne Zeichentool, mit Kosten je Strecke, Kapazität und Maut. Zeichnen (a) wäre ein eigener, grosser Aufwand und würde den Handel in den Hintergrund drängen.

**Machbarkeit (Engine)**
- **Zone Schweiz:** Technisch kein Problem für die Daten und die Wirtschaft, die Zonen sind schon so gebaut. Heute hat jede Zone aber Wasser, auf dem Schiffe fahren. Eine Landzone braucht ein anderes Netz: Städte als Knoten, Strassen und Gleise als Kanten mit Laufzeit, Kapazität, Zustand und Maut, Transport in Fuhrwerk, Bahn oder LKW. Das ist ein neues Verkehrsmodell und der eigentliche Aufwand, die Karte selbst ist leicht (SVG, Kamera).
- **Grösse:** Eine Zone mit 60 bis 100 Städten würde die Wirtschaft verlangsamen (die KI-Händler rechnen pro Zone alle Städte durch). Besser sind **vier bis sechs Landzonen** (zum Beispiel Mittelland, Nordostschweiz, Westschweiz, Alpen und Tessin) mit je 8 bis 15 Städten, verbunden durch Kantenverbindungen wie die heutigen Verbindungen.
- **Dampfschiffe und Erneuerung:** gut machbar über `data/schiffe.json` (Epoche und Baujahr je Typ, Wertverlust nach Alter), die Kapitäne bleiben.
- **Kanal:** gut machbar als Grossprojekt: neue Verbindung mit Materialliste, Geldkosten und Bauzeit in Tagen, dazu Schiffsverkehr zwischen zwei Zonen (heute fahren Schiffe nicht zwischen Zonen).

**Vorgeschlagene Schritte** (jeder für sich spielbar und prüfbar)
1. **Schiffsentwicklung:** neue Schiffstypen je Epoche (zum Beispiel Ruderschiff, Segelschiff, Dampfschiff, Motorschiff), Alter und Wertverlust, Erneuerung. Berührt nur Daten und die Werft.
2. **Epochen in der Wirtschaft:** Preisniveau und Nachfrage je Epoche, Seeverkehr wird unrentabel, Rheinverkehr ab Basel wichtiger (neue Zone Rheinmündung mit Holland und Deutschland).
3. **Verkehrsmodell:** Strasse, Gleis, Autobahn als Ausbaustufen einer Verbindung (Kapazität, Laufzeit, Fracht, Maut), erst auf den bestehenden Verbindungen.
4. **Landzonen Schweiz** (vier bis sechs) mit dem Verkehrsmodell.
5. **Konzessionen und Maut:** Strassen selbst bauen, Autobahnen finanzieren oder kaufen, Maut einnehmen.
6. **Kanäle** als Grossprojekt zwischen Seen.

Offen: Wie lange das Endgame sein soll (Jahre bis 2000?), und ob es ein klares Ziel gibt (zum Beispiel Konzern oder Verkehrsimperium).

## Vorgeschlagene Reihenfolge

1. **Kapitäne mit Stufen** und **Risiko-Ereignisse** für Schiffe: erste Fassungen im Spiel. Offen: Ereignisse für Betriebe und Kontore (Brand, Verderb, Diebstahl), Schmuggler und Zollkontrolle, sobald es Zoll gibt.
2. **Spielziel:** Rang und Ratssitz in Städten, im Spiel. Freischaltung von Rängen, Seen und Bahn nach Rang, Ratssitzen und Kalenderjahr, abgestimmt auf rund 25 Stunden (siehe `docs/entscheidungen.md`). Offen: mit echtem Spielen prüfen, wie viele Spieltage pro Stunde vergehen (Feld «Ansehen») und `ab_jahr` in `data/ziel.json` und `data/zonen.json` danach schieben; Freischaltung weiterer Schiffstypen und Gebäude.
3. **Zoll und Verträge** auf der bestehenden Karte (Zölle zwischen den Ständen), zuerst in der Simulation.
4. **Walensee als zweite Karte** mit Flussstädten als Zoll- und Handelstor.

Jeder Schritt läuft wie bei der Wirtschaft: erst Daten und Simulation, dann Spiel, dann Balance-Checks mit drei Seeds.

# Spieltiefe und Erweiterung

Stand: 23.10.2026, Entwurf nach Rückmeldung zur Demo. Noch nichts davon ist umgesetzt.

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
- Offen: Kapitäne anheuern in Wirtshäusern der Städte oder frei verfügbar? Gibt es Verlust (Tod, Kündigung)? Alle Zahlen gehören in `data/`.

## Erweiterung: weitere Seen, verbunden durch Flüsse

Idee des Projektinhabers: weitere Seen der Schweiz als eigene Karten, verbunden durch Flüsse. Erstes Beispiel: der **Walensee**.

- Jeder See ist eine eigene **Wirtschaftszone** mit eigenen Waren, Preisen und Städten. Man kann sie als eigene Karten anschauen.
- Die Städte an den Verbindungsflüssen sind die Tore zwischen den Zonen. Sie erheben **Zoll** auf Waren, werden dadurch reich und wichtig und sind politisch umkämpft.
- Das passt zu den Säulen Handel und Diplomatie: Preisunterschiede zwischen den Zonen sind der Handelsanreiz, der Zoll und die Verträge sind die Reibung.
- Der Walensee schliesst an den Obersee an (Schmerikon und die Linth, Weesen, Walenstadt). Historische Wege und Schiffbarkeit im 17. Jahrhundert sind noch zu prüfen.
- Technisch: Karten, Städte und Waren stehen bereits in `data/`. Nötig sind mehrere Karten (heute eine, `data/karte.json`), Zonenzugehörigkeit pro Stadt, Zölle als Daten und eine Simulation mit mehreren Zonen.
- Offen: Wie viele Zonen insgesamt (Hobby-Umfang, siehe [konzept.md](konzept.md))? Fahren Schiffe selbst zwischen den Zonen, oder braucht es Umladen und Treideln an den Flussstädten? Hat jede Zone eigene Waren?

## Vorgeschlagene Reihenfolge

1. **Kapitäne mit Stufen:** klein, in sich abgeschlossen, gibt der Automatik sofort mehr Gewicht. Dazu die ersten **Risiko-Ereignisse** für Schiffe.
2. **Spielziel:** Etappen festlegen. Dann hat alles Weitere ein Maß.
3. **Zoll und Verträge** auf der bestehenden Karte (Zölle zwischen den Ständen), zuerst in der Simulation.
4. **Walensee als zweite Karte** mit Flussstädten als Zoll- und Handelstor.

Jeder Schritt läuft wie bei der Wirtschaft: erst Daten und Simulation, dann Spiel, dann Balance-Checks mit drei Seeds.

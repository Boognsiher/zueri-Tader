# Stadtausbau

Stand: Entwurf. Entschieden sind das Slot-System und die einfache Zufriedenheit. Zahlen in `data/buildings.json` sind nicht ausbalanciert und werden von der Simulation noch nicht gelesen.

## Grundidee: Stadt als Wirtschaftsmotor

Der Ausbau dient dem Handel und umgekehrt:

- Stadt wächst → mehr Bevölkerung → mehr Bedarf, mehr Arbeitskräfte, mehr Steuern
- Gebäude produzieren Waren, die der Spieler handelt oder die die Stadt versorgen
- Unversorgte Bevölkerung senkt die Zufriedenheit, das hat Folgen für Ruf, Steuern und Unruhen
- Beispiel: Eine Rumbrennerei braucht Zuckerrohr, also schickt der Spieler Schiffe zur Plantage

## Entschiedene Grundsätze

- **Slot-System:** pro Stadt eine feste Zahl Bauplätze, Gebäude werden per Liste oder Menü gewählt. Ein späterer Wechsel auf ein Raster ist möglich, weil die Wirtschaft von der Platzierung unabhängig bleibt.
- **Bauen nur in freigeschalteten Städten.** Keine eigenen Siedlungen am Anfang. Wie Städte freigeschaltet werden, ist offen.
- **Eine Zufriedenheitszahl pro Stadt** statt Bevölkerungsschichten. Die Tiefe (Schichten mit Aufstieg) lässt sich später erweitern.

## Slots

- Die Zahl der Bauplätze wächst mit der Stadtgrösse. Beispielwerte: Dorf 6, Stadt 12, Metropole 20 (noch nicht festgelegt).
- Gebäude haben **Stufen** (Ausbau statt nur Neubau). Das gibt Fortschritt, ohne mehr Plätze zu brauchen.
- Wenige Plätze zwingen zu Entscheidungen (Rumbrennerei oder Werft?). Daraus entsteht Strategie.

## Gebäudekategorien

| Kategorie | Beispiele |
|---|---|
| Produktion | Plantagen, Farm, Fischerei, Sägewerk, Erzmine |
| Werkstatt | Rumbrennerei, Zigarrenmanufaktur, Weberei, Schmiede |
| Versorgung | Markt, Lagerhaus, Kirche, Krankenhaus |
| Handel und Schifffahrt | Kontor, Werft |
| Verteidigung und Politik | Befestigung, Botschaft |

Die Entwürfe mit Kosten, Unterhalt und Wirkung stehen in `data/buildings.json`.

## Rahmenbedingungen

- Baukosten (Gold und Material) und laufender Unterhalt, sonst baut man unbegrenzt
- Baumaterial ist Ware (Holz, Werkzeug) und muss verschifft werden. Damit hängt der Ausbau am Handel.
- In Städten fremder Nationen braucht der Spieler eine Genehmigung oder ein gutes Verhältnis (Verbindung zur Diplomatie)

## Verbindung zur Diplomatie

- Wem die Stadt gehört, bestimmt, was der Spieler dort bauen darf und wie er besteuert wird
- Gute Beziehungen schalten Bauerlaubnisse, Vorrechte und Rabatte frei
- Unterstützung einer Stadt (Lieferungen, Spenden) erhöht Ruf und Einfluss

## Umsetzungsreihenfolge

1. Stadtdaten um Bevölkerung, Bedarf und Gebäude erweitern, bevor es Grafik gibt (damit ist der Ausbau später eine Erweiterung, kein Umbau)
2. Slot-System in der Simulation: Gebäude bauen verändert Produktion und Bedarf
3. Erst danach Darstellung: Stadtansicht mit Kacheln oder Karten pro Platz, dazu eine Illustration, die mit dem Ausbau wechselt

## Offene Fragen

- Wie werden Städte freigeschaltet (Ruf, Kauf, Lizenz, Kampagnenfortschritt)?
- Wirkt ein Gebäude wie eine Kirche direkt auf die Zufriedenheit, oder nur über Waren? Im Entwurf gibt es einen direkten Bonus.
- Bevölkerungswachstum: nach welcher Regel, mit welcher Obergrenze?
- Kann der Spieler Gebäude abreissen oder nur herunterstufen?

# Stadtausbau

Stand: Im Spiel umgesetzt sind Kontore und Betriebe (siehe unten "Umsetzung in der Demo"). Der Rest dieses Dokuments ist der ursprüngliche Entwurf. Die Simulation liest `data/buildings.json` noch nicht.

## Umsetzung in der Demo (22.10.2026)

Angelehnt an die Werkstätten in Mount & Blade: Bannerlord:

- **Vorhandene Betriebe:** Jede Stadt hat von Anfang an Betriebe in Besitz der Stadt, abgeleitet aus ihrer Produktion in `cities.json` (höchstens einer pro Ware, wenn die Menge für einen ganzen Betrieb reicht). Insgesamt 34 Betriebe.
- **Kaufen und verkaufen:** Der Spieler kauft einen Betrieb zum Marktwert, wenn eines seiner Schiffe im Hafen liegt. Dessen Leistung geht von der Stadt auf ihn über. Der Betrieb kauft Zutaten am Markt der Stadt (oder aus dem Kontor) und verkauft die Erzeugnisse dort (oder liefert ins Kontor). Gewinn oder Verlust geht an den Spieler. Zurückverkauft wird für 70 % des Marktwerts.
- **Neubau:** Wenige Bauplätze pro Stadt (2-4 nach Einwohnern). Neue Betriebe erhöhen das Angebot. Rohstoffbetriebe nur, wo die Stadt den Rohstoff hat. Baumaterial (Holz, Werkzeug) muss im Kontor oder in einem Schiff vor Ort liegen.
- **Kontor:** Lager mit 400 Einheiten pro Stadt. Für das Einlagern von Erzeugnissen, für Werkstätten mit eigenen Zutaten und für Handelsrouten (laden und entladen).
- **Versorgung:** Am Markt der Stadt kauft und verkauft ein Betrieb mit Handelsspanne, Werkstätten verdienen so wenig. Mit Versorgung über das Kontor gibt es keine Spanne, und Werkstätten brauchen nur 70 % der Zutaten. Eigene Ketten (Rohstoffe heranschaffen, verarbeiten, Ware dorthin fahren, wo sie teuer ist) lohnen sich deshalb klar.
- **Zahlen:** `data/buildings.json`. Der Kaufpreis ist der höhere Tagesgewinn aus Marktversorgung (heutige Preise) und Eigenversorgung (Basispreise), mal `amortisation_tage` (150).
- **Noch nicht umgesetzt:** Stufen, Versorgungsgebäude mit Wirkung auf die Zufriedenheit, Werft, Befestigung, Gesandtschaft (in `buildings.json` unter `geplant`), Bevölkerungswachstum.

## Grundidee: Stadt als Wirtschaftsmotor

Der Ausbau dient dem Handel und umgekehrt:

- Stadt wächst → mehr Bevölkerung → mehr Bedarf, mehr Arbeitskräfte, mehr Steuern
- Gebäude produzieren Waren, die der Spieler handelt oder die die Stadt versorgen
- Unversorgte Bevölkerung senkt die Zufriedenheit, das hat Folgen für Ruf, Steuern und Unruhen
- Beispiel: Eine Trotte braucht Trauben, also schickt der Spieler Schiffe zu den Rebbergen

## Entschiedene Grundsätze

- **Slot-System:** pro Stadt eine feste Zahl Bauplätze, Gebäude werden per Liste oder Menü gewählt. Ein späterer Wechsel auf ein Raster ist möglich, weil die Wirtschaft von der Platzierung unabhängig bleibt.
- **Bauen nur in freigeschalteten Städten.** Keine eigenen Siedlungen am Anfang. Wie Städte freigeschaltet werden, ist offen.
- **Eine Zufriedenheitszahl pro Stadt** statt Bevölkerungsschichten. Die Tiefe (Schichten mit Aufstieg) lässt sich später erweitern.

## Slots

- Die Zahl der Bauplätze wächst mit der Stadtgrösse. Beispielwerte: Dorf 6, Stadt 12, Metropole 20 (noch nicht festgelegt).
- Gebäude haben **Stufen** (Ausbau statt nur Neubau). Das gibt Fortschritt, ohne mehr Plätze zu brauchen.
- Wenige Plätze zwingen zu Entscheidungen (Trotte oder Schiffswerft?). Daraus entsteht Strategie.

## Gebäudekategorien

| Kategorie | Beispiele |
|---|---|
| Produktion | Rebberg, Kornhof, Fischerei, Sägewerk, Sennerei |
| Werkstatt | Trotte, Seidenweberei, Weberei, Schmiede |
| Versorgung | Markt, Lagerhaus, Kirche, Krankenhaus |
| Handel und Schifffahrt | Kontor, Werft |
| Verteidigung und Politik | Befestigung, Botschaft |

Die Entwürfe mit Kosten, Unterhalt und Wirkung stehen in `data/buildings.json`.

## Rahmenbedingungen

- Baukosten (Gulden und Material) und laufender Unterhalt, sonst baut man unbegrenzt
- Baumaterial ist Ware (Holz, Werkzeug) und muss verschifft werden. Damit hängt der Ausbau am Handel.
- In Städten fremder Orte braucht der Spieler eine Genehmigung oder ein gutes Verhältnis (Verbindung zur Diplomatie)

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

# Wirtschaft

Das Wirtschaftsmodell ist als Simulation ohne Grafik umgesetzt (`tools/sim/wirtschaft_sim.py`) und getestet. Alle Zahlen stehen in `data/`.

## Waren (14)

| Gruppe | Waren | Rolle |
|---|---|---|
| Grundversorgung | Nahrung, Fisch, Holz | wird immer gebraucht, stabile Preise, geringe Marge |
| Rohstoffe | Zuckerrohr, Tabak, Baumwolle, Kakao, Eisenerz | Basis der Produktionsketten |
| Veredelt | Rum, Zigarren, Tuch, Werkzeug | höhere Preise, brauchen Rohstoffe |
| Luxus und Import | Wein, Gewürze | hohe Marge, im Modell als Import/Produktion einzelner Städte |

**Produktionsketten** (bewusst kurz, höchstens zwei Stufen):

- 2 Zuckerrohr → 1 Rum
- 2 Tabak → 1 Zigarren
- 2 Baumwolle → 1 Tuch
- 1 Eisenerz + 1 Holz → 1 Werkzeug

Werkzeug ist die wichtigste Ware, weil es später als Baumaterial in den Stadtausbau zurückfliesst. So hängt der Ausbau am Handel.

## Städte mit Profil

Jede Stadt hat Stärken (was sie billig produziert) und Schwächen (was sie nachfragt). Das ist die Landkarte der Handelsrouten und wird von Hand entworfen. Faustregeln für die Datenpflege:

- Pro Ware liegt die Gesamtproduktion etwa **3-8 % über dem Gesamtbedarf**. Liegt sie darunter, entsteht dauerhafte Knappheit. Liegt sie deutlich darüber, verderben Waren und die Preise fallen auf den Boden.
- Bei Waren mit kleinen Mengen (Kakao, Eisenerz, Werkzeug, Gewürze) liegt der Überschuss wegen der Rundung bei 11-13 %. Das verursachte in den Tests keinen Verderb.
- **Rohstoff und Werkstatt nicht überall in derselben Stadt.** Sonst wird die Ware nie gehandelt (in der ersten Version passierte das bei Tabak und Eisenerz).

## Preisformel

Jede Stadt hat pro Ware einen Lagerbestand S und einen Zielbestand T. Der Zielbestand ergibt sich aus Eigenbedarf (Verbrauch plus Werkstattbedarf) und Produktion der Stadt:

```
T = TARGET_DAYS_USE * (Verbrauch + Werkstattbedarf) + TARGET_DAYS_PROD * Produktion
Preis = Basispreis * (T / S) ^ k        begrenzt auf 40 % bis 250 % des Basispreises
```

- Viel Lager (S > T): Preis sinkt. Wenig Lager: Preis steigt.
- **k** (Standard 0.7) steuert die Empfindlichkeit des Marktes.
- Kaufpreis und Verkaufspreis unterscheiden sich um 10 % (Handelsspanne), sonst gäbe es risikofreien Gewinn durch Hin-und-her-Handeln.
- **Mengeneffekt:** Beim Kaufen und Verkaufen grosser Mengen bewegt sich der Preis mit. Ein Markt lässt sich nicht in einem Zug leerkaufen.
- Lager sind begrenzt (4 × Zielbestand). Überschuss verdirbt.

## Tagesablauf pro Stadt

1. Produktion und Import kommen ins Lager
2. Werkstätten verarbeiten Rohstoffe
3. Die Bevölkerung verbraucht Waren
4. Zufriedenheit passt sich an, Überschuss über der Lagergrenze verdirbt

## Zufriedenheit

Eine Zahl pro Stadt (0-100): 60 % aus der Deckung des Grundbedarfs (Nahrung, Fisch, Holz), 40 % aus gehobenem Bedarf (Rum, Tuch, Zigarren, Wein, Gewürze, Kakao). Sie gleitet langsam auf den Zielwert zu. Werkzeug ist Ausbaubedarf ohne Wirkung auf die Zufriedenheit.

## Ereignisse

Zufällige Ereignisse verschieben Preise: Missernte (Produktion -70 % für 20 Tage), Seuche (mehr Nahrungsbedarf), Fest (mehr Luxusbedarf), Blockade (Stadt wird 15 Tage nicht angesteuert). Vereinfachung: Schiffe, die schon unterwegs sind, landen trotz Blockade.

## Händler-KI

KI-Händler testen die Wirtschaft. Sie wählen die Fahrt mit dem höchsten Gewinn pro Tag und laden so viel, bis der Grenzgewinn null ist. Zwei Eigenschaften waren für stabile Ergebnisse entscheidend:

- Sie berücksichtigen Schiffe, die bereits mit derselben Ware zum selben Ziel unterwegs sind. Ohne das fuhren sie im Pulk zur selben Chance, und fast jede zehnte Tour machte Verlust.
- Wenn im aktuellen Hafen nichts zu laden ist, können sie leer zu einem aussichtsreichen Hafen fahren. In der Praxis greift das selten.

Diese KI ist ein Prüfstand, kein Gegner. Ein menschlicher Spieler wird bessere Routen finden.

## Testergebnis (Standardwerte, 8 Städte, 45 Schiffe, 720 Tage)

| Messwert | Ergebnis | Ziel |
|---|---|---|
| Preisstreuung | 12-32 % um den Basispreis | stabil |
| Zeit am Preisdeckel/-boden | praktisch 0 % | höchstens 20 % |
| Rendite pro Tour (Mittel) | ca. 28 % | 10-30 % |
| Amortisation eines Schiffs (20'000 Gold) | ca. 200 Tage | 30-300 Tage |
| Verderb | ca. 0 % der Produktion | höchstens 8 % |
| Häufigste Route | ca. 4,6 % der Touren | höchstens 12 % |
| Zufriedenheit | ca. 100 | mindestens 55 |

Die Ziele sind Richtwerte aus der Konzeptphase, keine Naturgesetze. Ob ein Spieler schneller wachsen soll, ist eine Designentscheidung.

Die Zufriedenheit liegt zu glatt bei 100: Die KI versorgt die Städte zuverlässig. Spannung entsteht erst durch Spieler, Ereignisse und später Diplomatie und Krieg.

## Balance-Erkenntnisse

**Wichtigste Stellschraube: `TARGET_DAYS_USE` und `TARGET_DAYS_PROD`.** Grosse Zielbestände machen den Markt träge und liquide: Eine Schiffsladung bewegt den Preis wenig, die Renditen sinken. Kleine Zielbestände machen ihn nervös mit hohen Gewinnen. Bei 60 Schiffen und k = 0.5 sank die mittlere Tourrendite von 36 % (Zielbestand 12/8 Tage) über 27 % (20/14) auf 19 % (30/20).

Andere Parameter hatten kaum Wirkung: Handelsspanne, Mindestrendite, Mindestgewinn und Ladekapazität änderten die Rendite praktisch nicht.

**Schiffszahl und Rendite** (Zielbestand 30/20 Tage):

| Schiffe | k | Rendite pro Tour | Amortisation |
|---|---|---|---|
| 40 | 0.5 | 21 % | 226 Tage |
| 40 | 0.7 | 31 % | 154 Tage |
| 50 | 0.7 | 26 % | 250 Tage |
| 60 | 0.5 | 19 % | 429 Tage |

Mehr Schiffe drücken die Rendite und verlängern die Amortisation: Das ist der Wettbewerb unter den Händlern. Bei zu wenig Schiffen (unter etwa 40) steigen Preisausschläge und Verderb.

**Kakao** und andere Waren mit kleinem Marktvolumen sind in der Statistik schnell unterrepräsentiert. Der Check misst deshalb den Anteil der Produktion, der verschifft wird, nicht den Wertanteil.

## Offene Punkte der Wirtschaft

- Bevölkerungswachstum (die Einwohnerzahlen sind derzeit fest)
- Gebäude als Quelle von Produktion und Werkstattkapazität (siehe [stadtausbau.md](stadtausbau.md))
- Preise und Nachfrage in Abhängigkeit von Diplomatie (Embargos, Zölle, Lizenzen)
- Piraten und Konvois als Kostenfaktor für Handelsrouten

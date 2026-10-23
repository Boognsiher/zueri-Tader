# game/

Die spielbare Demo von Züri-Trade: Handel auf dem Zürichsee im Browser.

## Starten

Das Spiel lädt seine Zahlen aus `data/*.json` und braucht deshalb einen kleinen lokalen Webserver (als Datei per Doppelklick geöffnet, blockiert der Browser das Laden). Python genügt, sonst ist nichts zu installieren.

- **Windows:** `spielen.bat` im Hauptordner doppelklicken. Der Browser öffnet sich mit dem Spiel.
- **Von Hand:** im Hauptordner `python -m http.server 8000` starten und `http://localhost:8000/game/` öffnen.

## Was die Demo kann

- Seekarte des Zürichsees mit acht Seegemeinden von Zürich bis Schmerikon, Durchfahrt am Seedamm. Daneben Walensee, Hochrhein (bis Basel), Bodensee und Genfersee als weitere Zonen (siehe unten)
- Marktübersicht jeder Stadt in der Seitenleiste: Lager, Kauf- und Verkaufspreis, bestes Gebot in einer anderen Stadt. Grosse Mengen verschieben den Preis (Mengeneffekt).
- **Steuerung mit der Maus:** Klick auf den See, und das gewählte Schiff segelt dorthin (auch Kurswechsel unterwegs). Klick auf eine Stadt, und es legt dort an. Der Weg führt automatisch über Wasser, zum Obersee durch den Seedamm.
- **Kamera:** Ein Finger oder die Maus verschiebt die Karte, zwei Finger, Mausrad oder die Knöpfe +/− zoomen. Ein gewähltes Schiff wird zentriert und von der Kamera verfolgt (Knopf ◎), ⤢ zeigt den ganzen See, die Auswahl oben links springt zu einem anderen See.
- **Schiff abwählen** (nochmals anklicken, Esc oder Knopf «Abwählen»): Ein Klick auf eine Stadt hebt sie dann nur hervor und zeigt sie in der Marktübersicht, ohne dass ein Schiff losfährt. Der Knopf «Stadtfenster öffnen» zeigt Kontor, Betriebe und Werft. Liegt ein eigenes Schiff dort, lässt sich von hier aus mit ihm handeln.
- **Handelsfenster:** öffnet sich bei der Ankunft im Hafen (oder per Klick auf die Stadt, in der das Schiff liegt) und hält die Zeit an. Darin auch die Option, direkt zu einem anderen Hafen zu segeln, und der Schiffskauf.
- **Flotten:** Schiffe im selben Hafen zusammenlegen (Laderaum addiert, Tempo des langsamsten), im Hafen wieder auflösen
- **Schiffe:** Weidling (40 Laderaum, etwas schneller), Nauen (120), Ledischiff (250, langsamer). Neu in den Werften von Zürich, Wädenswil und Rapperswil, gebraucht als zufällige Angebote in irgendeiner Stadt, Verkauf zu 50 % des Neupreises (Reiter «Werft»)
- **Betriebe:** in jeder Stadt vorhandene Betriebe kaufen (wie Werkstätten in Bannerlord) oder auf freien Bauplätzen neue bauen. Sie arbeiten täglich, Gewinn oder Verlust geht an dich. Versorgung über den Markt (mit Handelsspanne) oder über das Kontor (ohne Spanne, Werkstätten brauchen nur 70 % der Zutaten): Eigene Ketten lohnen sich.
- **Kontor:** Lager in einer Stadt (Stufe 1-3, je 400 Plätze). Waren zwischen Schiff und Kontor umlagern, am Markt kaufen und verkaufen, auch ohne Schiff, und Handelsregeln pro Ware, nach denen das Kontor jeden Tag selbst handelt
- **Stufen und Stadtgebäude:** Betriebe bis Stufe 3 ausbauen. Markthalle (weniger Handelsspanne), Kirche (mehr Bauplätze), Zunfthaus (weniger Betriebsunterhalt)
- **Bevölkerung:** Städte wachsen, wenn sie zufrieden sind, bis zur Grenze ihres Wohnraums. Versorgungsgebäude: Brunnen und Spital (Zufriedenheit), Wohnhäuser (Wohnraum)
- **Kontor als Anwesenheit:** Mit einem Kontor geht in der Stadt alles wie mit einem Schiff im Hafen. Im Kontor lassen sich Tage Bedarf der eigenen Werkstätten sperren
- **Bilanz:** Einnahmen und Ausgaben nach Konten pro Monat und gesamt, Vermögen, Monatsergebnis (Knopf «Bilanz» oben)
- **Automatik pro Schiff:** Handelsroute mit Aufträgen (kaufen, verkaufen, Kontor laden und entladen, mit Preisgrenzen) oder freier Handel, bei dem der Kapitän selbst die besten Geschäfte sucht (auch mit gemischter Ladung), oder **Versorgen**: nur Städte wählen, das Schiff verteilt Kontor-Ware dorthin, wo deine Werkstätten sie brauchen. Lenkst du das Schiff von Hand, pausiert die Automatik, ▶ in der Flotte nimmt sie wieder auf. Laden und Löschen braucht Liegezeit (voller Laderaum rund 0,8 Tage).
- **Kapitäne:** in den Wirtshäusern anheuern (Reiter «Wirtshaus»), Stufen 1 bis 10 durch Erfahrung, bessere Fahrt, schnelleres Laden und Kampf, Lohn pro Tag. Sinkt das Schiff, ist der Kapitän Monate verschollen. Ein Schiff geht auch ohne Kapitän
- **Spielziel:** Rang des Handelshauses (Kleinhändler bis Herr des Sees) aus Vermögen und Ratssitzen. Ratssitze kauft man im Rathaus einer Stadt (Kontor nötig), sie senken Spanne und Zoll. Das Feld «Ansehen» zeigt Fortschritt und Spielzeit
- **Risiko:** Sturm, Havarie, Überfall und Rückenwind treffen Schiffe auf See, mildern lassen sie sich durch Kapitäne, Wachtschiffe als Geleit und eine Versicherung
- **Zoll und Verträge:** Verkäufe zahlen Zoll nach Stand und Ware, Handelsvertrag, Ratssitz und Ruf senken ihn, Krieg erhöht ihn
- **Seen und Verbindungen:** Zonen werden gegen Rang und Gebühr erschlossen (Feld «Seen»). Waren reisen zwischen den Seen von Kontor zu Kontor über Fluss, Fuhrweg oder Bahn (im Reiter «Kontor», Abschnitt «Verbindungen»), mit Fracht, Zoll und Laufzeit
- **Spielstand:** Speichern und Laden im Browser, automatisches Speichern jede Minute, Export und Import als Datei, «Weiterspielen» beim Start
- KI-Händler handeln mit (40 am Anfang, mehr mit wachsender Bevölkerung), als graue Punkte auf dem See sichtbar, aber nur in Sichtweite eigener Schiffe und Städte (`sichtweite` in `data/spiel.json`)
- Ereignisse (Missernte, Seuche, Chilbi, Föhnsturm) verändern Angebot und Nachfrage
- **Meldungen** in zwei Reitern: «Wichtig» (Ereignisse, Ankünfte, Warnungen, Käufe und Bauten) und «Handel» (Käufe und Verkäufe, Automatik, Kontore); ein Punkt zeigt Neues im anderen Reiter
- Echtzeit mit Pause in drei Tempostufen, Leertaste hält an, auf Wunsch Halt bei jeder Ankunft

- **Stände:** Jede Stadt gehört einem Stand (Zürich, Schwyz, Rapperswil, Glarus). Die Stände führen ab und zu Krieg gegeneinander. Im Reiter «Rathaus» gibt es dann Kaperbriefe: Prisengeld für versenkte Kriegsschiffe des Gegners, dafür sind dessen Häfen gesperrt. Ruf pro Stand (hoher Ruf: weniger Handelsspanne, tiefer Ruf: feindlich)
- **Kampf:** Kriegsschiffe (Wachtschiff, Kriegsnauen) in den Werften. Kampfhaltung pro Schiff: angreifen (fährt Gegner in der Nähe selbst an), verteidigen, ausweichen. Gefechte laufen von selbst, ein Gefechtsbericht zeigt das Ergebnis. Schäden werden im Hafen repariert

Noch nicht dabei: Spielziel, Verträge und Embargos, Folgen von Kriegen für die Wirtschaft (siehe `docs/roadmap.md`).

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Seite und Stil (Pergament und Seekarte, siehe `docs/optik.md`) |
| `src/daten.js` | lädt `data/*.json` |
| `src/wirtschaft.js` | Wirtschaftsmodell: Preise, Städte, KI-Händler, Ereignisse. Entspricht `tools/sim/wirtschaft_sim.py` |
| `src/spiel.js` | Spielerzustand: Geld, Schiffe, Fahrten, Handel, Kalender |
| `src/navigation.js` | Wegsuche über Wasser für die frei gesteuerten Schiffe |
| `src/betriebe.js` | Kontore und Betriebe (Stadtausbau) |
| `src/automatik.js` | automatischer Handel: Handelsroute, Versorgen, freier Handel |
| `src/speicher.js` | Spielstand speichern und laden |
| `src/routenfenster.js` | Fenster zum Einrichten der Automatik |
| `src/werft.js` | Bootshandel: neue und gebrauchte Schiffe, Verkauf |
| `src/diplomatie.js` | Stände: Krieg und Frieden, Ruf, Kaperbriefe |
| `src/kampf.js` | Kriegsschiffe der Stände, Kampfhaltungen, Gefechte |
| `src/bilanz.js` | Buchhaltung für die Bilanz |
| `src/karte.js` | Seekarte als SVG |
| `src/kapitaene.js` | Kapitäne: Wirtshaus, Stufen, Lohn, verschollen |
| `src/ziel.js` | Spielziel: Rang und Ratssitze |
| `src/risiko.js` | Sturm, Havarie, Überfall, Rückenwind, Versicherung |
| `src/zoll.js` | Zoll und Handelsverträge |
| `src/zonen.js` | Zonen, Erschliessen, Verbindungen, Fracht, Bahn |
| `src/kamera.js` | Kamera der Karte: Verschieben, Zoomen, Schiff verfolgen |
| `src/oberflaeche.js` | Seitenleiste (Flotte, Besitz, Stände, Marktübersicht), Handelsfenster mit den Reitern Markt, Kontor, Betriebe, Werft, Rathaus, Gefechtsbericht, Meldungen |
| `src/main.js` | Einstieg, Zeitsteuerung, Menü Spielstand |
| `src/zufall.js` | reproduzierbarer Zufallsgenerator |
| `test/wirtschaft_test.mjs` | Test ohne Browser (`node game/test/wirtschaft_test.mjs`) |

Reines JavaScript (ES-Module), ohne Build-Schritt und ohne Pakete. Wirtschaft und Spielerzustand greifen nicht auf das DOM zu und laufen deshalb auch unter Node.

## Regeln für Änderungen

- Zahlen gehören nach `data/`. Startwerte und Tempo der Demo stehen in `data/spiel.json`, die Karte in `data/karte.json`, Schiffstypen, Kampfwerte und Bootshandel in `data/schiffe.json`, Stände und Kriege in `data/fraktionen.json`.
- Die Schiffe des Spielers fahren stufenlos und frei, die KI-Händler in ganzen Tagen auf festen Wegen wie in der Simulation.
- `src/wirtschaft.js` und `tools/sim/wirtschaft_sim.py` müssen dieselbe Logik haben. Wer eine Seite ändert, ändert die andere mit und lässt beide Tests laufen. Der Spieltest prüft dieselben Balance-Checks wie die Simulation.

## Engine

Für die Demo ist ein Web-Spiel gewählt (siehe `docs/entscheidungen.md`): läuft ohne Installation, lässt sich mit Node automatisch testen und teilt die Daten direkt mit der Simulation. Godot 4 bleibt eine Option für später, falls eine 3D-Stadtansicht kommt. Die Daten in `data/` und das Referenzmodell in `tools/sim/` wären dann weiter nutzbar.

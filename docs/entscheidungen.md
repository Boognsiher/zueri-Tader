# Entscheidungen

Protokoll aller Entscheidungen und offenen Fragen. Neue Entscheidungen oben bei "Entschieden" ergänzen, mit Datum und Begründung.

## Entschieden

| Datum | Entscheidung | Begründung |
|---|---|---|
| 22.10.2026 | Erste Demo als Web-Spiel in reinem JavaScript (ohne Build-Schritt), Start über einen lokalen Python-Webserver | Der Projektinhaber wollte eine spielbare Demo. Web läuft ohne Installation, lässt sich mit Node automatisch gegen die Balance-Checks testen und liest `data/*.json` direkt. Godot bleibt für später möglich (siehe `game/README.md`) |
| 22.10.2026 | Fahrten zwischen Untersee und Obersee führen über den Seedamm (`data/karte.json`), in Simulation und Spiel | Sonst würden Schiffe auf der Karte über Land fahren. Die Fahrzeiten änderten sich kaum, alle Checks bestehen |
| 22.10.2026 | Setting: Zürichsee im 17. Jahrhundert statt Karibik. 8 Seegemeinden von Zürich bis Schmerikon, Lastschiffe (Nauen, Ledischiffe), Währung Gulden | Vom Projektinhaber entschieden, passt zum Titel "Züri-Trade". Die Waren wurden eins zu eins übertragen (gleiche Preise und Mengen), damit die getestete Balance erhalten bleibt. Annahme: Das Jahrhundert bleibt, weil Konzept und Waren darauf aufbauen |
| 22.10.2026 | Ereignisse stehen in `data/events.json` statt im Code | Nach einer Umbenennung der Waren hätten fest eingetragene Namen still nichts mehr bewirkt |
| 22.10.2026 | Hobbyprojekt, das die Spielidee der Port-Royale-Reihe weiterentwickelt | Eigenes Spiel ist realistischer als Modifikationen des geschlossenen Originals |
| 22.10.2026 | Schwerpunkte: Handel, Management, Diplomatie. Kampf bleibt klein | Persönliche Gewichtung, Kampf nur als Würze |
| 22.10.2026 | Kampf mit statischer Ansicht, keine 3D-Schlachten | Spart den grössten Entwicklungsaufwand |
| 22.10.2026 | 2D-Karte mit Städten als Knoten und Seewegen | Passt zu einem Managementspiel, spart Aufwand |
| 22.10.2026 | Stadtausbau als Slot-System | Schnell testbar, später auf Raster erweiterbar |
| 22.10.2026 | Bauen nur in freigeschalteten Städten, keine eigenen Siedlungen am Anfang | Einfacher Start, Tiefe später |
| 22.10.2026 | Eine Zufriedenheitszahl pro Stadt statt Bevölkerungsschichten | Einfacher Start, Tiefe später |
| 22.10.2026 | Datengetriebenes Design: Zahlen in `data/*.json`, nicht im Code | Balance ohne Programmieren, Simulation und Spiel teilen die Daten |
| 22.10.2026 | Wirtschaft zuerst als Python-Simulation ohne Grafik testen | Spielspass im Kern beweisen, bevor Oberfläche und Inhalt folgen |
| 22.10.2026 | Entwicklung auf GitHub, Weiterarbeit mit Claude Code | Versionierung, Dokumentation und Tests an einem Ort |
| 22.10.2026 | Arbeitstitel "Züri-Trade" | Vom Projektinhaber gewählt, Titel ist änderbar |
| 22.10.2026 | Standardwerte der Simulation: Zielbestand 30/20 Tage, 45 Schiffe, k = 0.7 | Erfüllt alle Balance-Checks, siehe `docs/wirtschaft.md` |
| 22.10.2026 | Grafikansatz orientiert sich an Port Royale 3 (alter Look: 2D-Karte, später optional 3D-Stadtansicht), bewusst vereinfacht und poliert. Keine Übernahme von Originalbildern | Gleiche Grafik ist nicht erreichbar und nicht nötig. Ein stimmiger Stil reicht, und das Repo bleibt rechtlich sauber. Siehe `docs/optik.md` |
| 22.10.2026 | Unreal Engine 5 geprüft, nicht empfohlen | Für ein oberflächenlastiges Verwaltungsspiel unnötig aufwändig, Projekte bestehen weitgehend aus Binärdateien (schlecht für Git und Claude Code). Siehe `game/README.md` |

## Empfehlung, noch nicht bestätigt

| Thema | Empfehlung |
|---|---|
| Zeitmodell | Echtzeit mit Pause, intern in festen Tagen gerechnet. Fühlt sich lebendig an und bleibt testbar. Alternative: rundenbasiert (einfacher zu bauen). So in der Demo umgesetzt (drei Tempostufen, Halt bei Ankunft), Bestätigung nach dem Ausprobieren. |
| Umfang | 15-25 Städte, 10-15 Waren |
| Preisformel | `Basispreis × (Zielbestand / Lagerbestand)^k`, siehe `docs/wirtschaft.md` |

## Offen

- **Engine langfristig:** Die Demo läuft im Browser. Ob das so bleibt oder später Godot 4 kommt (z. B. für eine 3D-Stadtansicht), ist offen.
- **Spielziel:** Reichtum, Titel, Monopole oder eine Kombination
- **Einzelspieler oder Mehrspieler:** bisher Einzelspieler angenommen
- **Diplomatie:** Umfang und Tiefe, siehe `docs/diplomatie.md`
- **Städte freischalten:** wie und wodurch
- **Lizenz des Repos:** noch nicht festgelegt
- **Grafik im Detail:** Richtung ist festgelegt (siehe oben). Offen sind der genaue Oberflächenstil (Pergament, Seekarte, Kontor) und ob die Stadtansicht 2D oder später 3D wird, siehe `docs/optik.md`

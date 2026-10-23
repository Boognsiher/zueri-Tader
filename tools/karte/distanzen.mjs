// Berechnet die Weglänge über Wasser zwischen allen Städten und schreibt sie nach
// data/karte.json (Feld "distanzen"). Simulation und KI-Händler rechnen damit.
// Nach jeder Änderung an Ufern, Durchfahrten oder Stadtpositionen neu ausführen:
//
//   node tools/karte/distanzen.mjs
//
// Die Wegsuche ist dieselbe wie für die Schiffe des Spielers (game/src/navigation.js).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ladeDaten } from "../../game/src/daten.js";
import { Navigation, weglaenge } from "../../game/src/navigation.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const D = await ladeDaten(async (datei) => JSON.parse(await readFile(path.join(DATA, datei), "utf-8")));
const nav = new Navigation(D);

const distanzen = {};
let fehler = 0;
for (const [i, a] of D.staedte.entries()) {
  if (!nav.imWasser(a.pos)) {
    console.log(`!! ${a.name} liegt nicht im Wasser (${a.pos})`);
    fehler++;
  }
  for (const b of D.staedte.slice(i + 1)) {
    if (b.zone !== a.zone) continue; // zwischen Zonen gibt es keinen Wasserweg
    const w = nav.route(a.pos, b.pos);
    if (!w) {
      console.log(`!! kein Weg ${a.name} -> ${b.name}`);
      fehler++;
      continue;
    }
    distanzen[`${a.name}|${b.name}`] = Math.round(weglaenge(w) * 100) / 100;
  }
}
if (fehler) process.exit(1);

const datei = path.join(DATA, "karte.json");
const karte = JSON.parse(await readFile(datei, "utf-8"));
karte.distanzen = distanzen;
// Kompakt schreiben: innerste Listen und Objekte auf einer Zeile
let text = JSON.stringify(karte, null, 2);
for (let alt = ""; alt !== text; ) {
  alt = text;
  text = text.replace(/([[{])\s*\n\s*([^[\]{}]*?)\s*\n\s*([\]}])/g, (_, a, inhalt, z) => a + inhalt.replace(/,\s*\n\s*/g, ", ") + z);
}
await writeFile(datei, text + "\n", "utf-8");
const werte = Object.values(distanzen);
console.log(`${werte.length} Distanzen geschrieben, Mittel ${(werte.reduce((x, y) => x + y, 0) / werte.length).toFixed(3)}`);

// Misst, wie lange ein Spieltag (spiel.tagVoran) dauert, aufgeteilt nach Teilsystemen.
// Aufruf: node tools/sim/zeitsprung_mess.mjs [tage]
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ladeDaten } from "../../game/src/daten.js";
import { Spiel } from "../../game/src/spiel.js";
import { starteFrei } from "../../game/src/automatik.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const D = await ladeDaten(async (datei) => JSON.parse(await readFile(path.join(DATA, datei), "utf-8")));
const tage = Number(process.argv[2] ?? 365);

const spiel = new Spiel(D, 1);
spiel.gulden = 100000;
for (const s of spiel.schiffe) starteFrei(spiel, s, 5000);

// Teilsysteme umhüllen und Zeit sammeln
const zeit = {};
const huelle = (obj, name, label) => {
  const f = obj[name].bind(obj);
  obj[name] = (...a) => {
    const t = performance.now();
    try {
      return f(...a);
    } finally {
      zeit[label] = (zeit[label] ?? 0) + performance.now() - t;
    }
  };
};
huelle(spiel.welt, "naechsterTag", "welt");
for (const n of ["ausbau", "werft", "diplomatie", "kapitaene", "ziel", "risiko", "zoll", "zonen"]) huelle(spiel[n], "tag", n);
huelle(spiel.kampf, "tag", "kampf.tag");
huelle(spiel.kampf, "schritt", "kampf.schritt");
huelle(spiel, "pruefeAnkuenfte", "ankuenfte");

const start = performance.now();
for (let t = 0; t < tage; t++) spiel.tagVoran();
const gesamt = performance.now() - start;
console.log(`${tage} Tage in ${(gesamt / 1000).toFixed(1)} s, ${(gesamt / tage).toFixed(1)} ms pro Tag`);
for (const [k, v] of Object.entries(zeit).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${(v / tage).toFixed(2)} ms/Tag`);

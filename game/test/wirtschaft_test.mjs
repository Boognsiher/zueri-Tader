// Prüft das Wirtschaftsmodell des Spiels ohne Browser.
// Aufruf aus dem Repo-Hauptordner:  node game/test/wirtschaft_test.mjs
//
// 1. Die Wirtschaft des Spiels (ohne Spieler) besteht dieselben Balance-Checks wie
//    tools/sim/wirtschaft_sim.py. So fällt auf, wenn Spiel und Simulation auseinanderlaufen.
// 2. Handel des Spielers: kein Gewinn durch Hin-und-her-Handeln, Laderaum und Geld begrenzen.
// 3. Karte: Jeder Seeweg führt über Wasser.
//
// Exit-Code 0 = alles bestanden, 1 = mindestens ein Check durchgefallen.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ladeDaten } from "../src/daten.js";
import { Welt, neueStatistik, weg } from "../src/wirtschaft.js";
import { Spiel } from "../src/spiel.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const D = await ladeDaten(async (datei) => JSON.parse(await readFile(path.join(DATA, datei), "utf-8")));

let fehler = 0;
function pruefe(text, ok) {
  console.log(`${ok ? "OK " : "!! "}${text}`);
  if (!ok) fehler++;
}

// --- 1. Balance wie in der Simulation ------------------------------------
const TAGE = 720;
for (const seed of [1, 2, 3]) {
  const welt = new Welt(D, seed);
  const st = neueStatistik();
  welt.st = st;
  let geld0 = 0;
  let preisRand = 0;
  let preisPunkte = 0;
  for (let t = 0; t < TAGE; t++) {
    st.an = t >= D.p.WARMUP;
    if (t === D.p.WARMUP) geld0 = welt.haendler.reduce((a, h) => a + h.geld, 0);
    welt.naechsterTag();
    if (st.an) {
      for (const s of welt.staedte) {
        for (const g of Object.keys(s.bestand)) {
          const r = s.mittelpreis(g) / D.waren[g];
          preisPunkte++;
          if (r >= D.p.PRICE_MAX - 0.01 || r <= D.p.PRICE_MIN + 0.01) preisRand++;
        }
      }
    }
  }
  const tage = TAGE - D.p.WARMUP;
  const rendite = st.touren.reduce((a, t) => a + t.rendite, 0) / st.touren.length;
  const proSchiffTag = (welt.haendler.reduce((a, h) => a + h.geld, 0) - geld0) / welt.haendler.length / tage;
  const amortisation = D.p.SHIP_COST / proSchiffTag;
  const routen = {};
  for (const t of st.touren) routen[t.route] = (routen[t.route] || 0) + 1;
  const spitze = (100 * Math.max(...Object.values(routen))) / st.touren.length;
  const produziert = Object.values(st.produziert).reduce((a, b) => a + b, 0);
  const verderb = (100 * Object.values(st.verdorben).reduce((a, b) => a + b, 0)) / produziert;
  const rand = (100 * preisRand) / preisPunkte;
  const zufriedenheit = welt.staedte.reduce((a, s) => a + s.zufriedenheit, 0) / welt.staedte.length;

  console.log(`\nSeed ${seed}: ${st.touren.length} Touren`);
  pruefe(`Mittlere Tourrendite ${(100 * rendite).toFixed(0)}% (Ziel 10-30%)`, rendite >= 0.1 && rendite <= 0.3);
  pruefe(`Schiff amortisiert sich in ${amortisation.toFixed(0)} Tagen (Ziel 30-300)`, amortisation >= 30 && amortisation <= 300);
  pruefe(`Häufigste Route ${spitze.toFixed(1)}% der Touren (Ziel <= 12%)`, spitze <= 12);
  pruefe(`Verderb ${verderb.toFixed(1)}% der Produktion (Ziel <= 8%)`, verderb <= 8);
  pruefe(`Preise am Deckel/Boden ${rand.toFixed(1)}% der Stadt-Tage (Ziel <= 20%)`, rand <= 20);
  pruefe(`Zufriedenheit am Ende ${zufriedenheit.toFixed(0)} (Ziel >= 55)`, zufriedenheit >= 55);
}

// --- 2. Handel des Spielers -----------------------------------------------
console.log("\nHandel des Spielers");
{
  const spiel = new Spiel(D, 7);
  const schiff = spiel.schiffe[0];
  const g = Object.keys(schiff.ort.bestand)[0];
  const geld0 = spiel.gulden;
  const bestand0 = schiff.ort.bestand[g];
  const kauf = spiel.kaufen(schiff, g, 30);
  pruefe(`Kauf von ${kauf.menge} ${g} senkt das Lager um genau diese Menge`, Math.abs(schiff.ort.bestand[g] - (bestand0 - kauf.menge)) < 1e-9);
  const verkauf = spiel.verkaufen(schiff, g, kauf.menge);
  pruefe(`Sofortiger Rückverkauf bringt Verlust (${(verkauf.betrag - kauf.betrag).toFixed(0)} Gulden)`, spiel.gulden < geld0);
  pruefe("Lager ist danach wieder auf dem Ausgangswert", Math.abs(schiff.ort.bestand[g] - bestand0) < 1e-9);

  const viel = spiel.kaufen(schiff, "Korn", 10000);
  pruefe(`Laderaum begrenzt den Kauf (${viel.menge} von höchstens ${D.p.SHIP_CAP})`, spiel.ladungsmenge(schiff) <= D.p.SHIP_CAP);
  spiel.verkaufen(schiff, "Korn", 10000);

  spiel.gulden = 100;
  const arm = spiel.kaufen(schiff, "Korn", 50);
  pruefe(`Geld begrenzt den Kauf (${arm.menge} Korn für ${arm.betrag.toFixed(0)} von 100 Gulden)`, arm.menge > 0 && arm.menge < 50 && spiel.gulden >= 0);
  spiel.gulden = 12000;

  const ziel = spiel.welt.staedte.find((s) => s !== schiff.ort && !s.gesperrt(spiel.welt.tag));
  pruefe("Ablegen klappt", spiel.ablegen(schiff, ziel));
  pruefe("Unterwegs ist kein Handel möglich", spiel.kaufen(schiff, "Korn", 10).menge === 0);
  const ankunft = schiff.ankunft;
  while (spiel.welt.tag < ankunft) spiel.tagVoran();
  pruefe(`Schiff kommt am geplanten Tag in ${ziel.name} an`, schiff.ort === ziel && !schiff.ziel);
}

// --- 3. Karte: Seewege über Wasser ----------------------------------------
console.log("\nKarte");
{
  const welt = new Welt(D, 1);
  function imUfer([x, y], ufer) {
    let drin = false;
    for (let i = 0, j = ufer.length - 1; i < ufer.length; j = i++) {
      const [x1, y1] = ufer[i];
      const [x2, y2] = ufer[j];
      if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) drin = !drin;
    }
    return drin;
  }
  function imWasser(p) {
    return Object.values(D.karte.seeteile).some((t) => imUfer(p, t.ufer));
  }
  let ueberLand = 0;
  for (const a of welt.staedte) {
    for (const b of welt.staedte) {
      if (a === b) continue;
      const punkte = weg(D, a, b);
      for (let i = 1; i < punkte.length; i++) {
        for (let s = 0; s <= 50; s++) {
          const p = [punkte[i - 1][0] + ((punkte[i][0] - punkte[i - 1][0]) * s) / 50, punkte[i - 1][1] + ((punkte[i][1] - punkte[i - 1][1]) * s) / 50];
          if (!imWasser(p)) {
            ueberLand++;
            console.log(`   über Land: ${a.name} -> ${b.name} bei ${p.map((v) => v.toFixed(1))}`);
            break;
          }
        }
      }
      if (welt.fahrtage(a, b) !== welt.fahrtage(b, a)) ueberLand++;
    }
  }
  pruefe("Alle Seewege führen über Wasser und sind in beide Richtungen gleich lang", ueberLand === 0);
}

console.log(fehler ? `\n${fehler} Check(s) durchgefallen` : "\nAlle Checks bestanden");
process.exit(fehler ? 1 : 0);

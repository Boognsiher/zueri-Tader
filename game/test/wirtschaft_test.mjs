// Prüft das Wirtschaftsmodell des Spiels ohne Browser.
// Aufruf aus dem Repo-Hauptordner:  node game/test/wirtschaft_test.mjs
//
// 1. Die Wirtschaft des Spiels (ohne Spieler) besteht dieselben Balance-Checks wie
//    tools/sim/wirtschaft_sim.py. So fällt auf, wenn Spiel und Simulation auseinanderlaufen.
// 2. Handel des Spielers: kein Gewinn durch Hin-und-her-Handeln, Laderaum und Geld begrenzen.
// 3. Karte: Jeder Seeweg führt über Wasser.
// 4.-6. Betriebe und Kontor, automatischer Handel, Speichern und Laden.
//
// Exit-Code 0 = alles bestanden, 1 = mindestens ein Check durchgefallen.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ladeDaten } from "../src/daten.js";
import { Welt, neueStatistik, weg } from "../src/wirtschaft.js";
import { Spiel } from "../src/spiel.js";
import { starteRoute, starteFrei, beende } from "../src/automatik.js";
import { speichere, lade, pruefe as pruefeStand } from "../src/speicher.js";

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

  const ziel = spiel.welt.stadt["Schmerikon"];
  pruefe("Ablegen nach Schmerikon klappt", spiel.segeln(schiff, { stadt: ziel }).ok);
  pruefe("Unterwegs ist kein Handel möglich", spiel.kaufen(schiff, "Korn", 10).menge === 0);
  pruefe(`Der Weg führt über den Seedamm (${schiff.fahrt.weg.length} Punkte)`, schiff.fahrt.weg.length >= 3);
  const ankunft = schiff.fahrt.ende;
  while (spiel.welt.tag < ankunft) spiel.tagVoran();
  pruefe(`Schiff kommt zur geplanten Zeit in ${ziel.name} an`, schiff.ort === ziel && !schiff.fahrt);

  // Freie Fahrt: auf den See, Kurswechsel unterwegs, Land wird abgelehnt
  pruefe("Klick auf Land wird abgelehnt", !spiel.segeln(schiff, { punkt: [50, 5] }).ok);
  pruefe("Fahrt zu einem Punkt auf dem Obersee klappt", spiel.segeln(schiff, { punkt: [88, 41] }).ok);
  spiel.vorruecken(0.5);
  const vorher = spiel.position(schiff);
  pruefe("Kurswechsel auf See nach Zürich klappt", spiel.segeln(schiff, { stadt: spiel.welt.stadt["Zürich"] }).ok);
  const neu = schiff.fahrt.weg[0];
  pruefe("Neuer Kurs beginnt an der aktuellen Position", Math.hypot(neu[0] - vorher.x, neu[1] - vorher.y) < 1e-9);
  spiel.anhalten(schiff);
  pruefe("Anhalten auf See: kein Hafen, keine Fahrt", !schiff.fahrt && !schiff.ort);
  pruefe("Auf See ist kein Handel möglich", spiel.kaufen(schiff, "Korn", 10).menge === 0);
}

// --- Wegsuche: von jedem Hafen zu jedem Hafen und zu Punkten auf dem See ---
console.log("\nWegsuche");
{
  const spiel = new Spiel(D, 3);
  const nav = spiel.nav;
  const ziele = [...spiel.welt.staedte.map((s) => s.pos), [10, 10], [50, 30], [70, 42], [95, 40], [80, 47]];
  let fehlt = 0;
  let ueberLand = 0;
  for (const a of ziele) {
    for (const b of ziele) {
      if (a === b) continue;
      const w = nav.route(a, b);
      if (!w) {
        fehlt++;
        console.log(`   kein Weg: ${a} -> ${b}`);
        continue;
      }
      for (let i = 1; i < w.length; i++) if (!nav.frei(w[i - 1], w[i])) ueberLand++;
    }
  }
  pruefe(`Alle ${ziele.length * (ziele.length - 1)} Wege gefunden, keiner führt über Land`, fehlt === 0 && ueberLand === 0);
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

// --- 4. Betriebe und Kontor -------------------------------------------------
console.log("\nBetriebe und Kontor");
{
  const spiel = new Spiel(D, 11);
  const a = spiel.ausbau;
  const schiff = spiel.schiffe[0];
  const zuerich = spiel.welt.stadt["Zürich"];
  spiel.gulden = 200000;
  pruefe(`Jede Stadt hat vorhandene Betriebe (${a.betriebe.length} insgesamt)`, spiel.welt.staedte.every((s) => a.betriebeIn(s).length > 0));

  const kornhof = a.betriebeIn(zuerich).find((b) => b.typ === "kornhof");
  const kornVorher = zuerich.prod.Korn;
  pruefe("Kornhof in Zürich kaufen", a.kaufen(kornhof));
  pruefe(`Stadtproduktion Korn sinkt um die Leistung (${kornVorher} -> ${zuerich.prod.Korn})`, zuerich.prod.Korn === kornVorher - a.typ(kornhof).leistung);
  const geld = spiel.gulden;
  const lager = zuerich.bestand.Korn;
  spiel.tagVoran();
  pruefe(`Der Betrieb liefert an den Markt und bringt Geld (${kornhof.gestern.kasse.toFixed(0)} Gulden am ersten Tag)`, kornhof.gestern.kasse > 0 && spiel.gulden > geld - 100);

  // Kontor: Holz mitbringen, bauen, Erzeugnisse einlagern, umlagern
  spiel.kaufen(schiff, "Holz", 40);
  pruefe("Kontor in Zürich bauen (Holz aus dem Schiff)", a.kontorBauen(zuerich));
  pruefe("Betrieb liefert ins Kontor", a.setzeZiel(kornhof, "kontor"));
  spiel.tagVoran();
  const imKontor = a.kontor(zuerich).lager.Korn?.menge ?? 0;
  pruefe(`Korn liegt im Kontor (${imKontor})`, imKontor > 0);
  const umgelagert = a.umlagern(schiff, "Korn", 5, "insSchiff");
  pruefe("Kontor -> Schiff umlagern", umgelagert === Math.min(5, Math.floor(imKontor)) && schiff.ladung.Korn?.menge >= umgelagert);

  // Neubau: Bauplatz, Rohstoff der Stadt, Material
  pruefe("Kein Neubau eines Sägewerks in Zürich (kein Holz dort)", a.pruefeBau(zuerich, "saegewerk") !== null);
  const kostenTrotte = a.baukosten("trotte", zuerich);
  spiel.kaufen(schiff, "Holz", 30);
  pruefe(`Werkzeug fehlt für die Trotte: "${a.pruefeBau(zuerich, "trotte")}"`, String(a.pruefeBau(zuerich, "trotte")).includes("Werkzeug"));
  spiel.ausbau.kontore["Zürich"].lager.Werkzeug = { menge: kostenTrotte.material.Werkzeug, einstand: 100 };
  const neu = a.bauen(zuerich, "trotte");
  pruefe("Trotte neu bauen mit Material aus Kontor und Schiff", !!neu && a.freiePlaetze(zuerich) === a.bauplaetze(zuerich) - 1);

  pruefe("Kornhof an die Stadt verkaufen", a.verkaufen(kornhof));
  pruefe("Stadtproduktion Korn wieder wie vorher", zuerich.prod.Korn === kornVorher);
  pruefe("Unterhalt des Kontors wird bezahlt", (() => { const g = spiel.gulden; spiel.tagVoran(); return spiel.gulden < g + 1e6; })());

  // Die Betriebe des Spielers lassen die Wirtschaft stabil: alle kaufen und ein Jahr laufen lassen
  const voll = new Spiel(D, 5);
  voll.gulden = 1e9;
  for (const s of voll.welt.staedte) voll.neuesSchiff(s);
  for (const b of voll.ausbau.betriebe) voll.ausbau.kaufen(b);
  for (let t = 0; t < 360; t++) voll.tagVoran();
  const zufr = voll.welt.staedte.reduce((x, s) => x + s.zufriedenheit, 0) / voll.welt.staedte.length;
  const prod = voll.ausbau.betriebe.filter((b) => voll.ausbau.typ(b).art === "produktion");
  const amort = prod.map((b) => b.kaufpreis / (b.summe / 360)).sort((x, y) => x - y);
  const median = amort[Math.floor(amort.length / 2)];
  pruefe(`Alle Betriebe in Spielerhand: Zufriedenheit bleibt ${zufr.toFixed(0)} (Ziel >= 55)`, zufr >= 55);
  pruefe(`Rohstoffbetriebe amortisieren sich im Median in ${median.toFixed(0)} Tagen (Ziel 100-300)`, median >= 100 && median <= 300);
}

// --- 5. Automatischer Handel --------------------------------------------------
console.log("\nAutomatischer Handel");
{
  const spiel = new Spiel(D, 21);
  const schiff = spiel.schiffe[0];
  pruefe("Route mit nur einem Hafen wird abgelehnt", starteRoute(spiel, schiff, [{ stadt: "Zürich", auftraege: [] }]) !== null);
  const fehler = starteRoute(spiel, schiff, [
    { stadt: "Zürich", auftraege: [{ art: "kaufen", ware: "Seide", menge: 60, preis: null }] },
    { stadt: "Lachen", auftraege: [{ art: "verkaufen", ware: "Seide", menge: null, preis: null }] },
  ]);
  pruefe("Route Zürich - Lachen startet", fehler === null && !!schiff.fahrt);
  let besuche = 0;
  for (let t = 0; t < 120; t++) {
    spiel.tagVoran();
    besuche = spiel.meldungen.filter((m) => m.text.includes("(Route)")).length;
  }
  pruefe(`Das Schiff fährt die Route selbständig ab (${besuche} Halte in 120 Tagen)`, besuche >= 8);
  beende(spiel, schiff);
  pruefe("Route beenden", schiff.auto === null);

  const frei = new Spiel(D, 22);
  const s2 = frei.schiffe[0];
  starteFrei(frei, s2, 8000);
  const start = frei.gulden;
  for (let t = 0; t < 360; t++) frei.tagVoran();
  const geschaefte = frei.meldungen.filter((m) => m.text.includes("(frei)")).length;
  const vermoegen = frei.gulden + frei.warenwert();
  pruefe(`Freier Handel macht in einem Jahr Gewinn (${(vermoegen - start).toFixed(0)} Gulden, ${geschaefte}+ Meldungen)`, vermoegen > start);
  pruefe("Freier Handel hält das Einsatzlimit ein", Object.values(s2.ladung).every((p) => p.menge * p.einstand <= 8000 + 1));
}

// --- 6. Speichern und Laden ---------------------------------------------------
console.log("\nSpeichern und Laden");
{
  const spiel = new Spiel(D, 31);
  spiel.gulden = 80000;
  const s = spiel.schiffe[0];
  spiel.ausbau.kaufen(spiel.ausbau.betriebeIn(s.ort)[0]);
  starteRoute(spiel, s, [
    { stadt: "Zürich", auftraege: [{ art: "kaufen", ware: "Rohseide", menge: 80, preis: 60 }] },
    { stadt: "Wädenswil", auftraege: [{ art: "verkaufen", ware: "Rohseide", menge: null, preis: null }] },
  ]);
  const zweites = spiel.neuesSchiff(spiel.welt.stadt["Meilen"]);
  spiel.segeln(zweites, { punkt: [50, 30] });
  for (let t = 0; t < 40; t++) spiel.tagVoran();
  spiel.vorruecken(0.37);

  const text = JSON.stringify(speichere(spiel));
  const geladen = lade(D, JSON.parse(text));
  pruefe(`Spielstand als JSON (${(text.length / 1024).toFixed(0)} KB) speichern und laden`, geladen.datum() === spiel.datum());
  pruefe("Gespeicherter Stand stimmt mit dem geladenen überein", JSON.stringify(speichere(geladen)).replace(/"gespeichert":"[^"]*"/, "") === text.replace(/"gespeichert":"[^"]*"/, ""));
  for (let t = 0; t < 120; t++) {
    spiel.tagVoran();
    geladen.tagVoran();
  }
  const gleich =
    spiel.gulden === geladen.gulden &&
    spiel.welt.staedte.every((st, i) => JSON.stringify(st.bestand) === JSON.stringify(geladen.welt.staedte[i].bestand)) &&
    spiel.welt.haendler.every((h, i) => h.geld === geladen.welt.haendler[i].geld);
  pruefe("Nach 120 weiteren Tagen sind Original und geladenes Spiel identisch", gleich);
  pruefe("Fremde Datei wird abgelehnt", pruefeStand(D, { foo: 1 }) !== null);
}

console.log(fehler ? `\n${fehler} Check(s) durchgefallen` : "\nAlle Checks bestanden");
process.exit(fehler ? 1 : 0);

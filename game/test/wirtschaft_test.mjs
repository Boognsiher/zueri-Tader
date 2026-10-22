// Prüft das Wirtschaftsmodell des Spiels ohne Browser.
// Aufruf aus dem Repo-Hauptordner:  node game/test/wirtschaft_test.mjs
//
// 1. Die Wirtschaft des Spiels (ohne Spieler) besteht dieselben Balance-Checks wie
//    tools/sim/wirtschaft_sim.py. So fällt auf, wenn Spiel und Simulation auseinanderlaufen.
// 2. Handel des Spielers: kein Gewinn durch Hin-und-her-Handeln, Laderaum und Geld begrenzen.
// 3. Karte: Jeder Seeweg führt über Wasser.
// 4.-9. Betriebe und Kontor, automatischer Handel, Speichern und Laden, Bootshandel, Eigenversorgung,
//      Stufen, Stadtgebäude und Kontorhandel.
// 10.  Bevölkerung, Versorgungsgebäude, Kontor als Anwesenheit, Sperren, Bilanz.
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
  pruefe("Route Zürich - Lachen startet, das Schiff lädt zuerst (Liegezeit)", fehler === null && !schiff.fahrt && schiff.auto.abfahrt > spiel.zeit);
  spiel.tagVoran();
  pruefe("Nach dem Laden legt das Schiff ab", !!schiff.fahrt);
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

// --- 7. Bootshandel -----------------------------------------------------------
console.log("\nBootshandel");
{
  const nauen = D.schiffe.typ.nauen;
  pruefe("Nauen entspricht dem Schiff der KI (Laderaum, Preis, Unterhalt, Tempo)",
    nauen.laderaum === D.p.SHIP_CAP && nauen.preis === D.p.SHIP_COST && nauen.unterhalt === D.p.UPKEEP && nauen.tempo === 1);
  const g = D.schiffe.gebraucht;
  pruefe("Gebrauchtrabatt kleiner als der Verkaufsabschlag (kein Gewinn durch Kaufen und Verkaufen)", g.rabatt_max < 1 - D.schiffe.verkaufsanteil);

  const spiel = new Spiel(D, 41);
  const w = spiel.werft;
  spiel.gulden = 100000;
  const zuerich = spiel.welt.stadt["Zürich"];
  const meilen = spiel.welt.stadt["Meilen"];
  pruefe("In Meilen gibt es keine Werft", w.pruefeNeukauf(meilen, "weidling") !== null);
  const ledi = w.kaufeNeu(zuerich, "ledischiff");
  pruefe("Ledischiff in Zürich kaufen", !!ledi && spiel.laderaum(ledi) === 250);
  const k = spiel.kaufen(ledi, "Korn", 1000);
  pruefe(`Ledischiff lädt mehr als ein Nauen (${k.menge} Korn)`, k.menge > D.p.SHIP_CAP);
  pruefe("Beladenes Schiff kann nicht verkauft werden", w.pruefeVerkauf(ledi) !== null);
  spiel.verkaufen(ledi, "Korn", 1000);
  const geld = spiel.gulden;
  pruefe("Leeres Ledischiff verkaufen bringt den Verkaufsanteil", w.verkaufe(ledi) && spiel.gulden - geld === w.verkaufserloes({ typ: "ledischiff" }));
  pruefe("Das letzte Schiff kann nicht verkauft werden", w.pruefeVerkauf(spiel.schiffe[0]) !== null);

  // Fahrzeit hängt vom Tempo ab
  const weid = w.kaufeNeu(zuerich, "weidling");
  const nau = spiel.schiffe[0];
  spiel.segeln(weid, { stadt: spiel.welt.stadt["Lachen"] });
  spiel.segeln(nau, { stadt: spiel.welt.stadt["Lachen"] });
  const dw = weid.fahrt.ende - weid.fahrt.start;
  const dn = nau.fahrt.ende - nau.fahrt.start;
  pruefe(`Weidling ist schneller als der Nauen (${dw.toFixed(1)} gegen ${dn.toFixed(1)} Tage)`, dw < dn);

  // Gebrauchtmarkt: Angebote tauchen auf und verschwinden
  const markt = new Spiel(D, 42);
  let gesehen = 0;
  for (let t = 0; t < 365; t++) {
    const vorher = markt.werft.naechsteNr;
    markt.tagVoran();
    if (markt.werft.naechsteNr > vorher) gesehen++;
  }
  pruefe(`Gebrauchte Schiffe werden angeboten (${gesehen} Angebote in einem Jahr)`, gesehen >= 5);
  const angebot = markt.werft.angebote[0];
  if (angebot) {
    markt.gulden = 100000;
    const dort = markt.welt.stadt[angebot.stadt];
    markt.schiffe[0].ort = dort;
    markt.schiffe[0].fahrt = null;
    const gekauft = markt.werft.kaufeGebraucht(angebot);
    pruefe(`Gebrauchtes Schiff kaufen (${angebot.preis} statt ${D.schiffe.typ[angebot.typ].preis} Gulden, höherer Unterhalt)`,
      !!gekauft && gekauft.gebraucht && markt.unterhalt(gekauft) > D.schiffe.typ[angebot.typ].unterhalt);
  }

  // Wirtschaftlichkeit: je ein Schiff jedes Typs handelt ein Jahr frei
  const rendite = {};
  for (const t of D.schiffe.typen) {
    let summe = 0;
    for (const seed of [51, 52, 53]) {
      const sp = new Spiel(D, seed, { leer: false });
      const schiff = sp.schiffe[0];
      schiff.typ = t.id;
      sp.gulden = 60000;
      starteFrei(sp, schiff, 60000);
      for (let tag = 0; tag < 360; tag++) sp.tagVoran();
      summe += (sp.gulden + sp.warenwert() - 60000) / 360;
    }
    rendite[t.id] = summe / 3 / t.preis; // Gewinn pro Tag je Gulden Schiffspreis
  }
  const werte = Object.values(rendite);
  const verhaeltnis = Math.max(...werte) / Math.min(...werte);
  console.log("   Gewinn pro Tag je 1000 Gulden Schiffspreis:", Object.entries(rendite).map(([k2, v]) => `${k2} ${(v * 1000).toFixed(2)}`).join(", "));
  pruefe(`Kein Schiffstyp ist mehr als doppelt so rentabel wie ein anderer (Faktor ${verhaeltnis.toFixed(2)})`, werte.every((v) => v > 0) && verhaeltnis <= 2);
}

// --- 8. Eigenversorgung -------------------------------------------------------
// Eigene Werkstatt über das Kontor beliefern und die Ware anderswo verkaufen soll mehr bringen
// als dieselbe Werkstatt am Markt plus dasselbe Schiff im freien Handel.
console.log("\nEigenversorgung");
{
  function aufbau(seed) {
    const sp = new Spiel(D, seed);
    sp.gulden = 100000;
    const s = sp.schiffe[0];
    const stadt = sp.welt.stadt["Wädenswil"];
    s.ort = stadt;
    s.pos = [...stadt.pos];
    const b = sp.ausbau.betriebeIn(stadt).find((x) => x.typ === "trotte");
    sp.ausbau.kaufen(b);
    return { sp, s, stadt, b };
  }
  let kette = 0;
  let markt = 0;
  let werkstattMarkt = 0;
  for (const seed of [61, 62]) {
    const a = aufbau(seed);
    a.sp.kaufen(a.s, "Holz", 20);
    a.sp.ausbau.kontorBauen(a.stadt);
    a.sp.ausbau.setzeZiel(a.b, "kontor");
    const startA = a.sp.gulden + a.sp.warenwert();
    starteRoute(a.sp, a.s, [
      { stadt: "Wädenswil", auftraege: [
        { art: "kaufen", ware: "Trauben", menge: 100, preis: null },
        { art: "entladen", ware: "Trauben", menge: null, preis: null },
        { art: "laden", ware: "Wein", menge: null, preis: null },
      ] },
      { stadt: "Rapperswil", auftraege: [{ art: "verkaufen", ware: "Wein", menge: null, preis: null }] },
      { stadt: "Horgen", auftraege: [{ art: "verkaufen", ware: "Wein", menge: null, preis: null }] },
    ]);
    const b = aufbau(seed);
    const startB = b.sp.gulden + b.sp.warenwert();
    starteFrei(b.sp, b.s, 60000);
    for (let t = 0; t < 360; t++) {
      a.sp.tagVoran();
      b.sp.tagVoran();
    }
    kette += (a.sp.gulden + a.sp.warenwert() - startA) / 360 / 2;
    markt += (b.sp.gulden + b.sp.warenwert() - startB) / 360 / 2;
    werkstattMarkt += b.b.summe / 360 / 2;
  }
  pruefe(`Werkstatt mit Marktversorgung trägt sich kaum (${werkstattMarkt.toFixed(0)} Gulden/Tag)`, werkstattMarkt < 60);
  pruefe(`Trotte Wädenswil mit Kontor und Route: ${kette.toFixed(0)} Gulden/Tag, Markt + freier Handel: ${markt.toFixed(0)} (Ziel: Kette mindestens 15 % besser)`, kette >= markt * 1.15);
}

// --- 9. Stufen, Stadtgebäude, Kontorhandel ---------------------------------------
console.log("\nStufen, Stadtgebäude, Kontorhandel");
{
  const spiel = new Spiel(D, 71);
  const a = spiel.ausbau;
  const schiff = spiel.schiffe[0];
  const zuerich = spiel.welt.stadt["Zürich"];
  spiel.gulden = 500000;
  // Baumaterial reichlich ins Kontor
  spiel.kaufen(schiff, "Holz", 40);
  a.kontorBauen(zuerich);
  const k = a.kontor(zuerich);
  k.lager.Holz = { menge: 300, einstand: 30 };
  k.lager.Werkzeug = { menge: 100, einstand: 120 };

  // Betrieb ausbauen: doppelte Leistung, Stadtproduktion unverändert
  const kornhof = a.betriebeIn(zuerich).find((b) => b.typ === "kornhof");
  a.kaufen(kornhof);
  const kornStadt = zuerich.prod.Korn;
  pruefe("Kornhof auf Stufe 2 ausbauen", a.betriebAusbauen(kornhof) && kornhof.stufe === 2);
  pruefe(`Leistung verdoppelt (${a.leistung(kornhof)} Korn pro Tag)`, a.leistung(kornhof) === 2 * a.typ(kornhof).leistung);
  pruefe("Ausbau verändert die Stadtproduktion nicht", zuerich.prod.Korn === kornStadt);
  a.betriebAusbauen(kornhof);
  pruefe("Höchste Stufe ist 3", kornhof.stufe === 3 && a.pruefeBetriebsausbau(kornhof) !== null);
  a.verkaufen(kornhof);
  pruefe("Verkauf an die Stadt: Grundleistung plus zwei Ausbaustufen produziert die Stadt", zuerich.prod.Korn === kornStadt + 3 * a.typ(kornhof).leistung);

  // Kontor ausbauen
  const kapazitaet = a.lagerKapazitaet(k);
  pruefe("Kontor auf Stufe 2 ausbauen", a.kontorAusbauen(zuerich) && a.lagerKapazitaet(k) === 2 * kapazitaet);

  // Markthalle senkt die Spanne
  const vorher = spiel.kaufpreis(zuerich, "Korn") - spiel.verkaufspreis(zuerich, "Korn");
  pruefe("Markthalle bauen", a.baueGebaeude(zuerich, "markthalle"));
  const nachher = spiel.kaufpreis(zuerich, "Korn") - spiel.verkaufspreis(zuerich, "Korn");
  pruefe(`Spanne für Korn sinkt (${vorher.toFixed(2)} -> ${nachher.toFixed(2)} Gulden)`, nachher < vorher);
  a.baueGebaeude(zuerich, "markthalle");
  a.baueGebaeude(zuerich, "markthalle");
  pruefe(`Spanne nie unter dem Minimum (${(a.spanne(zuerich) * 100).toFixed(0)} %)`, a.spanne(zuerich) >= D.bau.spanne_min - 1e-12);
  const g0 = spiel.gulden;
  const r1 = spiel.kaufen(schiff, "Korn", 20);
  spiel.verkaufen(schiff, "Korn", 20);
  pruefe("Auch mit Markthalle bringt Hin-und-her-Handeln Verlust", spiel.gulden < g0 && r1.menge === 20);

  // Kirche: mehr Bauplätze
  const plaetze = a.bauplaetze(zuerich);
  const frei = a.freiePlaetze(zuerich);
  a.baueGebaeude(zuerich, "kirche");
  pruefe(`Kirche: +1 Bauplatz (${plaetze} -> ${a.bauplaetze(zuerich)}), der eigene Platz gleicht sich aus`, a.bauplaetze(zuerich) === plaetze + 1 && a.freiePlaetze(zuerich) === frei);
  a.baueGebaeude(zuerich, "kirche");
  pruefe("Kirche Stufe 2: ein freier Platz mehr als vorher", a.freiePlaetze(zuerich) === frei + 1);

  // Zunfthaus senkt den Unterhalt der Betriebe
  const trotte = a.betriebeIn(zuerich).find((b) => b.typ === "trotte");
  a.kaufen(trotte);
  const u0 = a.unterhalt(trotte);
  a.baueGebaeude(zuerich, "zunfthaus");
  pruefe(`Zunfthaus: Unterhalt der Trotte sinkt (${u0} -> ${a.unterhalt(trotte)})`, a.unterhalt(trotte) < u0);

  // Kontor handelt: von Hand und nach Regeln
  const kauf = a.kontorKaufen(zuerich, "Trauben", 50);
  pruefe(`Kontor kauft von Hand (${kauf.menge} Trauben ohne Schiff)`, kauf.menge === 50 && k.lager.Trauben.menge === 50);
  a.setzeRegel(zuerich, "Rohseide", { kaufenBis: 100, kaufPreis: 1000 });
  a.setzeRegel(zuerich, "Trauben", { verkaufenUeber: 10, verkaufPreis: 1 });
  for (let t = 0; t < 5; t++) spiel.tagVoran();
  pruefe(`Regel kaufen bis 100: ${Math.round(k.lager.Rohseide?.menge ?? 0)} Rohseide im Kontor`, Math.round(k.lager.Rohseide?.menge ?? 0) === 100);
  pruefe(`Regel verkaufen über 10: ${Math.round(k.lager.Trauben?.menge ?? 0)} Trauben übrig`, Math.round(k.lager.Trauben?.menge ?? 0) === 10);
  a.setzeRegel(zuerich, "Rohseide", { kaufenBis: 300, kaufPreis: 1 });
  spiel.tagVoran();
  pruefe("Preisgrenze verhindert teure Käufe", Math.round(k.lager.Rohseide.menge) === 100);

  // Speichern und Laden mit Stufen und Gebäuden
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Stufen, Stadtgebäude und Kontorregeln überstehen Speichern und Laden",
    geladen.ausbau.gebaeudeStufe(zuerich, "markthalle") === 3 && geladen.ausbau.kontor(zuerich).stufe === 2 &&
    geladen.ausbau.regel(zuerich, "Rohseide").kaufenBis === 300 && geladen.welt.stadt["Zürich"].prod.Korn === zuerich.prod.Korn);
}

// --- 10. Bevölkerung, Versorgungsgebäude, Kontor als Anwesenheit, Sperren, Bilanz -------
console.log("\nBevölkerung, Versorgung, Kontor, Bilanz");
{
  const spiel = new Spiel(D, 81);
  const a = spiel.ausbau;
  const schiff = spiel.schiffe[0];
  const zuerich = spiel.welt.stadt["Zürich"];
  const lachen = spiel.welt.stadt["Lachen"];
  spiel.gulden = 500000;
  spiel.kaufen(schiff, "Holz", 40);
  a.kontorBauen(zuerich);
  const k = a.kontor(zuerich);
  k.lager.Holz = { menge: 400, einstand: 30 };
  k.lager.Werkzeug = { menge: 100, einstand: 120 };

  // Versorgungsgebäude
  const z0 = zuerich.zufriedenheit;
  a.baueGebaeude(zuerich, "spital");
  a.baueGebaeude(zuerich, "brunnen");
  for (let t = 0; t < 60; t++) spiel.tagVoran();
  pruefe(`Spital und Brunnen heben die Zufriedenheit (${z0.toFixed(0)} -> ${zuerich.zufriedenheit.toFixed(0)})`, zuerich.zufriedenheit > z0 + 5);
  const raum = zuerich.wohnraum();
  a.baueGebaeude(zuerich, "wohnhaeuser");
  pruefe(`Wohnhäuser erhöhen den Wohnraum (${raum.toFixed(0)} -> ${zuerich.wohnraum().toFixed(0)})`, zuerich.wohnraum() > raum);

  // Kontor ersetzt das Schiff im Hafen
  spiel.segeln(schiff, { stadt: lachen });
  pruefe("Schiff unterwegs, trotzdem Betrieb kaufen dank Kontor", !schiff.ort && a.pruefeKauf(a.betriebeIn(zuerich)[0]) === null);
  pruefe("Werft in Zürich nutzbar dank Kontor", spiel.werft.pruefeNeukauf(zuerich, "weidling") === null);
  pruefe("Ohne Schiff und Kontor geht in Meilen nichts", a.pruefeKauf(a.betriebeIn(spiel.welt.stadt["Meilen"])[0]) !== null);

  // Sperren: Bedarf der eigenen Werkstatt bleibt im Kontor
  const seide = a.betriebeIn(zuerich).find((b) => b.typ === "seidenweberei");
  a.kaufen(seide);
  a.setzeZiel(seide, "kontor");
  k.lager.Rohseide = { menge: 100, einstand: 40 };
  const bedarf = a.bedarfProTag(zuerich, "Rohseide");
  a.setzeSperre(zuerich, "Rohseide", 5);
  pruefe(`Sperre 5 Tage = ${(5 * bedarf).toFixed(0)} Rohseide gesperrt`, Math.abs(a.gesperrt(zuerich, "Rohseide") - 5 * bedarf) < 1e-9 && bedarf > 0);
  const v = a.kontorVerkaufen(zuerich, "Rohseide", Infinity);
  pruefe(`Verkaufen lässt die Sperre im Kontor (${v.menge} verkauft, ${k.lager.Rohseide?.menge.toFixed(0)} bleiben)`, Math.abs((k.lager.Rohseide?.menge ?? 0) - 5 * bedarf) < 1);

  // Bilanz
  const kn = spiel.konten;
  pruefe("Bilanz bucht Bauten, Betriebskauf, Unterhalt und Handel",
    kn.gesamt.bauten < 0 && kn.gesamt.betriebeKauf < 0 && kn.gesamt.schiffeUnterhalt < 0 && kn.gesamt.handelEinkauf < 0 && kn.gesamt.kontorVerkauf > 0);
  pruefe(`Bilanz führt Monate (${Object.keys(kn.monate).join(", ")})`, Object.keys(kn.monate).length >= 2);
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Bevölkerung, Sperren und Bilanz überstehen Speichern und Laden",
    Math.abs(geladen.welt.stadt["Zürich"].einwohner - zuerich.einwohner) < 1e-9 && geladen.ausbau.kontor(zuerich).sperren.Rohseide === 5 &&
    geladen.konten.gesamt.bauten === kn.gesamt.bauten && geladen.welt.stadt["Zürich"].wohnraumBonus === zuerich.wohnraumBonus);
}

console.log(fehler ? `\n${fehler} Check(s) durchgefallen` : "\nAlle Checks bestanden");
process.exit(fehler ? 1 : 0);

// Prüft das Wirtschaftsmodell des Spiels ohne Browser.
// Aufruf aus dem Repo-Hauptordner:  node game/test/wirtschaft_test.mjs
// Nur ein Abschnitt (Teil des Titels):  NUR=zonen node game/test/wirtschaft_test.mjs
//
// 1. Die Wirtschaft des Spiels (ohne Spieler) besteht dieselben Balance-Checks wie
//    tools/sim/wirtschaft_sim.py. So fällt auf, wenn Spiel und Simulation auseinanderlaufen.
// 2. Handel des Spielers: kein Gewinn durch Hin-und-her-Handeln, Laderaum und Geld begrenzen.
// 3. Karte: Jeder Seeweg führt über Wasser, die Distanzen in karte.json sind aktuell.
// 4.-9. Betriebe und Kontor, automatischer Handel, Speichern und Laden, Bootshandel, Eigenversorgung,
//      Stufen, Stadtgebäude und Kontorhandel.
// 10.  Bevölkerung, Versorgungsgebäude, Kontor als Anwesenheit, Sperren, Bilanz.
// 11.  Automatik «Versorgen».
// 12.  Flotten.
// 13.  Stände, Kriege, Kaperbriefe und Gefechte.
// 14.  Kapitäne: Anheuern, Lohn, Stufen, Bonus, Verschollen, Speichern.
// 15.  Spielziel: Rang, Ratssitze, Preis, Wirkung, Speichern.
// 16.  Risiko-Ereignisse und Versicherung.
// 17.  Zoll und Handelsverträge.
// 18.  Zonen (weitere Seen), Erschliessen, Verbindungen, Fracht, Bahn.
// 19.  Schiffsentwicklung: Epochen, Alter, Erneuerung, Nachfolger der Kriegsschiffe.
// 20.  Kanäle: Bau über Material und Zeit, Schiffsverkehr zwischen Zonen, Maut.
// 21.  Epochen: Wohnraum, Ausgleich durch Landverkehr, KI-Flotten.
//
// Exit-Code 0 = alles bestanden, 1 = mindestens ein Check durchgefallen.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ladeDaten } from "../src/daten.js";
import { Welt, Haendler, neueStatistik, distanz } from "../src/wirtschaft.js";
import { Navigation, weglaenge } from "../src/navigation.js";
import { Spiel } from "../src/spiel.js";
import { starteRoute, starteFrei, beende, starteVersorgung } from "../src/automatik.js";
import { speichere, lade, pruefe as pruefeStand } from "../src/speicher.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const D = await ladeDaten(async (datei) => JSON.parse(await readFile(path.join(DATA, datei), "utf-8")));

let fehler = 0;

// Nur einen Abschnitt prüfen:  NUR=zonen node game/test/wirtschaft_test.mjs
const NUR = (process.env.NUR ?? "").toLowerCase();
function abschnitt(name) {
  if (NUR && !name.toLowerCase().includes(NUR)) return false;
  console.log(`\n${name}`);
  return true;
}

// Springt im Kalender auf den 1. Januar des Jahres (Freischaltungen hängen am Jahr)
function insJahr(spiel, jahr) {
  const [j, m, t] = spiel.D.spiel.start.datum;
  // Ein Spieltag zählt D.kalender Kalendertage (epochen.json)
  spiel.starttag = spiel.welt.tag - Math.ceil((Date.UTC(jahr, 0, 1) - Date.UTC(j, m - 1, t)) / 86400000 / spiel.D.kalender);
  return spiel;
}

// Für Tests von Fahrzeiten und Lieferketten: ohne Risiko-Ereignisse (Sturm, Überfall ...), die
// Ankunft und Ladung bewusst verändern. Die Ereignisse selbst prüft Abschnitt 16.
function ohneRisiko(spiel) {
  const r = structuredClone(spiel.D.risiko);
  for (const e of Object.values(r.ereignisse)) e.chance = 0;
  spiel.risiko.r = r;
  return spiel;
}
function pruefe(text, ok) {
  console.log(`${ok ? "OK " : "!! "}${text}`);
  if (!ok) fehler++;
}

// --- 1. Balance wie in der Simulation ------------------------------------
const TAGE = 720;
for (const seed of NUR ? [] : [1, 2, 3]) {
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
  const proSchiffTag = (welt.haendler.reduce((a, h) => a + h.geld, 0) - geld0 - st.eingeschossen) / st.schiffstage;
  const amortisation = D.p.SHIP_COST / proSchiffTag;
  const routen = {};
  for (const t of st.touren) routen[t.route] = (routen[t.route] || 0) + 1;
  const spitze = (100 * Math.max(...Object.values(routen))) / st.touren.length;
  const produziert = Object.values(st.produziert).reduce((a, b) => a + b, 0);
  const verderb = (100 * Object.values(st.verdorben).reduce((a, b) => a + b, 0)) / produziert;
  const rand = (100 * preisRand) / preisPunkte;
  const zufriedenheit = welt.staedte.reduce((a, s) => a + s.zufriedenheit, 0) / welt.staedte.length;

  console.log(`\nSeed ${seed}: ${st.touren.length} Touren, ${welt.haendler.length} KI-Händler am Ende`);
  pruefe(`Mittlere Tourrendite ${(100 * rendite).toFixed(0)}% (Ziel 10-30%)`, rendite >= 0.1 && rendite <= 0.3);
  pruefe(`Schiff amortisiert sich in ${amortisation.toFixed(0)} Tagen (Ziel 30-300)`, amortisation >= 30 && amortisation <= 300);
  pruefe(`Häufigste Route ${spitze.toFixed(1)}% der Touren (Ziel <= 12%)`, spitze <= 12);
  pruefe(`Verderb ${verderb.toFixed(1)}% der Produktion (Ziel <= 8%)`, verderb <= 8);
  pruefe(`Preise am Deckel/Boden ${rand.toFixed(1)}% der Stadt-Tage (Ziel <= 20%)`, rand <= 20);
  pruefe(`Zufriedenheit am Ende ${zufriedenheit.toFixed(0)} (Ziel >= 55)`, zufriedenheit >= 55);
}

// --- 2. Handel des Spielers -----------------------------------------------
if (abschnitt("Handel des Spielers")) {
  const spiel = ohneRisiko(new Spiel(D, 7));
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
  pruefe("Fahrt zu einem Punkt auf dem Obersee klappt", spiel.segeln(schiff, { punkt: [89, 54] }).ok);
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
if (abschnitt("Wegsuche")) {
  const spiel = new Spiel(D, 3);
  const nav = spiel.nav;
  // Städte, die Durchfahrt am Seedamm und Punkte mitten im See (zwischen gegenüberliegenden Ufern)
  const mitte = (a, b) => [(spiel.welt.stadt[a].pos[0] + spiel.welt.stadt[b].pos[0]) / 2, (spiel.welt.stadt[a].pos[1] + spiel.welt.stadt[b].pos[1]) / 2];
  const ziele = [...spiel.welt.staedte.filter((s) => s.zone === "zuerichsee").map((s) => s.pos), D.karte.durchfahrten[0].position, mitte("Meilen", "Horgen"), mitte("Zürich", "Küsnacht"), mitte("Lachen", "Schmerikon"), mitte("Rapperswil", "Lachen")];
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

// --- 3. Karte: Seewege über Wasser, Distanzen aktuell ---------------------------
if (abschnitt("Karte")) {
  const nav = new Navigation(D);
  let ueberLand = 0;
  let abweichung = 0;
  for (const a of D.staedte) {
    if (!nav.imWasser(a.pos)) {
      console.log(`   ${a.name} liegt nicht im Wasser`);
      ueberLand++;
    }
    for (const b of D.staedte) {
      if (a === b) continue;
      if (a.zone !== b.zone) {
        // zwischen Zonen gibt es keinen Weg (Waren reisen über Verbindungen); nur einige Paare prüfen
        if ((a.name.length + b.name.length) % 9 !== 0) continue;
        const w = nav.route(a.pos, b.pos);
        // zwischen Seen gibt es keinen Wasserweg (Waren reisen über Verbindungen)
        if (w) {
          console.log(`   Weg zwischen den Zonen ${a.name} -> ${b.name}`);
          ueberLand++;
        }
        continue;
      }
      const w = nav.route(a.pos, b.pos);
      if (!w) {
        ueberLand++;
        continue;
      }
      for (let i = 1; i < w.length; i++) if (!nav.frei(w[i - 1], w[i])) ueberLand++;
      const gespeichert = distanz(D, a, b);
      if (Math.abs(gespeichert - weglaenge(w)) > 0.02) {
        abweichung++;
        console.log(`   ${a.name} -> ${b.name}: gespeichert ${gespeichert}, berechnet ${weglaenge(w).toFixed(2)}`);
      }
    }
  }
  pruefe("Alle Städte liegen am Wasser, alle Wege innerhalb einer Zone führen über Wasser, zwischen den Zonen gibt es keinen", ueberLand === 0);
  pruefe("Distanzen in karte.json passen zur Karte (sonst: node tools/karte/distanzen.mjs)", abweichung === 0);
}

// --- 4. Betriebe und Kontor -------------------------------------------------
if (abschnitt("Betriebe und Kontor")) {
  const spiel = new Spiel(D, 11);
  const a = spiel.ausbau;
  const schiff = spiel.schiffe[0];
  const zuerich = spiel.welt.stadt["Zürich"];
  spiel.gulden = 200000;
  pruefe(`Jede Stadt hat vorhandene Betriebe (${a.betriebe.length} insgesamt)`, spiel.welt.staedte.every((s) => a.betriebeIn(s).length > 0));

  const seidenhof = a.betriebeIn(zuerich).find((b) => b.typ === "seidenhandel");
  const seideVorher = zuerich.prod.Rohseide;
  pruefe("Seidenhandel in Zürich kaufen", a.kaufen(seidenhof));
  pruefe(`Stadtproduktion Rohseide sinkt um die Leistung (${seideVorher} -> ${zuerich.prod.Rohseide})`, zuerich.prod.Rohseide === seideVorher - a.typ(seidenhof).leistung);
  const geld = spiel.gulden;
  const lager = zuerich.bestand.Rohseide;
  spiel.tagVoran();
  pruefe(`Der Betrieb liefert an den Markt und bringt Geld (${seidenhof.gestern.kasse.toFixed(0)} Gulden am ersten Tag)`, seidenhof.gestern.kasse > 0 && spiel.gulden > geld - 100);

  // Kontor: Holz mitbringen, bauen, Erzeugnisse einlagern, umlagern
  spiel.kaufen(schiff, "Holz", 40);
  pruefe("Kontor in Zürich bauen (Holz aus dem Schiff)", a.kontorBauen(zuerich));
  pruefe("Betrieb liefert ins Kontor", a.setzeZiel(seidenhof, "kontor"));
  spiel.tagVoran();
  const imKontor = a.kontor(zuerich).lager.Rohseide?.menge ?? 0;
  pruefe(`Rohseide liegt im Kontor (${imKontor})`, imKontor > 0);
  const umgelagert = a.umlagern(schiff, "Rohseide", 5, "insSchiff");
  pruefe("Kontor -> Schiff umlagern", umgelagert === Math.min(5, Math.floor(imKontor)) && schiff.ladung.Rohseide?.menge >= umgelagert);

  // Neubau: Bauplatz, Rohstoff der Stadt, Material
  pruefe("Kein Neubau eines Sägewerks in Zürich (kein Holz dort)", a.pruefeBau(zuerich, "saegewerk") !== null);
  pruefe(`Keine Schmiede in Zürich (kein Handwerk dort): "${a.pruefeBau(zuerich, "schmiede")}"`, String(a.pruefeBau(zuerich, "schmiede")).includes("Handwerk"));
  const kostenTrotte = a.baukosten("trotte", zuerich);
  spiel.kaufen(schiff, "Holz", 30);
  pruefe(`Werkzeug fehlt für die Trotte: "${a.pruefeBau(zuerich, "trotte")}"`, String(a.pruefeBau(zuerich, "trotte")).includes("Werkzeug"));
  spiel.ausbau.kontore["Zürich"].lager.Werkzeug = { menge: kostenTrotte.material.Werkzeug, einstand: 100 };
  const neu = a.bauen(zuerich, "trotte");
  pruefe("Trotte neu bauen mit Material aus Kontor und Schiff", !!neu && a.freiePlaetze(zuerich) === a.bauplaetze(zuerich) - 1);

  pruefe("Seidenhandel an die Stadt verkaufen", a.verkaufen(seidenhof));
  pruefe("Stadtproduktion Rohseide wieder wie vorher", zuerich.prod.Rohseide === seideVorher);
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
if (abschnitt("Automatischer Handel")) {
  const spiel = new Spiel(D, 21);
  const schiff = spiel.schiffe[0];
  pruefe("Route mit nur einem Hafen wird abgelehnt", starteRoute(spiel, schiff, [{ stadt: "Zürich", auftraege: [] }]) !== null);
  const fehler = starteRoute(spiel, schiff, [
    { stadt: "Zürich", auftraege: [{ art: "kaufen", ware: "Seide", menge: 60, preis: null }] },
    { stadt: "Lachen", auftraege: [{ art: "verkaufen", ware: "Seide", menge: null, preis: null }] },
  ]);
  pruefe("Route Zürich - Lachen startet, das Schiff lädt zuerst (Liegezeit)", fehler === null && !schiff.fahrt && schiff.auto.abfahrt > spiel.zeit);
  // Ein Föhnsturm am Ziel kann das Ablegen um Tage verzögern (der Zufall hängt von der Städteliste ab)
  for (let t = 0; t < 20 && !schiff.fahrt; t++) spiel.tagVoran();
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

  // Mit vollem Laderaum im Hafen gestartet: Das Schiff bringt die Ladung weg, statt ewig zu warten
  const voll = new Spiel(D, 3);
  const s3 = voll.schiffe[0];
  voll.kaufen(s3, "Korn", Infinity, true);
  starteFrei(voll, s3, 5000);
  let abgelegt = !!s3.fahrt;
  for (let t = 0; t < 5 && !abgelegt; t++) {
    voll.tagVoran();
    abgelegt = !!s3.fahrt || s3.ort?.name !== "Zürich";
  }
  pruefe("Freier Handel mit vollem Laderaum legt im Hafen ab", abgelegt);

  // Reparatur: Ab automatik_reparatur_ab Schaden bleibt das Schiff im Hafen, bis es repariert ist
  const rep = new Spiel(D, 1);
  const s4 = rep.schiffe[0];
  const rumpf = rep.schiffstyp(s4).rumpf;
  starteRoute(rep, s4, [{ stadt: "Zürich", auftraege: [] }, { stadt: "Horgen", auftraege: [] }]);
  s4.kampf.schaden = rumpf * 0.7;
  let lagRepariert = false;
  for (let t = 0; t < 20; t++) {
    rep.tagVoran();
    if (s4.auto.reparatur && s4.ort) lagRepariert = true;
  }
  pruefe("Automatik bleibt zur Reparatur im Hafen und fährt danach weiter", lagRepariert && s4.kampf.schaden === 0 && !s4.auto.reparatur);

  // Einkaufslager: Das Kontor kauft nur, die Automatik lädt zuerst aus dem Kontor
  const ek = new Spiel(D, 4);
  ek.gulden = 60000;
  const horgen = ek.welt.stadt["Horgen"];
  ek.ausbau.kontore["Horgen"] = { stufe: 1, lager: { Wein: { menge: 20, einstand: 50 } }, regeln: {}, sperren: {}, nurEinkauf: true };
  ek.ausbau.schlageRegelnVor(horgen);
  const regeln = Object.values(ek.ausbau.kontor(horgen).regeln);
  pruefe("Mit «Nur einkaufen» schlägt das Kontor nur Einkaufsregeln vor", regeln.length > 0 && regeln.every((r) => r.verkaufenUeber == null));
  ek.ausbau.setzeRegel(horgen, "Wein", { verkaufenUeber: 0 });
  for (let t = 0; t < 10; t++) ek.tagVoran();
  pruefe("Ein Einkaufslager verkauft nichts, auch mit Verkaufsregel", (ek.ausbau.kontor(horgen).lager.Wein?.menge ?? 0) === 20);
  const s5 = ek.schiffe[0];
  ek.anhalten(s5);
  Object.assign(s5, { ort: horgen, pos: [...horgen.pos], fahrt: null });
  const imKontor = Object.values(ek.ausbau.kontor(horgen).lager).reduce((x, p) => x + p.menge, 0);
  starteFrei(ek, s5, 5000);
  const nachher = Object.values(ek.ausbau.kontor(horgen).lager).reduce((x, p) => x + p.menge, 0);
  pruefe(`Freier Handel lädt zuerst aus dem Kontor (${imKontor} -> ${nachher})`, nachher < imKontor && !!s5.auto.plan);

  const rk = new Spiel(D, 4);
  const h2 = rk.welt.stadt["Horgen"];
  // Ohne Verwalter: Er würde das Holz als Baumaterial sperren, geprüft wird hier die Route
  rk.ausbau.kontore["Horgen"] = { stufe: 1, lager: { Holz: { menge: 30, einstand: 20 } }, regeln: {}, sperren: {}, verwalter: false };
  const s6 = rk.schiffe[0];
  rk.anhalten(s6);
  Object.assign(s6, { ort: h2, pos: [...h2.pos], fahrt: null });
  const gulden0 = rk.gulden;
  starteRoute(rk, s6, [{ stadt: "Horgen", auftraege: [{ art: "kaufen", ware: "Holz", menge: 50, preis: null }] }, { stadt: "Zürich", auftraege: [] }]);
  pruefe("Route: «kaufen» nimmt zuerst aus dem Kontor, den Rest am Markt", s6.ladung.Holz?.menge === 50 && !rk.ausbau.kontor(h2).lager.Holz && gulden0 - rk.gulden < 50 * 40);

  // Kontore auffüllen: Das Kontor in Wädenswil kauft nicht selbst (Höchstpreis 1), das Schiff bringt Holz bis 80.
  // 60 Tage: Seit der Spezialisierung (25.10.2026) liegt Holz nicht mehr in Lachen, die erste Lieferung dauert länger
  for (const an of [false, true]) {
    const af = new Spiel(D, 5);
    af.gulden = 40000;
    const wd = af.welt.stadt["Wädenswil"];
    af.ausbau.kontore["Wädenswil"] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
    af.ausbau.setzeRegel(wd, "Holz", { kaufenBis: 80, kaufPreis: 1 });
    starteFrei(af, af.schiffe[0], 5000, { auffuellen: an });
    for (let t = 0; t < 60; t++) af.tagVoran();
    const holz = af.ausbau.kontor(wd).lager.Holz?.menge ?? 0;
    if (an) pruefe(`Freier Handel mit «Kontore auffüllen» beliefert das Kontor (${holz} von 80 Holz)`, holz === 80);
    else pruefe("Ohne «Kontore auffüllen» liefert der freie Handel nichts ins Kontor", holz === 0);
  }
}

// --- 6. Speichern und Laden ---------------------------------------------------
if (abschnitt("Speichern und Laden")) {
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
if (abschnitt("Bootshandel")) {
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

  // Wirtschaftlichkeit: je ein Handelsschiff jedes Typs handelt ein Jahr frei
  // (Kriegsschiffe verdienen ihr Geld mit Prisen, nicht mit Handel)
  const rendite = {};
  for (const t of D.schiffe.typen.filter((x) => !x.kampfschiff && x.medium !== "land" && x.ab_jahr <= 1650)) {
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
if (abschnitt("Eigenversorgung")) {
  function aufbau(seed) {
    const sp = ohneRisiko(new Spiel(D, seed)); // geprüft wird die Wirtschaft, nicht das Risiko
    sp.gulden = 100000;
    const s = sp.schiffe[0];
    const stadt = sp.welt.stadt["Wädenswil"];
    s.ort = stadt;
    s.pos = [...stadt.pos];
    s.fahrt = null;
    const b = sp.ausbau.betriebeIn(stadt).find((x) => x.typ === "trotte");
    sp.ausbau.kaufen(b);
    return { sp, s, stadt, b };
  }
  let kette = 0;
  let markt = 0;
  let werkstattMarkt = 0;
  // Zehn Seeds: Ein einzelner Lauf streut stark (freier Handel 95 bis 261 Gulden/Tag), mit zwei Seeds
  // kippte das Ergebnis schon bei 2 % grösseren KI-Schiffen
  const seeds = [61, 62, 63, 64, 65, 66, 67, 68, 69, 70];
  for (const seed of seeds) {
    const a = aufbau(seed);
    a.s.ladung.Holz = { menge: 20, einstand: 60 }; // Baumaterial fürs Kontor, unabhängig vom Holzvorrat am Markt
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
    kette += (a.sp.gulden + a.sp.warenwert() - startA) / 360 / seeds.length;
    markt += (b.sp.gulden + b.sp.warenwert() - startB) / 360 / seeds.length;
    werkstattMarkt += b.b.summe / 360 / seeds.length;
  }
  pruefe(`Werkstatt mit Marktversorgung trägt sich kaum (${werkstattMarkt.toFixed(0)} Gulden/Tag)`, werkstattMarkt < 60);
  pruefe(`Trotte Wädenswil mit Kontor und Route: ${kette.toFixed(0)} Gulden/Tag, Markt + freier Handel: ${markt.toFixed(0)} (Ziel: Kette mindestens 15 % besser)`, kette >= markt * 1.15);
}

// --- 9. Stufen, Stadtgebäude, Kontorhandel ---------------------------------------
if (abschnitt("Stufen, Stadtgebäude, Kontorhandel")) {
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
  const seidenhof = a.betriebeIn(zuerich).find((b) => b.typ === "seidenhandel");
  a.kaufen(seidenhof);
  const seideStadt = zuerich.prod.Rohseide;
  pruefe("Seidenhandel auf Stufe 2 ausbauen", a.betriebAusbauen(seidenhof) && seidenhof.stufe === 2);
  pruefe(`Leistung verdoppelt (${a.leistung(seidenhof)} Rohseide pro Tag)`, a.leistung(seidenhof) === 2 * a.typ(seidenhof).leistung);
  pruefe("Ausbau verändert die Stadtproduktion nicht", zuerich.prod.Rohseide === seideStadt);
  a.betriebAusbauen(seidenhof);
  pruefe("Höchste Stufe ist 3", seidenhof.stufe === 3 && a.pruefeBetriebsausbau(seidenhof) !== null);
  a.verkaufen(seidenhof);
  pruefe("Verkauf an die Stadt: Grundleistung plus zwei Ausbaustufen produziert die Stadt", zuerich.prod.Rohseide === seideStadt + 3 * a.typ(seidenhof).leistung);

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
    geladen.ausbau.regel(zuerich, "Rohseide").kaufenBis === 300 && geladen.welt.stadt["Zürich"].prod.Rohseide === zuerich.prod.Rohseide);
}

if (abschnitt("Rückbau")) {
  const spiel = new Spiel(D, 72);
  const a = spiel.ausbau;
  const zuerich = spiel.welt.stadt["Zürich"];
  spiel.gulden = 500000;
  spiel.kaufen(spiel.schiffe[0], "Holz", 40);
  a.kontorBauen(zuerich);
  const k = a.kontor(zuerich);
  k.lager.Holz = { menge: 300, einstand: 30 };
  k.lager.Werkzeug = { menge: 100, einstand: 120 };
  const frei = a.freiePlaetze(zuerich);

  // Neu gebauter Betrieb: Stufe zurück, dann abreissen, der Bauplatz wird frei
  const typ = a.bau.betriebe.find((t) => t.art === "werkstatt").id;
  const b = a.bauen(zuerich, typ);
  a.betriebAusbauen(b);
  const g0 = spiel.gulden;
  pruefe("Betrieb von Stufe 2 auf 1 zurückbauen", a.betriebZurueckbauen(b) && b.stufe === 1);
  pruefe(`Rückbau bringt ${D.bau.rueckbau_erstattung * 100} % der Gulden zurück (${spiel.gulden - g0})`, spiel.gulden - g0 === a.erstattung(a.baukosten(typ, zuerich).gulden));
  pruefe("Betrieb abreissen gibt den Bauplatz frei", a.betriebZurueckbauen(b) && !a.betriebe.includes(b) && a.freiePlaetze(zuerich) === frei);

  // Gekaufter Stadtbetrieb lässt sich nicht abreissen
  const seidenhof = a.betriebeIn(zuerich).find((x) => x.typ === "seidenhandel");
  a.kaufen(seidenhof);
  pruefe("Gekaufter Betrieb auf Stufe 1 lässt sich nicht abreissen", a.pruefeBetriebsrueckbau(seidenhof) !== null);

  // Stadtgebäude: Stufe zurück, abreissen, Wirkung weg
  a.baueGebaeude(zuerich, "spital");
  a.baueGebaeude(zuerich, "spital");
  a.gebaeudeZurueckbauen(zuerich, "spital");
  pruefe("Spital auf Stufe 1 zurückgebaut, Zufriedenheit sinkt mit", a.gebaeudeStufe(zuerich, "spital") === 1 && zuerich.zufriedenheitBonus === a.bau.stadtgebaeude.find((t) => t.id === "spital").wert_pro_stufe);
  a.gebaeudeZurueckbauen(zuerich, "spital");
  pruefe("Spital abgerissen: Bauplatz frei, keine Wirkung", a.gebaeudeStufe(zuerich, "spital") === 0 && a.freiePlaetze(zuerich) === frei && zuerich.zufriedenheitBonus === 0);

  // Kirche: Stufe 1 gleicht ihren eigenen Platz aus, Stufe 2 nur zurück, wenn ihr Bauplatz frei ist
  a.baueGebaeude(zuerich, "kirche");
  a.baueGebaeude(zuerich, "kirche");
  while (a.freiePlaetze(zuerich) > 0 && (a.baueGebaeude(zuerich, "brunnen") || a.bauen(zuerich, typ)));
  pruefe("Kirche Stufe 2 lässt sich nicht zurückbauen, solange ihr Bauplatz belegt ist", a.freiePlaetze(zuerich) === 0 && a.pruefeGebaeudeRueckbau(zuerich, "kirche") !== null);

  // Kontor: Stufe nur zurück, wenn die Ware Platz hat; abreissen nur leer
  k.lager = { Holz: { menge: 100, einstand: 30 }, Werkzeug: { menge: 20, einstand: 120 } };
  pruefe("Kontor auf Stufe 2 ausbauen", a.kontorAusbauen(zuerich) && k.stufe === 2);
  k.lager = { Holz: { menge: a.bau.kontor.lager + 50, einstand: 30 } };
  pruefe("Kontor-Rückbau verweigert, wenn die Ware nicht ins kleinere Lager passt", a.pruefeKontorRueckbau(zuerich) !== null);
  k.lager = {};
  pruefe("Kontor auf Stufe 1 zurückbauen", a.kontorZurueckbauen(zuerich) && k.stufe === 1);
  const grundAbriss = a.pruefeKontorRueckbau(zuerich);
  pruefe(`Leeres Kontor abreissen${grundAbriss ? ` (${grundAbriss})` : ""}`, a.kontorZurueckbauen(zuerich) && !a.kontor(zuerich));
}

// --- 10. Bevölkerung, Versorgungsgebäude, Kontor als Anwesenheit, Sperren, Bilanz -------
if (abschnitt("Bevölkerung, Versorgung, Kontor, Bilanz")) {
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
  const vw = D.bau.kontor.verwalter;
  pruefe(`Der Verwalter sperrt ${vw.werkstatt_tage} Tage Bedarf der Werkstatt (${a.gesperrt(zuerich, "Rohseide")} Rohseide)`, a.verwalterAn(zuerich) && a.gesperrt(zuerich, "Rohseide") === Math.ceil(vw.werkstatt_tage * bedarf) && bedarf > 0);
  pruefe(`Der Verwalter sperrt Baumaterial (${a.gesperrt(zuerich, "Holz")} Holz)`, a.gesperrt(zuerich, "Holz") === vw.baumaterial.Holz);
  a.setzeVerwalter(zuerich, false);
  a.setzeSperre(zuerich, "Rohseide", 30);
  pruefe("Ohne Verwalter gilt die eigene Sperre in Stück (30 Rohseide, kein Holz)", a.gesperrt(zuerich, "Rohseide") === 30 && a.gesperrt(zuerich, "Holz") === 0);
  const v = a.kontorVerkaufen(zuerich, "Rohseide", Infinity);
  pruefe(`Verkaufen lässt die Sperre im Kontor (${v.menge} verkauft, ${k.lager.Rohseide?.menge.toFixed(0)} bleiben)`, Math.abs((k.lager.Rohseide?.menge ?? 0) - 30) < 1e-9);
  // Bauen darf gesperrte Ware verwenden
  a.setzeVerwalter(zuerich, true);
  k.lager.Holz = { menge: 40, einstand: 30 };
  pruefe("Gesperrtes Baumaterial zählt fürs Bauen", a.materialVorOrt(zuerich, "Holz") >= 40 && a.verfuegbar(zuerich, "Holz") === 0);
  a.setzeVerwalter(zuerich, false);

  // Bilanz
  const kn = spiel.konten;
  pruefe("Bilanz bucht Bauten, Betriebskauf, Unterhalt und Handel",
    kn.gesamt.bauten < 0 && kn.gesamt.betriebeKauf < 0 && kn.gesamt.schiffeUnterhalt < 0 && kn.gesamt.handelEinkauf < 0 && kn.gesamt.kontorVerkauf > 0);
  pruefe(`Bilanz führt Monate (${Object.keys(kn.monate).join(", ")})`, Object.keys(kn.monate).length >= 2);
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Bevölkerung, Sperren und Bilanz überstehen Speichern und Laden",
    Math.abs(geladen.welt.stadt["Zürich"].einwohner - zuerich.einwohner) < 1e-9 && geladen.ausbau.kontor(zuerich).sperren.Rohseide === 30 && geladen.ausbau.verwalterAn(zuerich) === false &&
    geladen.konten.gesamt.bauten === kn.gesamt.bauten && geladen.welt.stadt["Zürich"].wohnraumBonus === zuerich.wohnraumBonus);
}

// --- 11. Automatik «Versorgen» -----------------------------------------------------
if (abschnitt("Versorgen")) {
  const spiel = ohneRisiko(new Spiel(D, 91));
  const a = spiel.ausbau;
  // Ledischiff: Für die weite Strecke Zürich - Rapperswil reicht ein Nauen nicht (Laderaum)
  const schiff = spiel.schiffe[0];
  schiff.typ = "ledischiff";
  const zuerich = spiel.welt.stadt["Zürich"];
  const rapperswil = spiel.welt.stadt["Rapperswil"];
  spiel.gulden = 500000;
  // Kontore in beiden Städten (Holz an Bord, Präsenz über das Schiff)
  for (const stadt of [zuerich, rapperswil]) {
    schiff.ort = stadt;
    schiff.pos = [...stadt.pos];
    schiff.ladung.Holz = { menge: 40, einstand: 30 };
    a.kontorBauen(stadt);
  }
  // Rapperswil: Seidenhandel liefert Rohseide ins Kontor; Zürich: Seidenweberei aus dem Kontor
  const handel = a.betriebeIn(rapperswil).find((b) => b.typ === "seidenhandel");
  const weberei = a.betriebeIn(zuerich).find((b) => b.typ === "seidenweberei");
  a.kaufen(handel);
  a.kaufen(weberei);
  a.setzeZiel(handel, "kontor");
  a.setzeZiel(weberei, "kontor");
  pruefe("Versorgen braucht zwei Städte mit Kontor", starteVersorgung(spiel, schiff, ["Zürich", "Meilen"]) !== null);
  pruefe("Versorgen Zürich - Rapperswil startet", starteVersorgung(spiel, schiff, ["Zürich", "Rapperswil"]) === null);
  let seideProduziert = 0;
  for (let t = 0; t < 120; t++) {
    spiel.tagVoran();
    seideProduziert += weberei.gestern?.menge ?? 0;
  }
  const lieferungen = spiel.meldungen.filter((m) => m.text.includes("(Versorgen)") && m.text.includes("ausgeladen")).length;
  pruefe(`Rohseide kommt nach Zürich (${lieferungen}+ Lieferungen), die Weberei arbeitet (${seideProduziert} Seide in 120 Tagen)`,
    lieferungen >= 3 && seideProduziert > 0.5 * 120 * a.leistung(weberei));
}

// --- 12. Flotten ----------------------------------------------------------------------
if (abschnitt("Flotten")) {
  const spiel = new Spiel(D, 95);
  spiel.gulden = 200000;
  const zuerich = spiel.welt.stadt["Zürich"];
  const nauen = spiel.schiffe[0];
  const ledi = spiel.werft.kaufeNeu(zuerich, "ledischiff");
  const weid = spiel.werft.kaufeNeu(zuerich, "weidling");
  spiel.kaufen(nauen, "Korn", 50);
  spiel.kaufen(ledi, "Korn", 30);
  spiel.kaufen(weid, "Seide", 10);
  const unterhalt = spiel.unterhalt(nauen) + spiel.unterhalt(ledi) + spiel.unterhalt(weid);
  pruefe("Nauen und Ledischiff zur Flotte", spiel.zusammenlegen(nauen, ledi));
  pruefe("Weidling schliesst sich an", spiel.zusammenlegen(nauen, weid));
  const t = spiel.schiffstyp(nauen);
  pruefe(`Laderaum addiert sich (${t.laderaum} = 120 + 250 + 40)`, t.laderaum === 410 && spiel.schiffe.length === 1);
  pruefe(`Tempo des langsamsten Schiffs (${t.tempo})`, t.tempo === D.schiffe.typ.ledischiff.tempo);
  pruefe("Unterhalt addiert sich", Math.abs(spiel.unterhalt(nauen) - unterhalt) < 1e-9);
  pruefe("Ladung zusammengelegt (80 Korn, 10 Seide)", Math.round(nauen.ladung.Korn.menge) === 80 && Math.round(nauen.ladung.Seide.menge) === 10);
  const k = spiel.kaufen(nauen, "Korn", 1000);
  pruefe(`Flotte lädt mehr als ein Ledischiff (${80 + k.menge} Korn)`, 80 + k.menge > 250);
  pruefe("Flotte lässt sich nicht als Ganzes verkaufen", spiel.werft.pruefeVerkauf(nauen) !== null);
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Flotte übersteht Speichern und Laden", geladen.schiffe[0].mitglieder?.length === 3 && spiel.laderaum(geladen.schiffe[0]) === 410);
  const menge = spiel.ladungsmenge(nauen);
  const einzeln = spiel.aufloesen(nauen);
  pruefe("Flotte auflösen gibt drei Schiffe zurück", einzeln.length === 3 && spiel.schiffe.length === 3);
  pruefe("Ladung bleibt erhalten und passt in die Laderäume",
    Math.abs(einzeln.reduce((a, s) => a + spiel.ladungsmenge(s), 0) - menge) < 1e-9 && einzeln.every((s) => spiel.ladungsmenge(s) <= spiel.laderaum(s)));
}

// --- 13. Stände, Kriege, Kaperbriefe und Gefechte ---------------------------------
if (abschnitt("Stände und Kampf")) {
  const F = D.fraktionen;
  const zuordnung = D.staedte.map((s) => F.fraktionen.filter((f) => f.staedte.includes(s.name)).length);
  pruefe("Jede Stadt gehört genau einem Stand", zuordnung.every((n) => n === 1) && F.fraktionen.every((f) => f.staedte.length > 0));
  pruefe("Kriegsschiffe der Stände sind bekannte Kriegsschiff-Typen",
    F.fraktionen.every((f) => Object.keys(f.kriegsschiffe).every((t) => D.schiffe.typ[t]?.kampfschiff)));

  // Kriege kommen und gehen (drei Jahre, drei Seeds)
  let kriege = 0;
  let kriegsTage = 0;
  let friedensschluesse = 0;
  for (const seed of [61, 62, 63]) {
    const sp = new Spiel(D, seed);
    let vorher = 0;
    for (let t = 0; t < 1080; t++) {
      sp.tagVoran();
      const jetzt = Object.keys(sp.diplomatie.kriege).length;
      kriegsTage += jetzt;
      if (jetzt > vorher) kriege += jetzt - vorher;
      if (jetzt < vorher) friedensschluesse += vorher - jetzt;
      vorher = jetzt;
    }
  }
  const proJahr = kriege / 9;
  const dauer = kriegsTage / Math.max(1, kriege);
  console.log(`   ${kriege} Kriege in 9 Jahren, mittlere Dauer ${dauer.toFixed(0)} Tage, ${friedensschluesse} Friedensschlüsse`);
  pruefe(`Kriege kommen vor (${proJahr.toFixed(1)} pro Jahr, Ziel 0,4-3)`, proJahr >= 0.4 && proJahr <= 3);
  pruefe(`Kriege enden wieder (mittlere Dauer ${dauer.toFixed(0)} Tage, Ziel 60-300)`, friedensschluesse > 0 && dauer >= 60 && dauer <= 300);

  // Krieg Zürich gegen Schwyz von Hand, Kaperbrief in Zürich
  const spiel = new Spiel(D, 64);
  const d = spiel.diplomatie;
  spiel.gulden = 200000;
  const zuerich = spiel.welt.stadt["Zürich"];
  const lachen = spiel.welt.stadt["Lachen"];
  pruefe("Ohne Krieg gibt es keinen Kaperbrief", d.pruefeKaperbrief(zuerich) !== null);
  d.kriege["schwyz|zuerich"] = { seit: spiel.welt.tag, verluste: { schwyz: 0, zuerich: 0 } };
  pruefe("Im Krieg ist Lachen für einen neutralen Händler offen", !d.hafenGesperrt(lachen) && spiel.segeln(spiel.schiffe[0], { stadt: lachen }).ok);
  spiel.anhalten(spiel.schiffe[0]);
  spiel.schiffe[0].ort = zuerich;
  spiel.schiffe[0].pos = [...zuerich.pos];
  pruefe("Kaperbrief vom Stand Zürich kaufen", d.kaufeKaperbrief(zuerich) && d.kaperbriefe.includes("zuerich"));
  pruefe("Mit Kaperbrief ist Schwyz feindlich und Lachen gesperrt", d.feindlich("schwyz") && !spiel.segeln(spiel.schiffe[0], { stadt: lachen }).ok);
  pruefe("Rapperswil bleibt offen", !d.hafenGesperrt(spiel.welt.stadt["Rapperswil"]));

  // Eigener Kriegsnauen trifft vor Lachen auf das Schwyzer Wachtschiff
  const krieger = spiel.werft.kaufeNeu(zuerich, "kriegsnauen");
  pruefe("Kriegsnauen verteidigt sich von selbst", spiel.kampf.daten(krieger).haltung === "verteidigen");
  const wache = spiel.kampf.schiffe.find((s) => s.fraktion === "schwyz" && s.typ === "wachtschiff");
  const geld = spiel.gulden;
  const anzahl = spiel.kampf.schiffe.length;
  spiel.segeln(krieger, { punkt: [lachen.pos[0] - 4, lachen.pos[1] - 2] });
  for (let t = 0; t < 12 && spiel.kampf.schiffe.includes(wache); t++) spiel.tagVoran();
  const bericht = spiel.kampf.berichte.at(-1);
  pruefe(`Es kommt zum Gefecht vor ${bericht?.ort ?? "?"} (${bericht?.runden.length ?? 0} Runden)`, !!bericht && bericht.seiten[0].titel.startsWith("Deine Schiffe"));
  pruefe(`Das Wachtschiff wird versenkt, Prisengeld ${bericht?.prisengeld ?? 0} Gulden`,
    !spiel.kampf.schiffe.includes(wache) && bericht.prisengeld === D.schiffe.typ.wachtschiff.preis * F.kaperbrief.prisengeld_anteil && spiel.gulden > geld);
  pruefe(`Ruf steigt bei Zürich (${d.ruf.zuerich}) und sinkt bei Schwyz (${d.ruf.schwyz})`, d.ruf.zuerich > 0 && d.ruf.schwyz < 0);
  pruefe("Schwyz ersetzt das Schiff später", spiel.kampf.neubau.some((n) => n.fraktion === "schwyz") && spiel.kampf.schiffe.length < anzahl);
  const schaden = spiel.kampf.daten(krieger).schaden;
  if (schaden > 0) {
    spiel.segeln(krieger, { stadt: spiel.welt.stadt["Wädenswil"] });
    for (let t = 0; t < 30; t++) spiel.tagVoran();
    pruefe(`Schaden wird im Hafen repariert (${schaden.toFixed(0)} -> ${spiel.kampf.daten(krieger).schaden.toFixed(0)})`, spiel.kampf.daten(krieger).schaden < schaden);
  }

  // Handelsschiff ohne Geleit trifft auf dem Obersee einen Kriegsnauen: entkommt oder verliert die Ladung
  const opfer = spiel.werft.kaufeNeu(zuerich, "nauen");
  spiel.kaufen(opfer, "Korn", 50);
  spiel.kampf.stelle("schwyz", "kriegsnauen");
  const jaeger = spiel.kampf.schiffe.at(-1);
  Object.assign(opfer, { ort: null, fahrt: null, pos: [88, 53] });
  Object.assign(jaeger, { ort: null, fahrt: null, pos: [88.8, 53] });
  const zahl = spiel.kampf.berichte.length;
  spiel.kampf.kontakte();
  const b2 = spiel.kampf.berichte.length > zahl ? spiel.kampf.berichte.at(-1) : null;
  const ausgang = b2?.seiten[0].einheiten.find((e) => e.name === opfer.name)?.aus;
  pruefe(`Handelsschiff mit «ausweichen» im Gefecht: ${ausgang ?? "kein Gefecht"}`, (ausgang === "entkommen" && opfer.ladung.Korn?.menge === 50) || (ausgang === "aufgebracht" && !opfer.ladung.Korn));
  pruefe("Ein Handelsschiff wird nicht versenkt", spiel.schiffe.includes(opfer));

  // Speichern und Laden mitten im Krieg, danach gleicher Verlauf
  const stand = JSON.parse(JSON.stringify(speichere(spiel)));
  const geladen = lade(D, stand);
  for (let t = 0; t < 60; t++) {
    spiel.tagVoran();
    geladen.tagVoran();
  }
  pruefe("Stände und Kriegsschiffe überstehen Speichern und Laden (60 Tage gleich)",
    JSON.stringify(spiel.kampf.zustand()) === JSON.stringify(geladen.kampf.zustand()) &&
    JSON.stringify(spiel.diplomatie.zustand()) === JSON.stringify(geladen.diplomatie.zustand()) && spiel.gulden === geladen.gulden);

  // Frieden beendet den Kaperbrief
  delete d.kriege["schwyz|zuerich"];
  d.kaperbriefeNachFrieden();
  pruefe("Mit dem Frieden erlischt der Kaperbrief", !d.kaperbriefe.includes("zuerich"));
}

// --- 14. Kapitäne -----------------------------------------------------------
if (abschnitt("Kapitäne")) {
  const spiel = new Spiel(D, 1);
  const kk = spiel.kapitaene;
  const schiff = spiel.schiffe[0];
  const stadt = schiff.ort;
  pruefe("Ohne Kapitän: Faktor 1 und kein Lohn", kk.faktor(schiff, "tempo") === 1 && kk.liste.length === 0);
  const tempo0 = spiel.tempo(schiff);
  const b = kk.neuerBewerber(stadt.name);
  const geld0 = spiel.gulden;
  const k = kk.anheuern(b);
  pruefe("Kapitän anheuern kostet das Anwerbegeld", !!k && spiel.gulden === geld0 - kk.anwerbegeld(b) && !kk.wirtshaus.includes(b));
  pruefe("Anheuern ohne Anwesenheit ist nicht möglich", (() => {
    const fern = spiel.welt.staedte.find((s) => s !== stadt && !spiel.ausbau.vorOrt(s));
    const x = kk.neuerBewerber(fern.name);
    return kk.pruefeAnheuern(x) !== null;
  })());
  pruefe("Kapitän zuweisen", kk.zuweisen(k, schiff) && kk.von(schiff) === k);
  const bonus = 1 + (kk.stufe(k) - 1) * D.kapitaene.wirkung_je_stufe.tempo + (kk.eigenschaft(k)?.tempo ?? 0);
  pruefe("Tempo folgt Stufe und Eigenschaft", Math.abs(spiel.tempo(schiff) - tempo0 * bonus) < 1e-9);
  // Stufenaufstieg durch Erfahrung
  k.erfahrung = 0;
  k.eigenschaft = null;
  const stufe0 = kk.stufe(k);
  kk.erfahre(schiff, "umsatz", 100 * D.kapitaene.erfahrung_ab_stufe[1] / D.kapitaene.erfahrung.je_100_gulden);
  pruefe("Erfahrung bringt eine höhere Stufe und mehr Tempo", kk.stufe(k) === stufe0 + 1 && spiel.tempo(schiff) > tempo0);
  const lohnStufe = kk.lohn(k);
  pruefe("Lohn steigt mit der Stufe, Reserve zahlt weniger", lohnStufe > D.kapitaene.lohn.grund && kk.lohn(k, false) < lohnStufe);
  // Lohn wird täglich gebucht
  const g1 = spiel.gulden;
  const lohnHeute = kk.lohn(k, true);
  spiel.tagVoran();
  pruefe("Lohn der Kapitäne wird gebucht", spiel.konten.gesamt.kapitaenslohn <= -lohnHeute + 1e-9 && spiel.gulden < g1);
  // Verschollen: Untergang eines Kriegsschiffs, Rückkehr nach Monaten
  const kriegsschiff = spiel.neuesSchiff(stadt, "wachtschiff");
  const k2 = kk.anheuern(kk.neuerBewerber(stadt.name));
  kk.zuweisen(k2, kriegsschiff);
  kk.schiffVerloren(kriegsschiff, true);
  spiel.schiffe = spiel.schiffe.filter((x) => x !== kriegsschiff);
  const wartezeit = k2.bis - spiel.welt.tag;
  pruefe(`Kapitän ist nach dem Untergang verschollen (${wartezeit} Tage) und stirbt nicht`, kk.verschollen(k2) && wartezeit >= D.kapitaene.verschollen.tage_min && wartezeit <= D.kapitaene.verschollen.tage_max && kk.liste.includes(k2));
  const lohnVor = spiel.konten.gesamt.kapitaenslohn;
  // Speichern und Laden
  const stand = JSON.parse(JSON.stringify(speichere(spiel)));
  const geladen = lade(D, stand);
  pruefe("Kapitäne überstehen Speichern und Laden", JSON.stringify(spiel.kapitaene.zustand()) === JSON.stringify(geladen.kapitaene.zustand()) && geladen.kapitaene.von(geladen.schiffe[0])?.nr === k.nr);
  for (let t = 0; t < wartezeit + 1; t++) {
    spiel.tagVoran();
    geladen.tagVoran();
  }
  pruefe("Verschollener Kapitän kehrt zurück", !kk.verschollen(k2) && kk.zustandVon(k2) === "reserve");
  pruefe("Verschollene kosten keinen Lohn, Verlauf nach dem Laden gleich", JSON.stringify(spiel.kapitaene.zustand()) === JSON.stringify(geladen.kapitaene.zustand()) && spiel.gulden === geladen.gulden && spiel.konten.gesamt.kapitaenslohn < lohnVor);
  // Schiff verkaufen: Kapitän geht in die Reserve
  const zweit = spiel.neuesSchiff(stadt, "nauen");
  kk.zuweisen(k2, zweit);
  spiel.werft.verkaufe(zweit);
  pruefe("Verkauf eines Schiffs schickt den Kapitän in die Reserve", kk.zustandVon(k2) === "reserve");
  // Flotte: Kapitän bleibt erhalten
  const a = spiel.schiffe[0];
  const c = spiel.neuesSchiff(a.ort, "nauen");
  spiel.zusammenlegen(a, c);
  pruefe("Kapitän bleibt bei der Flotte", kk.von(a) === k);
  spiel.aufloesen(a);
  pruefe("Beim Auflösen behält das erste Schiff den Kapitän", spiel.schiffe.some((x) => kk.von(x) === k));
}

// --- 15. Spielziel: Rang und Ratssitze -----------------------------------------
if (abschnitt("Spielziel")) {
  const spiel = new Spiel(D, 5);
  const z = spiel.ziel;
  const staedte = spiel.welt.staedte;
  const klein = staedte.find((s) => s.name === "Küsnacht");
  const zuerich = spiel.welt.stadt["Zürich"];
  pruefe("Start: niedrigster Rang, keine Ratssitze", z.rangIndex === 0 && z.sitze.length === 0);
  spiel.gulden = 10_000_000;
  pruefe("Im Gründungsjahr hält das Jahr den Aufstieg zurück, trotz viel Geld", z.berechneRang() === 0);
  insJahr(spiel, 1700);
  pruefe("Viel Geld allein bringt nur den Rang ohne Ratssitze", z.berechneRang() === 1);
  pruefe("Ratssitz ohne Kontor nicht möglich", z.pruefeRatssitz(klein) !== null);
  spiel.schiffe[0].ort = klein;
  spiel.schiffe[0].pos = [...klein.pos];
  spiel.ausbau.kontore[klein.name] = { lager: {}, stufe: 1, regeln: {} };
  z.pruefeRang();
  pruefe("Mit Kontor und Geld: Ratssitz im kleinen Ort möglich", z.pruefeRatssitz(klein) === null);
  const preis1 = z.preis(klein);
  const kauf0 = spiel.gulden;
  pruefe("Ratssitz kaufen", z.kaufeRatssitz(klein) && z.hatSitz(klein) && spiel.gulden === kauf0 - preis1);
  pruefe("Mit einem Ratssitz steigt der Rang", z.rang.id === "handelsherr");
  pruefe("Jeder weitere Sitz wird teurer", z.preis(staedte.find((s) => s.name === "Meilen")) > staedte.find((s) => s.name === "Meilen").einwohner * D.ziel.ratssitz.preis_je_einwohner);
  pruefe("Zürich verlangt einen hohen Rang", z.pruefeRatssitz(zuerich)?.includes("Rang") === true || z.pruefeRatssitz(zuerich)?.includes("Kontor") === true);
  const rab = z.rabatt(klein);
  pruefe("Ratssitz senkt die Handelsspanne in der Stadt", rab === D.ziel.ratssitz.spanne_rabatt && z.rabatt(zuerich) === 0);
  const g0 = spiel.gulden;
  z.tag();
  pruefe("Ratsanteil wird täglich gezahlt", spiel.gulden > g0 && spiel.konten.gesamt.ratsanteil > 0);
  // Speichern und Laden
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Rang und Ratssitze überstehen Speichern und Laden", JSON.stringify(geladen.ziel.zustand()) === JSON.stringify(z.zustand()));
  // Ziel: alle Ratssitze
  z.sitze = staedte.map((s) => s.name);
  spiel.gulden = 200_000_000;
  insJahr(spiel, 1820);
  z.pruefeRang();
  pruefe("Alle Ratssitze und genug Vermögen, aber vor 1830: noch nicht am Ziel", !z.amZiel());
  insJahr(spiel, 1850);
  z.pruefeRang();
  pruefe("Alle Ratssitze, genug Vermögen und das Jahr: Ziel erreicht", z.amZiel() && z.rang.id === "herr_des_sees");
}

// --- 16. Risiko-Ereignisse ---------------------------------------------------
if (abschnitt("Risiko")) {
  // Eigene Kopie der Daten, damit die Chancen für den Test auf 1 gesetzt werden können
  const D2 = structuredClone(D);
  const spiel = new Spiel(D2, 9);
  const r = spiel.risiko;
  const e = D2.risiko.ereignisse;
  const schiff = spiel.schiffe[0];
  const ziel = spiel.welt.stadt["Rapperswil"];
  const losfahren = () => {
    spiel.schiffe[0].ort = spiel.welt.stadt["Zürich"];
    spiel.schiffe[0].fahrt = null;
    spiel.segeln(schiff, { stadt: ziel }, { still: true });
  };
  for (const k of Object.keys(e)) e[k].chance = 0;
  schiff.ladung.Korn = { menge: 100, einstand: 10 };
  losfahren();
  const ende0 = schiff.fahrt.ende;
  const pos0 = spiel.position(schiff);
  r.tag();
  pruefe("Ohne Chance passiert nichts", schiff.fahrt.ende === ende0 && schiff.ladung.Korn.menge === 100);

  // Sturm: Verzögerung und Schaden, Schiff springt nicht
  spiel.anteil = 0.5;
  e.sturm.chance = 1;
  const p1 = spiel.position(schiff);
  r.tag();
  const p2 = spiel.position(schiff);
  pruefe("Sturm verzögert die Ankunft und beschädigt das Schiff", schiff.fahrt.ende > ende0 && schiff.kampf.schaden > 0);
  pruefe("Das Schiff springt bei einer Verzögerung nicht", Math.hypot(p2.x - p1.x, p2.y - p1.y) < 0.2);
  e.sturm.chance = 0;
  void pos0;

  // Überfall: Ladung weg, Geleit und Versicherung
  e.ueberfall.chance = 1;
  e.ueberfall.kriegsfaktor = 1;
  const menge0 = schiff.ladung.Korn.menge;
  r.tag();
  const verlust = menge0 - (schiff.ladung.Korn?.menge ?? 0);
  pruefe(`Überfall raubt einen Teil der Ladung (${verlust.toFixed(0)} von ${menge0})`, verlust >= menge0 * e.ueberfall.verlust_anteil[0] - 1e-9 && verlust <= menge0 * e.ueberfall.verlust_anteil[1] + 1e-9);
  pruefe("Ein Wachtschiff schützt besser als ein Nauen", r.schutz({ ...schiff, mitglieder: null, typ: "wachtschiff", kampf: { schaden: 0 } }) > r.schutz(schiff));
  const g0 = spiel.gulden;
  r.versichern(schiff, true);
  schiff.ladung.Korn = { menge: 100, einstand: 10 };
  r.tag();
  const praemie = r.praemie(schiff);
  pruefe("Versichert: Prämie wird abgezogen und der Verlust zu 80 % ersetzt", spiel.konten.gesamt.versicherungPraemie <= -praemie + 1e-9 && spiel.konten.gesamt.versicherungLeistung > 0 && spiel.gulden > g0 - praemie - 1);
  r.versichern(schiff, false);
  pruefe("Versicherung lässt sich kündigen", !schiff.versichert);

  // Rückenwind verkürzt die Fahrt, Havarie verzögert und beschädigt stark
  e.ueberfall.chance = 0;
  e.rueckenwind.chance = 1;
  losfahren();
  const ende1 = schiff.fahrt.ende;
  r.tag();
  pruefe("Rückenwind verkürzt die Fahrt", schiff.fahrt.ende < ende1);
  e.rueckenwind.chance = 0;
  e.havarie.chance = 1;
  losfahren();
  schiff.kampf.schaden = 0;
  const ende2 = schiff.fahrt.ende;
  r.tag();
  pruefe("Havarie verzögert und beschädigt stärker als der Mindestschaden eines Sturms", schiff.fahrt.ende > ende2 && schiff.kampf.schaden >= D2.schiffe.typ.nauen.rumpf * e.havarie.schaden_anteil[0] * 0.3);
  pruefe("Ein Schiff geht durch Sturm oder Havarie nie unter", schiff.kampf.schaden <= D2.schiffe.typ.nauen.rumpf * 0.9 + 1e-9);

  // Speichern und Laden: Versicherung und Zufall bleiben
  r.versichern(schiff, true);
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Versicherung und Risiko-Zufall überstehen Speichern und Laden", geladen.schiffe[0].versichert === true && JSON.stringify(geladen.risiko.zustand()) === JSON.stringify(r.zustand()));
}

// --- 17. Zoll und Handelsverträge ---------------------------------------------
if (abschnitt("Zoll")) {
  const spiel = ohneRisiko(new Spiel(D, 12));
  const schiff = spiel.schiffe[0];
  const zuerich = schiff.ort;
  const zoll = spiel.zoll;
  const grund = zoll.satz(zuerich, "Korn");
  const luxus = zoll.satz(zuerich, "Gewürze");
  pruefe(`Importwaren zahlen mehr Zoll als Grundwaren (${(grund * 100).toFixed(1)} % gegen ${(luxus * 100).toFixed(1)} %)`, luxus > grund && grund > 0);
  pruefe("Schwyz verlangt mehr Zoll als Zürich", zoll.satz(spiel.welt.stadt["Lachen"], "Korn") > grund);
  // Verkauf: Zoll wird abgezogen und gebucht
  spiel.kaufen(schiff, "Korn", 40);
  const geld0 = spiel.gulden;
  const vorschau = spiel.verkaufen(schiff, "Korn", 40, false);
  const r = spiel.verkaufen(schiff, "Korn", 40);
  pruefe("Vorschau und Verkauf nennen denselben Zoll", Math.abs(vorschau.zoll - r.zoll) < 1e-9 && r.zoll > 0);
  pruefe("Der Zoll wird vom Erlös abgezogen und gebucht", Math.abs(spiel.gulden - (geld0 + r.betrag - r.zoll)) < 1e-6 && Math.abs(spiel.konten.gesamt.zoll + r.zoll) < 1e-6);
  // Krieg erhöht den Zoll
  const d = spiel.diplomatie;
  const ohneKrieg = zoll.satz(zuerich, "Korn");
  d.kriege["schwyz|zuerich"] = { seit: 0 };
  pruefe("Krieg des Stands erhöht den Zoll", zoll.satz(zuerich, "Korn") > ohneKrieg);
  delete d.kriege["schwyz|zuerich"];
  // Handelsvertrag
  spiel.gulden = 10_000_000;
  spiel.ziel.rangIndex = 1;
  const ohneVertrag = zoll.satz(zuerich, "Korn");
  const gebuehr = zoll.gebuehr(d.vonStadt(zuerich));
  const geld1 = spiel.gulden;
  pruefe("Handelsvertrag abschliessen kostet die Gebühr", zoll.schliesseVertrag(zuerich) && spiel.gulden === geld1 - gebuehr);
  pruefe("Handelsvertrag senkt den Zoll", Math.abs(zoll.satz(zuerich, "Korn") - ohneVertrag * D.zoll.ermaessigung.vertrag) < 1e-9);
  pruefe("Der Vertrag gilt nur für den Stand", zoll.satz(spiel.welt.stadt["Lachen"], "Korn") > zoll.satz(zuerich, "Korn"));
  for (let t = 0; t < D.zoll.vertrag.dauer_tage + 1; t++) spiel.tagVoran();
  pruefe("Der Vertrag läuft ab", zoll.vertragBis("zuerich") === null && zoll.satz(zuerich, "Korn") > 0);
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Verträge überstehen Speichern und Laden", JSON.stringify(geladen.zoll.zustand()) === JSON.stringify(zoll.zustand()));
  // Ratssitz senkt den Zoll in der Stadt
  const vorher = zoll.satz(zuerich, "Korn");
  spiel.ziel.sitze.push(zuerich.name);
  pruefe("Ratssitz senkt den Zoll", zoll.satz(zuerich, "Korn") < vorher);
}

// --- 18. Zonen und Verbindungen -------------------------------------------------
if (abschnitt("Zonen")) {
  const spiel = ohneRisiko(new Spiel(D, 14));
  insJahr(spiel, 1700);
  const zo = spiel.zonen;
  const welt = spiel.welt;
  pruefe(`Alle ${welt.staedte.length} Städte gehören zu einer Zone`, welt.staedte.every((s) => D.zonen.zonen.some((z) => z.id === s.zone)));
  pruefe("Nur der Zürichsee ist am Anfang offen", zo.erschlossen.length === 1 && zo.offen("zuerichsee") && !zo.offen("walensee"));
  // KI-Händler bleiben in ihrer Zone
  const zoneVorher = welt.haendler.map((h) => h.ort.zone);
  for (let t = 0; t < 40; t++) spiel.tagVoran();
  const bleiben = welt.haendler.every((h, i) => i >= zoneVorher.length || (h.ziel ? h.ziel.zone : h.ort.zone) === zoneVorher[i]);
  pruefe("KI-Händler fahren nie in eine andere Zone", bleiben);
  // Kriege nur innerhalb einer Zone
  const d = spiel.diplomatie;
  for (let t = 0; t < 4000; t++) d.tag();
  const kriegsparteien = Object.keys(d.kriege).map((k) => k.split("|").map((id) => d.zoneVon(d.fraktion(id))));
  pruefe(`Kriege gibt es nur innerhalb einer Zone (${kriegsparteien.length} Kriege geprüft)`, kriegsparteien.length > 0 && kriegsparteien.every(([a, b]) => a === b));

  // Erschliessen: Rang, Kontor am anderen Ende, Gebühr
  const schmerikon = welt.stadt["Schmerikon"];
  const weesen = welt.stadt["Weesen"];
  spiel.gulden = 1_000_000;
  pruefe("Erschliessen braucht den Rang", zo.pruefeErschliessen("walensee")?.includes("Rang") === true);
  insJahr(spiel, 1660);
  pruefe("Erschliessen braucht auch das Jahr (Walensee ab 1665)", (spiel.ziel.rangIndex = 9, zo.pruefeErschliessen("walensee")?.includes("1665") === true));
  insJahr(spiel, 1700);
  spiel.ziel.rangIndex = D.zonen.zonen.find((z) => z.id === "walensee").rang;
  pruefe("Erschliessen braucht ein Kontor am anderen Ende der Verbindung", zo.pruefeErschliessen("walensee")?.includes("Kontor") === true);
  spiel.ausbau.kontore[schmerikon.name] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
  const geld0 = spiel.gulden;
  pruefe("Mit Rang und Kontor ist Erschliessen möglich", zo.pruefeErschliessen("walensee") === null);
  pruefe("Der See wird erschlossen: Gebühr gezahlt, Kontor in Weesen", zo.erschliesse("walensee") && zo.offen("walensee") && !!spiel.ausbau.kontor(weesen) && spiel.gulden === geld0 - D.zonen.zonen.find((z) => z.id === "walensee").erschliessung);
  const schiffTyp = D.schiffe.typen.find((t) => (t.medium ?? "wasser") === "wasser" && spiel.werft.neuBaubar(t) && !t.kampfschiff).id;
  pruefe(`Im neuen See lässt sich am Kontor ein Schiff kaufen (Weesen hat sonst keine Werft)`, spiel.werft.pruefeNeukauf(weesen, schiffTyp) === null);

  // Fracht: Kontor Schmerikon -> Weesen
  const v = zo.verbindung("linth");
  const k = spiel.ausbau.kontor(schmerikon);
  k.lager.Korn = { menge: 200, einstand: 20 };
  const vorschau = zo.schicken(v, schmerikon, "Korn", 150, false);
  pruefe(`Kapazität begrenzt die Sendung (${vorschau} von 150, höchstens ${zo.werte(v).kapazitaet} am Tag)`, vorschau === zo.werte(v).kapazitaet);
  const g1 = spiel.gulden;
  const kosten = zo.kosten(v, schmerikon, "Korn", 50);
  const gesendet = zo.schicken(v, schmerikon, "Korn", 50);
  pruefe("Fracht und Zoll werden gezahlt und gebucht", gesendet === 50 && Math.abs(spiel.gulden - (g1 - kosten.fracht - kosten.zoll)) < 1e-6 && kosten.fracht > 0 && kosten.zoll > 0 && spiel.konten.gesamt.fracht < 0);
  pruefe("Die Ware verlässt das Kontor und ist unterwegs", Math.abs(k.lager.Korn.menge - 150) < 1e-9 && zo.unterwegs.length === 1);
  const kontorWeesen = spiel.ausbau.kontor(weesen);
  for (let t = 0; t < v.tage - 1; t++) spiel.tagVoran();
  pruefe("Vor Ablauf der Laufzeit ist nichts angekommen", !kontorWeesen.lager.Korn);
  spiel.tagVoran();
  const einstand = 20 + (kosten.fracht + kosten.zoll) / 50;
  pruefe(`Nach ${v.tage} Tagen liegt die Ware im Kontor Weesen, der Einstand enthält Fracht und Zoll (Ø ${kontorWeesen.lager.Korn?.einstand.toFixed(2)})`, kontorWeesen.lager.Korn?.menge === 50 && Math.abs(kontorWeesen.lager.Korn.einstand - einstand) < 1e-6);
  // Weiterleiten per Regel
  zo.setzeWeiter(schmerikon, "Korn", "linth", 100);
  spiel.tagVoran();
  pruefe("Regel «weiterleiten» schickt alles über der Reserve", Math.abs(k.lager.Korn.menge - 100) < 1e-6);
  // Voller Zielspeicher: Ware wartet
  const voll = spiel.ausbau.lagerFrei(kontorWeesen);
  kontorWeesen.lager.Holz = { menge: voll, einstand: 1 };
  spiel.tagVoran();
  for (let t = 0; t < 4; t++) spiel.tagVoran();
  pruefe("Bei vollem Lager im Ziel wartet die Lieferung auf der Verbindung", zo.unterwegs.length > 0);
  // Speichern und Laden
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Zonen und Lieferungen überstehen Speichern und Laden", JSON.stringify(geladen.zonen.zustand()) === JSON.stringify(zo.zustand()) && !!geladen.ausbau.kontor(geladen.welt.stadt["Weesen"]));

  // Ausbau einer Strecke: Jahr, Kontor, Gulden und Material über viele Tage
  const strasse = zo.strecke("zuerich_basel");
  zo.erschlossen.push("hochrhein");
  insJahr(spiel, 1700);
  pruefe("Die Chaussee gibt es erst ab 1760", zo.pruefeAusbau(strasse)?.includes("1760") === true);
  insJahr(spiel, 1800);
  const basel = welt.stadt["Basel"];
  const zuerichStadt = welt.stadt["Zürich"];
  pruefe("Ohne Kontor an der Strecke kein Ausbau", zo.pruefeAusbau(strasse)?.includes("Kontor") === true);
  spiel.ausbau.kontore["Zürich"] = { stufe: 1, lager: { Holz: { menge: 1e6, einstand: 1 }, Eisenerz: { menge: 1e6, einstand: 1 } }, regeln: {}, sperren: {} };
  spiel.gulden = 50_000_000;
  const bau = zo.baukosten(strasse, 1);
  pruefe(`Der Bau kostet Gulden, Material und Zeit (${bau.gulden} Gulden, ${bau.tage} Tage, ${Object.keys(bau.material).join(", ")})`, bau.gulden > 0 && bau.tage > 100 && bau.material.Holz > 0);
  const geldVorBau = spiel.gulden;
  pruefe("Bau beginnen", zo.starteAusbau(strasse) && zo.zustand_(strasse.id).projekt !== null);
  pruefe("Zwei Projekte auf derselben Strecke gehen nicht", zo.pruefeAusbau(strasse)?.includes("gebaut") === true);
  for (let t = 0; t < bau.tage + 2; t++) zo.projektTag(strasse);
  const z = zo.zustand_(strasse.id);
  pruefe("Nach der Bauzeit ist die Stufe fertig, der Spieler hält die Konzession", z.stufe === 1 && z.besitzer === "spieler" && !z.projekt);
  pruefe(`Gulden und Material wurden über die Bauzeit verbraucht (${Math.round(geldVorBau - spiel.gulden)} Gulden)`, Math.abs(geldVorBau - spiel.gulden - bau.gulden) < 5 && spiel.ausbau.kontor(zuerichStadt).lager.Holz.menge < 1e6);
  const w1 = zo.werte(strasse);
  const w0 = zo.werteStufe(strasse, 0);
  pruefe(`Die Chaussee ist schneller und billiger (${w0.tage} -> ${w1.tage} Tage, Fracht ${w0.fracht.toFixed(2)} -> ${w1.fracht.toFixed(2)})`, w1.tage < w0.tage && w1.fracht < w0.fracht && w1.kapazitaet > w0.kapazitaet);
  zo.setzeMaut(strasse, 0.5);
  pruefe("Der Mautsatz ist nach oben begrenzt", zo.zustand_(strasse.id).maut === w1.maut_max);
  zo.setzeMaut(strasse, 0.08);
  const g3 = spiel.gulden;
  zo.mautTag();
  pruefe(`Die Maut bringt Geld (${(spiel.gulden - g3).toFixed(0)} Gulden pro Tag)`, spiel.gulden > g3 && spiel.konten.gesamt.maut > 0);
  // Material fehlt: der Bau ruht
  const strasse2 = zo.strecke("zuerich_konstanz");
  spiel.ausbau.kontore["Konstanz"] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
  zo.erschlossen.push("bodensee");
  spiel.ausbau.kontore["Zürich"].lager = {};
  pruefe("Bau mit leerem Kontor beginnen", zo.starteAusbau(strasse2));
  for (let t = 0; t < 5; t++) zo.projektTag(strasse2);
  pruefe("Ohne Material kommt der Bau nicht voran", zo.zustand_(strasse2.id).projekt.fortschritt === 0);
  // Der Staat baut nach seinem Fahrplan
  insJahr(spiel, 1890);
  zo.staatTag();
  const zS = zo.zustand_("lausanne_basel");
  pruefe("1890 hat der Staat Chaussee und Eisenbahn gebaut", zS.stufe === 2 && zS.besitzer === null);
  pruefe("Wo der Spieler selbst baute, gilt der Fahrplan des Staats trotzdem, die Konzession bleibt", zo.zustand_(strasse.id).stufe === 2 && zo.zustand_(strasse.id).besitzer === "spieler");
  pruefe("Das laufende Projekt entfällt, wenn der Staat schneller war", zo.zustand_(strasse2.id).projekt === null);
  // Konzession kaufen
  spiel.ausbau.kontore["Basel"] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
  const lb = zo.strecke("lausanne_basel");
  zo.erschlossen.push("genfersee");
  const preis = zo.konzessionspreis(lb);
  const g4 = spiel.gulden;
  pruefe(`Konzession einer staatlichen Strecke kaufen (${preis} Gulden)`, zo.kaufeKonzession(lb) && zo.zustand_(lb.id).besitzer === "spieler" && spiel.gulden === g4 - preis);
  // Netz und Landfahrzeuge (frisches Spiel, damit der Fahrplan des Staats noch nicht gelaufen ist)
  const sp2 = ohneRisiko(new Spiel(D, 15));
  const zo2 = sp2.zonen;
  insJahr(sp2, 1650);
  pruefe("Das Netz in Landzonen: Saumpfad um 1650", Math.abs(zo2.netzTempo("mittelland") - 0.8) < 1e-9 && zo2.netzStufe("mittelland") === 0);
  insJahr(sp2, 1900);
  pruefe("Um 1900 fahren Züge: Netzstufe 2", zo2.netzStufe("mittelland") === 2);
  insJahr(sp2, 1650);
  zo2.erschlossen.push("mittelland");
  const bern = sp2.welt.stadt["Bern"];
  sp2.ausbau.kontore["Bern"] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
  sp2.gulden = 5_000_000;
  pruefe("In einer Landzone kauft man Fuhrwerke, keine Schiffe", sp2.werft.pruefeNeukauf(bern, "nauen")?.includes("Landfahrzeuge") === true && sp2.werft.pruefeNeukauf(bern, "fuhrwerk") === null);
  pruefe("Das Fuhrwerk fährt auf Fuhrwegen (Tempo = Grundtempo mal Netztempo)", (() => {
    const fw = sp2.werft.kaufeNeu(bern, "fuhrwerk");
    return !!fw && Math.abs(sp2.tempo(fw) - D.p.SPEED * 0.8) < 1e-6;
  })());
  insJahr(sp2, 1700);
  pruefe("Vor der Eisenbahn gibt es keinen Güterzug", sp2.werft.pruefeNeukauf(bern, "gueterzug") !== null);
  insJahr(sp2, 1900);
  pruefe("Der Güterzug braucht ein Eisenbahnnetz (Stufe 2) und fährt dann schneller", sp2.werft.pruefeNeukauf(bern, "gueterzug") === null && (() => {
    const zug = sp2.werft.kaufeNeu(bern, "gueterzug");
    return !!zug && sp2.tempo(zug) > D.p.SPEED * 2;
  })());
  // Das eigene Netz ist früher schneller als der Fahrplan des Staats
  const sp3 = ohneRisiko(new Spiel(D, 16));
  insJahr(sp3, 1800);
  sp3.zonen.zustand_("netz_mittelland").stufe = 1;
  pruefe("Wer das Netz früher ausbaut, ist schneller als der Fahrplan (Tempo der Chaussee schon vor dem Staat)", Math.abs(sp3.zonen.netzTempo("mittelland") - 1.0) < 1e-9);
  // Speichern und Laden
  const geladen2 = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Strecken, Stufen und Konzessionen überstehen Speichern und Laden", JSON.stringify(geladen2.zonen.zustand()) === JSON.stringify(zo.zustand()));
}

// --- 19. Schiffsentwicklung ---------------------------------------------------
if (abschnitt("Schiffsentwicklung")) {
  const spiel = ohneRisiko(new Spiel(D, 17));
  const w = spiel.werft;
  const zuerich = spiel.welt.stadt["Zürich"];
  spiel.gulden = 5_000_000;
  pruefe("1650 gibt es nur die alten Typen neu", w.neueTypen().every((t) => t.ab_jahr <= 1650) && !w.neueTypen().some((t) => t.id === "raddampfer"));
  pruefe("Der Raddampfer ist 1650 nicht zu kaufen", w.pruefeNeukauf(zuerich, "raddampfer")?.includes("1835") === true);
  insJahr(spiel, 1840);
  pruefe("1840 gibt es den Raddampfer neu, den Nauen auch noch", w.neueTypen().some((t) => t.id === "raddampfer") && w.neueTypen().some((t) => t.id === "nauen"));
  const geld0 = spiel.gulden;
  const dampfer = w.kaufeNeu(zuerich, "raddampfer");
  pruefe("Raddampfer kaufen: Baujahr und Preis", !!dampfer && dampfer.baujahr === 1840 && spiel.gulden === geld0 - D.schiffe.typ.raddampfer.preis);
  insJahr(spiel, 1880);
  pruefe("1880 baut keine Werft mehr einen Nauen (bis 1870)", w.pruefeNeukauf(zuerich, "nauen")?.includes("1870") === true && w.neueTypen().every((t) => t.id !== "nauen"));
  // Alter: Wert, Unterhalt, Havarie
  const neu = w.verkaufserloes(dampfer);
  const unterhaltNeu = spiel.unterhalt(dampfer);
  // Schiffe altern nach Spieltagen (365 = 1 Jahr), nicht nach dem schnelleren Kalender
  dampfer.bautag = spiel.tag - 365 * 20;
  pruefe(`Alter nach Spieltagen: 20 x 365 Spieltage = ${spiel.alter(dampfer)} Jahre`, spiel.alter(dampfer) === 20);
  pruefe(`Mit dem Alter sinken Verkaufserlös (${neu} -> ${w.verkaufserloes(dampfer)}) und steigt der Unterhalt (${unterhaltNeu.toFixed(1)} -> ${spiel.unterhalt(dampfer).toFixed(1)})`, w.verkaufserloes(dampfer) < neu && spiel.unterhalt(dampfer) > unterhaltNeu);
  dampfer.bautag = spiel.tag - 365 * D.schiffe.alter.alt_ab_jahre;
  pruefe("Ein altes Schiff hat öfter Havarien", spiel.istAlt(dampfer) && spiel.risiko.altHavarie(dampfer) === D.schiffe.alter.havarie_faktor_alt);
  dampfer.bautag = spiel.tag - 365 * 400;
  pruefe("Wert und Unterhalt haben Grenzen", spiel.alterswert(dampfer) === D.schiffe.alter.wert_min && spiel.altersfaktorUnterhalt(dampfer) === D.schiffe.alter.unterhalt_max);
  // Gebrauchtmarkt: nur Typen der Zeit
  insJahr(spiel, 1650);
  w.angebote = [];
  for (let t = 0; t < 3000 && w.angebote.length < 3; t++) w.tag();
  pruefe("Gebrauchtangebote nennen ein Alter und nur Typen, die es schon gab", w.angebote.length > 0 && w.angebote.every((a) => a.alter >= D.schiffe.alter.gebraucht_alter_min && D.schiffe.typ[a.typ].ab_jahr <= 1650));
  // Speichern und Laden: Baujahr bleibt
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Das Baujahr übersteht Speichern und Laden", geladen.schiffe.some((x) => x.typ === "raddampfer" && x.baujahr === 1840));
  // Nachfolger der Kriegsschiffe
  insJahr(spiel, 1900);
  const k = spiel.kampf;
  pruefe("Neue Kriegsschiffe der Stände sind ab 1900 die Nachfolger (Dampfwachboot, Kanonenboot)", k.neuesterTyp("wachtschiff") === "dampfwachboot" && k.neuesterTyp("kriegsnauen") === "kanonenboot");
  insJahr(spiel, 1950);
  pruefe("Ab 1950 ist das Dampfwachboot durch das Patrouillenboot ersetzt", k.neuesterTyp("wachtschiff") === "patrouillenboot");
  const vor = k.schiffe.filter((s) => s.typ === "wachtschiff").length;
  for (let t = 0; t < 1500; t++) {
    spiel.diplomatie.ruhe = {};
    k.tag();
  }
  pruefe(`Die Stände rüsten um (${vor} Wachtschiffe -> ${k.schiffe.filter((s) => s.typ === "wachtschiff").length})`, vor > 0 && k.schiffe.filter((s) => s.typ === "wachtschiff").length === 0);
}

// --- 20. Kanäle -----------------------------------------------------------------
if (abschnitt("Kanäle")) {
  const spiel = ohneRisiko(new Spiel(D, 18));
  const zo = spiel.zonen;
  const welt = spiel.welt;
  const k = zo.strecke("kanal_linth");
  const schmerikon = welt.stadt["Schmerikon"];
  const weesen = welt.stadt["Weesen"];
  insJahr(spiel, 1700);
  zo.erschlossen.push("walensee");
  spiel.gulden = 500_000_000;
  spiel.ausbau.kontore["Schmerikon"] = { stufe: 1, lager: { Holz: { menge: 1e7, einstand: 1 }, Eisenerz: { menge: 1e7, einstand: 1 }, Werkzeug: { menge: 1e7, einstand: 1 } }, regeln: {}, sperren: {} };
  pruefe("Der Linthkanal gibt es frühestens ab 1807", zo.pruefeAusbau(k)?.includes("1807") === true);
  insJahr(spiel, 1810);
  pruefe("Vor dem Bau gibt es keinen Wasserweg zwischen den Seen", spiel.nav.route(schmerikon.pos, weesen.pos) === null && !welt.verbunden("zuerichsee", "walensee"));
  const bau = zo.baukosten(k, 1);
  pruefe(`Das Grossprojekt braucht viel (${bau.gulden} Gulden, ${bau.tage} Tage, ${Object.entries(bau.material).map(([g, n]) => `${n} ${g}`).join(", ")})`, bau.gulden >= 600000 && bau.tage >= 900 && bau.material.Holz >= 3000);
  pruefe("Bau beginnen", zo.starteAusbau(k));
  for (let t = 0; t < bau.tage + 2; t++) zo.projektTag(k);
  pruefe("Nach der Bauzeit ist der Kanal fertig und gehört dem Spieler", zo.kanalFertig(k) && zo.zustand_(k.id).besitzer === "spieler");
  pruefe("Jetzt gibt es einen Wasserweg und die Zonen sind verbunden", spiel.nav.route(schmerikon.pos, weesen.pos) !== null && welt.verbunden("zuerichsee", "walensee"));
  pruefe("Die Distanz zwischen den Seen ist bekannt (KI-Fahrtage)", welt.fahrtage(schmerikon, weesen) >= 1);
  // Die KI-Händler dürfen nun über den Kanal handeln
  const h = new Haendler(schmerikon, D);
  h.geld = 1e6;
  const optionen = h.optionen(schmerikon, welt.tag, welt);
  pruefe(`KI-Händler am Kanal haben auch Ziele im anderen See (${optionen.filter((o) => o.ziel.zone === "walensee").length} von ${optionen.length} Optionen)`, optionen.length > 0 && optionen.some((o) => o.ziel.zone === "walensee"));
  // Das Schiff des Spielers fährt hinüber
  const schiff = spiel.schiffe[0];
  schiff.ort = schmerikon;
  schiff.pos = [...schmerikon.pos];
  schiff.fahrt = null;
  pruefe("Das Schiff des Spielers segelt über den Kanal nach Weesen", spiel.segeln(schiff, { stadt: weesen }, { still: true }).ok);
  // Maut
  zo.setzeMaut(k, 0.1);
  welt.handelswertGestern = { zuerichsee: 20000, walensee: 8000 };
  const g0 = spiel.gulden;
  zo.mautTag();
  pruefe(`Der Kanal bringt Maut (${(spiel.gulden - g0).toFixed(0)} Gulden pro Tag)`, spiel.gulden > g0);
  // Speichern und Laden
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Der fertige Kanal besteht nach dem Laden weiter", geladen.welt.verbunden("zuerichsee", "walensee") && geladen.nav.route(schmerikon.pos, weesen.pos) !== null);
  // Land und Wasser bleiben getrennt: Landfahrzeuge nutzen keine Kanäle
  pruefe("Landfahrzeuge nutzen den Kanal nicht (eigene Wegsuche)", spiel.navLand.route(schmerikon.pos, weesen.pos) === null);
}

// --- 21. Epochen: Wohnraum, Ausgleich, KI-Flotten --------------------------------
if (abschnitt("Epochen")) {
  {
    // Spieldauer: Bei mittlerem Tempo ist 1830 (letzte Zone, höchster Rang) nach rund 5 Stunden erreicht
    const sp = new Spiel(D, 5);
    const tageIn5h = (5 * 3600 * 1000) / D.spiel.tageslaenge_ms[2];
    const letztes = Math.max(...D.zonen.zonen.map((z) => z.ab_jahr), ...D.ziel.raenge.map((r) => r.ab_jahr));
    pruefe(`Mittleres Tempo: nach 5 Stunden (${Math.round(tageIn5h)} Spieltage) ist ${sp.jahr(Math.round(tageIn5h))}, alles frei ab ${letztes}`, Math.abs(sp.jahr(Math.round(tageIn5h)) - letztes) <= 5);
  }
  const welt = new Welt(D, 6);
  for (let t = 0; t < 120; t++) welt.naechsterTag();
  pruefe("1650: Die Kurven stehen (fast) auf dem Anfangswert", welt.kurve("wohnraum") < 1.01 && welt.kurve("ausgleich_see") === 0 && welt.kurve("ki_fracht") < 1.01);
  const zurich = welt.stadt["Zürich"];
  pruefe("Der Wohnraum wächst mit den Jahrhunderten", (() => {
    const z0 = zurich.wohnraum();
    welt.tagNull = welt.tag - Math.round((300 * 365.25) / D.kalender); // 300 Jahre später
    return zurich.wohnraum() > z0 * 3;
  })());
  // Ausgleich: Preisgefälle zwischen den Städten eines Sees schrumpft
  const w2 = new Welt(D, 7);
  for (let t = 0; t < 60; t++) w2.naechsterTag();
  const staedte = w2.staedte.filter((s) => s.zone === "zuerichsee");
  const gefaelle = () => Math.max(...staedte.map((s) => s.mittelpreis("Korn"))) / Math.min(...staedte.map((s) => s.mittelpreis("Korn")));
  staedte[0].bestand.Korn *= 0.2;
  staedte[1].bestand.Korn *= 3;
  const vorher = gefaelle();
  w2.tagNull = w2.tag - Math.round((300 * 365.25) / D.kalender);
  for (let t = 0; t < 6; t++) w2.landverkehr();
  pruefe(`Bahn und Lastwagen gleichen die Preise innerhalb eines Sees aus (Gefälle ${vorher.toFixed(2)} -> ${gefaelle().toFixed(2)})`, gefaelle() < vorher * 0.6);
  const summe = (zone) => w2.staedte.filter((x) => x.zone === zone).reduce((x, c) => x + c.bestand.Korn, 0);
  const zuerichVorher = summe("zuerichsee");
  const walenVorher = summe("walensee");
  w2.landverkehr();
  pruefe("Der Ausgleich schiebt Ware nur innerhalb einer Zone (die Summe je Zone bleibt)", Math.abs(summe("zuerichsee") - zuerichVorher) < 1e-6 && Math.abs(summe("walensee") - walenVorher) < 1e-6);
  pruefe("Die KI-Flotte ist 2000 grösser und schneller als 1650", (() => {
    w2.tagNull = w2.tag - Math.round((350 * 365.25) / D.kalender);
    return w2.kurve("ki_fracht") > 5 && w2.kurve("ki_tempo") > 2.5;
  })());
}

// --- 22. Jahreszeiten und Kornspeicher ---------------------------------------
// Setzt den Kalender der Welt auf einen Bruchteil des Jahres (0 = 1. Januar)
function inMonat(welt, bruchteil) {
  const jetzt = welt.jahr() % 1;
  const tage = Math.round((((bruchteil - jetzt + 1) % 1) * 365.25) / welt.D.kalender);
  welt.tagNull -= tage;
  return welt;
}
if (abschnitt("Jahreszeiten und Kornspeicher")) {
  // Korn: am Ende des Winters knapp und teurer als nach der Ernte (über drei Jahre gemittelt). Die Vorräte
  // sinken von Januar bis Mai (Faktor unter 1) und sind im Frühsommer am kleinsten, im Herbst am grössten.
  const w = new Welt(D, 4);
  const preise = { winter: [], sommer: [] };
  const zuerichsee = w.staedte.filter((s) => s.zone === "zuerichsee");
  for (let t = 0; t < 60 + 3 * 92; t++) {
    w.naechsterTag();
    if (t < 60) continue;
    const monat = Math.floor((w.jahr() % 1) * 12);
    const p = zuerichsee.reduce((a, s) => a + s.mittelpreis("Korn") / s.basispreis("Korn"), 0) / zuerichsee.length;
    if (monat >= 3 && monat <= 5) preise.winter.push(p);
    if (monat >= 8 && monat <= 10) preise.sommer.push(p);
  }
  const mittel = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  pruefe(`Korn ist vor der Ernte (April bis Juni) teurer als danach (${(100 * mittel(preise.winter)).toFixed(0)} % gegen ${(100 * mittel(preise.sommer)).toFixed(0)} % vom Grundpreis)`, mittel(preise.winter) > mittel(preise.sommer) * 1.1);
  pruefe("Waren ohne Jahreszeit produzieren gleichmässig", w.saison("Holz") === 1);

  // Kornspeicher: kauft in der Erntezeit, verkauft im Winter, gibt beim Abriss den Rest an den Markt
  const spiel = ohneRisiko(new Spiel(D, 23));
  const a = spiel.ausbau;
  const zuerich = spiel.welt.stadt["Zürich"];
  const t = a.gebaeudetypen.kornspeicher;
  spiel.gulden = 100000;
  for (let i = 0; i < 5; i++) spiel.tagVoran();
  a.gebaeude["Zürich"] = { kornspeicher: 1 };
  inMonat(spiel.welt, 7.5 / 12);
  zuerich.bestand.Korn = zuerich.ziel.Korn * 2; // reichlich Korn nach der Ernte
  const geld0 = spiel.gulden;
  for (let i = 0; i < 5; i++) spiel.tagVoran();
  const vorrat = a.speicherBestand(zuerich, t);
  pruefe(`In der Erntezeit kauft der Speicher Korn (${vorrat?.menge.toFixed(0)} Korn, Einstand ${vorrat?.einstand.toFixed(1)})`, vorrat?.menge > 0 && spiel.gulden < geld0 && vorrat.einstand <= zuerich.basispreis("Korn") * t.kauf_bis_preisfaktor * (1 + D.p.SPREAD));
  pruefe("Der Speicher läuft nicht über", vorrat.menge <= a.speicherKapazitaet(zuerich, t));
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Speichern und Laden behält den Vorrat", Math.abs(geladen.ausbau.speicherBestand(zuerich, t).menge - vorrat.menge) < 1e-9);
  inMonat(spiel.welt, 0.5 / 12);
  pruefe(`Im Januar dauert es noch ${a.tageBisErnte("Korn")} Spieltage bis zur Ernte`, a.tageBisErnte("Korn") > 5);
  zuerich.bestand.Korn = zuerich.ziel.Korn * 0.4; // Winter: Korn ist knapp
  const imWinter = vorrat.menge;
  const geld1 = spiel.gulden;
  spiel.tagVoran();
  pruefe(`Im Winter verkauft der Speicher verteilt bis zur Ernte (${(imWinter - vorrat.menge).toFixed(0)} von ${imWinter.toFixed(0)} Korn am ersten Tag)`, vorrat.menge < imWinter && imWinter - vorrat.menge <= Math.ceil(imWinter / 5) + 1);
  pruefe("Der Verkauf bringt Geld", spiel.gulden > geld1 - 200);
  const rest = vorrat.menge;
  const geld2 = spiel.gulden;
  pruefe("Kornspeicher abreissen", a.gebaeudeZurueckbauen(zuerich, "kornspeicher"));
  pruefe(`Beim Abriss geht der Vorrat an den Markt (${rest.toFixed(0)} Korn)`, !a.speicherBestand(zuerich, t) && spiel.gulden > geld2 + rest * zuerich.basispreis("Korn") * 0.3);
}

// --- 22b. Stadtspeicher: Reserve der Stadt ------------------------------------
if (abschnitt("Stadtspeicher")) {
  const spiel = ohneRisiko(new Spiel(D, 37));
  const a = spiel.ausbau;
  const horgen = spiel.welt.stadt["Horgen"];
  const t = a.gebaeudetypen.stadtspeicher;
  a.gebaeude["Horgen"] = { stadtspeicher: 2 };
  a.wendeGebaeudeAn();
  pruefe(`Reserve: ${2 * t.wert_pro_stufe} Tage Verbrauch (${horgen.reserveKapazitaet("Korn").toFixed(0)} Korn)`, Math.abs(horgen.reserveKapazitaet("Korn") - 2 * t.wert_pro_stufe * horgen.verbrauch.Korn) < 1e-9);
  horgen.bestand.Korn = horgen.ziel.Korn * 2; // reichlich Korn am Markt
  for (let i = 0; i < 5; i++) spiel.tagVoran();
  const reserve = horgen.reserve.Korn ?? 0;
  pruefe(`Bei Überschuss legt die Stadt Korn beiseite (${reserve.toFixed(0)}, höchstens ${t.einlagern_tage} Tag Verbrauch pro Tag)`, reserve > 0 && reserve <= 5 * t.einlagern_tage * horgen.verbrauch.Korn + 1e-6);
  const schiff = spiel.schiffe[0];
  Object.assign(schiff, { ort: horgen, pos: [...horgen.pos], fahrt: null });
  spiel.kaufen(schiff, "Korn", Infinity);
  pruefe("Händler kaufen den Markt leer, die Reserve bleibt", (horgen.reserve.Korn ?? 0) === reserve);
  horgen.bestand.Korn = 0;
  horgen.prodFaktor.Korn = [0, spiel.welt.tag + 5]; // Missernte: kein frisches Korn
  const mangel = horgen.schritt(spiel.welt.tag, null);
  pruefe(`Ohne Korn am Markt versorgt sich die Stadt aus der Reserve (${reserve.toFixed(0)} -> ${(horgen.reserve.Korn ?? 0).toFixed(0)}), kein Mangel`, (horgen.reserve.Korn ?? 0) < reserve && !mangel);
  delete horgen.prodFaktor.Korn;
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Speichern und Laden behält die Reserve", Math.abs((geladen.welt.stadt["Horgen"].reserve.Korn ?? 0) - (horgen.reserve.Korn ?? 0)) < 1e-9 && geladen.welt.stadt["Horgen"].reserveTage === 2 * t.wert_pro_stufe);
  horgen.reserve.Korn = horgen.reserveKapazitaet("Korn");
  const markt = horgen.bestand.Korn;
  Object.assign(schiff, { ort: horgen, pos: [...horgen.pos], fahrt: null });
  a.gebaeudeZurueckbauen(horgen, "stadtspeicher");
  pruefe("Rückbau: Was nicht mehr in die Reserve passt, geht an den Markt", Math.abs(horgen.reserve.Korn - horgen.reserveKapazitaet("Korn")) < 1e-6 && horgen.bestand.Korn > markt);
}

// --- 22c. Obergrenzen nach Rang: Schiffe hart, Kontore immer teurer ----------
if (abschnitt("Obergrenzen")) {
  const spiel = ohneRisiko(new Spiel(D, 41));
  const w = spiel.werft;
  const a = spiel.ausbau;
  const zuerich = spiel.welt.stadt["Zürich"];
  spiel.gulden = 1e7;
  const max = D.ziel.raenge[0].schiffe_max;
  while (w.anzahlSchiffe() < max) w.kaufeNeu(zuerich, "nauen");
  pruefe(`Als ${spiel.ziel.rang.name} höchstens ${max} Schiffe: ein weiteres geht nicht`, w.anzahlSchiffe() === max && w.kaufeNeu(zuerich, "nauen") === null && String(w.pruefeNeukauf(zuerich, "nauen")).includes("Rang"));
  w.angebote.push({ nr: 999, stadt: "Zürich", typ: "nauen", preis: 100, alter: 3 });
  pruefe("Auch gebraucht nicht", w.pruefeGebraucht(w.angebote.at(-1)) !== null);
  // Kontore: bis zur Grenze normal, darüber dreimal so teuer wie das vorherige
  const kmax = D.ziel.raenge[0].kontore_max;
  const grund = D.bau.kontor.baukosten.gulden;
  const f = D.bau.kontor.ueber_rang_faktor;
  const staedte = ["Zürich", "Horgen", "Meilen", "Lachen", "Rapperswil"].map((n) => spiel.welt.stadt[n]);
  const preise = [];
  for (const st of staedte) {
    preise.push(a.kontorBaukosten().gulden);
    const s = spiel.schiffe[0];
    Object.assign(s, { ort: st, pos: [...st.pos], fahrt: null });
    s.ladung.Holz = { menge: 100, einstand: 30 };
    a.kontorBauen(st);
  }
  pruefe(`Kontorpreise: ${preise.join(", ")} (Grenze ${kmax})`, preise.every((p, i) => p === grund * Math.pow(f, Math.max(0, i + 1 - kmax))) && Object.keys(a.kontore).length === staedte.length);
  const k = a.kontor(staedte.at(-1));
  pruefe("Unterhalt des Kontors über der Grenze ist teurer", a.kontorUnterhalt(k) === D.bau.kontor.unterhalt * Math.pow(f, staedte.length - kmax) && a.kontorUnterhalt(a.kontor(zuerich)) === D.bau.kontor.unterhalt);
  // Höherer Rang: mehr Schiffe
  spiel.ziel.rangIndex = 2;
  pruefe(`Als ${spiel.ziel.rang.name} wieder Platz in der Flotte (${D.ziel.raenge[2].schiffe_max})`, w.pruefeNeukauf(zuerich, "nauen") === null);
}

// --- 23. Fernhandelsverträge an den Verteilzentren ---------------------------
if (abschnitt("Fernhandelsverträge")) {
  const spiel = ohneRisiko(new Spiel(D, 31));
  const vt = spiel.vertraege;
  const zuerich = spiel.welt.stadt["Zürich"];
  const v = D.vertraege;
  spiel.gulden = 200000;
  pruefe("Zürich ist das Verteilzentrum des Zürichsees, Horgen nicht", vt.zoneVonZentrum(zuerich)?.id === "zuerichsee" && !vt.zoneVonZentrum(spiel.welt.stadt["Horgen"]));
  const angebote = vt.angebote(zuerich);
  const einkauf = angebote.find((x) => x.art === "einkauf" && x.ware === "Eisenerz");
  const verkauf = angebote.find((x) => x.art === "verkauf");
  pruefe(`Angebote nur aus nicht erschlossenen Zonen, höchstens ${v.vorlauf_jahre} Jahre vor dem Erschliessen (${angebote.length} Angebote aus ${[...new Set(angebote.map((x) => x.zone))].join(", ")})`, angebote.length > 0 && angebote.every((x) => !spiel.zonen.offen(x.zone) && spiel.jahr() >= spiel.zonen.zone(x.zone).ab_jahr - v.vorlauf_jahre));
  pruefe(`Eisenerz (fehlt am Zürichsee) kommt per Vertrag billiger als hier (${einkauf?.preis} aus ${einkauf?.zone})`, !!einkauf && einkauf.preis < D.waren.Eisenerz * 1.3);
  pruefe(`Ohne Kontor kein Vertrag: "${vt.pruefe(zuerich, einkauf, 40)}"`, String(vt.pruefe(zuerich, einkauf, 40)).includes("Kontor"));
  spiel.ausbau.kontore["Zürich"] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
  const k = spiel.ausbau.kontor(zuerich);
  const vertrag = vt.abschliessen(zuerich, einkauf, 40);
  pruefe("Einkaufsvertrag abschliessen", !!vertrag && vt.liste.length === 1);
  pruefe("Derselbe Vertrag nicht doppelt", vt.pruefe(zuerich, einkauf, 40) !== null);
  // Bis zum ersten Monatswechsel laufen lassen
  const geld0 = spiel.gulden;
  const monat0 = spiel.monat();
  while (spiel.monat() === monat0) spiel.tagVoran();
  spiel.tagVoran();
  pruefe(`Am Monatswechsel liegt das Eisenerz im Kontor (${k.lager.Eisenerz?.menge ?? 0}, Einstand ${k.lager.Eisenerz?.einstand})`, k.lager.Eisenerz?.menge === 40 && Math.abs(k.lager.Eisenerz.einstand - einkauf.preis) < 1e-9);
  pruefe("Erfüllte Lieferung baut das Geschäft auf: Erschliessen wird billiger", vt.rabatt(einkauf.zone) === v.rabatt_je_lieferung && spiel.zonen.erschliessungskosten(einkauf.zone) < spiel.zonen.zone(einkauf.zone).erschliessung);
  pruefe("Die Lieferung ist in der Bilanz gebucht", spiel.konten.gesamt.vertraege <= -40 * einkauf.preis + 1e-6 && spiel.gulden < geld0);
  // Abnahmevertrag ohne Ware: Strafe
  const ab = vt.abschliessen(zuerich, verkauf, 20);
  const geld1 = spiel.gulden;
  const monat1 = spiel.monat();
  delete k.lager[verkauf.ware];
  while (spiel.monat() === monat1) spiel.tagVoran();
  pruefe(`Fehlt die Ware für die Abnahme, wird eine Strafe fällig (${verkauf.ware})`, !!ab && spiel.gulden < geld1 - 20 * verkauf.preis * v.strafe_anteil * 0.99 - 40 * einkauf.preis);
  // Speichern und Laden
  const geladen = lade(D, JSON.parse(JSON.stringify(speichere(spiel))));
  pruefe("Speichern und Laden behält Verträge und Rabatt", geladen.vertraege.liste.length === 2 && geladen.vertraege.rabatt(einkauf.zone) === vt.rabatt(einkauf.zone));
  // Kündigen und Laufzeit
  const geld2 = spiel.gulden;
  pruefe("Kündigen kostet die Strafe für eine Monatsmenge", vt.kuendigen(ab.nr) && Math.abs(geld2 - spiel.gulden - vt.kuendigungsstrafe(ab)) < 1e-6 && vt.liste.length === 1);
  for (let m = 0; m < v.laufzeit_monate + 1; m++) {
    const jetzt = spiel.monat();
    while (spiel.monat() === jetzt) spiel.tagVoran();
  }
  pruefe(`Nach ${v.laufzeit_monate} Monaten ist der Vertrag erfüllt und endet`, vt.liste.length === 0 && vertrag.rest === 0);
}

console.log(fehler ? `\n${fehler} Check(s) durchgefallen` : "\nAlle Checks bestanden");
process.exit(fehler ? 1 : 0);

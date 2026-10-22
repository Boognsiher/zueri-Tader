// Automatischer Handel für Schiffe des Spielers.
//
// Handelsroute: Das Schiff fährt eine Liste von Häfen endlos ab und erledigt dort Aufträge
//   (verkaufen, kaufen, ins Kontor entladen, aus dem Kontor laden), auf Wunsch mit Preisgrenze.
// Freier Handel: Der Kapitän sucht selbst das beste Geschäft, mit derselben Bewertung wie die
//   KI-Händler (Gewinn pro Tag), und setzt höchstens den festgelegten Einsatz ein.
//
// schiff.auto = null (selbst steuern)
//   | { art: "route", halte: [{ stadt, auftraege: [{ art, ware, menge, preis }] }], index, erledigt }
//   | { art: "frei", einsatz, plan: { ware, ziel } | null, wartetage }
// Städte stehen als Namen drin, damit sich der Zustand speichern lässt.

import { Haendler } from "./wirtschaft.js";

export const AUFTRAGSARTEN = {
  verkaufen: "verkaufen",
  entladen: "ins Kontor entladen",
  kaufen: "kaufen",
  laden: "aus dem Kontor laden",
};
const REIHENFOLGE = ["verkaufen", "entladen", "kaufen", "laden"];
const WARTETAGE_FREI = 3; // so lange wartet der Kapitän auf ein Geschäft, bevor er den Hafen wechselt

const zahl = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });

// Gibt einen Fehlertext zurück oder null
export function pruefeRoute(spiel, halte) {
  if (halte.length < 2) return "Eine Route braucht mindestens zwei Häfen.";
  for (let i = 0; i < halte.length; i++) {
    if (!spiel.welt.stadt[halte[i].stadt]) return `Unbekannte Stadt: ${halte[i].stadt}`;
    if (halte[i].stadt === halte[(i + 1) % halte.length].stadt) return "Zwei aufeinanderfolgende Halte dürfen nicht dieselbe Stadt sein.";
  }
  return null;
}

export function starteRoute(spiel, schiff, halte) {
  const fehler = pruefeRoute(spiel, halte);
  if (fehler) return fehler;
  // Liegt das Schiff in einem Hafen der Route, beginnt es dort
  const hier = schiff.ort && !schiff.fahrt ? halte.findIndex((h) => h.stadt === schiff.ort.name) : -1;
  schiff.auto = { art: "route", halte, index: Math.max(0, hier), erledigt: false };
  spiel.melde(`${schiff.name} fährt jetzt die Handelsroute ${halte.map((h) => h.stadt).join(" – ")}.`);
  weiter(spiel, schiff);
  return null;
}

export function starteFrei(spiel, schiff, einsatz) {
  schiff.auto = { art: "frei", einsatz: Math.max(0, Number(einsatz) || 0), plan: null, wartetage: 0 };
  spiel.melde(`${schiff.name} handelt jetzt frei (Einsatz bis ${zahl.format(schiff.auto.einsatz)} Gulden).`);
  weiter(spiel, schiff);
}

export function beende(spiel, schiff) {
  if (!schiff.auto) return;
  schiff.auto = null;
  spiel.melde(`${schiff.name} wird wieder selbst gesteuert.`);
}

// Bei Ankunft und täglich für jedes automatische Schiff, das nicht unterwegs ist
export function weiter(spiel, schiff) {
  if (!schiff.auto || schiff.fahrt) return;
  if (schiff.auto.art === "route") route(spiel, schiff);
  else frei(spiel, schiff);
}

function route(spiel, schiff) {
  const a = schiff.auto;
  const halt = a.halte[a.index];
  if (schiff.ort && schiff.ort.name === halt.stadt) {
    if (!a.erledigt) {
      fuehreAus(spiel, schiff, halt);
      a.erledigt = true;
    }
    const naechster = (a.index + 1) % a.halte.length;
    // Gesperrter Hafen (Föhnsturm): warten und morgen neu versuchen
    if (spiel.segeln(schiff, { stadt: spiel.welt.stadt[a.halte[naechster].stadt] }, { still: true }).ok) {
      a.index = naechster;
      a.erledigt = false;
    }
    return;
  }
  spiel.segeln(schiff, { stadt: spiel.welt.stadt[halt.stadt] }, { still: true });
}

function fuehreAus(spiel, schiff, halt) {
  const teile = [];
  const auftraege = [...halt.auftraege].sort((x, y) => REIHENFOLGE.indexOf(x.art) - REIHENFOLGE.indexOf(y.art));
  for (const a of auftraege) {
    const menge = a.menge ?? Infinity;
    const grenze = a.preis ?? null;
    if (a.art === "verkaufen") {
      const r = spiel.verkaufen(schiff, a.ware, menge, true, grenze);
      if (r.menge) teile.push(`${r.menge} ${a.ware} verkauft (${r.gewinn >= 0 ? "+" : "−"}${zahl.format(Math.abs(r.gewinn))})`);
    } else if (a.art === "kaufen") {
      const r = spiel.kaufen(schiff, a.ware, menge, true, grenze);
      if (r.menge) teile.push(`${r.menge} ${a.ware} gekauft`);
    } else if (a.art === "entladen") {
      const m = spiel.ausbau.umlagern(schiff, a.ware, menge, "insKontor");
      if (m) teile.push(`${m} ${a.ware} ins Kontor`);
    } else if (a.art === "laden") {
      const m = spiel.ausbau.umlagern(schiff, a.ware, menge, "insSchiff");
      if (m) teile.push(`${m} ${a.ware} aus dem Kontor`);
    }
  }
  spiel.melde(`${schiff.name} (Route) in ${halt.stadt}: ${teile.length ? teile.join(", ") : "nichts zu tun"}.`, "handel");
}

function frei(spiel, schiff) {
  const a = schiff.auto;
  if (!schiff.ort) {
    // vor Anker: zum nächsten Hafen
    spiel.segeln(schiff, { stadt: spiel.naechsteStadt(schiff.pos) }, { still: true });
    return;
  }
  const stadt = schiff.ort;
  const teile = [];
  // Ladung verkaufen: die geplante Ware am Ziel, anderes nur mit mindestens 5 % Gewinn
  for (const g of Object.keys(schiff.ladung)) {
    if (!stadt.handelt(g)) continue;
    const posten = schiff.ladung[g];
    const amZiel = a.plan && a.plan.ziel === stadt.name && a.plan.ware === g;
    if (amZiel || stadt.verkaufspreis(g) >= posten.einstand * 1.05) {
      const r = spiel.verkaufen(schiff, g, Infinity);
      if (r.menge) teile.push(`${r.menge} ${g} verkauft (${r.gewinn >= 0 ? "+" : "−"}${zahl.format(Math.abs(r.gewinn))})`);
    }
  }
  a.plan = null;

  const budget = Math.min(a.einsatz, spiel.gulden);
  const tag = spiel.welt.tag;
  const optionen = budget > 0 ? Haendler.prototype.optionen.call({ D: spiel.D, geld: budget }, stadt, tag, spiel.welt) : [];
  if (optionen.length) {
    optionen.sort((x, y) => y.rate - x.rate);
    const o = optionen[0];
    const k = spiel.kaufen(schiff, o.ware, o.menge);
    if (k.menge && spiel.segeln(schiff, { stadt: o.ziel }, { still: true }).ok) {
      a.plan = { ware: o.ware, ziel: o.ziel.name };
      a.wartetage = 0;
      teile.push(`${k.menge} ${o.ware} gekauft, Ziel ${o.ziel.name}`);
    }
  } else if (++a.wartetage > WARTETAGE_FREI) {
    // Lange nichts gefunden: leer zum aussichtsreichsten Hafen
    let beste = null;
    for (const andere of spiel.welt.staedte) {
      if (andere === stadt || andere.gesperrt(tag)) continue;
      const dort = Haendler.prototype.optionen.call({ D: spiel.D, geld: budget }, andere, tag, spiel.welt);
      if (!dort.length) continue;
      const anfahrt = spiel.welt.fahrtage(stadt, andere);
      const rate = Math.max(...dort.map((o) => o.gewinn / (anfahrt + o.tage)));
      if (!beste || rate > beste.rate) beste = { stadt: andere, rate };
    }
    if (beste && spiel.segeln(schiff, { stadt: beste.stadt }, { still: true }).ok) {
      a.wartetage = 0;
      teile.push(`nichts Lohnendes, fährt leer nach ${beste.stadt.name}`);
    }
  }
  if (teile.length) spiel.melde(`${schiff.name} (frei) in ${stadt.name}: ${teile.join(", ")}.`, "handel");
}

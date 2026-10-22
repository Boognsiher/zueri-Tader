// Automatischer Handel für Schiffe des Spielers.
//
// Handelsroute: Das Schiff fährt eine Liste von Häfen endlos ab und erledigt dort Aufträge
//   (verkaufen, kaufen, ins Kontor entladen, aus dem Kontor laden), auf Wunsch mit Preisgrenze.
// Freier Handel: Der Kapitän sucht selbst das beste Geschäft, mit derselben Bewertung wie die
//   KI-Händler (Gewinn pro Tag), und setzt höchstens den festgelegten Einsatz ein. Den restlichen
//   Laderaum füllt er mit weiteren Waren, die sich am selben Ziel lohnen.
// Lenkt der Spieler ein automatisches Schiff von Hand, pausiert die Automatik (auto.pausiert),
// bis er sie wieder aufnimmt.
// Laden und Löschen braucht Zeit: Das Schiff bleibt im Hafen, bis die umgeschlagene Menge
// geschafft ist (schiffe.json: umschlag_pro_tag je Schiffstyp). auto.abfahrt = frühester Abfahrtszeitpunkt.
//
// schiff.auto = null (selbst steuern)
//   | { art: "route", halte: [{ stadt, auftraege: [{ art, ware, menge, preis }] }], index, erledigt, pausiert }
//   | { art: "frei", einsatz, plan: { waren, ziel } | null, wartetage, pausiert }
// Städte stehen als Namen drin, damit sich der Zustand speichern lässt.

import { Haendler, angebot } from "./wirtschaft.js";

export const AUFTRAGSARTEN = {
  verkaufen: "verkaufen",
  entladen: "ins Kontor entladen",
  kaufen: "kaufen",
  laden: "aus dem Kontor laden",
};
// Erst verkaufen und einkaufen, dann ins Kontor entladen (auch eben Gekauftes), dann laden
const REIHENFOLGE = ["verkaufen", "kaufen", "entladen", "laden"];
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

// Läuft die Automatik (vorhanden und nicht pausiert)?
export function aktiv(schiff) {
  return !!schiff.auto && !schiff.auto.pausiert;
}

export function pausiere(spiel, schiff) {
  if (!aktiv(schiff)) return;
  schiff.auto.pausiert = true;
  spiel.melde(`Automatik von ${schiff.name} pausiert (von Hand gesteuert).`);
}

export function nimmAuf(spiel, schiff) {
  if (!schiff.auto || !schiff.auto.pausiert) return;
  schiff.auto.pausiert = false;
  schiff.auto.abfahrt = null;
  if (schiff.auto.art === "route") schiff.auto.erledigt = false;
  spiel.melde(`Automatik von ${schiff.name} läuft wieder.`);
  // Fährt das Schiff gerade auf ein selbst gesetztes Ziel zu, übernimmt die Automatik sofort
  if (schiff.fahrt) spiel.anhalten(schiff);
  weiter(spiel, schiff);
}

export function beende(spiel, schiff) {
  if (!schiff.auto) return;
  schiff.auto = null;
  spiel.melde(`${schiff.name} wird wieder selbst gesteuert.`);
}

// Bei Ankunft und täglich für jedes automatische Schiff, das nicht unterwegs ist
export function weiter(spiel, schiff) {
  if (!aktiv(schiff) || schiff.fahrt) return;
  // Noch beim Laden oder Löschen
  if (schiff.auto.abfahrt != null && spiel.zeit < schiff.auto.abfahrt) return;
  if (schiff.auto.art === "route") route(spiel, schiff);
  else frei(spiel, schiff);
}

function route(spiel, schiff) {
  const a = schiff.auto;
  const halt = a.halte[a.index];
  if (schiff.ort && schiff.ort.name === halt.stadt) {
    if (!a.erledigt) {
      const menge = fuehreAus(spiel, schiff, halt);
      a.erledigt = true;
      a.abfahrt = spiel.zeit + liegezeit(spiel, schiff, menge);
      if (spiel.zeit < a.abfahrt) return;
    }
    a.abfahrt = null;
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

// Liegezeit in Tagen für eine umgeschlagene Menge (je nach Schiffstyp)
function liegezeit(spiel, schiff, menge) {
  return menge / spiel.schiffstyp(schiff).umschlag_pro_tag;
}

function tageText(tage) {
  return tage >= 0.05 ? `, Liegezeit ${tage.toLocaleString("de-CH", { maximumFractionDigits: 1 })} Tage` : "";
}

// Erledigt die Aufträge eines Halts, gibt die umgeschlagene Menge zurück
function fuehreAus(spiel, schiff, halt) {
  const teile = [];
  let umschlag = 0;
  const auftraege = [...halt.auftraege].sort((x, y) => REIHENFOLGE.indexOf(x.art) - REIHENFOLGE.indexOf(y.art));
  for (const a of auftraege) {
    const menge = a.menge ?? Infinity;
    const grenze = a.preis ?? null;
    if (a.art === "verkaufen") {
      const r = spiel.verkaufen(schiff, a.ware, menge, true, grenze);
      umschlag += r.menge;
      if (r.menge) teile.push(`${r.menge} ${a.ware} verkauft (${r.gewinn >= 0 ? "+" : "−"}${zahl.format(Math.abs(r.gewinn))})`);
    } else if (a.art === "kaufen") {
      const r = spiel.kaufen(schiff, a.ware, menge, true, grenze);
      umschlag += r.menge;
      if (r.menge) teile.push(`${r.menge} ${a.ware} gekauft`);
    } else if (a.art === "entladen") {
      const m = spiel.ausbau.umlagern(schiff, a.ware, menge, "insKontor");
      umschlag += m;
      if (m) teile.push(`${m} ${a.ware} ins Kontor`);
    } else if (a.art === "laden") {
      const m = spiel.ausbau.umlagern(schiff, a.ware, menge, "insSchiff");
      umschlag += m;
      if (m) teile.push(`${m} ${a.ware} aus dem Kontor`);
    }
  }
  spiel.melde(`${schiff.name} (Route) in ${halt.stadt}: ${teile.length ? teile.join(", ") : "nichts zu tun"}${tageText(liegezeit(spiel, schiff, umschlag))}.`, "handel");
  return umschlag;
}

function frei(spiel, schiff) {
  const a = schiff.auto;
  if (!schiff.ort) {
    // vor Anker (z. B. nach einer Pause): zum geplanten Ziel der Ladung, sonst zum nächsten Hafen
    const ziel = a.plan ? spiel.welt.stadt[a.plan.ziel] : spiel.naechsteStadt(schiff.pos);
    spiel.segeln(schiff, { stadt: ziel }, { still: true });
    return;
  }
  const stadt = schiff.ort;
  // Geladen: jetzt zum Ziel ablegen
  if (a.abfahrt != null && a.plan) {
    if (spiel.segeln(schiff, { stadt: spiel.welt.stadt[a.plan.ziel] }, { still: true }).ok) a.abfahrt = null;
    return;
  }
  a.abfahrt = null;
  const teile = [];
  let umschlag = 0;
  // Ladung verkaufen: die geplante Ware am Ziel, anderes nur mit mindestens 5 % Gewinn
  for (const g of Object.keys(schiff.ladung)) {
    if (!stadt.handelt(g)) continue;
    const posten = schiff.ladung[g];
    const amZiel = a.plan && a.plan.ziel === stadt.name && a.plan.waren.includes(g);
    if (amZiel || stadt.verkaufspreis(g) >= posten.einstand * 1.05) {
      const r = spiel.verkaufen(schiff, g, Infinity);
      umschlag += r.menge;
      if (r.menge) teile.push(`${r.menge} ${g} verkauft (${r.gewinn >= 0 ? "+" : "−"}${zahl.format(Math.abs(r.gewinn))})`);
    }
  }
  a.plan = null;

  const budget = Math.min(a.einsatz, spiel.gulden);
  const tag = spiel.welt.tag;
  const bewerter = { D: spiel.D, geld: budget, laderaum: spiel.freierLaderaum(schiff) };
  const optionen = budget > 0 ? Haendler.prototype.optionen.call(bewerter, stadt, tag, spiel.welt) : [];
  if (optionen.length) {
    optionen.sort((x, y) => y.rate - x.rate);
    const o = optionen[0];
    const k = spiel.kaufen(schiff, o.ware, o.menge);
    umschlag += k.menge;
    if (k.menge) {
      const gekauft = [`${k.menge} ${o.ware}`];
      const waren = [o.ware];
      // Restlichen Laderaum mit weiteren Waren für dasselbe Ziel füllen, die lohnendste zuerst
      const p = spiel.D.p;
      const weitere = Object.keys(stadt.bestand)
        .filter((g) => g !== o.ware && stadt.bestand[g] >= 5 && o.ziel.handelt(g))
        .map((g) => ({ g, ...angebot(spiel.D, stadt, o.ziel, g, Math.min(a.einsatz - k.betrag, spiel.gulden), spiel.freierLaderaum(schiff)) }))
        .filter((x) => x.menge > 0 && x.erloes - x.kosten >= p.MIN_PROFIT && (x.erloes - x.kosten) / x.kosten >= p.MIN_ROI)
        .sort((x, y) => y.erloes - y.kosten - (x.erloes - x.kosten));
      let ausgegeben = k.betrag;
      for (const x of weitere) {
        const rest = Math.min(a.einsatz - ausgegeben, spiel.gulden);
        const neu = angebot(spiel.D, stadt, o.ziel, x.g, rest, spiel.freierLaderaum(schiff));
        if (neu.menge <= 0 || neu.erloes - neu.kosten < p.MIN_PROFIT) continue;
        const r = spiel.kaufen(schiff, x.g, neu.menge);
        if (r.menge) {
          umschlag += r.menge;
          ausgegeben += r.betrag;
          gekauft.push(`${r.menge} ${x.g}`);
          waren.push(x.g);
        }
      }
      // Erst laden, dann ablegen (Liegezeit nach Umschlag)
      a.plan = { waren, ziel: o.ziel.name };
      a.wartetage = 0;
      a.abfahrt = spiel.zeit + liegezeit(spiel, schiff, umschlag);
      teile.push(`${gekauft.join(", ")} gekauft, Ziel ${o.ziel.name}${tageText(liegezeit(spiel, schiff, umschlag))}`);
    }
  } else if (++a.wartetage > WARTETAGE_FREI) {
    // Lange nichts gefunden: leer zum aussichtsreichsten Hafen
    let beste = null;
    for (const andere of spiel.welt.staedte) {
      if (andere === stadt || andere.gesperrt(tag)) continue;
      const dort = Haendler.prototype.optionen.call(bewerter, andere, tag, spiel.welt);
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
  // Ohne nennenswerte Liegezeit gleich ablegen
  if (a.abfahrt != null && spiel.zeit >= a.abfahrt) frei(spiel, schiff);
}

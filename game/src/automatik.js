// Automatischer Handel für Schiffe des Spielers.
//
// Handelsroute: Das Schiff fährt eine Liste von Häfen endlos ab und erledigt dort Aufträge
//   (verkaufen, kaufen, ins Kontor entladen, aus dem Kontor laden), auf Wunsch mit Preisgrenze.
// Versorgen: Das Schiff verteilt Kontor-Ware zwischen gewählten Städten dorthin, wo eigene
//   Werkstätten sie brauchen (siehe unten).
// Freier Handel: Der Kapitän sucht selbst das beste Geschäft, mit derselben Bewertung wie die
//   KI-Händler (Gewinn pro Tag), und setzt höchstens den festgelegten Einsatz ein. Den restlichen
//   Laderaum füllt er mit weiteren Waren, die sich am selben Ziel lohnen.
// Lenkt der Spieler ein automatisches Schiff von Hand, pausiert die Automatik (auto.pausiert),
// bis er sie wieder aufnimmt.
// Laden und Löschen braucht Zeit: Das Schiff bleibt im Hafen, bis die umgeschlagene Menge
// geschafft ist (schiffe.json: umschlag_pro_tag je Schiffstyp). auto.abfahrt = frühester Abfahrtszeitpunkt.
// Eigenes Kontor geht vor: Liegt im Hafen ein Kontor mit Ware, lädt die Automatik zuerst von dort
// (bezahlt, ohne Handelsspanne) und kauft nur den Rest am Markt. Bei einem normalen Kontor nur, was über
// dem Zielbestand seiner Einkaufsregel («kaufen bis») liegt; ein Einkaufslager («nur einkaufen») gibt alles ab.
// Kontore auffüllen (freier Handel, auto.auffuellen): Das Schiff lädt Ware bis zum Zielbestand in normale
// Kontore ab und bringt fehlende Ware hin, wenn sie anderswo billiger ist und das mehr bringt als das beste
// Geschäft. Einkaufslager werden nicht beliefert, sie kaufen selbst.
// Reparatur: Ab kampf.automatik_reparatur_ab Schaden bleibt das Schiff im nächsten Hafen liegen, bis es
// ganz repariert ist (auto.reparatur). Repariert wird im Tageslauf von kampf.js.
//
// schiff.auto = null (selbst steuern)
//   | { art: "route", halte: [{ stadt, auftraege: [{ art, ware, menge, preis }] }], index, erledigt, pausiert }
//   | { art: "frei", einsatz, auffuellen, plan: { waren, ziel } | null, wartetage, pausiert }
//   | { art: "versorgen", staedte: [Name], ziel, wartetage, pausiert }
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

export function starteFrei(spiel, schiff, einsatz, { auffuellen = false } = {}) {
  // Beim Start nicht warten: Gibt es hier kein Geschäft, sucht der Kapitän sofort einen besseren Hafen
  schiff.auto = { art: "frei", einsatz: Math.max(0, Number(einsatz) || 0), auffuellen: !!auffuellen, plan: null, wartetage: WARTETAGE_FREI };
  spiel.melde(`${schiff.name} handelt jetzt frei (Einsatz bis ${zahl.format(schiff.auto.einsatz)} Gulden${auffuellen ? ", füllt Kontore auf" : ""}).`);
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
  if (repariert(spiel, schiff)) return;
  if (schiff.auto.art === "route") route(spiel, schiff);
  else if (schiff.auto.art === "versorgen") versorgen(spiel, schiff);
  else frei(spiel, schiff);
}

// Bleibt das Schiff zur Reparatur im Hafen? Nur in Häfen, die reparieren, und solange das Geld reicht.
function repariert(spiel, schiff) {
  const a = schiff.auto;
  const kd = spiel.kampf.daten(schiff);
  const rumpf = spiel.kampf.typ(schiff).rumpf;
  const k = spiel.D.schiffe.kampf;
  if (kd.schaden <= 0 || !schiff.ort || spiel.diplomatie.hafenGesperrt(schiff.ort)) {
    a.reparatur = false;
    return false;
  }
  const tageskosten = Math.min(kd.schaden, rumpf * k.reparatur_anteil_pro_tag) * k.reparatur_kosten_je_punkt;
  if (spiel.gulden < tageskosten) {
    a.reparatur = false;
    return false;
  }
  if (!a.reparatur && kd.schaden >= rumpf * k.automatik_reparatur_ab) {
    a.reparatur = true;
    const tage = Math.ceil(kd.schaden / (rumpf * k.reparatur_anteil_pro_tag));
    spiel.melde(`${schiff.name} bleibt zur Reparatur in ${schiff.ort.name} (rund ${tage} ${tage === 1 ? "Tag" : "Tage"}, ${zahl.format(kd.schaden * k.reparatur_kosten_je_punkt)} Gulden).`);
  }
  return !!a.reparatur;
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
  return menge / (spiel.schiffstyp(schiff).umschlag_pro_tag * spiel.kapitaene.faktor(schiff, "umschlag"));
}

function tageText(tage) {
  if (tage < 0.05) return "";
  const text = tage.toLocaleString("de-CH", { maximumFractionDigits: 1 });
  return `, Liegezeit ${text} ${text === "1" ? "Tag" : "Tage"}`;
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
      // Zuerst aus dem eigenen Kontor, den Rest am Markt
      const ausKontor = spiel.ausbau.umlagern(schiff, a.ware, menge, "insSchiff");
      umschlag += ausKontor;
      if (ausKontor) teile.push(`${ausKontor} ${a.ware} aus dem Kontor`);
      const r = spiel.kaufen(schiff, a.ware, menge - ausKontor, true, grenze);
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
  // Kontore auffüllen: zuerst bis zum Zielbestand ins Kontor hier abladen
  if (a.auffuellen) {
    for (const [g, m] of Object.entries(fehlbestand(spiel, stadt))) {
      const n = schiff.ladung[g] ? spiel.ausbau.umlagern(schiff, g, m, "insKontor") : 0;
      if (n) {
        umschlag += n;
        teile.push(`${n} ${g} ins Kontor`);
      }
    }
  }
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
  // Ware im eigenen Kontor zuerst: Lohnt sie sich irgendwo, lädt das Schiff sie und füllt den Rest am Markt auf
  const kontorPlan = ausKontor(spiel, schiff, stadt);
  if (kontorPlan) {
    let geladen = 0;
    const gekauft = [];
    for (const g of kontorPlan.waren) {
      const m = spiel.ausbau.umlagern(schiff, g, kontorPlan.mengen[g], "insSchiff");
      if (m) {
        geladen += m;
        gekauft.push(`${m} ${g} aus dem Kontor`);
      }
    }
    const markt = fuelleAuf(spiel, schiff, stadt, kontorPlan.ziel, budget);
    umschlag += geladen + markt.menge;
    a.plan = { waren: [...kontorPlan.waren, ...markt.waren], ziel: kontorPlan.ziel.name };
    a.wartetage = 0;
    a.abfahrt = spiel.zeit + liegezeit(spiel, schiff, umschlag);
    teile.push(`${[...gekauft, ...markt.gekauft].join(", ")}, Ziel ${kontorPlan.ziel.name}${tageText(liegezeit(spiel, schiff, umschlag))}`);
    spiel.melde(`${schiff.name} (frei) in ${stadt.name}: ${teile.join(", ")}.`, "handel");
    if (spiel.zeit >= a.abfahrt) frei(spiel, schiff);
    return;
  }
  const bewerter = { D: spiel.D, geld: budget, laderaum: spiel.freierLaderaum(schiff) };
  const optionen = budget > 0 ? Haendler.prototype.optionen.call(bewerter, stadt, tag, spiel.welt) : [];
  // Kontore auffüllen, wenn das mehr bringt als das beste Geschäft
  const lief = a.auffuellen && budget > 0 ? lieferung(spiel, schiff, stadt, budget) : null;
  if (lief && (!optionen.length || lief.wert >= Math.max(...optionen.map((o) => o.rate)))) {
    const gekauft = [];
    const waren = [];
    for (const x of lief.posten) {
      const r = spiel.kaufen(schiff, x.g, x.menge, true, x.grenze);
      if (r.menge) {
        umschlag += r.menge;
        gekauft.push(`${r.menge} ${x.g}`);
        waren.push(x.g);
      }
    }
    if (waren.length) {
      a.plan = { waren, ziel: lief.ziel.name };
      a.wartetage = 0;
      a.abfahrt = spiel.zeit + liegezeit(spiel, schiff, umschlag);
      teile.push(`${gekauft.join(", ")} gekauft für das Kontor ${lief.ziel.name}${tageText(liegezeit(spiel, schiff, umschlag))}`);
      spiel.melde(`${schiff.name} (frei) in ${stadt.name}: ${teile.join(", ")}.`, "handel");
      if (spiel.zeit >= a.abfahrt) frei(spiel, schiff);
      return;
    }
  }
  if (optionen.length) {
    optionen.sort((x, y) => y.rate - x.rate);
    const o = optionen[0];
    const k = spiel.kaufen(schiff, o.ware, o.menge);
    umschlag += k.menge;
    if (k.menge) {
      // Restlichen Laderaum mit weiteren Waren für dasselbe Ziel füllen
      const markt = fuelleAuf(spiel, schiff, stadt, o.ziel, Math.min(a.einsatz - k.betrag, spiel.gulden), [o.ware]);
      umschlag += markt.menge;
      const gekauft = [`${k.menge} ${o.ware}`, ...markt.gekauft];
      const waren = [o.ware, ...markt.waren];
      // Erst laden, dann ablegen (Liegezeit nach Umschlag)
      a.plan = { waren, ziel: o.ziel.name };
      a.wartetage = 0;
      a.abfahrt = spiel.zeit + liegezeit(spiel, schiff, umschlag);
      teile.push(`${gekauft.join(", ")} gekauft, Ziel ${o.ziel.name}${tageText(liegezeit(spiel, schiff, umschlag))}`);
    }
  } else if (spiel.ladungsmenge(schiff) > 0) {
    // Nichts zu kaufen (z. B. Laderaum voll), aber Ladung an Bord: dorthin, wo sie am meisten bringt
    const ziel = besterAbnehmer(spiel, schiff, stadt);
    if (ziel && spiel.segeln(schiff, { stadt: ziel }, { still: true }).ok) {
      a.plan = { waren: Object.keys(schiff.ladung), ziel: ziel.name };
      a.wartetage = 0;
      teile.push(`bringt die Ladung nach ${ziel.name}`);
    }
  } else if (++a.wartetage > WARTETAGE_FREI) {
    // Lange nichts gefunden: leer zum aussichtsreichsten Hafen
    let beste = null;
    for (const andere of spiel.welt.staedte) {
      if (andere === stadt || !spiel.welt.verbunden(andere.zone, stadt.zone) || andere.gesperrt(tag)) continue;
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

// Restlichen Laderaum am Markt mit Waren füllen, die sich am Ziel lohnen, die lohnendste zuerst.
// geld = Budget dafür, ohne = Waren, die schon geplant sind. Gibt { menge, waren, gekauft } zurück.
function fuelleAuf(spiel, schiff, stadt, ziel, geld, ohne = []) {
  const p = spiel.D.p;
  const aus = { menge: 0, waren: [], gekauft: [] };
  const weitere = Object.keys(stadt.bestand)
    .filter((g) => !ohne.includes(g) && stadt.bestand[g] >= 5 && ziel.handelt(g))
    .map((g) => ({ g, ...angebot(spiel.D, stadt, ziel, g, Math.min(geld, spiel.gulden), spiel.freierLaderaum(schiff)) }))
    .filter((x) => x.menge > 0 && x.erloes - x.kosten >= p.MIN_PROFIT && (x.erloes - x.kosten) / x.kosten >= p.MIN_ROI)
    .sort((x, y) => y.erloes - y.kosten - (x.erloes - x.kosten));
  let ausgegeben = 0;
  for (const x of weitere) {
    const rest = Math.min(geld - ausgegeben, spiel.gulden);
    const neu = angebot(spiel.D, stadt, ziel, x.g, rest, spiel.freierLaderaum(schiff));
    if (neu.menge <= 0 || neu.erloes - neu.kosten < p.MIN_PROFIT) continue;
    const r = spiel.kaufen(schiff, x.g, neu.menge);
    if (r.menge) {
      aus.menge += r.menge;
      ausgegeben += r.betrag;
      aus.gekauft.push(`${r.menge} ${x.g}`);
      aus.waren.push(x.g);
    }
  }
  return aus;
}

// Ware aus dem Kontor im Hafen: das Ziel, an dem die verfügbare Kontor-Ware (ohne gesperrte) pro Tag
// Fahrt am meisten über dem Einstand bringt, mit mindestens 5 % Gewinn je Ware. Gibt { ziel, waren } oder null.
function ausKontor(spiel, schiff, hier) {
  const a = spiel.ausbau;
  const k = a.kontor(hier);
  if (!k || !spiel.imHafen(schiff, hier)) return null;
  // Ein normales Kontor behält den Zielbestand seiner Einkaufsregel, ein Einkaufslager gibt alles ab
  const frei = (g) => Math.max(0, a.verfuegbar(hier, g) - (k.nurEinkauf ? 0 : (k.regeln?.[g]?.kaufenBis ?? 0)));
  const waren = Object.keys(k.lager).filter((g) => frei(g) >= 1);
  if (!waren.length) return null;
  const platz = spiel.freierLaderaum(schiff);
  let beste = null;
  for (const ziel of spiel.welt.staedte) {
    if (ziel === hier || !spiel.welt.verbunden(ziel.zone, hier.zone) || ziel.gesperrt(spiel.welt.tag) || spiel.diplomatie.hafenGesperrt(ziel)) continue;
    let rest = platz;
    let gewinn = 0;
    const liste = [];
    const kandidaten = waren
      .filter((g) => ziel.handelt(g))
      .map((g) => {
        const m = Math.min(frei(g), platz);
        // mittlerer Erlös, wenn die ganze Menge verkauft wird
        const erloes = a.verkaufspreis(ziel, g, ziel.bestand[g] + m / 2);
        return { g, marge: erloes - k.lager[g].einstand, einstand: k.lager[g].einstand };
      })
      .filter((x) => x.marge >= 0.05 * x.einstand)
      .sort((x, y) => y.marge - x.marge);
    for (const x of kandidaten) {
      if (rest <= 0) break;
      const m = Math.min(frei(x.g), rest);
      gewinn += m * x.marge;
      rest -= m;
      liste.push(x.g);
    }
    if (!liste.length) continue;
    const wert = gewinn / (1 + spiel.welt.fahrtage(hier, ziel));
    if (!beste || wert > beste.wert) beste = { ziel, waren: liste, wert };
  }
  return beste ? { ...beste, mengen: Object.fromEntries(beste.waren.map((g) => [g, frei(g)])) } : null;
}

// Fehlender Bestand eines normalen Kontors bis zum Zielbestand seiner Einkaufsregeln: { Ware: Menge }.
// Einkaufslager bekommen nichts, sie kaufen selbst.
function fehlbestand(spiel, stadt) {
  const k = spiel.ausbau.kontor(stadt);
  const aus = {};
  if (!k || k.nurEinkauf) return aus;
  for (const [g, r] of Object.entries(k.regeln ?? {})) {
    const fehlt = Math.floor((r.kaufenBis ?? 0) - (k.lager[g]?.menge ?? 0));
    if (fehlt >= 1) aus[g] = fehlt;
  }
  return aus;
}

// Lieferung für ein Kontor: Ware, die einem Kontor fehlt und hier billiger ist als am Markt dort (ohne
// Markt dort: als der Höchstpreis seiner Regel). Bewertet nach Ersparnis pro Tag Fahrt wie die Geschäfte (rate).
// Gibt { ziel, posten: [{ g, menge, grenze }], wert } oder null.
function lieferung(spiel, schiff, hier, geld) {
  let beste = null;
  const platz = spiel.freierLaderaum(schiff);
  for (const name of Object.keys(spiel.ausbau.kontore)) {
    const ziel = spiel.welt.stadt[name];
    if (ziel === hier || !spiel.welt.verbunden(ziel.zone, hier.zone) || ziel.gesperrt(spiel.welt.tag) || spiel.diplomatie.hafenGesperrt(ziel)) continue;
    const regeln = spiel.ausbau.kontor(ziel).regeln ?? {};
    const liste = Object.entries(fehlbestand(spiel, ziel))
      .filter(([g]) => hier.handelt(g) && hier.bestand[g] >= 5)
      .map(([g, fehlt]) => {
        const p = spiel.kaufpreis(hier, g);
        // Vergleich: was die Ware in der Kontor-Stadt kostet; ohne Markt dort der Höchstpreis der Regel
        const grenze = ziel.handelt(g) ? spiel.kaufpreis(ziel, g) : (regeln[g]?.kaufPreis ?? hier.basispreis(g));
        return { g, fehlt, p, grenze, vorteil: grenze - p };
      })
      .filter((x) => x.vorteil > 0)
      .sort((x, y) => y.vorteil - x.vorteil);
    const posten = [];
    let rest = platz;
    let kasse = geld;
    let ersparnis = 0;
    for (const x of liste) {
      const m = Math.floor(Math.min(x.fehlt, rest, kasse / x.p));
      if (m < 1) continue;
      posten.push({ g: x.g, menge: m, grenze: x.grenze });
      rest -= m;
      kasse -= m * x.p;
      ersparnis += m * x.vorteil;
    }
    if (!posten.length) continue;
    const wert = ersparnis / (1 + spiel.welt.fahrtage(hier, ziel));
    if (!beste || wert > beste.wert) beste = { ziel, posten, wert };
  }
  return beste;
}

// Stadt, in der die Ladung pro Tag Fahrt am meisten Gewinn bringt (nach Fahrzeit gewichtet)
function besterAbnehmer(spiel, schiff, hier) {
  let beste = null;
  for (const andere of spiel.welt.staedte) {
    if (andere === hier || !spiel.welt.verbunden(andere.zone, hier.zone) || andere.gesperrt(spiel.welt.tag) || spiel.diplomatie.hafenGesperrt(andere)) continue;
    let gewinn = 0;
    for (const [g, p] of Object.entries(schiff.ladung)) if (andere.handelt(g)) gewinn += (spiel.verkaufspreis(andere, g) - p.einstand) * p.menge;
    const wert = gewinn / (1 + spiel.welt.fahrtage(hier, andere));
    if (!beste || wert > beste.wert) beste = { stadt: andere, wert };
  }
  return beste?.stadt ?? null;
}

// --- Versorgen ------------------------------------------------------------------
// Das Schiff verteilt Kontor-Ware zwischen den gewählten Städten: Es lädt, was in einer
// anderen gewählten Stadt gebraucht wird, und lädt es dort aus. Gebraucht wird, was die
// eigenen Werkstätten mit Kontor-Versorgung für versorgung.vorrat_tage plus die Zeit bis zur
// nächsten Lieferung (eine Rundreise) brauchen.

// Fehlmenge einer Ware im Kontor einer Stadt: Bedarf für den Vorrat plus zusatzTage
// (die Zeit bis zur nächsten Lieferung) minus Bestand
export function fehlmenge(spiel, stadtName, g, zusatzTage = 0) {
  const a = spiel.ausbau;
  const k = a.kontor(stadtName);
  if (!k) return 0;
  const stadt = spiel.welt.stadt[stadtName];
  const ziel = a.bedarfProTag(stadt, g) * (a.bau.versorgung.vorrat_tage + zusatzTage);
  return Math.max(0, ziel - (k.lager[g]?.menge ?? 0));
}

// Überschuss einer Ware im Kontor: was über dem eigenen Vorrat liegt und nicht gesperrt ist
export function ueberschuss(spiel, stadtName, g) {
  const a = spiel.ausbau;
  if (!a.kontor(stadtName)) return 0;
  const stadt = spiel.welt.stadt[stadtName];
  const eigen = a.bedarfProTag(stadt, g) * a.bau.versorgung.vorrat_tage;
  const verfuegbar = a.verfuegbar(stadt, g);
  const vorhanden = a.kontor(stadtName).lager[g]?.menge ?? 0;
  return Math.max(0, Math.min(verfuegbar, vorhanden - eigen));
}

export function pruefeVersorgung(spiel, staedte) {
  const mitKontor = staedte.filter((s) => spiel.ausbau.kontor(s));
  if (mitKontor.length < 2) return "Wähle mindestens zwei Städte, in denen du ein Kontor hast.";
  return null;
}

export function starteVersorgung(spiel, schiff, staedte) {
  const fehler = pruefeVersorgung(spiel, staedte);
  if (fehler) return fehler;
  schiff.auto = { art: "versorgen", staedte: staedte.filter((s) => spiel.ausbau.kontor(s)), ziel: null, wartetage: 0 };
  spiel.melde(`${schiff.name} versorgt jetzt die Kontore in ${schiff.auto.staedte.join(", ")}.`);
  weiter(spiel, schiff);
  return null;
}

function versorgen(spiel, schiff) {
  const a = schiff.auto;
  const waren = Object.keys(spiel.D.waren);
  // Nicht in einer gewählten Stadt: zur nächsten gewählten fahren
  if (!schiff.ort || !a.staedte.includes(schiff.ort.name)) {
    const p = spiel.position(schiff);
    const naechste = a.staedte
      .map((n) => spiel.welt.stadt[n])
      .sort((x, y) => Math.hypot(x.pos[0] - p.x, x.pos[1] - p.y) - Math.hypot(y.pos[0] - p.x, y.pos[1] - p.y))[0];
    spiel.segeln(schiff, { stadt: naechste }, { still: true });
    return;
  }
  const hier = schiff.ort.name;
  // Geladen und Liegezeit vorbei: zum Ziel ablegen
  if (a.abfahrt != null && a.ziel) {
    if (spiel.segeln(schiff, { stadt: spiel.welt.stadt[a.ziel] }, { still: true }).ok) {
      a.abfahrt = null;
      a.ziel = null;
    }
    return;
  }
  a.abfahrt = null;
  const teile = [];
  let umschlag = 0;
  // Bis zur nächsten Lieferung vergeht etwa eine Rundreise
  const rundreise = (ziel) => 2 * spiel.welt.fahrtage(spiel.welt.stadt[hier], spiel.welt.stadt[ziel]);
  const laengste = Math.max(...a.staedte.filter((s) => s !== hier).map(rundreise));
  // 1. Ausladen, was hier gebraucht wird
  for (const g of Object.keys(schiff.ladung)) {
    const m = spiel.ausbau.umlagern(schiff, g, Math.ceil(fehlmenge(spiel, hier, g, laengste)), "insKontor");
    if (m) {
      umschlag += m;
      teile.push(`${m} ${g} ausgeladen`);
    }
  }
  // 2. Ziel mit dem grössten deckbaren Bedarf suchen (Ladung an Bord zählt mit)
  let beste = null;
  for (const ziel of a.staedte) {
    if (ziel === hier) continue;
    let menge = 0;
    for (const g of waren) {
      const fehlt = fehlmenge(spiel, ziel, g, rundreise(ziel));
      if (fehlt > 0) menge += Math.min(fehlt, ueberschuss(spiel, hier, g) + (schiff.ladung[g]?.menge ?? 0));
    }
    if (menge >= 1 && (!beste || menge > beste.menge)) beste = { ziel, menge };
  }
  if (beste) {
    // 3. Laden, was dort fehlt, die grösste Lücke zuerst
    const liste = waren
      .map((g) => ({ g, fehlt: fehlmenge(spiel, beste.ziel, g, rundreise(beste.ziel)) - (schiff.ladung[g]?.menge ?? 0) }))
      .filter((x) => x.fehlt > 0)
      .sort((x, y) => y.fehlt - x.fehlt);
    for (const { g, fehlt } of liste) {
      const m = spiel.ausbau.umlagern(schiff, g, Math.min(Math.ceil(fehlt), Math.floor(ueberschuss(spiel, hier, g))), "insSchiff");
      if (m) {
        umschlag += m;
        teile.push(`${m} ${g} geladen`);
      }
    }
    a.ziel = beste.ziel;
    a.wartetage = 0;
    a.abfahrt = spiel.zeit + liegezeit(spiel, schiff, umschlag);
    teile.push(`Ziel ${beste.ziel}${tageText(liegezeit(spiel, schiff, umschlag))}`);
  } else if (++a.wartetage > WARTETAGE_FREI) {
    // Hier gibt es nichts zu verteilen: in die Stadt mit dem meisten Überschuss für andere
    let quelle = null;
    for (const s of a.staedte) {
      if (s === hier) continue;
      let menge = 0;
      for (const ziel of a.staedte) {
        if (ziel === s) continue;
        for (const g of waren) menge += Math.min(fehlmenge(spiel, ziel, g, rundreise(ziel)), ueberschuss(spiel, s, g));
      }
      if (menge >= 1 && (!quelle || menge > quelle.menge)) quelle = { s, menge };
    }
    if (quelle && spiel.segeln(schiff, { stadt: spiel.welt.stadt[quelle.s] }, { still: true }).ok) {
      a.wartetage = 0;
      teile.push(`nichts zu verteilen, fährt nach ${quelle.s}`);
    }
  }
  if (teile.length) spiel.melde(`${schiff.name} (Versorgen) in ${hier}: ${teile.join(", ")}.`, "handel");
  if (a.abfahrt != null && spiel.zeit >= a.abfahrt) versorgen(spiel, schiff);
}

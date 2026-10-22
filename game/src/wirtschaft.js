// Wirtschaftsmodell des Spiels: Preise, Städte, KI-Händler, Ereignisse.
// Entspricht tools/sim/wirtschaft_sim.py. Die Simulation bleibt das Referenzmodell zum
// Balancieren. Wer hier etwas an der Logik ändert, ändert es dort auch (und umgekehrt).
// Kein Zugriff auf das DOM, damit das Modell auch unter Node läuft (game/test/).

import { Zufall } from "./zufall.js";

// Preis = Basispreis * (Zielbestand / Lagerbestand) ^ k, begrenzt
export function preis(D, basis, ziel, bestand) {
  const p = basis * Math.pow(ziel / Math.max(bestand, 1), D.p.K);
  return Math.min(Math.max(p, basis * D.p.PRICE_MIN), basis * D.p.PRICE_MAX);
}

function abstand(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// Weg über Wasser als Punktliste: direkt im selben Seeteil, sonst über die Durchfahrt
export function weg(D, a, b) {
  const ta = D.seeteil[a.name];
  const tb = D.seeteil[b.name];
  if (ta === tb) return [a.pos, b.pos];
  const d = D.karte.durchfahrten.find((x) => x.verbindet.includes(ta) && x.verbindet.includes(tb));
  if (!d) throw new Error(`Keine Durchfahrt zwischen ${ta} und ${tb} (karte.json)`);
  return [a.pos, d.position, b.pos];
}

export function weglaenge(punkte) {
  let summe = 0;
  for (let i = 1; i < punkte.length; i++) summe += abstand(punkte[i - 1], punkte[i]);
  return summe;
}

export function fahrtage(D, a, b) {
  return Math.max(1, Math.ceil(weglaenge(weg(D, a, b)) / D.p.SPEED));
}

function mittel(liste) {
  return liste.length ? liste.reduce((a, b) => a + b, 0) / liste.length : 1;
}

function addiere(tabelle, schluessel, wert) {
  tabelle[schluessel] = (tabelle[schluessel] || 0) + wert;
}

export class Stadt {
  constructor(cfg, D) {
    this.D = D;
    this.name = cfg.name;
    this.einwohner = cfg.einwohner;
    this.einwohner0 = cfg.einwohner; // Startbevölkerung, Bezug für das Wachstum
    this.zufriedenheitBonus = 0; // Versorgungsgebäude des Spielers (betriebe.js)
    this.wohnraumBonus = 0; // zusätzlicher Wohnraum als Anteil der Startbevölkerung
    this.pos = cfg.pos;
    // Kopien: Betriebe des Spielers verschieben Leistung zwischen Stadt und Spieler (betriebe.js)
    this.prod = { ...cfg.prod };
    this.werk = { ...cfg.werk };
    this.unterwegs = {}; // Ladung der KI-Händler, die hierher unterwegs ist
    this.ballast = 0; // KI-Schiffe, die leer hierher unterwegs sind
    this.prodFaktor = {}; // Ware -> [Faktor, bis Tag] (Ereignisse)
    this.verbrauchFaktor = {};
    this.sperreBis = -1;
    this.zufriedenheit = 60;
    this.ereignisse = []; // laufende Ereignisse für die Anzeige: {name, bis}

    this.verbrauch = {};
    for (const [g, rate] of Object.entries(D.verbrauch)) this.verbrauch[g] = (rate * this.einwohner) / 1000;

    const bedarf = {}; // Zutatenbedarf der Werkstätten pro Tag
    const ausstoss = {};
    for (const [g, a] of Object.entries(this.prod)) addiere(ausstoss, g, a);
    for (const [g, b] of Object.entries(this.werk)) {
      addiere(ausstoss, g, b);
      for (const [zutat, n] of Object.entries(D.rezepte[g])) addiere(bedarf, zutat, n * b);
    }

    this.ziel = {};
    this.kap = {};
    this.bestand = {};
    for (const g of Object.keys(D.waren)) {
      const t =
        D.p.TARGET_DAYS_USE * ((this.verbrauch[g] || 0) + (bedarf[g] || 0)) +
        D.p.TARGET_DAYS_PROD * (ausstoss[g] || 0);
      if (t > 0) {
        // nur Waren, die hier eine Rolle spielen, haben einen Markt
        this.ziel[g] = Math.max(t, 20);
        this.kap[g] = D.p.CAP_FACTOR * this.ziel[g];
        this.bestand[g] = this.ziel[g];
      }
    }
    this.ziel0 = { ...this.ziel };
    this.kap0 = { ...this.kap };
  }

  // Bevölkerungsfaktor: Produktion, Werkstätten, Verbrauch und Zielbestand wachsen mit
  faktor() {
    return this.einwohner / this.einwohner0;
  }

  // Obergrenze der Bevölkerung (Wohnraum)
  wohnraum() {
    return this.einwohner0 * (this.D.p.POP_MAX_FACTOR + this.wohnraumBonus);
  }

  skaliere() {
    const f = this.faktor();
    for (const [g, rate] of Object.entries(this.D.verbrauch)) this.verbrauch[g] = (rate * this.einwohner) / 1000;
    for (const g of Object.keys(this.ziel0)) {
      this.ziel[g] = this.ziel0[g] * f;
      this.kap[g] = this.kap0[g] * f;
    }
  }

  handelt(g) {
    return g in this.bestand;
  }

  gesperrt(tag) {
    return tag < this.sperreBis;
  }

  // Preise, wahlweise für einen angenommenen Lagerbestand (Mengeneffekt)
  mittelpreis(g, bestand = this.bestand[g]) {
    return preis(this.D, this.D.waren[g], this.ziel[g], bestand);
  }

  kaufpreis(g, bestand) {
    return this.mittelpreis(g, bestand) * (1 + this.D.p.SPREAD / 2);
  }

  verkaufspreis(g, bestand) {
    return this.mittelpreis(g, bestand) * (1 - this.D.p.SPREAD / 2);
  }

  // Erwarteter Verkaufspreis unter Berücksichtigung anderer KI-Schiffe unterwegs
  geplanterVerkaufspreis(g) {
    return this.verkaufspreis(g, this.bestand[g] + (this.unterwegs[g] || 0));
  }

  static faktor(tabelle, g, tag) {
    const v = tabelle[g];
    return v && v[1] > tag ? v[0] : 1;
  }

  // Ein Tag: Produktion, Werkstätten, Verbrauch, Zufriedenheit, Bevölkerung, Verderb
  schritt(tag, st) {
    const D = this.D;
    const f = this.faktor();
    // Produktion wächst mit der Bevölkerung (mehr Arbeitskräfte)
    for (const [g, a] of Object.entries(this.prod)) {
      const q = a * f * Stadt.faktor(this.prodFaktor, g, tag);
      this.bestand[g] += q;
      if (st) addiere(st.produziert, g, q);
    }
    for (const [g, kapazitaet] of Object.entries(this.werk)) {
      let batches = kapazitaet * f;
      for (const [zutat, n] of Object.entries(D.rezepte[g])) {
        batches = Math.min(batches, (this.bestand[zutat] ?? 0) / n);
      }
      if (batches > 0) {
        for (const [zutat, n] of Object.entries(D.rezepte[g])) this.bestand[zutat] -= n * batches;
        this.bestand[g] += batches;
        if (st) addiere(st.produziert, g, batches);
      }
    }
    const grund = [];
    const gehoben = [];
    let mangel = false;
    for (const [g, rate] of Object.entries(this.verbrauch)) {
      const bedarf = rate * Stadt.faktor(this.verbrauchFaktor, g, tag);
      const erhalten = Math.min(bedarf, this.bestand[g]);
      this.bestand[g] -= erhalten;
      const anteil = bedarf > 0 ? erhalten / bedarf : 1;
      if (D.grundbedarf.includes(g)) {
        grund.push(anteil);
        if (anteil < 0.9) mangel = true;
      } else if (D.gehoben.includes(g)) {
        gehoben.push(anteil);
      }
    }
    // Aufschlüsselung für die Anzeige
    this.zufriedenheitTeile = { grund: D.p.SAT_BASIC * mittel(grund), gehoben: D.p.SAT_COMFORT * mittel(gehoben), gebaeude: this.zufriedenheitBonus };
    const zielwert = Math.min(100, D.p.SAT_BASIC * mittel(grund) + D.p.SAT_COMFORT * mittel(gehoben) + this.zufriedenheitBonus);
    this.zufriedenheit += 0.1 * (zielwert - this.zufriedenheit);
    // Bevölkerung: wächst über POP_SAT_NEUTRAL, schrumpft darunter, begrenzt durch Wohnraum
    const n = D.p.POP_SAT_NEUTRAL;
    const rate = this.zufriedenheit > n ? (D.p.POP_GROWTH * (this.zufriedenheit - n)) / (100 - n) : (-D.p.POP_SHRINK * (n - this.zufriedenheit)) / n;
    const tief = this.einwohner0 * D.p.POP_MIN_FACTOR;
    this.einwohner = Math.min(Math.max(this.einwohner * (1 + rate), tief), Math.max(this.wohnraum(), tief));
    this.wachstum = rate; // für die Anzeige
    this.skaliere();
    for (const g of Object.keys(this.bestand)) {
      if (this.bestand[g] > this.kap[g]) {
        if (st) addiere(st.verdorben, g, this.bestand[g] - this.kap[g]);
        this.bestand[g] = this.kap[g];
      }
    }
    this.ereignisse = this.ereignisse.filter((e) => e.bis > tag);
    return mangel;
  }
}

// Optimale Ladungsmenge einer KI-Fahrt, mit Preiswirkung auf beiden Seiten
export function angebot(D, von, nach, g, geld, laderaum = D.p.SHIP_CAP) {
  const bestandVon = von.bestand[g];
  const bestandNach = nach.bestand[g] + (nach.unterwegs[g] || 0);
  let kosten = 0;
  let erloes = 0;
  let menge = 0;
  while (menge < laderaum && bestandVon - menge >= 2) {
    const kauf = von.kaufpreis(g, bestandVon - menge);
    const verkauf = nach.verkaufspreis(g, bestandNach + menge);
    if (verkauf <= kauf || kosten + kauf > geld) break;
    kosten += kauf;
    erloes += verkauf;
    menge++;
  }
  return { menge, kosten, erloes };
}

// KI-Händler: wählt die Fahrt mit dem höchsten Gewinn pro Tag (wie Ship in der Simulation)
export class Haendler {
  constructor(stadt, D) {
    this.D = D;
    this.ort = stadt;
    this.geld = D.p.START_MONEY;
    this.ladung = null;
    this.ziel = null;
    this.abfahrt = null;
    this.ankunft = null;
  }

  handle(tag, welt, st) {
    this.geld -= this.D.p.UPKEEP;
    if (this.ziel) {
      if (tag < this.ankunft) return;
      if (this.ladung) {
        this.verkaufe(tag, st);
      } else {
        // Leerfahrt beendet
        this.ziel.ballast -= 1;
        this.ort = this.ziel;
        this.ziel = null;
        this.ankunft = null;
      }
    }
    this.plane(tag, welt, st);
  }

  verkaufe(tag, st) {
    const { ware, menge, kosten, von, start } = this.ladung;
    const stadt = this.ziel;
    let erloes = 0;
    for (let i = 0; i < menge; i++) {
      erloes += stadt.verkaufspreis(ware);
      stadt.bestand[ware] += 1;
    }
    this.geld += erloes;
    stadt.unterwegs[ware] -= menge;
    if (st && st.an) {
      st.touren.push({ rendite: (erloes - kosten) / kosten, gewinn: erloes - kosten, tage: tag - start, ware, route: `${von} -> ${stadt.name}` });
    }
    this.ort = stadt;
    this.ziel = null;
    this.ladung = null;
    this.ankunft = null;
  }

  // Alle sinnvollen Handelsfahrten ab einer Stadt
  optionen(von, tag, welt) {
    const p = this.D.p;
    const liste = [];
    for (const g of Object.keys(von.bestand)) {
      if (von.bestand[g] < 5) continue;
      const kauf = von.kaufpreis(g);
      for (const nach of welt.staedte) {
        if (nach === von || nach.gesperrt(tag) || !nach.handelt(g)) continue;
        if (nach.geplanterVerkaufspreis(g) < kauf * (1 + p.MIN_ROI)) continue;
        // laderaum: nur gesetzt, wenn der freie Handel des Spielers diese Bewertung nutzt
        const { menge, kosten, erloes } = angebot(this.D, von, nach, g, this.geld, this.laderaum ?? p.SHIP_CAP);
        const gewinn = erloes - kosten;
        if (menge <= 0 || gewinn < p.MIN_PROFIT || gewinn / kosten < p.MIN_ROI) continue;
        const tage = welt.fahrtage(von, nach) + 1;
        liste.push({ rate: gewinn / tage, ware: g, ziel: nach, menge, tage, gewinn });
      }
    }
    return liste;
  }

  plane(tag, welt, st) {
    const von = this.ort;
    const liste = this.optionen(von, tag, welt);
    if (liste.length) {
      liste.sort((a, b) => b.rate - a.rate);
      const top = liste.slice(0, 3);
      const wahl = welt.zufall.gewichtet(top, top.map((o) => o.rate));
      let kosten = 0;
      for (let i = 0; i < wahl.menge; i++) {
        kosten += von.kaufpreis(wahl.ware);
        von.bestand[wahl.ware] -= 1;
      }
      this.geld -= kosten;
      this.ladung = { ware: wahl.ware, menge: wahl.menge, kosten, von: von.name, start: tag };
      addiere(wahl.ziel.unterwegs, wahl.ware, wahl.menge);
      this.ziel = wahl.ziel;
      this.abfahrt = tag;
      this.ankunft = tag + wahl.tage;
      return;
    }
    // Nichts zu laden: leer zum aussichtsreichsten Hafen verlegen.
    // Schiffe, die schon leer dorthin unterwegs sind, mindern die Attraktivität.
    let beste = null;
    let besteRate = 0;
    for (const stadt of welt.staedte) {
      if (stadt === von || stadt.gesperrt(tag)) continue;
      const dort = this.optionen(stadt, tag, welt);
      if (!dort.length) continue;
      const anfahrt = welt.fahrtage(von, stadt);
      const rate = Math.max(...dort.map((o) => o.gewinn / (anfahrt + o.tage))) / (1 + stadt.ballast);
      if (rate > besteRate) {
        beste = stadt;
        besteRate = rate;
      }
    }
    if (beste) {
      beste.ballast += 1;
      this.ziel = beste;
      this.abfahrt = tag;
      this.ankunft = tag + welt.fahrtage(von, beste);
      if (st && st.an) st.leerfahrten++;
    }
  }
}

export function neueStatistik() {
  return { an: false, produziert: {}, verdorben: {}, touren: [], leerfahrten: 0 };
}

// Die Welt ohne Spieler: Städte, KI-Händler, Ereignisse, Tageszähler
export class Welt {
  constructor(D, seed) {
    this.D = D;
    this.zufall = new Zufall(seed);
    this.tag = 0; // nächster zu rechnender Tag
    this.staedte = D.staedte.map((c) => new Stadt(c, D));
    this.stadt = Object.fromEntries(this.staedte.map((s) => [s.name, s]));
    this.haendler = [];
    for (let i = 0; i < D.p.AI_SHIPS; i++) this.haendler.push(new Haendler(this.zufall.wahl(this.staedte), D));
    this.st = null; // Statistik, nur in Tests
    this.tageCache = {};
  }

  fahrtage(a, b) {
    const schluessel = `${a.name}|${b.name}`;
    if (!(schluessel in this.tageCache)) this.tageCache[schluessel] = fahrtage(this.D, a, b);
    return this.tageCache[schluessel];
  }

  weg(a, b) {
    return weg(this.D, a, b);
  }

  // Rechnet einen Tag. Gibt die neuen Ereignisse zurück.
  naechsterTag(mitEreignissen = true) {
    const tag = this.tag;
    const meldungen = [];
    if (mitEreignissen) {
      for (const stadt of this.staedte) {
        if (this.zufall.zahl() < this.D.p.EVENT_RATE) meldungen.push(this.ereignis(stadt, tag));
      }
    }
    for (const stadt of this.staedte) stadt.schritt(tag, this.st);
    for (const h of this.zufall.mischen(this.haendler.slice())) h.handle(tag, this, this.st);
    this.tag++;
    return meldungen;
  }

  ereignis(stadt, tag) {
    const ev = this.zufall.wahl(this.D.ereignisse);
    const bis = tag + ev.dauer;
    if (ev.art === "produktion") {
      for (const g of ev.waren) if (g in stadt.prod) stadt.prodFaktor[g] = [ev.faktor, bis];
    } else if (ev.art === "verbrauch") {
      for (const g of ev.waren) stadt.verbrauchFaktor[g] = [ev.faktor, bis];
    } else if (ev.art === "sperre") {
      stadt.sperreBis = bis;
    } else {
      throw new Error(`Unbekannte Ereignisart: ${ev.art}`);
    }
    stadt.ereignisse.push({ name: ev.name, bis });
    return { stadt: stadt.name, name: ev.name, text: ev.text.replace("{stadt}", stadt.name) };
  }
}

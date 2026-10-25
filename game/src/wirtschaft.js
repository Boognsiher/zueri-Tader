// Wirtschaftsmodell des Spiels: Preise, Städte, KI-Händler, Ereignisse.
// Entspricht tools/sim/wirtschaft_sim.py. Die Simulation bleibt das Referenzmodell zum
// Balancieren. Wer hier etwas an der Logik ändert, ändert es dort auch (und umgekehrt).
// Kein Zugriff auf das DOM, damit das Modell auch unter Node läuft (game/test/).

import { Zufall } from "./zufall.js";
import { Navigation } from "./navigation.js";
import { kurve } from "./epochen.js";

// Preis = Basispreis * (Zielbestand / Lagerbestand) ^ k, begrenzt
export function preis(D, basis, ziel, bestand) {
  const p = basis * Math.pow(ziel / Math.max(bestand, 1), D.p.K);
  return Math.min(Math.max(p, basis * D.p.PRICE_MIN), basis * D.p.PRICE_MAX);
}

// Weglänge über Wasser zwischen zwei Städten, vorberechnet aus der Karte
// (karte.json: distanzen, erzeugt mit tools/karte/distanzen.mjs)
export function distanz(D, a, b, extra = null) {
  if (a === b) return 0;
  const d = D.karte.distanzen[`${a.name}|${b.name}`] ?? D.karte.distanzen[`${b.name}|${a.name}`] ?? extra?.[`${a.name}|${b.name}`] ?? extra?.[`${b.name}|${a.name}`];
  if (d === undefined) throw new Error(`Distanz ${a.name} - ${b.name} fehlt in karte.json (node tools/karte/distanzen.mjs)`);
  return d;
}

export function fahrtage(D, a, b) {
  return Math.max(1, Math.ceil(distanz(D, a, b) / D.p.SPEED));
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
    this.reserve = {}; // Stadtspeicher: Ware -> Menge, nicht am Markt (betriebe.js setzt reserveTage)
    this.reserveTage = 0;
    this.wohnraumBonus = 0; // zusätzlicher Wohnraum als Anteil der Startbevölkerung
    this.pos = cfg.pos;
    this.welt = null; // wird von der Welt gesetzt (Jahr für die Epochenkurven)
    this.zone = cfg.zone; // Wirtschaftszone (zonen.json): KI-Händler handeln nur innerhalb einer Zone
    this.preisfaktor = D.zonen?.zonen.find((z) => z.id === cfg.zone)?.preisfaktor ?? {}; // Preisniveau der Zone je Ware
    // Kopien: Betriebe des Spielers verschieben Leistung zwischen Stadt und Spieler (betriebe.js)
    // Einfuhr der Verteilzentren (imp) zählt wie Produktion
    this.prod = { ...cfg.prod, ...cfg.imp };
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
    const epoche = this.welt ? this.welt.kurve("wohnraum") : 1; // Verstädterung über die Jahrhunderte (epochen.json)
    return this.einwohner0 * (this.D.p.POP_MAX_FACTOR * epoche + this.wohnraumBonus);
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
  // Basispreis der Ware in dieser Stadt (Basispreis mal Preisniveau der Zone)
  basispreis(g) {
    return this.D.waren[g] * (this.preisfaktor[g] ?? 1);
  }

  mittelpreis(g, bestand = this.bestand[g]) {
    return preis(this.D, this.basispreis(g), this.ziel[g], bestand);
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

  // Stadtspeicher (buildings.json, wirkung «reserve»): Grösse der Reserve je Ware
  reserveKapazitaet(g) {
    return this.reserveTage * (this.verbrauch[g] ?? 0);
  }

  // Überschuss am Markt (über dem Zielbestand) in die Reserve legen, höchstens einlagern_tage Verbrauch pro Tag
  lagereEin() {
    if (!this.reserveTage) return;
    const t = this.D.bau?.stadtgebaeude.find((x) => x.wirkung === "reserve");
    if (!t) return;
    for (const g of t.waren) {
      if (!this.handelt(g)) continue;
      const m = Math.min(this.bestand[g] - this.ziel[g], this.reserveKapazitaet(g) - (this.reserve[g] ?? 0), t.einlagern_tage * (this.verbrauch[g] ?? 0));
      if (m > 0) {
        this.bestand[g] -= m;
        this.reserve[g] = (this.reserve[g] ?? 0) + m;
      }
    }
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
      const q = a * f * Stadt.faktor(this.prodFaktor, g, tag) * (this.welt?.saison(g) ?? 1);
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
      let erhalten = Math.min(bedarf, this.bestand[g]);
      this.bestand[g] -= erhalten;
      // Stadtspeicher: Fehlt am Markt etwas, aus der Reserve nehmen
      if (erhalten < bedarf && this.reserve[g] > 0) {
        const aus = Math.min(bedarf - erhalten, this.reserve[g]);
        this.reserve[g] -= aus;
        erhalten += aus;
      }
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
    this.lagereEin();
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
  // Grosse Schiffe (spätere Epochen) werden in Stücken von höchstens 1/120 des Laderaums gerechnet,
  // sonst dauert jede Schätzung zu lang; bis 120 Einheiten ist es Stück für Stück wie bisher
  const schritt = Math.max(1, Math.floor(laderaum / 120));
  while (menge + schritt <= laderaum && bestandVon - menge >= 1 + schritt) {
    const kauf = von.kaufpreis(g, bestandVon - menge);
    const verkauf = nach.verkaufspreis(g, bestandNach + menge);
    if (verkauf <= kauf || kosten + kauf * schritt > geld) break;
    kosten += kauf * schritt;
    erloes += verkauf * schritt;
    menge += schritt;
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
        this.verkaufe(tag, st, welt);
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

  verkaufe(tag, st, welt) {
    const { ware, menge, kosten, von, start } = this.ladung;
    const stadt = this.ziel;
    let erloes = 0;
    for (let i = 0; i < menge; i++) {
      erloes += stadt.verkaufspreis(ware);
      stadt.bestand[ware] += 1;
    }
    if (welt) welt.handelswert[stadt.zone] = (welt.handelswert[stadt.zone] ?? 0) + erloes;
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
    // Erreichbare, offene Häfen hängen nicht von der Ware ab: einmal vor der Schleife bestimmen
    const ziele = welt.staedte.filter((nach) => nach !== von && welt.verbunden(von.zone, nach.zone) && !nach.gesperrt(tag));
    for (const g of Object.keys(von.bestand)) {
      if (von.bestand[g] < 5) continue;
      const kauf = von.kaufpreis(g);
      for (const nach of ziele) {
        if (!nach.handelt(g)) continue;
        if (nach.geplanterVerkaufspreis(g) < kauf * (1 + p.MIN_ROI)) continue;
        // laderaum: nur gesetzt, wenn der freie Handel des Spielers diese Bewertung nutzt
        const { menge, kosten, erloes } = angebot(this.D, von, nach, g, this.geld, this.laderaum ?? Math.round(p.SHIP_CAP * welt.kurve("ki_fracht")));
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
      if (stadt === von || !welt.verbunden(stadt.zone, von.zone) || stadt.gesperrt(tag)) continue;
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
  return { an: false, produziert: {}, verdorben: {}, touren: [], leerfahrten: 0, eingeschossen: 0, schiffstage: 0 };
}

// Die Welt ohne Spieler: Städte, KI-Händler, Ereignisse, Tageszähler
export class Welt {
  constructor(D, seed) {
    this.D = D;
    this.zufall = new Zufall(seed);
    this.tag = 0; // nächster zu rechnender Tag
    this.staedte = D.staedte.map((c) => new Stadt(c, D));
    this.stadt = Object.fromEntries(this.staedte.map((s) => [s.name, s]));
    for (const s of this.staedte) s.welt = this;
    // Kalenderjahr für die Epochenkurven: tagNull = Tag, an dem das Spiel (nach dem Einlaufen) beginnt
    const [j0, m0] = D.spiel.start.datum;
    this.startjahr = j0 + (m0 - 1) / 12;
    this.tagNull = 0;
    this.zonenArt = Object.fromEntries(D.zonen.zonen.map((z) => [z.id, z.art ?? "see"]));
    this.kanalDistanzen = {}; // Distanzen zwischen Städten, die erst ein Kanal verbindet (zonen.js)
    this.kanalPaare = []; // fertige Kanäle: [Zone A, Zone B]
    this.kanalUfer = []; // Polygone der fertigen Kanäle (für die Darstellung der KI-Fahrten)
    this.netzTempo = {}; // Tempofaktor der Landzonen, wenn der Spieler das Netz früher ausgebaut hat (zonen.js)
    this.handelswert = {}; // Verkaufserlös der KI-Händler heute, je Zone (Grundlage der Maut)
    this.handelswertGestern = {};
    this.zonen = [...new Set(this.staedte.map((s) => s.zone))]; // Zonen in der Reihenfolge der Städte
    this.haendler = [];
    for (const zone of this.zonen) {
      for (let i = 0; i < this.kiZiel(zone); i++) this.haendler.push(new Haendler(this.zufall.wahl(this.staedte.filter((s) => s.zone === zone)), D));
    }
    this.st = null; // Statistik, nur in Tests
    this.tageCache = {};
    this.wegCache = {};
    this.nav = null; // Wegsuche für die Darstellung der KI-Fahrten, erst bei Bedarf
  }

  // Sind zwei Zonen durch Kanäle verbunden (auch über mehrere Kanäle)? Dann handeln die KI-Händler zwischen ihnen.
  // Die Gruppen werden gemerkt und erst neu berechnet, wenn ein Kanal dazukommt (die Abfrage steht in inneren Schleifen).
  verbunden(a, b) {
    if (a === b) return true;
    if (this.gruppenKanaele !== this.kanalPaare.length) {
      this.gruppenKanaele = this.kanalPaare.length;
      this.gruppe = {};
      for (const z of this.zonen) {
        if (this.gruppe[z] !== undefined) continue;
        const gesehen = new Set([z]);
        for (let neu = true; neu; ) {
          neu = false;
          for (const [x, y] of this.kanalPaare) {
            if (gesehen.has(x) !== gesehen.has(y)) {
              gesehen.add(x);
              gesehen.add(y);
              neu = true;
            }
          }
        }
        for (const g of gesehen) this.gruppe[g] = z;
      }
    }
    return this.gruppe[a] !== undefined && this.gruppe[a] === this.gruppe[b];
  }

  // Jahr (mit Bruchteil) und Epochenkurven (data/epochen.json)
  // Ein Spieltag zählt D.kalender Kalendertage (epochen.json): Epochen laufen schneller als die Wirtschaft
  jahr() {
    return this.startjahr + (Math.max(0, this.tag - this.tagNull) * (this.D.kalender ?? 1)) / 365.25;
  }

  kurve(name) {
    return kurve(this.D, name, this.jahr());
  }

  // Jahreszeit: Faktor auf die Produktion einer Ware im aktuellen Kalendermonat (goods.json)
  saison(g, jahr = this.jahr()) {
    const f = this.D.jahreszeit?.[g];
    return f ? f[Math.floor((jahr % 1) * 12) % 12] : 1;
  }

  // Anzahl KI-Händler einer Zone: AI_SHIPS_PER_1000 je 1000 Einwohner der Zone. Die Händler bleiben
  // in ihrer Zone, darum wird je Zone gerechnet (sonst könnte ein See zufällig zu wenige bekommen).
  // Gerechnet wird mit der Startbevölkerung: Wächst die Stadt, erneuern die Händler ihre Schiffe (grösserer
  // Laderaum, mehr Tempo, epochen.json), es kommen nicht mehr Schiffe dazu.
  kiZiel(zone) {
    return Math.round((this.D.p.AI_SHIPS_PER_1000 * this.staedte.filter((s) => s.zone === zone).reduce((a, s) => a + s.einwohner0, 0)) / 1000);
  }

  // Fahrtage der KI-Händler; ihr Tempo wächst mit den Epochen (ki_tempo, in Schritten von 0,05)
  fahrtage(a, b) {
    // Schiffe: ki_tempo; in Landzonen bestimmt das Strassen- und Schienennetz das Tempo (netz_tempo)
    const tempo = Math.round((this.zonenArt[a.zone] === "land" ? Math.max(this.kurve("netz_tempo"), this.netzTempo[a.zone] ?? 0) : this.kurve("ki_tempo")) * 20) / 20;
    const schluessel = `${a.name}|${b.name}|${tempo}`;
    if (!(schluessel in this.tageCache)) this.tageCache[schluessel] = Math.max(1, Math.ceil(distanz(this.D, a, b, this.kanalDistanzen) / (this.D.p.SPEED * tempo)));
    return this.tageCache[schluessel];
  }

  // Weg über Wasser als Punktliste (für die Darstellung der KI-Händler auf der Karte)
  weg(a, b) {
    const schluessel = `${a.name}|${b.name}`;
    if (!(schluessel in this.wegCache)) {
      if (!this.nav) {
        this.nav = new Navigation(this.D);
        for (const u of this.kanalUfer) this.nav.fuegeHinzu(u);
      }
      this.wegCache[schluessel] = this.nav.route(a.pos, b.pos) ?? [a.pos, b.pos];
    }
    return this.wegCache[schluessel];
  }

  // Rechnet einen Tag. Gibt die neuen Ereignisse zurück.
  naechsterTag(mitEreignissen = true) {
    const tag = this.tag;
    const meldungen = [];
    this.handelswertGestern = this.handelswert;
    this.handelswert = {};
    if (mitEreignissen) {
      for (const stadt of this.staedte) {
        if (this.zufall.zahl() < this.D.p.EVENT_RATE) meldungen.push(this.ereignis(stadt, tag));
      }
    }
    for (const stadt of this.staedte) stadt.schritt(tag, this.st);
    this.landverkehr();
    // Mit der Bevölkerung kommen neue Händler dazu (es verschwinden keine)
    for (const zone of this.zonen) {
      let anzahl = this.haendler.filter((h) => h.ort.zone === zone).length;
      for (; anzahl < this.kiZiel(zone); anzahl++) {
        this.haendler.push(new Haendler(this.zufall.wahl(this.staedte.filter((s) => s.zone === zone)), this.D));
        if (this.st && this.st.an) this.st.eingeschossen += this.D.p.START_MONEY;
      }
    }
    if (this.st && this.st.an) this.st.schiffstage += this.haendler.length;
    for (const h of this.zufall.mischen(this.haendler.slice())) h.handle(tag, this, this.st);
    this.tag++;
    return meldungen;
  }

  // Bahn und Lastwagen gleichen die Lager innerhalb einer Zone aus (epochen.json: ausgleich_*):
  // Jede Stadt rückt täglich um einen Teil des Gefälles an das Mittel der Zone heran, die Summe
  // bleibt gleich. So verschwinden mit der Zeit die Preisunterschiede innerhalb eines Sees.
  landverkehr() {
    for (const zone of this.zonen) {
      const art = this.D.zonen.zonen.find((z) => z.id === zone)?.art ?? "see";
      const staerke = this.kurve(`ausgleich_${art}`) * 0.25;
      if (staerke <= 0) continue;
      const staedte = this.staedte.filter((s) => s.zone === zone);
      for (const g of Object.keys(this.D.waren)) {
        const mit = staedte.filter((s) => s.handelt(g));
        const summeBestand = mit.reduce((a, s) => a + s.bestand[g], 0);
        const summeZiel = mit.reduce((a, s) => a + s.ziel[g], 0);
        if (summeZiel <= 0) continue;
        const mittel = summeBestand / summeZiel;
        for (const s of mit) s.bestand[g] = Math.max(0, s.bestand[g] + staerke * (mittel * s.ziel[g] - s.bestand[g]));
      }
    }
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

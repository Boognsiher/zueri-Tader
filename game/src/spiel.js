// Spielzustand des Spielers: Geld, Schiffe, Handel, Kalender.
// Die Welt (Städte, KI-Händler, Ereignisse) steht in wirtschaft.js, Kontore und Betriebe in
// betriebe.js, der automatische Handel in automatik.js.

import { Welt } from "./wirtschaft.js";
import { Navigation, weglaenge, punktAufWeg } from "./navigation.js";
import { Ausbau } from "./betriebe.js";
import * as automatik from "./automatik.js";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export class Spiel {
  // leer = true: ohne Einschwingen und ohne Startschiff, zum Laden eines Spielstands
  constructor(D, seed, { leer = false } = {}) {
    this.D = D;
    this.welt = new Welt(D, seed);
    this.nav = new Navigation(D);
    this.anteil = 0; // Fortschritt im laufenden Tag (0..1), setzt die Zeitsteuerung
    // Einschwingen ohne Spieler, damit die Preise beim Start nicht mehr springen
    if (!leer) for (let i = 0; i < D.p.WARMUP; i++) this.welt.naechsterTag();
    this.starttag = this.welt.tag;
    this.gulden = D.spiel.start.gulden;
    this.schiffe = [];
    this.namen = [...D.spiel.schiffsnamen];
    this.meldungen = [];
    this.bilanz = { einkauf: 0, verkauf: 0, unterhalt: 0, schiffe: 0, betriebe: 0, betriebeKauf: 0, betriebeVerkauf: 0 };
    this.ausbau = new Ausbau(this);
    if (!leer) this.neuesSchiff(this.welt.stadt[D.spiel.start.stadt]);
  }

  // Spieltag ab Spielbeginn (0 = Starttag)
  get tag() {
    return this.welt.tag - this.starttag;
  }

  datum(tag = this.tag) {
    const [j, m, t] = this.D.spiel.start.datum;
    const d = new Date(Date.UTC(j, m - 1, t + tag));
    return `${d.getUTCDate()}. ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  // Datum zu einem Welt-Tag oder einer Welt-Zeit (z. B. Ankunft eines Schiffs)
  datumWelt(weltZeit) {
    return this.datum(Math.floor(weltZeit) - this.starttag);
  }

  // Welt-Zeit mit Tagesbruchteil: Die Schiffe des Spielers fahren stufenlos
  get zeit() {
    return this.welt.tag + this.anteil;
  }

  melde(text, art = "info") {
    this.meldungen.unshift({ tag: this.tag, datum: this.datum(), text, art });
    this.meldungen.length = Math.min(this.meldungen.length, 60);
  }

  neuesSchiff(stadt) {
    const name = this.namen.shift() ?? `${this.D.spiel.schiffstyp} ${this.schiffe.length + 1}`;
    // ort = Hafen, in dem das Schiff liegt (null auf See), fahrt = laufende Fahrt oder null
    // auto = automatischer Handel (automatik.js) oder null
    const schiff = { name, pos: [...stadt.pos], ort: stadt, fahrt: null, ladung: {}, auto: null };
    this.schiffe.push(schiff);
    return schiff;
  }

  ladungsmenge(schiff) {
    return Object.values(schiff.ladung).reduce((a, p) => a + p.menge, 0);
  }

  freierLaderaum(schiff) {
    return this.D.p.SHIP_CAP - this.ladungsmenge(schiff);
  }

  imHafen(schiff, stadt) {
    return !!schiff.ort && !schiff.fahrt && (!stadt || schiff.ort === stadt);
  }

  // Aktuelle Position, auch während der Fahrt
  position(schiff) {
    if (!schiff.fahrt) return { x: schiff.pos[0], y: schiff.pos[1], links: false };
    const f = schiff.fahrt;
    return punktAufWeg(f.weg, (this.zeit - f.start) / Math.max(f.ende - f.start, 1e-9));
  }

  // Nächste Stadt, für Meldungen wie "vor Meilen"
  naechsteStadt(punkt) {
    let beste = null;
    for (const s of this.welt.staedte) {
      const d = Math.hypot(s.pos[0] - punkt[0], s.pos[1] - punkt[1]);
      if (!beste || d < beste.d) beste = { stadt: s, d };
    }
    return beste.stadt;
  }

  // Kauf mit Mengeneffekt: jede Einheit zum Preis beim dann aktuellen Lagerbestand.
  // Mit ausfuehren = false nur Vorschau. preisgrenze: höchster Preis pro Stück (oder null).
  kaufen(schiff, g, wunsch, ausfuehren = true, preisgrenze = null) {
    const stadt = schiff.ort;
    if (!this.imHafen(schiff) || !stadt.handelt(g)) return { menge: 0, betrag: 0 };
    const bestand = stadt.bestand[g];
    const grenze = Math.min(wunsch, this.freierLaderaum(schiff));
    let menge = 0;
    let betrag = 0;
    while (menge < grenze && bestand - menge >= 2) {
      const p = stadt.kaufpreis(g, bestand - menge);
      if (betrag + p > this.gulden || (preisgrenze !== null && p > preisgrenze)) break;
      betrag += p;
      menge++;
    }
    if (ausfuehren && menge > 0) {
      stadt.bestand[g] -= menge;
      this.gulden -= betrag;
      this.bilanz.einkauf += betrag;
      const posten = (schiff.ladung[g] ??= { menge: 0, einstand: 0 });
      posten.einstand = (posten.einstand * posten.menge + betrag) / (posten.menge + menge);
      posten.menge += menge;
    }
    return { menge, betrag };
  }

  // preisgrenze: niedrigster Preis pro Stück (oder null)
  verkaufen(schiff, g, wunsch, ausfuehren = true, preisgrenze = null) {
    const stadt = schiff.ort;
    const posten = schiff.ladung[g];
    if (!this.imHafen(schiff) || !stadt.handelt(g) || !posten) return { menge: 0, betrag: 0, gewinn: 0 };
    const bestand = stadt.bestand[g];
    const hoechstens = Math.min(wunsch, posten.menge);
    let menge = 0;
    let betrag = 0;
    for (; menge < hoechstens; menge++) {
      const p = stadt.verkaufspreis(g, bestand + menge);
      if (preisgrenze !== null && p < preisgrenze) break;
      betrag += p;
    }
    const gewinn = betrag - posten.einstand * menge;
    if (ausfuehren && menge > 0) {
      stadt.bestand[g] += menge;
      this.gulden += betrag;
      this.bilanz.verkauf += betrag;
      posten.menge -= menge;
      if (posten.menge <= 1e-9) delete schiff.ladung[g];
    }
    return { menge, betrag, gewinn };
  }

  // Fahrt zu einer Stadt (ziel.stadt) oder zu einem Punkt auf dem See (ziel.punkt).
  // Geht auch auf See: Das Schiff wechselt dann den Kurs. Gibt einen Grund zurück, wenn es nicht geht.
  // still = true: ohne Meldung (automatischer Handel meldet selbst)
  segeln(schiff, ziel, { still = false } = {}) {
    const stadt = ziel.stadt ?? null;
    if (stadt && this.imHafen(schiff, stadt)) return { ok: false, grund: `${schiff.name} liegt schon in ${stadt.name}.` };
    if (stadt && stadt.gesperrt(this.welt.tag)) return { ok: false, grund: `Föhnsturm: ${stadt.name} kann nicht angelaufen werden.` };
    const p = this.position(schiff);
    const von = [p.x, p.y];
    const nach = stadt ? stadt.pos : ziel.punkt;
    const weg = this.nav.route(von, nach);
    if (!weg) return { ok: false, grund: "Dort ist Land." };
    const tage = weglaenge(weg) / this.D.p.SPEED;
    const warImHafen = schiff.ort;
    schiff.pos = von;
    schiff.ort = null;
    schiff.fahrt = { weg, start: this.zeit, ende: this.zeit + tage, ziel: stadt };
    if (stadt && !still) {
      const ab = warImHafen ? `legt in ${warImHafen.name} ab` : "ändert den Kurs";
      this.melde(`${schiff.name} ${ab}, Ziel ${stadt.name} (Ankunft ${this.datumWelt(schiff.fahrt.ende)}).`);
    }
    return { ok: true };
  }

  // Auf See an der aktuellen Stelle anhalten
  anhalten(schiff) {
    if (!schiff.fahrt) return;
    const p = this.position(schiff);
    schiff.pos = [p.x, p.y];
    schiff.fahrt = null;
  }

  // Schiffe ans Ziel bringen, deren Fahrt bis zur aktuellen Zeit vorbei ist
  pruefeAnkuenfte() {
    const ankuenfte = [];
    for (const s of this.schiffe) {
      if (s.fahrt && this.zeit >= s.fahrt.ende) {
        const f = s.fahrt;
        s.pos = [...f.weg[f.weg.length - 1]];
        s.ort = f.ziel;
        s.fahrt = null;
        ankuenfte.push(s);
        if (s.auto) automatik.weiter(this, s);
        else if (s.ort) this.melde(`${s.name} ist in ${s.ort.name} angekommen.`, "ankunft");
        else this.melde(`${s.name} hat den Zielpunkt vor ${this.naechsteStadt(s.pos).name} erreicht.`);
      }
    }
    return ankuenfte;
  }

  // Zeitsteuerung: Fortschritt im laufenden Tag setzen, gibt angekommene Schiffe zurück
  vorruecken(anteil) {
    this.anteil = Math.max(0, Math.min(anteil, 0.999999));
    return this.pruefeAnkuenfte();
  }

  kannSchiffKaufen(stadt) {
    return this.gulden >= this.D.p.SHIP_COST && this.schiffe.some((s) => this.imHafen(s, stadt));
  }

  schiffKaufen(stadt) {
    if (!this.kannSchiffKaufen(stadt)) return null;
    this.gulden -= this.D.p.SHIP_COST;
    this.bilanz.schiffe += this.D.p.SHIP_COST;
    const schiff = this.neuesSchiff(stadt);
    this.melde(`Neuer ${this.D.spiel.schiffstyp} "${schiff.name}" in ${stadt.name} gekauft.`, "gut");
    return schiff;
  }

  // Wert der Ladung in Schiffen und Kontoren zum Einstandspreis
  warenwert() {
    let summe = 0;
    for (const s of this.schiffe) for (const p of Object.values(s.ladung)) summe += p.menge * p.einstand;
    for (const k of Object.values(this.ausbau.kontore)) for (const p of Object.values(k.lager)) summe += p.menge * p.einstand;
    return summe;
  }

  // Ein Tag vergeht. Gibt Ereignisse und angekommene Schiffe zurück.
  tagVoran() {
    this.anteil = 0;
    const ereignisse = this.welt.naechsterTag();
    for (const e of ereignisse) this.melde(e.text, "ereignis");
    const unterhalt = this.D.p.UPKEEP * this.schiffe.length;
    this.gulden -= unterhalt;
    this.bilanz.unterhalt += unterhalt;
    this.ausbau.tag();
    const ankuenfte = this.pruefeAnkuenfte();
    // Automatische Schiffe, die warten (gesperrter Hafen, kein Geschäft), versuchen es neu
    for (const s of this.schiffe) if (s.auto && !s.fahrt && !ankuenfte.includes(s)) automatik.weiter(this, s);
    return { ereignisse, ankuenfte };
  }
}

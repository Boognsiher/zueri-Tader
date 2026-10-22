// Spielzustand des Spielers: Geld, Schiffe, Handel, Kalender.
// Die Welt (Städte, KI-Händler, Ereignisse) steht in wirtschaft.js.

import { Welt, weg } from "./wirtschaft.js";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export class Spiel {
  constructor(D, seed) {
    this.D = D;
    this.welt = new Welt(D, seed);
    // Einschwingen ohne Spieler, damit die Preise beim Start nicht mehr springen
    for (let i = 0; i < D.p.WARMUP; i++) this.welt.naechsterTag();
    this.starttag = this.welt.tag;
    this.gulden = D.spiel.start.gulden;
    this.schiffe = [];
    this.namen = [...D.spiel.schiffsnamen];
    this.meldungen = [];
    this.bilanz = { einkauf: 0, verkauf: 0, unterhalt: 0, schiffe: 0 };
    this.neuesSchiff(this.welt.stadt[D.spiel.start.stadt]);
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

  // Datum zu einem Welt-Tag (z. B. Ankunft eines Schiffs)
  datumWelt(weltTag) {
    return this.datum(weltTag - this.starttag);
  }

  melde(text, art = "info") {
    this.meldungen.unshift({ tag: this.tag, datum: this.datum(), text, art });
    this.meldungen.length = Math.min(this.meldungen.length, 60);
  }

  neuesSchiff(stadt) {
    const name = this.namen.shift() ?? `${this.D.spiel.schiffstyp} ${this.schiffe.length + 1}`;
    const schiff = { name, ort: stadt, ziel: null, abfahrt: null, ankunft: null, weg: null, ladung: {} };
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
    return !schiff.ziel && (!stadt || schiff.ort === stadt);
  }

  // Kauf mit Mengeneffekt: jede Einheit zum Preis beim dann aktuellen Lagerbestand.
  // Mit ausfuehren = false nur Vorschau.
  kaufen(schiff, g, wunsch, ausfuehren = true) {
    const stadt = schiff.ort;
    if (!this.imHafen(schiff) || !stadt.handelt(g)) return { menge: 0, betrag: 0 };
    const bestand = stadt.bestand[g];
    const grenze = Math.min(wunsch, this.freierLaderaum(schiff));
    let menge = 0;
    let betrag = 0;
    while (menge < grenze && bestand - menge >= 2) {
      const p = stadt.kaufpreis(g, bestand - menge);
      if (betrag + p > this.gulden) break;
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

  verkaufen(schiff, g, wunsch, ausfuehren = true) {
    const stadt = schiff.ort;
    const posten = schiff.ladung[g];
    if (!this.imHafen(schiff) || !stadt.handelt(g) || !posten) return { menge: 0, betrag: 0, gewinn: 0 };
    const bestand = stadt.bestand[g];
    const menge = Math.min(wunsch, posten.menge);
    let betrag = 0;
    for (let i = 0; i < menge; i++) betrag += stadt.verkaufspreis(g, bestand + i);
    const gewinn = betrag - posten.einstand * menge;
    if (ausfuehren && menge > 0) {
      stadt.bestand[g] += menge;
      this.gulden += betrag;
      this.bilanz.verkauf += betrag;
      posten.menge -= menge;
      if (posten.menge === 0) delete schiff.ladung[g];
    }
    return { menge, betrag, gewinn };
  }

  kannAblegen(schiff, ziel) {
    if (!this.imHafen(schiff) || ziel === schiff.ort) return false;
    return !ziel.gesperrt(this.welt.tag);
  }

  ablegen(schiff, ziel) {
    if (!this.kannAblegen(schiff, ziel)) return false;
    schiff.ziel = ziel;
    schiff.abfahrt = this.welt.tag;
    schiff.ankunft = this.welt.tag + this.welt.fahrtage(schiff.ort, ziel);
    schiff.weg = weg(this.D, schiff.ort, ziel);
    this.melde(`${schiff.name} legt in ${schiff.ort.name} ab, Ziel ${ziel.name} (Ankunft ${this.datumWelt(schiff.ankunft)}).`);
    return true;
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

  // Wert der Ladung zum Einstandspreis
  warenwert() {
    let summe = 0;
    for (const s of this.schiffe) for (const p of Object.values(s.ladung)) summe += p.menge * p.einstand;
    return summe;
  }

  // Ein Tag vergeht. Gibt Ereignisse und angekommene Schiffe zurück.
  tagVoran() {
    const ereignisse = this.welt.naechsterTag();
    for (const e of ereignisse) this.melde(e.text, "ereignis");
    const unterhalt = this.D.p.UPKEEP * this.schiffe.length;
    this.gulden -= unterhalt;
    this.bilanz.unterhalt += unterhalt;
    const ankuenfte = [];
    for (const s of this.schiffe) {
      if (s.ziel && this.welt.tag >= s.ankunft) {
        s.ort = s.ziel;
        s.ziel = null;
        s.weg = null;
        ankuenfte.push(s);
        this.melde(`${s.name} ist in ${s.ort.name} angekommen.`, "ankunft");
      }
    }
    return { ereignisse, ankuenfte };
  }
}

// Spielzustand des Spielers: Geld, Schiffe, Handel, Kalender.
// Die Welt (Städte, KI-Händler, Ereignisse) steht in wirtschaft.js, Kontore und Betriebe in
// betriebe.js, der automatische Handel in automatik.js, Stände und Kaperbriefe in diplomatie.js,
// Kriegsschiffe und Gefechte in kampf.js.

import { Welt } from "./wirtschaft.js";
import { Navigation, weglaenge, punktAufWeg } from "./navigation.js";
import { Ausbau } from "./betriebe.js";
import { Werft } from "./werft.js";
import * as automatik from "./automatik.js";
import { neueKonten, buche } from "./bilanz.js";
import { Diplomatie } from "./diplomatie.js";
import { Kampf, neueKampfdaten } from "./kampf.js";
import { Kapitaene } from "./kapitaene.js";
import { Ziel } from "./ziel.js";
import { Risiko } from "./risiko.js";
import { Zoll } from "./zoll.js";
import { Zonen } from "./zonen.js";
import { Zufall } from "./zufall.js";

const MELDUNGEN_JE_REIHE = 60;
const SCHRITTE_JE_TAG = 16; // Prüfungen auf Gefechte pro Tag, wenn tagVoran ohne Zeitsteuerung läuft
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
    this.konten = neueKonten(); // Buchhaltung für die Bilanz (bilanz.js)
    this.ausbau = new Ausbau(this);
    this.werft = new Werft(this);
    // Eigener Zufall für Kriege und Gefechte, damit sie die Ereignisse der Wirtschaft nicht verschieben
    this.kriegszufall = new Zufall((seed ^ 0x2b1d5eed) | 0);
    this.diplomatie = new Diplomatie(this);
    this.kampf = new Kampf(this);
    this.kapitaene = new Kapitaene(this, seed);
    this.ziel = new Ziel(this);
    this.risiko = new Risiko(this, seed);
    this.zoll = new Zoll(this);
    this.zonen = new Zonen(this);
    this.spielsekunden = 0; // echte Spielzeit mit laufender Uhr, für die Abstimmung des Spieltempos
    if (!leer) this.kapitaene.starte();
    if (!leer) this.neuesSchiff(this.welt.stadt[D.spiel.start.stadt]);
  }

  // Spieltag ab Spielbeginn (0 = Starttag)
  get tag() {
    return this.welt.tag - this.starttag;
  }

  // Kalenderjahr (für Freischaltungen nach Jahren)
  jahr(tag = this.tag) {
    const [j, m, t] = this.D.spiel.start.datum;
    return new Date(Date.UTC(j, m - 1, t + tag)).getUTCFullYear();
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

  // Monatsschlüssel wie "1650-04" zum Spieltag
  monat(tag = this.tag) {
    const [j, m, t] = this.D.spiel.start.datum;
    const d = new Date(Date.UTC(j, m - 1, t + tag));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  monatsname(schluessel) {
    const [j, m] = schluessel.split("-").map(Number);
    return `${MONATE[m - 1]} ${j}`;
  }

  // Buchung für die Bilanz (Einnahme positiv, Ausgabe negativ)
  buche(konto, betrag) {
    buche(this.konten, this.monat(), konto, betrag);
  }

  // Meldungen in zwei Reihen: "handel" (Käufe und Verkäufe, Automatik, Kontore) und
  // "wichtig" (alles andere). Jede Reihe behält ihre letzten MELDUNGEN_JE_REIHE Einträge.
  melde(text, art = "info") {
    const reihe = art === "handel" ? "handel" : "wichtig";
    this.meldungen.unshift({ tag: this.tag, datum: this.datum(), text, art, reihe });
    let zaehler = 0;
    this.meldungen = this.meldungen.filter((m) => m.reihe !== reihe || ++zaehler <= MELDUNGEN_JE_REIHE);
  }

  neuesSchiff(stadt, typId = this.D.schiffe.startschiff, gebraucht = false, alter = 0) {
    const t = this.D.schiffe.typ[typId];
    let name = this.namen.shift();
    for (let n = this.schiffe.length + 1; !name || this.schiffe.some((s) => s.name === name); n++) name = `${t.name} ${n}`;
    // typ = Schiffstyp (schiffe.json), gebraucht = höherer Unterhalt
    // ort = Hafen, in dem das Schiff liegt (null auf See), fahrt = laufende Fahrt oder null
    // auto = automatischer Handel (automatik.js) oder null
    // kampf = Kampfhaltung, Schaden und Jagd (kampf.js)
    const schiff = { name, typ: typId, gebraucht, baujahr: this.jahr() - (alter ?? 0), pos: [...stadt.pos], ort: stadt, fahrt: null, ladung: {}, auto: null, kampf: neueKampfdaten(t.kampfschiff) };
    this.schiffe.push(schiff);
    return schiff;
  }

  // Schiffstyp; eine Flotte bekommt einen zusammengesetzten Typ: Laderaum und Umschlag
  // addieren sich (auch Kampfkraft und Rumpf), das Tempo ist das des langsamsten Schiffs
  schiffstyp(schiff) {
    if (!schiff.mitglieder) return this.D.schiffe.typ[schiff.typ];
    const typen = schiff.mitglieder.map((m) => this.D.schiffe.typ[m.typ]);
    return {
      id: "flotte",
      name: "Flotte",
      laderaum: typen.reduce((a, t) => a + t.laderaum, 0),
      tempo: Math.min(...typen.map((t) => t.tempo)),
      umschlag_pro_tag: typen.reduce((a, t) => a + t.umschlag_pro_tag, 0),
      groesse: Math.max(...typen.map((t) => t.groesse)),
      unterhalt: typen.reduce((a, t) => a + t.unterhalt, 0),
      kampfkraft: typen.reduce((a, t) => a + t.kampfkraft, 0),
      rumpf: typen.reduce((a, t) => a + t.rumpf, 0),
      kampfschiff: typen.some((t) => t.kampfschiff),
    };
  }

  laderaum(schiff) {
    return this.schiffstyp(schiff).laderaum;
  }

  // Alter eines Schiffs (oder Flottenmitglieds) in Jahren
  alter(schiff) {
    return Math.max(0, this.jahr() - (schiff.baujahr ?? this.jahr()));
  }

  // Wert eines Schiffs als Anteil des Neuwerts: verliert mit dem Alter, aber nicht unter wert_min
  alterswert(schiff) {
    const a = this.D.schiffe.alter;
    return Math.max(a.wert_min, 1 - a.wertverlust_je_jahr * this.alter(schiff));
  }

  // Altes Schiff: höherer Unterhalt und mehr Havarien
  altersfaktorUnterhalt(schiff) {
    const a = this.D.schiffe.alter;
    return Math.min(a.unterhalt_max, 1 + a.unterhalt_je_jahr * this.alter(schiff));
  }

  istAlt(schiff) {
    return this.alter(schiff) >= this.D.schiffe.alter.alt_ab_jahre;
  }

  unterhalt(schiff) {
    if (schiff.mitglieder) return schiff.mitglieder.reduce((a, m) => a + this.unterhalt(m), 0);
    const t = this.schiffstyp(schiff);
    return t.unterhalt * (schiff.gebraucht ? this.D.schiffe.gebraucht.unterhalt_faktor : 1) * this.altersfaktorUnterhalt(schiff);
  }

  // --- Flotten -----------------------------------------------------------------
  // Eine Flotte ist ein Eintrag in der Schiffsliste mit mitglieder = [{name, typ, gebraucht}].
  pruefeZusammenlegen(a, b) {
    if (a === b) return "Dasselbe Schiff.";
    if (!this.imHafen(a) || !this.imHafen(b) || a.ort !== b.ort) return "Beide Schiffe müssen im selben Hafen liegen.";
    return null;
  }

  // b schliesst sich a an; Ladung wird zusammengelegt, Automatik endet
  zusammenlegen(a, b) {
    if (this.pruefeZusammenlegen(a, b)) return false;
    const mitglied = (s) => (s.mitglieder ? s.mitglieder : [{ name: s.name, typ: s.typ, gebraucht: s.gebraucht, baujahr: s.baujahr }]);
    a.mitglieder = [...mitglied(a), ...mitglied(b)];
    a.typ = "flotte";
    a.gebraucht = false;
    for (const [g, p] of Object.entries(b.ladung)) {
      const ziel = (a.ladung[g] ??= { menge: 0, einstand: 0 });
      ziel.einstand = (ziel.einstand * ziel.menge + p.einstand * p.menge) / (ziel.menge + p.menge);
      ziel.menge += p.menge;
    }
    a.auto = null;
    delete a.versichert; // die Versicherung der Flotte beginnt neu
    if (!a.kapitaen && b.kapitaen) a.kapitaen = b.kapitaen; // sonst bleibt b's Kapitän in Reserve
    else if (b.kapitaen) delete b.kapitaen;
    a.kampf.schaden += b.kampf.schaden;
    this.schiffe = this.schiffe.filter((s) => s !== b);
    this.melde(`${b.name} schliesst sich der Flotte «${a.name}» an (${a.mitglieder.length} Schiffe, Laderaum ${this.laderaum(a)}).`);
    return true;
  }

  pruefeAufloesen(flotte) {
    if (!flotte.mitglieder) return "Das ist keine Flotte.";
    if (!this.imHafen(flotte)) return "Die Flotte muss im Hafen liegen.";
    return null;
  }

  // Flotte in Einzelschiffe zerlegen; die Ladung wird der Reihe nach auf die Laderäume verteilt
  aufloesen(flotte) {
    if (this.pruefeAufloesen(flotte)) return null;
    const ladung = Object.entries(flotte.ladung).map(([g, p]) => ({ g, ...p }));
    const neu = flotte.mitglieder.map((m) => ({
      name: m.name, typ: m.typ, gebraucht: m.gebraucht, baujahr: m.baujahr, pos: [...flotte.pos], ort: flotte.ort, fahrt: null, ladung: {}, auto: null,
      kampf: neueKampfdaten(this.D.schiffe.typ[m.typ].kampfschiff),
    }));
    // Schaden nach Rumpf verteilen
    const rumpf = this.schiffstyp(flotte).rumpf;
    for (const s of neu) s.kampf.schaden = (flotte.kampf.schaden * this.schiffstyp(s).rumpf) / rumpf;
    for (const s of neu) {
      let frei = this.laderaum(s);
      for (const posten of ladung) {
        if (frei <= 0) break;
        const m = Math.min(frei, posten.menge);
        if (m <= 0) continue;
        s.ladung[posten.g] = { menge: m, einstand: posten.einstand };
        posten.menge -= m;
        frei -= m;
      }
    }
    for (const s of neu) delete s.versichert;
    if (flotte.kapitaen) neu[0].kapitaen = flotte.kapitaen; // der Kapitän der Flotte bleibt beim ersten Schiff
    const i = this.schiffe.indexOf(flotte);
    this.schiffe.splice(i, 1, ...neu);
    this.melde(`Flotte «${flotte.name}» in ${flotte.ort.name} aufgelöst.`);
    return neu;
  }

  // Geschwindigkeit in Karteneinheiten pro Tag
  tempo(schiff) {
    return this.D.p.SPEED * this.schiffstyp(schiff).tempo * this.kapitaene.faktor(schiff, "tempo");
  }

  ladungsmenge(schiff) {
    return Object.values(schiff.ladung).reduce((a, p) => a + p.menge, 0);
  }

  freierLaderaum(schiff) {
    return this.laderaum(schiff) - this.ladungsmenge(schiff);
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

  // Orte, von denen aus der Spieler fremde Schiffe sieht: eigene Schiffe und eigene Städte
  // (Kontor oder eigener Betrieb), je mit Sichtweite aus data/spiel.json
  sichtpunkte() {
    const w = this.D.spiel.sichtweite;
    const punkte = this.schiffe.map((s) => {
      const p = this.position(s);
      return [p.x, p.y, w.schiff];
    });
    const eigene = new Set([...Object.keys(this.ausbau.kontore), ...this.ausbau.eigene().map((b) => b.stadt)]);
    for (const name of eigene) punkte.push([...this.welt.stadt[name].pos, w.eigene_stadt]);
    return punkte;
  }

  sichtbar(x, y, punkte = this.sichtpunkte()) {
    return punkte.some(([px, py, r]) => Math.hypot(px - x, py - y) <= r);
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

  // Preise für den Spieler in einer Stadt (Handelsspanne mit Rabatt durch eine Markthalle)
  kaufpreis(stadt, g) {
    return this.ausbau.kaufpreis(stadt, g);
  }

  verkaufspreis(stadt, g) {
    return this.ausbau.verkaufspreis(stadt, g);
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
      const p = this.ausbau.kaufpreis(stadt, g, bestand - menge);
      if (betrag + p > this.gulden || (preisgrenze !== null && p > preisgrenze)) break;
      betrag += p;
      menge++;
    }
    if (ausfuehren && menge > 0) {
      stadt.bestand[g] -= menge;
      this.gulden -= betrag;
      this.buche("handelEinkauf", -betrag);
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
      const p = this.ausbau.verkaufspreis(stadt, g, bestand + menge);
      if (preisgrenze !== null && p < preisgrenze) break;
      betrag += p;
    }
    const zoll = this.zoll.erheben(stadt, g, betrag, ausfuehren && menge > 0);
    const gewinn = betrag - zoll - posten.einstand * menge;
    if (ausfuehren && menge > 0) {
      stadt.bestand[g] += menge;
      this.gulden += betrag - zoll;
      this.buche("handelVerkauf", betrag);
      this.kapitaene.erfahre(schiff, "umsatz", betrag);
      posten.menge -= menge;
      if (posten.menge <= 1e-9) delete schiff.ladung[g];
    }
    return { menge, betrag, gewinn, zoll };
  }

  // Fahrt zu einer Stadt (ziel.stadt) oder zu einem Punkt auf dem See (ziel.punkt).
  // Geht auch auf See: Das Schiff wechselt dann den Kurs. Gibt einen Grund zurück, wenn es nicht geht.
  // still = true: ohne Meldung (automatischer Handel meldet selbst)
  segeln(schiff, ziel, { still = false } = {}) {
    const stadt = ziel.stadt ?? null;
    if (stadt && this.imHafen(schiff, stadt)) return { ok: false, grund: `${schiff.name} liegt schon in ${stadt.name}.` };
    if (stadt && stadt.gesperrt(this.welt.tag)) return { ok: false, grund: `Föhnsturm: ${stadt.name} kann nicht angelaufen werden.` };
    if (stadt && this.diplomatie.hafenGesperrt(stadt)) return { ok: false, grund: `Der ${this.diplomatie.vonStadt(stadt).name} ist dir feindlich gesinnt, ${stadt.name} lässt dich nicht ein.` };
    const p = this.position(schiff);
    const von = [p.x, p.y];
    const nach = stadt ? stadt.pos : ziel.punkt;
    const weg = this.nav.route(von, nach);
    if (!weg) return { ok: false, grund: "Dort ist Land." };
    const tage = weglaenge(weg) / this.tempo(schiff);
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
        if (f.jagd) continue; // Jagd eines Kriegsschiffs (kampf.js): kein Halt, keine Meldung
        ankuenfte.push(s);
        if (automatik.aktiv(s)) automatik.weiter(this, s);
        else if (s.ort) this.melde(`${s.name} ist in ${s.ort.name} angekommen.`, "ankunft");
        else this.melde(`${s.name} hat den Zielpunkt vor ${this.naechsteStadt(s.pos).name} erreicht.`);
      }
    }
    return ankuenfte;
  }

  // Zeitsteuerung: Fortschritt im laufenden Tag setzen, gibt angekommene Schiffe zurück
  vorruecken(anteil) {
    this.anteil = Math.max(0, Math.min(anteil, 0.999999));
    const ankuenfte = this.pruefeAnkuenfte();
    // Automatische Schiffe, die fertig geladen haben, legen ab
    for (const s of this.schiffe) {
      if (automatik.aktiv(s) && !s.fahrt && s.auto.abfahrt != null && this.zeit >= s.auto.abfahrt) automatik.weiter(this, s);
    }
    this.kampf.schritt();
    return ankuenfte;
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
    // Ohne Zeitsteuerung (Tests) Gefechte auch innerhalb des Tages prüfen, sonst fahren
    // Schiffe aneinander vorbei (zwei Schiffe nähern sich um bis zu 20 Karteneinheiten am Tag)
    for (let i = 1; i < SCHRITTE_JE_TAG; i++) {
      if (i / SCHRITTE_JE_TAG <= this.anteil) continue;
      this.anteil = i / SCHRITTE_JE_TAG;
      this.kampf.schritt();
    }
    this.anteil = 0;
    const ereignisse = this.welt.naechsterTag();
    for (const e of ereignisse) this.melde(e.text, "ereignis");
    const unterhalt = this.schiffe.reduce((a, s) => a + this.unterhalt(s), 0);
    this.gulden -= unterhalt;
    this.buche("schiffeUnterhalt", -unterhalt);
    this.ausbau.tag();
    this.werft.tag();
    this.diplomatie.tag();
    this.kampf.tag();
    this.kapitaene.tag();
    this.ziel.tag();
    this.risiko.tag();
    this.zoll.tag();
    this.zonen.tag();
    const ankuenfte = this.pruefeAnkuenfte();
    // Automatische Schiffe, die warten (gesperrter Hafen, kein Geschäft), versuchen es neu
    for (const s of this.schiffe) if (automatik.aktiv(s) && !s.fahrt && !ankuenfte.includes(s)) automatik.weiter(this, s);
    this.kampf.schritt();
    return { ereignisse, ankuenfte };
  }
}

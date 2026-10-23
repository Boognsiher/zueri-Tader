// Kriegsschiffe der Stände, Kampfhaltung der eigenen Schiffe und Gefechte.
// Alle Zahlen stehen in data/schiffe.json (Kampfwerte, Abschnitt kampf) und data/fraktionen.json.
//
// Gefechte laufen automatisch ab (statische Ansicht, siehe docs/entscheidungen.md): Kommen sich
// zwei verfeindete Schiffe auf dem See näher als die Gefechtsweite, schliessen sich Schiffe in
// der Nähe an, dann wird in Runden geschossen, bis eine Seite ausfällt, entkommt oder die
// Runden vorbei sind. Schiffe im Hafen sind sicher.
//
// Kampfhaltung der eigenen Schiffe (schiff.kampf.haltung):
//   angreifen   = fährt Gegner in Jagdweite selbst an (nur ohne eigenen Kurs und ohne Automatik),
//                 kehrt danach in den Hafen zurück, aus dem es ausgelaufen ist
//   verteidigen = kämpft, wenn es angegriffen wird, und hilft eigenen Schiffen in der Nähe
//   ausweichen  = versucht zu entkommen und mischt sich nicht in fremde Gefechte ein
// Kriegsschiffe kämpfen bis zum Untergang, Handelsschiffe werden aufgebracht (Ladung weg, schwer
// beschädigt). Das letzte Schiff des Spielers wird nie versenkt, nur aufgebracht.

import * as automatik from "./automatik.js";
import { weglaenge } from "./navigation.js";

export const HALTUNGEN = [
  ["angreifen", "Angreifen", "Fährt Gegner in der Nähe selbst an"],
  ["verteidigen", "Verteidigen", "Kämpft, wenn angegriffen, und hilft eigenen Schiffen"],
  ["ausweichen", "Ausweichen", "Versucht zu entkommen"],
];

export function neueKampfdaten(kampfschiff) {
  return { haltung: kampfschiff ? "verteidigen" : "ausweichen", schaden: 0, ruheBis: 0, basis: null, planZeit: -1 };
}

const BERICHTE_HOECHSTENS = 5;
const PLAN_ABSTAND = 0.25; // Tage zwischen zwei Kursplanungen

export class Kampf {
  constructor(spiel) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.k = spiel.D.schiffe.kampf;
    this.schiffe = []; // Kriegsschiffe der Stände
    this.neubau = []; // { fraktion, typ, tag }
    this.berichte = []; // Gefechtsberichte mit Beteiligung des Spielers, noch nicht angezeigt
    this.naechsteNr = 1;
    for (const f of this.D.fraktionen.fraktionen) {
      for (const [typ, n] of Object.entries(f.kriegsschiffe)) for (let i = 0; i < n; i++) this.stelle(f.id, typ);
    }
  }

  get diplomatie() {
    return this.spiel.diplomatie;
  }

  // Neues Kriegsschiff eines Stands im Hauptort
  stelle(fraktion, typ) {
    const heim = this.diplomatie.hauptort(fraktion);
    const basis = `${this.D.fraktionen.nach[fraktion].adjektiv} ${this.D.schiffe.typ[typ].name}`;
    let name = basis;
    for (let n = 2; this.schiffe.some((s) => s.name === name); n++) name = `${basis} ${n}`;
    // auftrag: heim, jagd, patrouille; bis = Ende der Patrouille vor einem Hafen
    this.schiffe.push({ nr: this.naechsteNr++, fraktion, typ, name, pos: [...heim.pos], ort: heim, fahrt: null, schaden: 0, auftrag: "heim", bis: 0, ruheBis: 0, planZeit: -1 });
  }

  // --- Werte der Beteiligten (eigene Schiffe und Kriegsschiffe der Stände) ----------------
  typ(x) {
    return x.fraktion ? this.D.schiffe.typ[x.typ] : this.spiel.schiffstyp(x);
  }

  daten(x) {
    if (x.fraktion) return x;
    return (x.kampf ??= neueKampfdaten(this.spiel.schiffstyp(x).kampfschiff));
  }

  haltung(x) {
    return x.fraktion ? "verteidigen" : this.daten(x).haltung;
  }

  setzeHaltung(schiff, haltung) {
    if (!HALTUNGEN.some(([h]) => h === haltung)) return false;
    this.daten(schiff).haltung = haltung;
    return true;
  }

  aufSee(x) {
    return !x.ort || !!x.fahrt;
  }

  pos(x) {
    return this.spiel.position(x);
  }

  feind(x, y) {
    const d = this.diplomatie;
    if (x.fraktion && y.fraktion) return d.imKrieg(x.fraktion, y.fraktion);
    if (x.fraktion) return !y.fraktion && d.feindlich(x.fraktion);
    if (y.fraktion) return d.feindlich(y.fraktion);
    return false;
  }

  alle() {
    return [...this.spiel.schiffe, ...this.schiffe];
  }

  // Nächster Gegner auf dem See in Jagdweite (um den Punkt mitte)
  naechsterFeind(x, mitte) {
    const zeit = this.spiel.zeit;
    let beste = null;
    for (const u of this.alle()) {
      if (u === x || !this.aufSee(u) || this.daten(u).ruheBis > zeit || !this.feind(x, u)) continue;
      const p = this.pos(u);
      const d = Math.hypot(p.x - mitte[0], p.y - mitte[1]);
      if (d <= this.k.jagdweite && (!beste || d < beste.d)) beste = { u, d, p };
    }
    return beste;
  }

  // --- Bewegung ---------------------------------------------------------------------
  fahre(s, ziel) {
    const p = this.pos(s);
    const nach = ziel.stadt ? ziel.stadt.pos : ziel.punkt;
    const weg = this.spiel.nav.route([p.x, p.y], nach);
    if (!weg) return false;
    const zeit = this.spiel.zeit;
    s.pos = [p.x, p.y];
    s.ort = null;
    s.fahrt = { weg, start: zeit, ende: zeit + weglaenge(weg) / (this.D.p.SPEED * this.typ(s).tempo), ziel: ziel.stadt ?? null };
    return true;
  }

  heim(s) {
    const heim = this.diplomatie.hauptort(s.fraktion);
    if ((s.ort === heim && !s.fahrt) || (s.auftrag === "heim" && s.fahrt)) return;
    s.auftrag = "heim";
    this.fahre(s, { stadt: heim });
  }

  // Kurs eines Kriegsschiffs der Stände
  plane(s) {
    const d = this.diplomatie;
    const t = this.typ(s);
    const kriege = d.feinde(s.fraktion);
    const bedroht = kriege.length > 0 || d.feindlich(s.fraktion);
    if (!bedroht || s.schaden >= 0.5 * t.rumpf) return this.heim(s);
    const p = this.pos(s);
    // Wachen jagen nur in der Nähe des Heimathafens
    const mitte = t.rolle === "wache" ? d.hauptort(s.fraktion).pos : [p.x, p.y];
    const feind = this.naechsterFeind(s, mitte);
    if (feind) {
      s.auftrag = "jagd";
      this.fahre(s, { punkt: [feind.p.x, feind.p.y] });
      return;
    }
    if (t.rolle === "wache" || !kriege.length) return this.heim(s);
    if (s.auftrag === "patrouille" && (s.fahrt || this.spiel.zeit < s.bis)) return;
    const z = this.spiel.kriegszufall;
    const gegner = this.D.fraktionen.nach[z.wahl(kriege)];
    s.auftrag = "patrouille";
    this.fahre(s, { punkt: this.spiel.welt.stadt[z.wahl(gegner.staedte)].pos });
  }

  // Eigenes Schiff mit Haltung «angreifen»
  jage(schiff) {
    const kd = this.daten(schiff);
    if (kd.haltung !== "angreifen" || automatik.aktiv(schiff)) return;
    if (schiff.fahrt && !schiff.fahrt.jagd) return; // ein eigener Kurs hat Vorrang
    const zeit = this.spiel.zeit;
    if (zeit - kd.planZeit < PLAN_ABSTAND) return;
    kd.planZeit = zeit;
    const p = this.pos(schiff);
    const feind = kd.schaden < 0.5 * this.typ(schiff).rumpf ? this.naechsterFeind(schiff, [p.x, p.y]) : null;
    if (feind) {
      if (this.spiel.imHafen(schiff)) kd.basis = schiff.ort.name;
      if (this.spiel.segeln(schiff, { punkt: [feind.p.x, feind.p.y] }, { still: true }).ok) schiff.fahrt.jagd = true;
    } else if (!schiff.fahrt && kd.basis) {
      // zurück in den Hafen, aus dem es ausgelaufen ist
      const basis = this.spiel.welt.stadt[kd.basis];
      kd.basis = null;
      if (this.spiel.segeln(schiff, { stadt: basis }, { still: true }).ok) schiff.fahrt.jagd = true;
    }
  }

  // Bei jedem Zeitschritt: Ankünfte der Kriegsschiffe, Kurse, Gefechte
  schritt() {
    const zeit = this.spiel.zeit;
    for (const s of this.schiffe) {
      if (s.fahrt && zeit >= s.fahrt.ende) {
        s.pos = [...s.fahrt.weg[s.fahrt.weg.length - 1]];
        s.ort = s.fahrt.ziel;
        s.fahrt = null;
        if (s.auftrag === "patrouille") s.bis = zeit + this.k.patrouille_tage;
      }
    }
    for (const s of this.schiffe) {
      if (zeit - s.planZeit >= PLAN_ABSTAND) {
        s.planZeit = zeit;
        this.plane(s);
      }
    }
    for (const s of [...this.spiel.schiffe]) this.jage(s);
    this.kontakte();
  }

  kontakte() {
    const zeit = this.spiel.zeit;
    const bereit = (u) => this.aufSee(u) && this.daten(u).ruheBis <= zeit;
    const alle = this.alle().filter(bereit);
    const pos = new Map(alle.map((u) => [u, this.pos(u)]));
    for (let i = 0; i < alle.length; i++) {
      for (let j = i + 1; j < alle.length; j++) {
        const a = alle[i];
        const b = alle[j];
        if (!bereit(a) || !bereit(b) || !this.feind(a, b)) continue;
        if (!this.alle().includes(a) || !this.alle().includes(b)) continue; // schon versenkt
        const pa = pos.get(a);
        const pb = pos.get(b);
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= this.k.gefechtsweite) this.gefecht(a, b, alle.filter(bereit), pos);
      }
    }
  }

  // --- Gefecht ------------------------------------------------------------------------
  gefecht(a, b, kandidaten, pos) {
    const spiel = this.spiel;
    const z = spiel.kriegszufall;
    const seiten = [[a], [b]];
    const mitte = pos.get(a);
    for (const u of kandidaten) {
      if (u === a || u === b) continue;
      const p = pos.get(u);
      if (Math.hypot(p.x - mitte.x, p.y - mitte.y) > this.k.sammelweite) continue;
      if (!u.fraktion && this.haltung(u) === "ausweichen") continue;
      for (const [eigene, andere] of [[seiten[0], seiten[1]], [seiten[1], seiten[0]]]) {
        if (andere.some((v) => this.feind(u, v)) && !eigene.some((v) => this.feind(u, v))) {
          eigene.push(u);
          break;
        }
      }
    }
    const einheit = (x) => {
      const t = this.typ(x);
      const kd = this.daten(x);
      return {
        x, name: x.name, typname: t.name, fraktion: x.fraktion ?? null, kampfkraft: t.kampfkraft * this.spiel.kapitaene.faktor(x, "kampf"), rumpf: t.rumpf, tempo: t.tempo * this.spiel.kapitaene.faktor(x, "tempo"),
        vorher: kd.schaden, schaden: kd.schaden, flieht: !x.fraktion && kd.haltung === "ausweichen", kampfschiff: !!t.kampfschiff, aus: null,
      };
    };
    const S = seiten.map((liste) => liste.map(einheit));
    const ort = spiel.naechsteStadt([mitte.x, mitte.y]).name;
    const titel = (seite) => {
      const namen = [...new Set(seite.map((e) => (e.fraktion ? this.D.fraktionen.nach[e.fraktion].name : "Deine Schiffe")))];
      return namen.join(", ");
    };
    const runden = [];
    const aktiv = (seite) => seite.filter((e) => !e.aus);
    const macht = (seite) => aktiv(seite).reduce((x, e) => x + e.kampfkraft * (1 - (0.5 * e.schaden) / e.rumpf), 0);
    for (let r = 1; r <= this.k.runden; r++) {
      if (!aktiv(S[0]).length || !aktiv(S[1]).length) break;
      // Flucht: eine Seite, deren Schiffe alle ausweichen, versucht zu entkommen
      let entkommen = false;
      for (const [i, j] of [[0, 1], [1, 0]]) {
        const eigene = aktiv(S[i]);
        if (!eigene.every((e) => e.flieht)) continue;
        const verhaeltnis = Math.min(...eigene.map((e) => e.tempo)) / Math.min(...aktiv(S[j]).map((e) => e.tempo));
        if (z.zahl() < this.k.flucht_chance * Math.max(0.5, Math.min(1.5, verhaeltnis))) {
          for (const e of eigene) e.aus = "entkommen";
          runden.push(`Runde ${r}: ${titel(eigene)} entkommen.`);
          entkommen = true;
        }
      }
      if (entkommen) break;
      const treffer = [0, 1].map((i) => macht(S[i]) * this.k.schaden_faktor * (0.75 + 0.5 * z.zahl()));
      const text = [];
      for (const [i, j] of [[0, 1], [1, 0]]) {
        const ziele = aktiv(S[j]);
        const summe = ziele.reduce((x, e) => x + e.rumpf, 0);
        for (const e of ziele) e.schaden += (treffer[i] * e.rumpf) / summe; // grosse Schiffe fangen mehr ab
        text.push(`${titel(S[i])} ${Math.round(treffer[i])} Schaden`);
      }
      const ausfaelle = [];
      for (const e of [...aktiv(S[0]), ...aktiv(S[1])]) {
        if (e.schaden < e.rumpf) continue;
        e.schaden = e.rumpf;
        const letztes = !e.fraktion && spiel.schiffe.length <= 1;
        e.aus = e.fraktion || (e.kampfschiff && !letztes) ? "versenkt" : "aufgebracht";
        ausfaelle.push(`${e.name} ${e.aus}`);
      }
      runden.push(`Runde ${r}: ${text.join(", ")}.${ausfaelle.length ? ` ${ausfaelle.join(", ")}.` : ""}`);
    }
    return this.abschluss(S, runden, ort, titel);
  }

  abschluss(S, runden, ort, titel) {
    const spiel = this.spiel;
    const d = this.diplomatie;
    const zeit = spiel.zeit;
    const spielerDabei = S.map((seite) => seite.some((e) => !e.fraktion));
    let prisengeld = 0;
    const meldungen = [];
    for (const [i, seite] of S.entries()) {
      for (const e of seite) {
        const kd = this.daten(e.x);
        kd.schaden = Math.min(e.schaden, e.rumpf);
        kd.ruheBis = zeit + this.k.ruhe_tage;
        if (e.fraktion && e.aus === "versenkt") {
          this.schiffe = this.schiffe.filter((s) => s !== e.x);
          this.neubau.push({ fraktion: e.fraktion, typ: e.x.typ, tag: spiel.welt.tag + this.D.fraktionen.neubau_tage });
          d.verlust(e.fraktion);
          if (spielerDabei[1 - i]) prisengeld += this.belohnung(e);
        } else if (!e.fraktion && e.aus === "versenkt") {
          spiel.kapitaene.schiffVerloren(e.x, true);
          spiel.schiffe = spiel.schiffe.filter((s) => s !== e.x);
          meldungen.push(`«${e.name}» ist gesunken.`);
        } else if (!e.fraktion && e.aus === "aufgebracht") {
          e.x.ladung = {};
          kd.schaden = Math.round(e.rumpf * 0.9);
          meldungen.push(`«${e.name}» wurde aufgebracht, die Ladung ist verloren.`);
        }
      }
    }
    // Erfahrung für Kapitäne in Gefechten, mehr beim Sieg
    for (const [i, seite] of S.entries()) {
      for (const e of seite) {
        if (e.fraktion || e.aus === "versenkt" || !spiel.schiffe.includes(e.x)) continue;
        spiel.kapitaene.erfahre(e.x, "gefecht");
        if (S[1 - i].every((g) => g.aus && g.aus !== "entkommen")) spiel.kapitaene.erfahre(e.x, "sieg");
      }
    }
    const versenkt = S.flat().filter((e) => e.aus === "versenkt").map((e) => e.name);
    const verloren = S.map((seite) => seite.every((e) => e.aus && e.aus !== "entkommen"));
    let ergebnis;
    if (verloren[0] && !verloren[1]) ergebnis = `Sieg für ${titel(S[1])}.`;
    else if (verloren[1] && !verloren[0]) ergebnis = `Sieg für ${titel(S[0])}.`;
    else if (S.flat().some((e) => e.aus === "entkommen")) ergebnis = "Eine Seite ist entkommen.";
    else ergebnis = "Unentschieden, beide Seiten drehen ab.";
    if (spielerDabei[0] || spielerDabei[1]) {
      const eigene = spielerDabei[0] ? 0 : 1;
      const bericht = {
        datum: spiel.datum(),
        ort,
        seiten: [S[eigene], S[1 - eigene]].map((seite) => ({
          titel: titel(seite),
          einheiten: seite.map((e) => ({ name: e.name, typ: e.typname, fraktion: e.fraktion, rumpf: e.rumpf, vorher: e.vorher, nachher: Math.min(e.schaden, e.rumpf), aus: e.aus })),
        })),
        runden,
        ergebnis,
        prisengeld,
      };
      this.berichte.push(bericht);
      if (this.berichte.length > BERICHTE_HOECHSTENS) this.berichte.shift();
      spiel.melde(`Gefecht vor ${ort}: ${ergebnis}${prisengeld ? ` Prisengeld ${Math.round(prisengeld)} Gulden.` : ""} ${meldungen.join(" ")}`.trim(), "warnung");
    } else if (versenkt.length) {
      spiel.melde(`Gefecht vor ${ort} zwischen ${titel(S[0])} und ${titel(S[1])}: ${versenkt.join(", ")} versenkt.`, "ereignis");
    }
  }

  // Der Spieler hat geholfen, ein Kriegsschiff zu versenken: Prisengeld vom Auftraggeber
  belohnung(e) {
    const d = this.diplomatie;
    const k = this.D.fraktionen.kaperbrief;
    d.aendereRuf(e.fraktion, -k.ruf_verlust);
    const auftraggeber = d.kaperbriefe.find((id) => d.imKrieg(id, e.fraktion));
    if (!auftraggeber) return 0;
    const betrag = Math.round(this.D.schiffe.typ[e.x.typ].preis * k.prisengeld_anteil);
    this.spiel.gulden += betrag;
    this.spiel.buche("prisengeld", betrag);
    d.aendereRuf(auftraggeber, k.ruf_sieg);
    return betrag;
  }

  // --- Tageslauf: Neubau, Reparatur -------------------------------------------------------
  tag() {
    const spiel = this.spiel;
    const tag = spiel.welt.tag;
    for (const n of this.neubau.filter((x) => x.tag <= tag)) this.stelle(n.fraktion, n.typ);
    this.neubau = this.neubau.filter((x) => x.tag > tag);
    const anteil = this.k.reparatur_anteil_pro_tag;
    for (const s of this.schiffe) {
      if (s.ort === this.diplomatie.hauptort(s.fraktion) && !s.fahrt) s.schaden = Math.max(0, s.schaden - this.typ(s).rumpf * anteil);
    }
    for (const schiff of spiel.schiffe) {
      const kd = this.daten(schiff);
      if (kd.schaden <= 0 || !spiel.imHafen(schiff) || this.diplomatie.hafenGesperrt(schiff.ort)) continue;
      const punkte = Math.min(kd.schaden, this.typ(schiff).rumpf * anteil);
      const kosten = Math.round(punkte * this.k.reparatur_kosten_je_punkt);
      if (spiel.gulden < kosten) continue;
      spiel.gulden -= kosten;
      spiel.buche("schiffeReparatur", -kosten);
      kd.schaden -= punkte;
    }
  }

  // --- Speichern ----------------------------------------------------------------------
  zustand() {
    const nr = (stadt) => (stadt ? stadt.name : null);
    return {
      naechsteNr: this.naechsteNr,
      neubau: this.neubau,
      schiffe: this.schiffe.map((s) => ({ ...s, ort: nr(s.ort), fahrt: s.fahrt ? { ...s.fahrt, ziel: nr(s.fahrt.ziel) } : null })),
    };
  }

  laden(z) {
    if (!z) return; // ältere Spielstände: Flotten der Stände im Heimathafen
    const stadt = (name) => (name ? this.spiel.welt.stadt[name] : null);
    this.naechsteNr = z.naechsteNr;
    this.neubau = z.neubau;
    this.schiffe = z.schiffe.map((s) => ({ ...s, ort: stadt(s.ort), fahrt: s.fahrt ? { ...s.fahrt, ziel: stadt(s.fahrt.ziel) } : null }));
  }
}

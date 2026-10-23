// Kapitäne der Spielerschiffe: anheuern, Stufen, Lohn, verschollen nach dem Untergang.
// Alle Zahlen stehen in data/kapitaene.json. Ein Schiff ohne Kapitän fährt mit einem einfachen
// Steuermann ohne Bonus und ohne Lohn, die Kapitäne sind also ein Zusatz und kein Zwang.
//
// Ein Kapitän gehört dem Spieler (spiel.kapitaene.liste) und ist einem Schiff zugeordnet
// (schiff.kapitaen = Nummer des Kapitäns) oder in Reserve. Kapitäne sterben nicht: Sinkt das Schiff,
// ist der Kapitän für Monate verschollen (bis = Welt-Tag) und kehrt dann in die Reserve zurück.
// Bewerber warten in den Wirtshäusern der Städte (wirtshaus), mit eigenem Zufallsgenerator,
// damit die Wirtschaft nicht verschoben wird.

import { Zufall } from "./zufall.js";

export class Kapitaene {
  constructor(spiel, seed) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.k = spiel.D.kapitaene;
    this.zufall = new Zufall((seed ^ 0x4a17a1e5) | 0);
    this.liste = []; // { nr, name, erfahrung, eigenschaft, bis }
    this.wirtshaus = []; // Bewerber: { nr, stadt, name, erfahrung, eigenschaft, bis }
    this.naechsteNr = 1;
  }

  // Zum Spielstart ein paar Bewerber, damit gleich jemand zu haben ist
  starte() {
    for (const s of this.spiel.welt.staedte) if (this.zufall.zahl() < this.k.wirtshaus.start_chance) this.neuerBewerber(s.name);
  }

  eigenschaft(k) {
    return this.k.eigenschaften.find((e) => e.id === k.eigenschaft);
  }

  stufe(k) {
    let stufe = 1;
    this.k.erfahrung_ab_stufe.forEach((ab, i) => {
      if (k.erfahrung >= ab) stufe = i + 1;
    });
    return Math.min(stufe, this.k.stufen_max);
  }

  // Erfahrung bis zur nächsten Stufe, null auf der höchsten
  naechsteStufeBei(k) {
    return this.stufe(k) >= this.k.stufen_max ? null : this.k.erfahrung_ab_stufe[this.stufe(k)];
  }

  // Tageslohn eines Kapitäns auf einem Schiff (in Reserve die Hälfte, verschollen nichts)
  lohn(k, imDienst = true) {
    const l = this.k.lohn;
    const grund = (l.grund + l.je_stufe * (this.stufe(k) - 1)) * (this.eigenschaft(k)?.lohn ?? 1);
    return grund * (imDienst ? 1 : l.reserve_anteil);
  }

  anwerbegeld(k) {
    return Math.round(this.lohn(k) * this.k.anwerbegeld_tage);
  }

  // --- Zuordnung ------------------------------------------------------------------
  von(schiff) {
    return schiff.kapitaen ? this.liste.find((k) => k.nr === schiff.kapitaen) ?? null : null;
  }

  schiffVon(k) {
    return this.spiel.schiffe.find((s) => s.kapitaen === k.nr) ?? null;
  }

  verschollen(k) {
    return k.bis != null;
  }

  // Zustand für die Anzeige: "schiff", "reserve" oder "verschollen"
  zustandVon(k) {
    if (this.verschollen(k)) return "verschollen";
    return this.schiffVon(k) ? "schiff" : "reserve";
  }

  // Zuschlag eines Kapitäns auf Tempo, Umschlag oder Kampfkraft (Faktor 1 ohne Kapitän)
  faktor(schiff, art) {
    const k = this.von(schiff);
    if (!k) return 1;
    return 1 + (this.stufe(k) - 1) * this.k.wirkung_je_stufe[art] + (this.eigenschaft(k)?.[art] ?? 0);
  }

  // --- Anheuern, Zuweisen, Entlassen ---------------------------------------------------
  bewerberIn(stadt) {
    return this.wirtshaus.filter((b) => b.stadt === stadt.name);
  }

  pruefeAnheuern(bewerber) {
    const stadt = this.spiel.welt.stadt[bewerber.stadt];
    if (!this.spiel.ausbau.vorOrt(stadt)) return "Dafür brauchst du ein Schiff im Hafen oder ein Kontor hier.";
    if (this.spiel.gulden < this.anwerbegeld(bewerber)) return "Zu wenig Gulden.";
    return null;
  }

  anheuern(bewerber) {
    if (this.pruefeAnheuern(bewerber)) return null;
    const geld = this.anwerbegeld(bewerber);
    this.spiel.gulden -= geld;
    this.spiel.buche("kapitaenAnwerbung", -geld);
    this.wirtshaus = this.wirtshaus.filter((b) => b !== bewerber);
    const k = { nr: this.naechsteNr++, name: bewerber.name, erfahrung: bewerber.erfahrung, eigenschaft: bewerber.eigenschaft, bis: null };
    this.liste.push(k);
    this.spiel.melde(`Kapitän ${k.name} (Stufe ${this.stufe(k)}) in ${bewerber.stadt} angeheuert.`, "gut");
    return k;
  }

  pruefeZuweisen(k, schiff) {
    if (this.verschollen(k)) return "Der Kapitän ist verschollen.";
    if (schiff.kapitaen === k.nr) return "Er fährt dieses Schiff schon.";
    if (!this.spiel.imHafen(schiff)) return "Das Schiff muss im Hafen liegen.";
    return null;
  }

  // Der Kapitän übernimmt das Schiff; ein bisheriger Kapitän des Schiffs geht in die Reserve,
  // und der neue verlässt sein altes Schiff (nur im Hafen)
  zuweisen(k, schiff) {
    if (this.pruefeZuweisen(k, schiff)) return false;
    const altesSchiff = this.schiffVon(k);
    if (altesSchiff && !this.spiel.imHafen(altesSchiff)) return false;
    if (altesSchiff) delete altesSchiff.kapitaen;
    schiff.kapitaen = k.nr;
    this.spiel.melde(`Kapitän ${k.name} (Stufe ${this.stufe(k)}) übernimmt «${schiff.name}».`);
    return true;
  }

  pruefeEntlassen(k) {
    const schiff = this.schiffVon(k);
    if (schiff && !this.spiel.imHafen(schiff)) return "Das Schiff ist auf See.";
    return null;
  }

  // Auf Wunsch: Kapitän ins Reserve (vom Schiff nehmen)
  absetzen(k) {
    const schiff = this.schiffVon(k);
    if (!schiff || this.pruefeEntlassen(k)) return false;
    delete schiff.kapitaen;
    return true;
  }

  entlassen(k) {
    if (this.pruefeEntlassen(k)) return false;
    const schiff = this.schiffVon(k);
    if (schiff) delete schiff.kapitaen;
    this.liste = this.liste.filter((x) => x !== k);
    this.spiel.melde(`Kapitän ${k.name} entlassen.`);
    return true;
  }

  // --- Ereignisse ---------------------------------------------------------------------
  // Das Schiff geht verloren (Untergang) oder wird verkauft/aufgelöst
  schiffVerloren(schiff, untergang) {
    const k = this.von(schiff);
    if (!k) return;
    delete schiff.kapitaen;
    if (!untergang) return;
    const v = this.k.verschollen;
    k.bis = this.spiel.welt.tag + Math.round(v.tage_min + (v.tage_max - v.tage_min) * this.zufall.zahl());
    this.spiel.melde(`Kapitän ${k.name} ist mit «${schiff.name}» verschollen. Vielleicht taucht er wieder auf.`, "warnung");
  }

  // Erfahrung sammeln: art = "umsatz" (wert = Gulden), "gefecht", "sieg", "seetag"
  erfahre(schiff, art, wert = 1) {
    const k = this.von(schiff);
    if (!k) return;
    const e = this.k.erfahrung;
    const stufe = this.stufe(k);
    k.erfahrung += art === "umsatz" ? (wert / 100) * e.je_100_gulden : e[art === "seetag" ? "je_seetag" : art === "gefecht" ? "je_gefecht" : "je_sieg"] * wert;
    const neu = this.stufe(k);
    if (neu > stufe) this.spiel.melde(`Kapitän ${k.name} von «${schiff.name}» steigt auf Stufe ${neu}.`, "gut");
  }

  neuerBewerber(stadt) {
    const w = this.k.wirtshaus;
    const z = this.zufall;
    const stufe = 1 + Math.floor(z.zahl() * w.stufe_max);
    const eig = z.zahl() < 0.75 ? z.wahl(this.k.eigenschaften).id : null;
    const b = {
      nr: this.naechsteNr++,
      stadt,
      name: `${z.wahl(this.k.vornamen)} ${z.wahl(this.k.nachnamen)}`,
      erfahrung: this.k.erfahrung_ab_stufe[stufe - 1],
      eigenschaft: eig,
      bis: this.spiel.welt.tag + w.bleibt_tage,
    };
    this.wirtshaus.push(b);
    return b;
  }

  // Täglich: Lohn, Seetage, Rückkehr verschollener Kapitäne, neue Bewerber
  tag() {
    const spiel = this.spiel;
    const welt = spiel.welt;
    let lohn = 0;
    for (const k of this.liste) {
      if (this.verschollen(k)) {
        if (welt.tag >= k.bis) {
          k.bis = null;
          spiel.melde(`Kapitän ${k.name} ist wieder aufgetaucht und wartet auf ein Schiff.`, "gut");
        }
        continue;
      }
      lohn += this.lohn(k, !!this.schiffVon(k));
    }
    if (lohn) {
      spiel.gulden -= lohn;
      spiel.buche("kapitaenslohn", -lohn);
    }
    for (const s of spiel.schiffe) if (s.fahrt && s.kapitaen) this.erfahre(s, "seetag");
    const w = this.k.wirtshaus;
    this.wirtshaus = this.wirtshaus.filter((b) => b.bis > welt.tag);
    if (this.zufall.zahl() < w.chance_pro_tag) {
      const stadt = this.zufall.wahl(welt.staedte);
      if (this.bewerberIn(stadt).length < w.max_je_stadt) this.neuerBewerber(stadt.name);
    }
  }

  // --- Speichern ----------------------------------------------------------------------
  zustand() {
    return { liste: this.liste, wirtshaus: this.wirtshaus, naechsteNr: this.naechsteNr, zufall: this.zufall.zustand };
  }

  laden(z) {
    if (!z) return; // ältere Spielstände: noch keine Kapitäne, das Wirtshaus füllt sich mit der Zeit
    this.liste = z.liste;
    this.wirtshaus = z.wirtshaus;
    this.naechsteNr = z.naechsteNr;
    this.zufall.zustand = z.zufall;
  }
}

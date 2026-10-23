// Risiko-Ereignisse für Schiffe des Spielers auf See: Sturm, Überfall, Havarie, Rückenwind,
// dazu die Versicherung. Alle Zahlen stehen in data/risiko.json. Die Ereignisse treffen nur den
// Spieler (nicht die KI-Händler) und haben einen eigenen Zufallsgenerator, damit sie die
// Wirtschaft nicht verschieben. Kapitäne und Kriegsschiffe in der Flotte mildern die Folgen.

import { Zufall } from "./zufall.js";

export class Risiko {
  constructor(spiel, seed) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.r = spiel.D.risiko;
    this.zufall = new Zufall((seed ^ 0x5a3d1b07) | 0);
  }

  // Zahl in [von, bis]
  spanne([von, bis]) {
    return von + (bis - von) * this.zufall.zahl();
  }

  // Neupreis der Schiffe (bei Flotten die Summe)
  neupreis(schiff) {
    const typen = schiff.mitglieder ? schiff.mitglieder.map((m) => m.typ) : [schiff.typ];
    return typen.reduce((a, t) => a + this.D.schiffe.typ[t].preis, 0);
  }

  praemie(schiff) {
    return this.neupreis(schiff) * this.r.versicherung.praemie_je_tag;
  }

  // Versicherung ein- oder ausschalten
  versichern(schiff, an) {
    schiff.versichert = an;
    if (!an) delete schiff.versichert;
  }

  // Schutz gegen Überfälle: Kampfkraft des Schiffs oder der Flotte mit Kapitän
  schutz(schiff) {
    const s = this.spiel;
    return 1 + s.schiffstyp(schiff).kampfkraft * s.kapitaene.faktor(schiff, "kampf") * this.r.schutz_je_kampfkraft;
  }

  // Sturm- und Havarieschaden sinkt mit der Stufe des Kapitäns
  schadensfaktor(schiff) {
    const k = this.spiel.kapitaene.von(schiff);
    return Math.max(0.3, 1 - (k ? this.spiel.kapitaene.stufe(k) - 1 : 0) * this.r.schaden_minus_je_stufe);
  }

  // Fahrtdauer ändern, ohne dass das Schiff auf der Karte springt (Fortschritt bleibt gleich)
  verschiebeAnkunft(schiff, tage) {
    const f = schiff.fahrt;
    const jetzt = this.spiel.zeit;
    const p = (jetzt - f.start) / Math.max(f.ende - f.start, 1e-9);
    const neuesEnde = Math.max(jetzt + 0.05, f.ende + tage);
    if (p < 0.95) f.start = (jetzt - p * neuesEnde) / (1 - p);
    f.ende = neuesEnde;
  }

  // Rumpfschaden in Punkten, nie bis zum Untergang
  schaden(schiff, anteil) {
    const rumpf = this.spiel.schiffstyp(schiff).rumpf;
    const kd = this.spiel.kampf.daten(schiff);
    const punkte = Math.min(rumpf * anteil * this.schadensfaktor(schiff), rumpf * 0.9 - kd.schaden);
    if (punkte <= 0) return 0;
    kd.schaden += punkte;
    return punkte;
  }

  // Versicherung zahlt einen Betrag aus (Anteil laut Daten), gibt die Auszahlung zurück
  erstatte(schiff, betrag) {
    if (!schiff.versichert || betrag <= 0) return 0;
    const summe = Math.round(betrag * this.r.versicherung.erstattung);
    this.spiel.gulden += summe;
    this.spiel.buche("versicherungLeistung", summe);
    return summe;
  }

  zusatz(schiff, summe) {
    return summe ? ` Die Versicherung zahlt ${Math.round(summe)} Gulden.` : "";
  }

  sturm(schiff) {
    const e = this.r.ereignisse.sturm;
    const tage = this.spanne(e.verzoegerung_tage);
    this.verschiebeAnkunft(schiff, tage);
    const punkte = this.schaden(schiff, this.spanne(e.schaden_anteil));
    const kosten = punkte * this.D.schiffe.kampf.reparatur_kosten_je_punkt;
    const ersatz = this.erstatte(schiff, kosten);
    this.spiel.melde(`Sturm auf dem See: «${schiff.name}» verliert ${tage.toFixed(1).replace(".", ",")} Tage und nimmt Schaden.${this.zusatz(schiff, ersatz)}`, "warnung");
  }

  havarie(schiff) {
    const e = this.r.ereignisse.havarie;
    const tage = this.spanne(e.verzoegerung_tage);
    this.verschiebeAnkunft(schiff, tage);
    const punkte = this.schaden(schiff, this.spanne(e.schaden_anteil));
    const kosten = punkte * this.D.schiffe.kampf.reparatur_kosten_je_punkt;
    const ersatz = this.erstatte(schiff, kosten);
    this.spiel.melde(`«${schiff.name}» läuft auf eine Untiefe und schlägt leck: ${tage.toFixed(1).replace(".", ",")} Tage Verspätung, schwerer Schaden.${this.zusatz(schiff, ersatz)}`, "warnung");
  }

  ueberfall(schiff) {
    const e = this.r.ereignisse.ueberfall;
    const s = this.spiel;
    const anteil = this.spanne(e.verlust_anteil) * (s.schiffstyp(schiff).kampfschiff ? 0.5 : 1);
    let wert = 0;
    let menge = 0;
    for (const [g, p] of Object.entries(schiff.ladung)) {
      const weg = p.menge * anteil;
      wert += weg * p.einstand;
      menge += weg;
      p.menge -= weg;
      if (p.menge <= 1e-9) delete schiff.ladung[g];
    }
    const ersatz = this.erstatte(schiff, wert);
    s.melde(`Überfall: Strandräuber entern «${schiff.name}» und rauben ${Math.round(menge)} Einheiten Ladung (${Math.round(wert)} Gulden).${this.zusatz(schiff, ersatz)}`, "warnung");
  }

  rueckenwind(schiff) {
    const f = schiff.fahrt;
    const tage = this.spanne(this.r.ereignisse.rueckenwind.gewinn_tage);
    if (f.ende - this.spiel.zeit < tage + 0.5) return; // zu kurz vor dem Ziel
    this.verschiebeAnkunft(schiff, -tage);
    this.spiel.melde(`Günstiger Wind: «${schiff.name}» spart ${tage.toFixed(1).replace(".", ",")} Tage.`, "gut");
  }

  // Täglich: Prämie, dann für jedes Schiff auf See würfeln
  tag() {
    const s = this.spiel;
    const e = this.r.ereignisse;
    let praemie = 0;
    for (const schiff of s.schiffe) if (schiff.versichert) praemie += this.praemie(schiff);
    if (praemie) {
      s.gulden -= praemie;
      s.buche("versicherungPraemie", -praemie);
    }
    const krieg = this.spiel.diplomatie.liste.some((f) => this.spiel.diplomatie.feindlich(f.id));
    for (const schiff of [...s.schiffe]) {
      if (!schiff.fahrt || schiff.fahrt.jagd) continue;
      // Reihenfolge fest, damit der Zufall reproduzierbar bleibt
      if (this.zufall.zahl() < e.sturm.chance) this.sturm(schiff);
      if (!schiff.fahrt) continue;
      if (this.zufall.zahl() < e.havarie.chance) this.havarie(schiff);
      if (Object.keys(schiff.ladung).length) {
        const chance = (e.ueberfall.chance * (krieg ? e.ueberfall.kriegsfaktor : 1)) / this.schutz(schiff);
        if (this.zufall.zahl() < chance) this.ueberfall(schiff);
      }
      if (this.zufall.zahl() < e.rueckenwind.chance) this.rueckenwind(schiff);
    }
  }

  zustand() {
    return { zufall: this.zufall.zustand };
  }

  laden(z) {
    if (z) this.zufall.zustand = z.zufall;
  }
}

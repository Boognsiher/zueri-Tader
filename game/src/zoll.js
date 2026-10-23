// Zoll und Handelsverträge. Alle Zahlen stehen in data/zoll.json. Der Zoll ist ein Anteil des
// Verkaufserlöses in einer Stadt; Ratssitz, hoher Ruf und ein Handelsvertrag senken ihn, ein Krieg
// des Stands erhöht ihn. Betrifft nur den Spieler, nicht die KI-Händler.

export class Zoll {
  constructor(spiel) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.z = spiel.D.zoll;
    this.vertraege = {}; // Stand-ID -> Welt-Tag, bis zu dem der Vertrag gilt
  }

  // Gilt ein Handelsvertrag mit dem Stand der Stadt?
  vertragBis(standId) {
    const bis = this.vertraege[standId];
    return bis !== undefined && bis > this.spiel.welt.tag ? bis : null;
  }

  // Zollsatz (Anteil des Erlöses) für eine Ware in einer Stadt
  satz(stadt, ware) {
    const d = this.spiel.diplomatie;
    const stand = d.vonStadt(stadt);
    const gruppe = this.D.gruppen[ware];
    let satz = (this.z.stand[stand.id] ?? this.z.standard ?? 0) * (this.z.gruppe[gruppe] ?? 1);
    if (d.feinde(stand.id).length) satz += this.z.kriegszuschlag;
    const e = this.z.ermaessigung;
    if (this.spiel.ziel.hatSitz(stadt)) satz *= e.ratssitz;
    if (d.ruf[stand.id] >= this.D.fraktionen.ruf.vorzug) satz *= e.ruf_vorzug;
    if (this.vertragBis(stand.id) !== null) satz *= e.vertrag;
    return Math.max(0, satz);
  }

  // Zoll auf einen Erlös; wird als Ausgabe verbucht, wenn buchen = true
  erheben(stadt, ware, erloes, buchen = true) {
    const zoll = erloes * this.satz(stadt, ware);
    if (buchen && zoll > 0) this.spiel.buche("zoll", -zoll);
    return zoll;
  }

  // --- Handelsverträge ---------------------------------------------------------------
  gebuehr(stand) {
    const v = this.z.vertrag;
    const einwohner = stand.staedte.reduce((a, name) => a + this.spiel.welt.stadt[name].einwohner, 0);
    return Math.max(v.gebuehr_min, Math.round((einwohner * v.gebuehr_je_einwohner) / 100) * 100);
  }

  pruefeVertrag(stadt) {
    const s = this.spiel;
    const stand = s.diplomatie.vonStadt(stadt);
    const v = this.z.vertrag;
    if (!s.ausbau.vorOrt(stadt)) return "Dafür brauchst du ein Schiff im Hafen oder ein Kontor hier.";
    if (s.diplomatie.feindlich(stand.id)) return `Der ${stand.name} ist dir feindlich gesinnt.`;
    if (s.diplomatie.ruf[stand.id] < v.ruf_min) return `Dein Ruf beim ${stand.name} ist zu schlecht.`;
    if (s.ziel.rangIndex + 1 < v.rang_min) return `Dafür brauchst du mindestens den Rang «${s.ziel.raenge[v.rang_min - 1].name}».`;
    if (s.gulden < this.gebuehr(stand)) return "Zu wenig Gulden.";
    return null;
  }

  // Schliesst den Vertrag ab oder erneuert ihn: Die Laufzeit beginnt heute
  schliesseVertrag(stadt) {
    if (this.pruefeVertrag(stadt)) return false;
    const s = this.spiel;
    const stand = s.diplomatie.vonStadt(stadt);
    const geb = this.gebuehr(stand);
    s.gulden -= geb;
    s.buche("vertragsgebuehr", -geb);
    this.vertraege[stand.id] = s.welt.tag + this.z.vertrag.dauer_tage;
    s.melde(`Handelsvertrag mit dem ${stand.name}: ${Math.round((1 - this.z.ermaessigung.vertrag) * 100)} % weniger Zoll bis ${s.datumWelt(this.vertraege[stand.id])}.`, "gut");
    return true;
  }

  tag() {
    const s = this.spiel;
    for (const [id, bis] of Object.entries(this.vertraege)) {
      if (bis === s.welt.tag) s.melde(`Der Handelsvertrag mit dem ${s.diplomatie.fraktion(id).name} ist abgelaufen.`, "warnung");
    }
  }

  zustand() {
    return { vertraege: this.vertraege };
  }

  laden(z) {
    this.vertraege = z?.vertraege ?? {};
  }
}

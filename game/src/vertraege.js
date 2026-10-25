// Fernhandelsverträge an den Verteilzentren (data/vertraege.json): Handel mit Zonen, die der Spieler
// noch nicht erschlossen hat. Ein Handelshaus der fremden Zone liefert jeden Kalendermonat eine feste
// Menge ins eigene Kontor am Verteilzentrum (einkauf) oder nimmt sie von dort ab (verkauf), zu einem
// festen Preis. Erfüllte Lieferungen bauen das Geschäft auf und verbilligen das spätere Erschliessen.
//
// vertrag = { nr, art: "einkauf" | "verkauf", zone, stadt, ware, menge, preis, rest (Monate), geliefert }

export class Vertraege {
  constructor(spiel) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.v = spiel.D.vertraege;
    this.liste = [];
    this.beziehung = {}; // Zone -> Anzahl vollständig erfüllter Lieferungen
    this.monat = null; // zuletzt abgerechneter Kalendermonat
  }

  // Verteilzentrum einer Stadt: die Zone, deren Verteilzentrum sie ist, sonst null
  zoneVonZentrum(stadt) {
    return this.D.zonen.zonen.find((z) => z.verteilzentrum === (stadt.name ?? stadt)) ?? null;
  }

  // Preisniveau einer Zone für eine Ware
  niveau(zone, g) {
    return zone.preisfaktor?.[g] ?? 1;
  }

  // Fremde Zonen, mit denen das Verteilzentrum handeln kann: noch nicht erschlossen, höchstens
  // vorlauf_jahre vor dem frühesten Erschliessen (ab_jahr)
  partner() {
    const s = this.spiel;
    return this.D.zonen.zonen.filter((z) => !s.zonen.offen(z.id) && s.jahr() >= (z.ab_jahr ?? 0) - this.v.vorlauf_jahre);
  }

  // Angebote eines Verteilzentrums: je fremde Zone einige Waren zum Einkauf und zum Verkauf
  angebote(stadt) {
    const hier = this.zoneVonZentrum(stadt);
    if (!hier) return [];
    const aus = [];
    for (const z of this.partner()) {
      const cfg = this.D.staedte.filter((c) => c.zone === z.id);
      const erzeugt = new Set(cfg.flatMap((c) => [...Object.keys(c.prod), ...Object.keys(c.werk)]));
      const fehlt = new Set(cfg.flatMap((c) => Object.keys(c.imp)));
      const einkauf = [...erzeugt]
        .map((g) => ({ g, preis: this.D.waren[g] * this.niveau(z, g) * (1 + this.v.aufschlag_einkauf) }))
        .filter((x) => x.preis < this.D.waren[x.g] * this.niveau(hier, x.g))
        .sort((a, b) => a.preis / this.D.waren[a.g] - b.preis / this.D.waren[b.g])
        .slice(0, this.v.angebote_je_art);
      const verkauf = Object.keys(this.D.waren)
        .filter((g) => fehlt.has(g) || this.niveau(z, g) >= this.v.verkauf_ab_preisniveau)
        .map((g) => ({ g, preis: this.D.waren[g] * this.niveau(z, g) * (1 - this.v.abschlag_verkauf) }))
        .sort((a, b) => b.preis / this.D.waren[b.g] - a.preis / this.D.waren[a.g])
        .slice(0, this.v.angebote_je_art);
      for (const x of einkauf) aus.push({ art: "einkauf", zone: z.id, ware: x.g, preis: Math.round(x.preis * 10) / 10 });
      for (const x of verkauf) aus.push({ art: "verkauf", zone: z.id, ware: x.g, preis: Math.round(x.preis * 10) / 10 });
    }
    return aus;
  }

  pruefe(stadt, angebot, menge) {
    const s = this.spiel;
    if (!this.zoneVonZentrum(stadt)) return "Verträge gibt es nur in Verteilzentren.";
    if (!s.ausbau.kontor(stadt)) return "Dafür brauchst du hier ein Kontor (die Ware kommt dort an oder geht von dort weg).";
    if (this.liste.length >= this.v.max_vertraege) return `Höchstens ${this.v.max_vertraege} Verträge gleichzeitig.`;
    if (!this.v.mengen.includes(menge)) return "Unbekannte Menge.";
    if (!this.angebote(stadt).some((a) => a.art === angebot.art && a.zone === angebot.zone && a.ware === angebot.ware)) return "Dieses Angebot gibt es nicht mehr.";
    if (this.liste.some((x) => x.stadt === stadt.name && x.zone === angebot.zone && x.ware === angebot.ware && x.art === angebot.art)) return "Dieser Vertrag läuft schon.";
    return null;
  }

  abschliessen(stadt, angebot, menge) {
    if (this.pruefe(stadt, angebot, menge)) return null;
    const nr = Math.max(0, ...this.liste.map((x) => x.nr)) + 1;
    const vertrag = { nr, art: angebot.art, zone: angebot.zone, stadt: stadt.name, ware: angebot.ware, menge, preis: angebot.preis, rest: this.v.laufzeit_monate, geliefert: 0 };
    this.liste.push(vertrag);
    const zone = this.spiel.zonen.zone(angebot.zone);
    this.spiel.melde(`Vertrag mit einem Handelshaus aus ${zone.name}: ${vertrag.art === "einkauf" ? "Lieferung" : "Abnahme"} von ${menge} ${angebot.ware} pro Monat zu ${angebot.preis} Gulden in ${stadt.name}, ${vertrag.rest} Monate.`, "gut");
    return vertrag;
  }

  // Kündigen kostet die Strafe für eine Monatsmenge
  kuendigungsstrafe(vertrag) {
    return Math.round(vertrag.menge * vertrag.preis * this.v.strafe_anteil);
  }

  kuendigen(nr) {
    const vertrag = this.liste.find((x) => x.nr === nr);
    if (!vertrag) return false;
    const strafe = this.kuendigungsstrafe(vertrag);
    this.spiel.gulden -= strafe;
    this.spiel.buche("vertraege", -strafe);
    this.liste = this.liste.filter((x) => x !== vertrag);
    this.spiel.melde(`Vertrag über ${vertrag.ware} in ${vertrag.stadt} gekündigt (Strafe ${strafe} Gulden).`, "warnung");
    return true;
  }

  // Rabatt auf das Erschliessen einer Zone durch erfüllte Lieferungen
  rabatt(zoneId) {
    return Math.min(this.v.rabatt_max, (this.beziehung[zoneId] ?? 0) * this.v.rabatt_je_lieferung);
  }

  // Eine Monatslieferung abrechnen
  liefere(vertrag) {
    const s = this.spiel;
    const stadt = s.welt.stadt[vertrag.stadt];
    const k = s.ausbau.kontor(stadt);
    let menge = 0;
    if (k && vertrag.art === "einkauf") {
      menge = Math.max(0, Math.min(vertrag.menge, Math.floor(s.ausbau.lagerFrei(k)), Math.floor(s.gulden / vertrag.preis)));
      if (menge > 0) {
        const p = (k.lager[vertrag.ware] ??= { menge: 0, einstand: 0 });
        p.einstand = (p.einstand * p.menge + vertrag.preis * menge) / (p.menge + menge);
        p.menge += menge;
        s.gulden -= menge * vertrag.preis;
        s.buche("vertraege", -menge * vertrag.preis);
      }
    } else if (k) {
      menge = Math.max(0, Math.min(vertrag.menge, Math.floor(s.ausbau.verfuegbar(stadt, vertrag.ware))));
      if (menge > 0) {
        const p = k.lager[vertrag.ware];
        p.menge -= menge;
        if (p.menge <= 1e-9) delete k.lager[vertrag.ware];
        s.gulden += menge * vertrag.preis;
        s.buche("vertraege", menge * vertrag.preis);
      }
    }
    const fehlt = vertrag.menge - menge;
    const strafe = Math.round(fehlt * vertrag.preis * this.v.strafe_anteil);
    if (strafe > 0) {
      s.gulden -= strafe;
      s.buche("vertraege", -strafe);
    } else {
      this.beziehung[vertrag.zone] = (this.beziehung[vertrag.zone] ?? 0) + 1;
    }
    vertrag.geliefert += menge;
    vertrag.rest -= 1;
    const text = vertrag.art === "einkauf" ? `${menge} ${vertrag.ware} geliefert` : `${menge} ${vertrag.ware} abgenommen`;
    s.melde(`Vertrag ${vertrag.stadt} (${s.zonen.zone(vertrag.zone).name}): ${text}${strafe ? `, ${fehlt} fehlen, Strafe ${strafe} Gulden` : ""}${vertrag.rest ? "" : ", Vertrag erfüllt"}.`, strafe ? "warnung" : "handel");
  }

  // Abrechnung am Monatswechsel
  tag() {
    const monat = this.spiel.monat();
    if (this.monat === null) this.monat = monat;
    if (monat === this.monat) return;
    this.monat = monat;
    for (const vertrag of [...this.liste]) this.liefere(vertrag);
    this.liste = this.liste.filter((x) => x.rest > 0);
  }

  zustand() {
    return { liste: this.liste, beziehung: this.beziehung, monat: this.monat };
  }

  laden(z) {
    this.liste = z?.liste ?? [];
    this.beziehung = z?.beziehung ?? {};
    this.monat = z?.monat ?? null;
  }
}

// Bootshandel: neue Schiffe in Werftstädten, Verkauf eigener Schiffe, Gebrauchtmarkt.
// Alle Zahlen stehen in data/schiffe.json. Gekauft wird nur, wenn der Spieler vor Ort ist:
// mit einem Schiff im Hafen oder einem Kontor.

export class Werft {
  constructor(spiel) {
    this.spiel = spiel;
    this.daten = spiel.D.schiffe;
    this.angebote = []; // Gebrauchtschiffe: { nr, typ, stadt, preis, bis }
    this.naechsteNr = 1;
  }

  typ(id) {
    return this.daten.typ[id];
  }

  // Werftstädte, dazu jede Stadt mit eigenem Kontor am Ende einer Verbindung: Dort entsteht beim
  // Erschliessen das erste Kontor einer Zone, und ohne Schiff käme der Spieler sonst nie zu einer Werft
  istWerft(stadt) {
    if (this.daten.werften.includes(stadt.name)) return true;
    return !!this.spiel.ausbau.kontor(stadt) && this.spiel.D.zonen.verbindungen.some((v) => v.von === stadt.name || v.nach === stadt.name);
  }

  // Anwesend: eigenes Schiff im Hafen oder eigenes Kontor
  vorOrt(stadt) {
    return this.spiel.ausbau.vorOrt(stadt);
  }

  // --- Epochen: Welche Typen baut die Werft im laufenden Jahr? ---------------------------
  neuBaubar(typ) {
    const jahr = this.spiel.jahr();
    return jahr >= (typ.ab_jahr ?? 0) && jahr <= (typ.bis_jahr ?? Infinity);
  }

  // Typen, die jetzt neu zu kaufen sind (in der Reihenfolge der Daten)
  neueTypen(stadt = null) {
    const medium = stadt ? (this.spiel.zonen.zone(stadt.zone).art === "land" ? "land" : "wasser") : null;
    return this.daten.typen.filter((t) => this.neuBaubar(t) && (!medium || (t.medium ?? "wasser") === medium));
  }

  // Typen, die es in den nächsten Jahrzehnten erstmals gibt (für die Anzeige)
  kommendeTypen(stadt = null) {
    const jahr = this.spiel.jahr();
    const medium = stadt ? (this.spiel.zonen.zone(stadt.zone).art === "land" ? "land" : "wasser") : null;
    return this.daten.typen.filter((t) => (t.ab_jahr ?? 0) > jahr && (!medium || (t.medium ?? "wasser") === medium)).sort((a, b) => a.ab_jahr - b.ab_jahr);
  }

  // --- Neue Schiffe ---------------------------------------------------------------
  pruefeNeukauf(stadt, typId) {
    if (!this.neuBaubar(this.typ(typId))) return this.typ(typId).ab_jahr > this.spiel.jahr() ? `Diesen Typ gibt es erst ab ${this.typ(typId).ab_jahr}.` : `Diesen Typ baut keine Werft mehr (bis ${this.typ(typId).bis_jahr}).`;
    const t = this.typ(typId);
    const zone = this.spiel.zonen.zone(stadt.zone);
    const medium = zone.art === "land" ? "land" : "wasser";
    if ((t.medium ?? "wasser") !== medium) return medium === "land" ? `In ${zone.name} fahren nur Landfahrzeuge.` : `In ${zone.name} fahren nur Schiffe.`;
    if ((t.netz_min ?? 0) > this.spiel.zonen.netzStufe(stadt.zone) && medium === "land") return `Das braucht in ${zone.name} mindestens ein Netz der Stufe «${this.spiel.zonen.stufen(this.spiel.zonen.strecke("netz_" + stadt.zone))[t.netz_min].name}».`;
    if (!this.istWerft(stadt)) return `In ${stadt.name} gibt es keine Werft (Werften: ${this.daten.werften.join(", ")}).`;
    if (!this.vorOrt(stadt)) return "Dafür brauchst du ein Schiff im Hafen oder ein Kontor hier.";
    if (this.spiel.gulden < this.typ(typId).preis) return "Zu wenig Gulden.";
    return null;
  }

  kaufeNeu(stadt, typId) {
    if (this.pruefeNeukauf(stadt, typId)) return null;
    const t = this.typ(typId);
    this.spiel.gulden -= t.preis;
    this.spiel.buche("schiffeKauf", -t.preis);
    const schiff = this.spiel.neuesSchiff(stadt, typId, false);
    this.spiel.melde(`Neuer ${t.name} «${schiff.name}» in ${stadt.name} gekauft.`, "gut");
    return schiff;
  }

  // --- Verkauf eigener Schiffe ----------------------------------------------------------
  verkaufserloes(schiff) {
    if (schiff.mitglieder) return schiff.mitglieder.reduce((a, m) => a + this.verkaufserloes(m), 0);
    return Math.round((this.typ(schiff.typ).preis * this.daten.verkaufsanteil * this.spiel.alterswert(schiff)) / 100) * 100;
  }

  pruefeVerkauf(schiff) {
    if (schiff.mitglieder) return "Eine Flotte erst auflösen, dann die Schiffe einzeln verkaufen.";
    if (this.spiel.schiffe.length <= 1) return "Dein letztes Schiff kannst du nicht verkaufen.";
    if (!this.spiel.imHafen(schiff)) return "Das Schiff muss im Hafen liegen.";
    if (this.spiel.ladungsmenge(schiff) > 0) return "Erst die Ladung verkaufen oder ins Kontor bringen.";
    return null;
  }

  verkaufe(schiff) {
    if (this.pruefeVerkauf(schiff)) return false;
    const erloes = this.verkaufserloes(schiff);
    this.spiel.gulden += erloes;
    this.spiel.buche("schiffeVerkauf", erloes);
    this.spiel.kapitaene.schiffVerloren(schiff, false);
    this.spiel.schiffe = this.spiel.schiffe.filter((s) => s !== schiff);
    this.spiel.namen.push(schiff.name); // der Name wird wieder frei
    this.spiel.melde(`${this.typ(schiff.typ).name} «${schiff.name}» in ${schiff.ort.name} für ${erloes} Gulden verkauft.`);
    return true;
  }

  // --- Gebrauchtmarkt ------------------------------------------------------------
  angeboteIn(stadt) {
    return this.angebote.filter((a) => a.stadt === stadt.name);
  }

  pruefeGebraucht(angebot) {
    const stadt = this.spiel.welt.stadt[angebot.stadt];
    if (!this.vorOrt(stadt)) return "Dafür brauchst du ein Schiff im Hafen oder ein Kontor hier.";
    if (this.spiel.gulden < angebot.preis) return "Zu wenig Gulden.";
    return null;
  }

  kaufeGebraucht(angebot) {
    if (this.pruefeGebraucht(angebot)) return null;
    const stadt = this.spiel.welt.stadt[angebot.stadt];
    this.spiel.gulden -= angebot.preis;
    this.spiel.buche("schiffeKauf", -angebot.preis);
    this.angebote = this.angebote.filter((a) => a !== angebot);
    const schiff = this.spiel.neuesSchiff(stadt, angebot.typ, true, angebot.alter ?? 0);
    this.spiel.melde(`Gebrauchten ${this.typ(angebot.typ).name} «${schiff.name}» in ${stadt.name} für ${angebot.preis} Gulden gekauft.`, "gut");
    return schiff;
  }

  // Täglich: abgelaufene Angebote entfernen, ab und zu ein neues
  tag() {
    const welt = this.spiel.welt;
    const g = this.daten.gebraucht;
    this.angebote = this.angebote.filter((a) => a.bis > welt.tag);
    if (this.angebote.length >= g.max_angebote || welt.zufall.zahl() >= g.chance_pro_tag) return;
    const stadt = welt.zufall.wahl(welt.staedte);
    const medium = this.spiel.zonen.zone(stadt.zone).art === "land" ? "land" : "wasser";
    const jahr = this.spiel.jahr();
    const t = welt.zufall.wahl(this.daten.typen.filter((x) => (x.medium ?? "wasser") === medium && (x.ab_jahr ?? 0) <= jahr && jahr <= (x.bis_jahr ?? Infinity) + 30));
    const rabatt = g.rabatt_min + (g.rabatt_max - g.rabatt_min) * welt.zufall.zahl();
    const alt = this.daten.alter;
    const angebot = { nr: this.naechsteNr++, typ: t.id, stadt: stadt.name, alter: alt.gebraucht_alter_min + ((this.naechsteNr * 7) % (alt.gebraucht_alter_max - alt.gebraucht_alter_min + 1)), preis: Math.round((t.preis * (1 - rabatt)) / 100) * 100, bis: welt.tag + g.dauer_tage };
    this.angebote.push(angebot);
    this.spiel.melde(`In ${stadt.name} wird ein gebrauchter ${t.name} für ${angebot.preis} Gulden angeboten (bis ${this.spiel.datumWelt(angebot.bis)}).`, "ereignis");
  }

  zustand() {
    return { angebote: this.angebote, naechsteNr: this.naechsteNr };
  }

  laden(z) {
    this.angebote = z?.angebote ?? [];
    this.naechsteNr = z?.naechsteNr ?? 1;
  }
}

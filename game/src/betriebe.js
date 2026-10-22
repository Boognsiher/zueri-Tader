// Stadtausbau: Kontore, Betriebe und Stadtgebäude des Spielers, angelehnt an Werkstätten,
// die man in Städten kaufen kann (wie in Mount & Blade: Bannerlord).
//
// Jede Stadt hat von Anfang an Betriebe in Besitz der Stadt. Ihre Leistung ist Teil der
// Produktion aus cities.json. Kauft der Spieler einen, wird diese Leistung aus der
// Stadtproduktion herausgenommen und der Spieler führt den Betrieb selbst und trägt Gewinn
// oder Verlust. Solange er an den Markt liefert, bleibt der Warenfluss der Stadt gleich, die
// Balance der Simulation also gültig. Neu gebaute Betriebe und Ausbaustufen kommen dazu und
// erhöhen das Angebot. Verkauft der Spieler einen Betrieb, arbeitet er als Teil der
// Stadtproduktion weiter.
//
// Am Markt ihrer Stadt kaufen und verkaufen Betriebe wie Händler, mit Handelsspanne. Über das
// Kontor fällt die Spanne weg, und Werkstätten brauchen weniger Zutaten: Eigenversorgung soll
// sich lohnen (siehe docs/entscheidungen.md).
//
// Stufen: Betriebe und Kontore lassen sich bis stufen_max ausbauen. Jede Stufe bringt die
// Grundleistung (bzw. das Grundlager) noch einmal.
// Stadtgebäude (Markthalle, Kirche, Zunfthaus) geben dem Spieler Vorteile in ihrer Stadt.
// Das Kontor kann selbst handeln: von Hand und nach Regeln pro Ware, jeden Tag.

import { Stadt } from "./wirtschaft.js";

function neuerBetrieb(nr, typ, stadt, gebaut) {
  return { nr, typ, stadt, besitzer: "stadt", gebaut, stufe: 1, ziel: "markt", gestern: null, summe: 0 };
}

function addiere(lager, g, menge, einstand) {
  const p = (lager[g] ??= { menge: 0, einstand: 0 });
  p.einstand = (p.einstand * p.menge + einstand * menge) / (p.menge + menge);
  p.menge += menge;
}

function entnimm(lager, g, menge) {
  const p = lager[g];
  p.menge -= menge;
  if (p.menge <= 1e-9) delete lager[g];
}

function ohneGulden(kosten) {
  const material = { ...kosten };
  delete material.gulden;
  return material;
}

export class Ausbau {
  constructor(spiel) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.bau = spiel.D.bau;
    this.typen = Object.fromEntries(this.bau.betriebe.map((t) => [t.id, t]));
    this.gebaeudetypen = Object.fromEntries(this.bau.stadtgebaeude.map((t) => [t.id, t]));
    this.basis = Object.fromEntries(this.D.staedte.map((s) => [s.name, s]));
    this.kontore = {}; // Stadtname -> { stufe, lager: { Ware: {menge, einstand} }, regeln: { Ware: Regel } }
    this.gebaeude = {}; // Stadtname -> { Gebäude-ID: Stufe }
    this.betriebe = [];
    for (const cfg of this.D.staedte) {
      for (const t of this.bau.betriebe) {
        const menge = (t.art === "produktion" ? cfg.prod : cfg.werk)[t.ware] || 0;
        const n = Math.min(this.bau.vorhandene_betriebe_pro_ware, Math.floor(menge / t.leistung));
        for (let i = 0; i < n; i++) this.betriebe.push(neuerBetrieb(this.betriebe.length + 1, t.id, cfg.name, false));
      }
    }
  }

  // --- Werte ------------------------------------------------------------------
  typ(b) {
    return this.typen[b.typ ?? b];
  }

  leistung(b) {
    return this.typ(b).leistung * (b.stufe ?? 1);
  }

  // Unterhalt eines Betriebs pro Tag, mit Nachlass durch ein Zunfthaus
  unterhalt(b) {
    const rabatt = this.gebaeudeWirkung(b.stadt, "betriebsunterhalt");
    return this.typ(b).unterhalt * (b.stufe ?? 1) * Math.max(0, 1 - rabatt);
  }

  // Erwarteter Tagesgewinn einer Stufe nach Unterhalt bei Versorgung über den Markt der Stadt,
  // zu den heutigen Preisen mit Handelsspanne (für Waren ohne Markt dort: Basispreise)
  tagesgewinn(typId, stadt = null) {
    const t = this.typen[typId];
    const D = this.D;
    const s = D.p.SPREAD / 2;
    const verkauf = (g) => (stadt && stadt.handelt(g) ? stadt.verkaufspreis(g) : D.waren[g] * (1 - s));
    const kauf = (g) => (stadt && stadt.handelt(g) ? stadt.kaufpreis(g) : D.waren[g] * (1 + s));
    let brutto = verkauf(t.ware);
    if (t.art === "werkstatt") {
      for (const [z, m] of Object.entries(D.rezepte[t.ware])) brutto -= kauf(z) * m;
    }
    return t.leistung * brutto - t.unterhalt;
  }

  // Möglicher Tagesgewinn einer Stufe bei Eigenversorgung: Zutaten in der günstigsten Stadt
  // gekauft, Erzeugnisse in der teuersten verkauft, ohne Fahrtkosten. Richtwert für die Anzeige.
  potenzial(typId) {
    const t = this.typen[typId];
    const staedte = this.spiel.welt.staedte;
    const bester = (g) => Math.max(...staedte.filter((x) => x.handelt(g)).map((x) => x.verkaufspreis(g)));
    const billigster = (g) => Math.min(...staedte.filter((x) => x.handelt(g)).map((x) => x.kaufpreis(g)));
    let brutto = bester(t.ware);
    if (t.art === "werkstatt") {
      const faktor = this.bau.eigenversorgung.zutaten_faktor;
      for (const [z, m] of Object.entries(this.D.rezepte[t.ware])) brutto -= billigster(z) * m * faktor;
    }
    return t.leistung * brutto - t.unterhalt;
  }

  // Wertschöpfung einer Stufe bei Basispreisen ohne Handelsspanne (Eigenversorgung)
  basisgewinn(typId) {
    const t = this.typen[typId];
    let brutto = this.D.waren[t.ware];
    if (t.art === "werkstatt") {
      for (const [z, m] of Object.entries(this.D.rezepte[t.ware])) brutto -= this.D.waren[z] * m;
    }
    return t.leistung * brutto - t.unterhalt;
  }

  // Wert einer Stufe: der höhere Wert aus Marktversorgung (heutige Preise der Stadt) und
  // Eigenversorgung (Basispreise), jeweils x amortisation_tage, mindestens der Mindestwert.
  // So ist eine Werkstatt nicht spottbillig, nur weil sie am Markt kaum etwas abwirft.
  wert(typId, stadt = null) {
    const tage = this.bau.amortisation_tage;
    const roh = Math.max(this.tagesgewinn(typId, stadt), this.basisgewinn(typId)) * tage;
    return Math.max(this.bau.mindestwert, Math.round(roh / 100) * 100);
  }

  // Erlös beim Verkauf an die Stadt, alle Stufen zusammen
  verkaufserloes(b) {
    const stadt = this.spiel.welt.stadt[b.stadt];
    return Math.round((this.wert(b.typ, stadt) * (b.stufe ?? 1) * this.bau.verkaufserloes_anteil) / 100) * 100;
  }

  materialwert(material) {
    return Object.entries(material).reduce((a, [g, n]) => a + this.D.waren[g] * n, 0);
  }

  // Neubau und jede Ausbaustufe: Wert einer Stufe, ein Teil davon als Baumaterial
  baukosten(typId, stadt = null) {
    const t = this.typen[typId];
    return { gulden: Math.max(0, Math.round((this.wert(typId, stadt) - this.materialwert(t.baumaterial)) / 100) * 100), material: t.baumaterial };
  }

  // --- Preise für den Spieler (Markthalle senkt die Handelsspanne) ------------------
  spanne(stadt) {
    const name = stadt.name ?? stadt;
    return Math.max(this.bau.spanne_min, this.D.p.SPREAD - this.gebaeudeWirkung(name, "spanne") - (this.spiel.diplomatie?.spanneRabatt(stadt) ?? 0));
  }

  kaufpreis(stadt, g, bestand) {
    return stadt.mittelpreis(g, bestand) * (1 + this.spanne(stadt) / 2);
  }

  verkaufspreis(stadt, g, bestand) {
    return stadt.mittelpreis(g, bestand) * (1 - this.spanne(stadt) / 2);
  }

  // --- Stadtproduktion an den Besitz anpassen ---------------------------------
  // Gekaufte Stadtbetriebe nehmen ihre Grundleistung aus der Stadtproduktion. Neubauten und
  // Ausbaustufen sind zusätzliche Leistung; gehören sie der Stadt, produziert sie damit.
  wendeKapazitaetAn() {
    for (const stadt of this.spiel.welt.staedte) {
      const cfg = this.basis[stadt.name];
      const prod = { ...cfg.prod };
      const werk = { ...cfg.werk };
      for (const b of this.betriebe.filter((x) => x.stadt === stadt.name)) {
        const t = this.typ(b);
        const tabelle = t.art === "produktion" ? prod : werk;
        const stufe = b.stufe ?? 1;
        if (b.besitzer === "spieler" && !b.gebaut) tabelle[t.ware] -= t.leistung;
        if (b.besitzer === "stadt") tabelle[t.ware] = (tabelle[t.ware] || 0) + t.leistung * (b.gebaut ? stufe : stufe - 1);
      }
      for (const tabelle of [prod, werk]) for (const g of Object.keys(tabelle)) if (tabelle[g] <= 1e-9) delete tabelle[g];
      stadt.prod = prod;
      stadt.werk = werk;
    }
  }

  // --- Abfragen ---------------------------------------------------------------
  kontor(stadt) {
    return this.kontore[stadt.name ?? stadt] ?? null;
  }

  lagerMenge(kontor) {
    return Object.values(kontor.lager).reduce((a, p) => a + p.menge, 0);
  }

  lagerKapazitaet(kontor) {
    return this.bau.kontor.lager * (kontor.stufe ?? 1);
  }

  lagerFrei(kontor) {
    return this.lagerKapazitaet(kontor) - this.lagerMenge(kontor);
  }

  betriebeIn(stadt) {
    return this.betriebe.filter((b) => b.stadt === stadt.name);
  }

  eigene() {
    return this.betriebe.filter((b) => b.besitzer === "spieler");
  }

  gebaeudeStufe(stadt, id) {
    return this.gebaeude[stadt.name ?? stadt]?.[id] ?? 0;
  }

  // Summe der Wirkung aller Stadtgebäude einer Art in einer Stadt
  gebaeudeWirkung(stadt, wirkung) {
    let summe = 0;
    for (const t of this.bau.stadtgebaeude) if (t.wirkung === wirkung) summe += this.gebaeudeStufe(stadt, t.id) * t.wert_pro_stufe;
    return summe;
  }

  bauplaetze(stadt) {
    let plaetze = 0;
    for (const stufe of this.bau.bauplaetze) if (stadt.einwohner >= stufe.ab_einwohner) plaetze = stufe.plaetze;
    return plaetze + this.gebaeudeWirkung(stadt, "bauplatz");
  }

  // Belegt: neu gebaute Betriebe und Stadtgebäude (je ein Platz, egal welche Stufe)
  freiePlaetze(stadt) {
    const gebaut = this.betriebeIn(stadt).filter((b) => b.gebaut).length;
    const gebaeude = Object.values(this.gebaeude[stadt.name] ?? {}).filter((s) => s > 0).length;
    return this.bauplaetze(stadt) - gebaut - gebaeude;
  }

  schiffImHafen(stadt) {
    return this.spiel.schiffe.find((s) => this.spiel.imHafen(s, stadt)) ?? null;
  }

  // Anwesend ist der Spieler mit einem Schiff im Hafen oder einem Kontor
  vorOrt(stadt) {
    return !!this.schiffImHafen(stadt) || !!this.kontor(stadt);
  }

  // Baumaterial vor Ort: Kontor und alle eigenen Schiffe im Hafen
  materialVorOrt(stadt, g) {
    let menge = this.kontor(stadt) ? this.verfuegbar(stadt, g) : 0;
    for (const s of this.spiel.schiffe) if (this.spiel.imHafen(s, stadt)) menge += s.ladung[g]?.menge ?? 0;
    return menge;
  }

  fehlendesMaterial(stadt, material) {
    return Object.entries(material)
      .filter(([g, n]) => this.materialVorOrt(stadt, g) < n)
      .map(([g, n]) => `${Math.ceil(n - this.materialVorOrt(stadt, g))} ${g}`);
  }

  nimmMaterial(stadt, material) {
    for (const [g, n] of Object.entries(material)) {
      let rest = n;
      const k = this.kontor(stadt);
      if (k?.lager[g]) {
        const m = Math.min(rest, this.verfuegbar(stadt, g));
        entnimm(k.lager, g, m);
        rest -= m;
      }
      for (const s of this.spiel.schiffe) {
        if (rest <= 0 || !this.spiel.imHafen(s, stadt) || !s.ladung[g]) continue;
        const m = Math.min(rest, s.ladung[g].menge);
        entnimm(s.ladung, g, m);
        rest -= m;
      }
    }
  }

  // Gemeinsame Prüfung für alles, was gebaut wird: vor Ort, Gulden, Material
  pruefeKosten(stadt, gulden, material) {
    if (!this.vorOrt(stadt)) return "Dafür brauchst du ein Schiff im Hafen oder ein Kontor hier.";
    if (this.spiel.gulden < gulden) return "Zu wenig Gulden.";
    const fehlt = this.fehlendesMaterial(stadt, material);
    if (fehlt.length) return `Es fehlt Baumaterial: ${fehlt.join(", ")}.`;
    return null;
  }

  bezahle(stadt, gulden, material) {
    this.nimmMaterial(stadt, material);
    this.spiel.gulden -= gulden;
    this.spiel.buche("bauten", -gulden);
  }

  // --- Betriebe ----------------------------------------------------------------
  pruefeKauf(b) {
    const stadt = this.spiel.welt.stadt[b.stadt];
    if (b.besitzer === "spieler") return "Gehört dir schon.";
    if (!this.vorOrt(stadt)) return "Dafür brauchst du ein Schiff im Hafen oder ein Kontor hier.";
    if (this.spiel.gulden < this.kaufpreisBetrieb(b)) return "Zu wenig Gulden.";
    return null;
  }

  // Ein Stadtbetrieb kostet den Wert aller seiner Stufen
  kaufpreisBetrieb(b) {
    return this.wert(b.typ, this.spiel.welt.stadt[b.stadt]) * (b.stufe ?? 1);
  }

  kaufen(b) {
    if (this.pruefeKauf(b)) return false;
    const preis = this.kaufpreisBetrieb(b);
    this.spiel.gulden -= preis;
    this.spiel.buche("betriebeKauf", -preis);
    b.besitzer = "spieler";
    b.ziel = "markt";
    b.gestern = null;
    b.kaufpreis = preis;
    b.summe = 0;
    this.wendeKapazitaetAn();
    this.spiel.melde(`${this.typ(b).name} in ${b.stadt} für ${preis} Gulden gekauft.`, "gut");
    return true;
  }

  verkaufen(b) {
    if (b.besitzer !== "spieler") return false;
    const erloes = this.verkaufserloes(b);
    this.spiel.gulden += erloes;
    this.spiel.buche("betriebeVerkauf", erloes);
    b.besitzer = "stadt";
    b.ziel = "markt";
    b.gestern = null;
    this.wendeKapazitaetAn();
    this.spiel.melde(`${this.typ(b).name} in ${b.stadt} für ${erloes} Gulden an die Stadt verkauft.`);
    return true;
  }

  setzeZiel(b, ziel) {
    if (b.besitzer !== "spieler") return false;
    if (ziel === "kontor" && !this.kontor(b.stadt)) return false;
    b.ziel = ziel;
    return true;
  }

  pruefeBetriebsausbau(b) {
    const stadt = this.spiel.welt.stadt[b.stadt];
    if (b.besitzer !== "spieler") return "Nur eigene Betriebe lassen sich ausbauen.";
    if ((b.stufe ?? 1) >= this.bau.stufen_max) return "Höchste Stufe erreicht.";
    const k = this.baukosten(b.typ, stadt);
    return this.pruefeKosten(stadt, k.gulden, k.material);
  }

  betriebAusbauen(b) {
    if (this.pruefeBetriebsausbau(b)) return false;
    const stadt = this.spiel.welt.stadt[b.stadt];
    const k = this.baukosten(b.typ, stadt);
    this.bezahle(stadt, k.gulden, k.material);
    b.stufe = (b.stufe ?? 1) + 1;
    b.kaufpreis = (b.kaufpreis ?? 0) + k.gulden + this.materialwert(k.material);
    this.wendeKapazitaetAn();
    this.spiel.melde(`${this.typ(b).name} in ${b.stadt} auf Stufe ${b.stufe} ausgebaut.`, "gut");
    return true;
  }

  pruefeBau(stadt, typId) {
    const t = this.typen[typId];
    if (this.freiePlaetze(stadt) <= 0) return "Kein freier Bauplatz.";
    if (t.art === "produktion" && !(t.ware in this.basis[stadt.name].prod)) return `In ${stadt.name} gibt es kein ${t.ware}.`;
    const k = this.baukosten(typId, stadt);
    return this.pruefeKosten(stadt, k.gulden, k.material);
  }

  bauen(stadt, typId) {
    if (this.pruefeBau(stadt, typId)) return null;
    const k = this.baukosten(typId, stadt);
    this.bezahle(stadt, k.gulden, k.material);
    const b = neuerBetrieb(Math.max(0, ...this.betriebe.map((x) => x.nr)) + 1, typId, stadt.name, true);
    b.besitzer = "spieler";
    b.kaufpreis = k.gulden + this.materialwert(k.material);
    this.betriebe.push(b);
    this.wendeKapazitaetAn();
    this.spiel.melde(`${this.typen[typId].name} in ${stadt.name} gebaut.`, "gut");
    return b;
  }

  // --- Stadtgebäude ------------------------------------------------------------------
  pruefeGebaeude(stadt, id) {
    const stufe = this.gebaeudeStufe(stadt, id);
    if (stufe >= this.bau.stufen_max) return "Höchste Stufe erreicht.";
    if (stufe === 0 && this.freiePlaetze(stadt) <= 0) return "Kein freier Bauplatz.";
    const k = this.gebaeudetypen[id].baukosten;
    return this.pruefeKosten(stadt, k.gulden, ohneGulden(k));
  }

  // Bauen (Stufe 1) oder ausbauen (nächste Stufe)
  baueGebaeude(stadt, id) {
    if (this.pruefeGebaeude(stadt, id)) return false;
    const t = this.gebaeudetypen[id];
    this.bezahle(stadt, t.baukosten.gulden, ohneGulden(t.baukosten));
    const g = (this.gebaeude[stadt.name] ??= {});
    g[id] = (g[id] ?? 0) + 1;
    this.wendeGebaeudeAn();
    this.spiel.melde(g[id] === 1 ? `${t.name} in ${stadt.name} gebaut.` : `${t.name} in ${stadt.name} auf Stufe ${g[id]} ausgebaut.`, "gut");
    return true;
  }

  // Versorgungsgebäude: Zufriedenheit und Wohnraum der Städte setzen
  wendeGebaeudeAn() {
    for (const stadt of this.spiel.welt.staedte) {
      stadt.zufriedenheitBonus = this.gebaeudeWirkung(stadt, "zufriedenheit");
      stadt.wohnraumBonus = this.gebaeudeWirkung(stadt, "wohnraum");
    }
  }

  // --- Kontor ------------------------------------------------------------------------
  pruefeKontorBau(stadt) {
    if (this.kontor(stadt)) return "Hier hast du schon ein Kontor.";
    const k = this.bau.kontor.baukosten;
    return this.pruefeKosten(stadt, k.gulden, ohneGulden(k));
  }

  kontorBauen(stadt) {
    if (this.pruefeKontorBau(stadt)) return false;
    const k = this.bau.kontor.baukosten;
    this.bezahle(stadt, k.gulden, ohneGulden(k));
    this.kontore[stadt.name] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
    this.spiel.melde(`Kontor in ${stadt.name} gebaut.`, "gut");
    return true;
  }

  pruefeKontorAusbau(stadt) {
    const kontor = this.kontor(stadt);
    if (!kontor) return "Hier hast du kein Kontor.";
    if ((kontor.stufe ?? 1) >= this.bau.stufen_max) return "Höchste Stufe erreicht.";
    const k = this.bau.kontor.ausbau;
    return this.pruefeKosten(stadt, k.gulden, ohneGulden(k));
  }

  kontorAusbauen(stadt) {
    if (this.pruefeKontorAusbau(stadt)) return false;
    const k = this.bau.kontor.ausbau;
    this.bezahle(stadt, k.gulden, ohneGulden(k));
    const kontor = this.kontor(stadt);
    kontor.stufe = (kontor.stufe ?? 1) + 1;
    this.spiel.melde(`Kontor in ${stadt.name} auf Stufe ${kontor.stufe} ausgebaut (${this.lagerKapazitaet(kontor)} Lagerplätze).`, "gut");
    return true;
  }

  // Waren zwischen Schiff und Kontor verschieben (richtung "insKontor" oder "insSchiff")
  umlagern(schiff, g, wunsch, richtung, ausfuehren = true) {
    const k = schiff.ort && this.spiel.imHafen(schiff) ? this.kontor(schiff.ort) : null;
    if (!k) return 0;
    const von = richtung === "insKontor" ? schiff.ladung : k.lager;
    const nach = richtung === "insKontor" ? k.lager : schiff.ladung;
    const platz = richtung === "insKontor" ? this.lagerFrei(k) : this.spiel.freierLaderaum(schiff);
    const vorhanden = richtung === "insKontor" ? von[g]?.menge ?? 0 : this.verfuegbar(schiff.ort, g);
    const menge = Math.floor(Math.min(wunsch, vorhanden, platz));
    if (ausfuehren && menge > 0) {
      const einstand = von[g].einstand;
      entnimm(von, g, menge);
      addiere(nach, g, menge, einstand);
    }
    return menge;
  }

  // Das Kontor kauft am Markt der Stadt ein (kein Schiff nötig). preisgrenze: höchster Preis
  kontorKaufen(stadt, g, wunsch, ausfuehren = true, preisgrenze = null) {
    const k = this.kontor(stadt);
    if (!k || !stadt.handelt(g)) return { menge: 0, betrag: 0 };
    const bestand = stadt.bestand[g];
    const grenze = Math.min(wunsch, Math.floor(this.lagerFrei(k)));
    let menge = 0;
    let betrag = 0;
    while (menge < grenze && bestand - menge >= 2) {
      const p = this.kaufpreis(stadt, g, bestand - menge);
      if (betrag + p > this.spiel.gulden || (preisgrenze !== null && p > preisgrenze)) break;
      betrag += p;
      menge++;
    }
    if (ausfuehren && menge > 0) {
      stadt.bestand[g] -= menge;
      this.spiel.gulden -= betrag;
      this.spiel.buche("kontorEinkauf", -betrag);
      addiere(k.lager, g, menge, betrag / menge);
    }
    return { menge, betrag };
  }

  // Aus dem Kontor an den Markt der Stadt verkaufen. preisgrenze: niedrigster Preis
  kontorVerkaufen(stadt, g, wunsch, ausfuehren = true, preisgrenze = null) {
    const k = this.kontor(stadt);
    const posten = k?.lager[g];
    if (!posten || !stadt.handelt(g)) return { menge: 0, betrag: 0, gewinn: 0 };
    const hoechstens = Math.floor(Math.min(wunsch, this.verfuegbar(stadt, g)));
    const bestand = stadt.bestand[g];
    let menge = 0;
    let betrag = 0;
    for (; menge < hoechstens; menge++) {
      const p = this.verkaufspreis(stadt, g, bestand + menge);
      if (preisgrenze !== null && p < preisgrenze) break;
      betrag += p;
    }
    const gewinn = betrag - posten.einstand * menge;
    if (ausfuehren && menge > 0) {
      stadt.bestand[g] += menge;
      this.spiel.gulden += betrag;
      this.spiel.buche("kontorVerkauf", betrag);
      entnimm(k.lager, g, menge);
    }
    return { menge, betrag, gewinn };
  }

  // Tagesbedarf der eigenen Werkstätten mit Kontor-Versorgung in dieser Stadt an einer Zutat
  bedarfProTag(stadt, g) {
    let summe = 0;
    for (const b of this.betriebeIn(stadt)) {
      const t = this.typ(b);
      if (b.besitzer !== "spieler" || b.ziel !== "kontor" || t.art !== "werkstatt") continue;
      const m = this.D.rezepte[t.ware][g];
      if (m) summe += this.leistung(b) * m * this.bau.eigenversorgung.zutaten_faktor;
    }
    return summe;
  }

  // Gesperrte Menge: so viele Tage Bedarf der eigenen Werkstätten bleiben im Kontor
  gesperrt(stadt, g) {
    const tage = this.kontor(stadt)?.sperren?.[g] ?? 0;
    return tage * this.bedarfProTag(stadt, g);
  }

  // Menge, die verkauft oder an Schiffe abgegeben werden darf
  verfuegbar(stadt, g) {
    const menge = this.kontor(stadt)?.lager[g]?.menge ?? 0;
    return Math.max(0, menge - this.gesperrt(stadt, g));
  }

  setzeSperre(stadt, g, tage) {
    const k = this.kontor(stadt);
    if (!k) return false;
    k.sperren ??= {};
    if (!tage) delete k.sperren[g];
    else k.sperren[g] = Math.max(0, tage);
    return true;
  }

  // Handelsregel für eine Ware im Kontor:
  // { kaufenBis, kaufPreis, verkaufenUeber, verkaufPreis } (je null = aus bzw. egal)
  regel(stadt, g) {
    return this.kontor(stadt)?.regeln?.[g] ?? null;
  }

  setzeRegel(stadt, g, regel) {
    const k = this.kontor(stadt);
    if (!k) return false;
    k.regeln ??= {};
    const leer = regel.kaufenBis == null && regel.verkaufenUeber == null;
    if (leer) delete k.regeln[g];
    else k.regeln[g] = { kaufenBis: null, kaufPreis: null, verkaufenUeber: null, verkaufPreis: null, ...regel };
    return true;
  }

  // Täglicher Handel der Kontore nach ihren Regeln, höchstens handel_pro_tag Stück je Ware
  kontorHandel() {
    const proTag = this.bau.kontor.handel_pro_tag;
    const zahl = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
    for (const [name, k] of Object.entries(this.kontore)) {
      const stadt = this.spiel.welt.stadt[name];
      const teile = [];
      for (const [g, r] of Object.entries(k.regeln ?? {})) {
        const vorhanden = k.lager[g]?.menge ?? 0;
        if (r.verkaufenUeber != null && vorhanden > r.verkaufenUeber) {
          // kontorVerkaufen achtet selbst auf gesperrte Ware
          const v = this.kontorVerkaufen(stadt, g, Math.min(proTag, Math.floor(vorhanden - r.verkaufenUeber)), true, r.verkaufPreis);
          if (v.menge) teile.push(`${v.menge} ${g} verkauft (${zahl.format(v.betrag)})`);
        } else if (r.kaufenBis != null && vorhanden < r.kaufenBis) {
          const kauf = this.kontorKaufen(stadt, g, Math.min(proTag, Math.floor(r.kaufenBis - vorhanden)), true, r.kaufPreis);
          if (kauf.menge) teile.push(`${kauf.menge} ${g} gekauft (${zahl.format(kauf.betrag)})`);
        }
      }
      if (teile.length) this.spiel.melde(`Kontor ${name}: ${teile.join(", ")}.`, "handel");
    }
  }

  // --- Ein Tag ------------------------------------------------------------------
  // Läuft nach dem Tag der Welt: eigene Betriebe arbeiten, Kontore handeln, Unterhalt wird fällig
  tag() {
    const spiel = this.spiel;
    const tag = spiel.welt.tag - 1;
    let kasseGesamt = 0;
    for (const b of this.eigene()) {
      const t = this.typ(b);
      const stadt = spiel.welt.stadt[b.stadt];
      const k = this.kontor(stadt);
      const insKontor = b.ziel === "kontor" && k;
      const unterhalt = this.unterhalt(b);
      const leistung = this.leistung(b);
      let kasse = -unterhalt;
      let menge = 0;
      let kosten = unterhalt;
      if (t.art === "produktion") {
        menge = leistung * Stadt.faktor(stadt.prodFaktor, t.ware, tag);
      } else {
        // Zutaten: bei Versorgung über das Kontor nur von dort, sonst vom Markt.
        // Eigenversorgung braucht weniger Zutaten (eigenversorgung.zutaten_faktor)
        const faktor = insKontor ? this.bau.eigenversorgung.zutaten_faktor : 1;
        const rezept = Object.entries(this.D.rezepte[t.ware]).map(([z, m]) => [z, m * faktor]);
        for (let n = 0; n < leistung; n++) {
          const moeglich = rezept.every(([z, m]) => (insKontor ? (k.lager[z]?.menge ?? 0) : stadt.handelt(z) ? Math.max(0, stadt.bestand[z] - 2) : 0) >= m);
          if (!moeglich) break;
          let preis = 0;
          for (const [z, m] of rezept) {
            let rest = m;
            const ausKontor = insKontor ? Math.min(rest, k.lager[z]?.menge ?? 0) : 0;
            if (ausKontor > 0) {
              preis += k.lager[z].einstand * ausKontor;
              entnimm(k.lager, z, ausKontor);
              rest -= ausKontor;
            }
            for (; rest > 1e-9; rest -= Math.min(1, rest)) {
              const p = this.kaufpreis(stadt, z) * Math.min(1, rest);
              stadt.bestand[z] -= Math.min(1, rest);
              kasse -= p;
              preis += p;
            }
          }
          kosten += preis;
          menge++;
          // Kein Geld mehr für Zutaten: Betrieb steht für den Rest des Tages still
          if (spiel.gulden + kasse < 0) break;
        }
      }
      // Erzeugnisse abliefern
      if (menge > 0) {
        if (insKontor) {
          const m = Math.min(menge, this.lagerFrei(k));
          if (m > 0) addiere(k.lager, t.ware, m, kosten / menge);
          b.verdorben = menge - m;
        } else if (stadt.handelt(t.ware)) {
          const bestand = stadt.bestand[t.ware];
          for (let i = 0; i < Math.floor(menge); i++) kasse += this.verkaufspreis(stadt, t.ware, bestand + i);
          const rest = menge - Math.floor(menge);
          if (rest > 0) kasse += rest * this.verkaufspreis(stadt, t.ware, bestand + Math.floor(menge));
          stadt.bestand[t.ware] += menge;
          b.verdorben = 0;
        }
      }
      b.gestern = { menge, kasse };
      b.summe += kasse;
      kasseGesamt += kasse;
    }
    spiel.buche("betriebe", kasseGesamt);
    // Unterhalt der Kontore und Stadtgebäude
    let kontorUnterhalt = 0;
    for (const k of Object.values(this.kontore)) kontorUnterhalt += this.bau.kontor.unterhalt * (k.stufe ?? 1);
    let gebaeudeUnterhalt = 0;
    for (const g of Object.values(this.gebaeude)) {
      for (const [id, stufe] of Object.entries(g)) gebaeudeUnterhalt += this.gebaeudetypen[id].unterhalt * stufe;
    }
    spiel.buche("kontorUnterhalt", -kontorUnterhalt);
    spiel.buche("gebaeudeUnterhalt", -gebaeudeUnterhalt);
    spiel.gulden += kasseGesamt - kontorUnterhalt - gebaeudeUnterhalt;
    this.kontorHandel();
    return kasseGesamt;
  }

  // --- Speichern ------------------------------------------------------------------
  zustand() {
    return { kontore: this.kontore, betriebe: this.betriebe, gebaeude: this.gebaeude };
  }

  laden(z) {
    // Spielstände vor den Stufen: fehlende Felder ergänzen
    this.kontore = z.kontore;
    for (const k of Object.values(this.kontore)) {
      k.stufe ??= 1;
      k.regeln ??= {};
      k.sperren ??= {};
    }
    this.betriebe = z.betriebe;
    for (const b of this.betriebe) b.stufe ??= 1;
    this.gebaeude = z.gebaeude ?? {};
    this.wendeKapazitaetAn();
    this.wendeGebaeudeAn();
  }
}

// Stadtausbau: Kontore und Betriebe des Spielers, angelehnt an Werkstätten, die man in
// Städten kaufen kann (wie in Mount & Blade: Bannerlord).
//
// Jede Stadt hat von Anfang an Betriebe in Besitz der Stadt. Ihre Leistung ist Teil der
// Produktion aus cities.json. Kauft der Spieler einen, wird diese Leistung aus der
// Stadtproduktion herausgenommen und der Spieler führt den Betrieb selbst: Er kauft die
// Zutaten am Markt der Stadt (oder nimmt sie aus dem Kontor), verkauft die Erzeugnisse dort
// (oder lagert sie im Kontor) und trägt Gewinn oder Verlust. Solange er an den Markt liefert,
// bleibt der Warenfluss der Stadt gleich, die Balance der Simulation also gültig.
// Betriebe handeln mit dem Markt ihrer Stadt zum Mittelpreis, ohne Handelsspanne: Sie
// beliefern die Stadt direkt wie deren eigene Werkstätten. Die Spanne ist die Marge des
// Schiffshandels (siehe docs/entscheidungen.md).
// Neu gebaute Betriebe kommen dazu und erhöhen das Angebot. Verkauft der Spieler einen
// Betrieb, geht er an die Stadt und arbeitet als Teil ihrer Produktion weiter.

import { Stadt } from "./wirtschaft.js";

function neuerBetrieb(nr, typ, stadt, gebaut) {
  return { nr, typ, stadt, besitzer: "stadt", gebaut, ziel: "markt", gestern: null, summe: 0 };
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

export class Ausbau {
  constructor(spiel) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.bau = spiel.D.bau;
    this.typen = Object.fromEntries(this.bau.betriebe.map((t) => [t.id, t]));
    this.basis = Object.fromEntries(this.D.staedte.map((s) => [s.name, s]));
    this.kontore = {}; // Stadtname -> { lager: { Ware: {menge, einstand} } }
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

  // Erwarteter Tagesgewinn nach Unterhalt, zu den heutigen Mittelpreisen der Stadt
  // (ohne Stadt oder für Waren ohne Markt dort: Basispreise)
  tagesgewinn(typId, stadt = null) {
    const t = this.typen[typId];
    const D = this.D;
    const preis = (g) => (stadt && stadt.handelt(g) ? stadt.mittelpreis(g) : D.waren[g]);
    let brutto = preis(t.ware);
    if (t.art === "werkstatt") {
      for (const [z, m] of Object.entries(D.rezepte[t.ware])) brutto -= preis(z) * m;
    }
    return t.leistung * brutto - t.unterhalt;
  }

  // Marktwert: erwarteter Tagesgewinn x amortisation_tage, mindestens der Mindestwert
  wert(typId, stadt = null) {
    const roh = Math.round((this.tagesgewinn(typId, stadt) * this.bau.amortisation_tage) / 100) * 100;
    return Math.max(this.bau.mindestwert, roh);
  }

  verkaufserloes(typId, stadt = null) {
    return Math.round((this.wert(typId, stadt) * this.bau.verkaufserloes_anteil) / 100) * 100;
  }

  materialwert(material) {
    return Object.entries(material).reduce((a, [g, n]) => a + this.D.waren[g] * n, 0);
  }

  // Neubau: gleicher Wert wie ein bestehender Betrieb, ein Teil davon als Baumaterial
  baukosten(typId, stadt = null) {
    const t = this.typen[typId];
    return { gulden: Math.max(0, Math.round((this.wert(typId, stadt) - this.materialwert(t.baumaterial)) / 100) * 100), material: t.baumaterial };
  }

  // --- Stadtproduktion an den Besitz anpassen ---------------------------------
  wendeKapazitaetAn() {
    for (const stadt of this.spiel.welt.staedte) {
      const cfg = this.basis[stadt.name];
      const prod = { ...cfg.prod };
      const werk = { ...cfg.werk };
      for (const b of this.betriebe.filter((x) => x.stadt === stadt.name)) {
        const t = this.typ(b);
        const tabelle = t.art === "produktion" ? prod : werk;
        if (b.besitzer === "spieler" && !b.gebaut) tabelle[t.ware] -= t.leistung;
        if (b.besitzer === "stadt" && b.gebaut) tabelle[t.ware] = (tabelle[t.ware] || 0) + t.leistung;
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

  lagerFrei(kontor) {
    return this.bau.kontor.lager - this.lagerMenge(kontor);
  }

  betriebeIn(stadt) {
    return this.betriebe.filter((b) => b.stadt === stadt.name);
  }

  eigene() {
    return this.betriebe.filter((b) => b.besitzer === "spieler");
  }

  bauplaetze(stadt) {
    let plaetze = 0;
    for (const stufe of this.bau.bauplaetze) if (stadt.einwohner >= stufe.ab_einwohner) plaetze = stufe.plaetze;
    return plaetze;
  }

  freiePlaetze(stadt) {
    return this.bauplaetze(stadt) - this.betriebeIn(stadt).filter((b) => b.gebaut).length;
  }

  schiffImHafen(stadt) {
    return this.spiel.schiffe.find((s) => this.spiel.imHafen(s, stadt)) ?? null;
  }

  // Baumaterial vor Ort: Kontor und alle eigenen Schiffe im Hafen
  materialVorOrt(stadt, g) {
    let menge = this.kontor(stadt)?.lager[g]?.menge ?? 0;
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
        const m = Math.min(rest, k.lager[g].menge);
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

  // --- Handlungen --------------------------------------------------------------
  pruefeKauf(b) {
    const stadt = this.spiel.welt.stadt[b.stadt];
    if (b.besitzer === "spieler") return "Gehört dir schon.";
    if (!this.schiffImHafen(stadt)) return "Dafür muss eines deiner Schiffe im Hafen liegen.";
    if (this.spiel.gulden < this.wert(b.typ, stadt)) return "Zu wenig Gulden.";
    return null;
  }

  kaufen(b) {
    if (this.pruefeKauf(b)) return false;
    const preis = this.wert(b.typ, this.spiel.welt.stadt[b.stadt]);
    this.spiel.gulden -= preis;
    this.spiel.bilanz.betriebeKauf += preis;
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
    const erloes = this.verkaufserloes(b.typ, this.spiel.welt.stadt[b.stadt]);
    this.spiel.gulden += erloes;
    this.spiel.bilanz.betriebeVerkauf += erloes;
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

  pruefeKontorBau(stadt) {
    const k = this.bau.kontor;
    if (this.kontor(stadt)) return "Hier hast du schon ein Kontor.";
    if (!this.schiffImHafen(stadt)) return "Dafür muss eines deiner Schiffe im Hafen liegen.";
    if (this.spiel.gulden < k.baukosten.gulden) return "Zu wenig Gulden.";
    const material = { ...k.baukosten };
    delete material.gulden;
    const fehlt = this.fehlendesMaterial(stadt, material);
    if (fehlt.length) return `Es fehlt Baumaterial: ${fehlt.join(", ")}.`;
    return null;
  }

  kontorBauen(stadt) {
    if (this.pruefeKontorBau(stadt)) return false;
    const material = { ...this.bau.kontor.baukosten };
    const gulden = material.gulden;
    delete material.gulden;
    this.nimmMaterial(stadt, material);
    this.spiel.gulden -= gulden;
    this.spiel.bilanz.betriebeKauf += gulden;
    this.kontore[stadt.name] = { lager: {} };
    this.spiel.melde(`Kontor in ${stadt.name} gebaut.`, "gut");
    return true;
  }

  pruefeBau(stadt, typId) {
    const t = this.typen[typId];
    if (!this.schiffImHafen(stadt)) return "Dafür muss eines deiner Schiffe im Hafen liegen.";
    if (this.freiePlaetze(stadt) <= 0) return "Kein freier Bauplatz.";
    if (t.art === "produktion" && !(t.ware in this.basis[stadt.name].prod)) return `In ${stadt.name} gibt es kein ${t.ware}.`;
    const k = this.baukosten(typId, stadt);
    if (this.spiel.gulden < k.gulden) return "Zu wenig Gulden.";
    const fehlt = this.fehlendesMaterial(stadt, k.material);
    if (fehlt.length) return `Es fehlt Baumaterial: ${fehlt.join(", ")}.`;
    return null;
  }

  bauen(stadt, typId) {
    if (this.pruefeBau(stadt, typId)) return null;
    const k = this.baukosten(typId, stadt);
    this.nimmMaterial(stadt, k.material);
    this.spiel.gulden -= k.gulden;
    this.spiel.bilanz.betriebeKauf += k.gulden;
    const b = neuerBetrieb(Math.max(0, ...this.betriebe.map((x) => x.nr)) + 1, typId, stadt.name, true);
    b.besitzer = "spieler";
    b.kaufpreis = k.gulden + this.materialwert(k.material);
    this.betriebe.push(b);
    this.wendeKapazitaetAn();
    this.spiel.melde(`${this.typen[typId].name} in ${stadt.name} gebaut.`, "gut");
    return b;
  }

  // Waren zwischen Schiff und Kontor verschieben (richtung "insKontor" oder "insSchiff")
  umlagern(schiff, g, wunsch, richtung, ausfuehren = true) {
    const k = schiff.ort && this.spiel.imHafen(schiff) ? this.kontor(schiff.ort) : null;
    if (!k) return 0;
    const von = richtung === "insKontor" ? schiff.ladung : k.lager;
    const nach = richtung === "insKontor" ? k.lager : schiff.ladung;
    const platz = richtung === "insKontor" ? this.lagerFrei(k) : this.spiel.freierLaderaum(schiff);
    const menge = Math.floor(Math.min(wunsch, von[g]?.menge ?? 0, platz));
    if (ausfuehren && menge > 0) {
      const einstand = von[g].einstand;
      entnimm(von, g, menge);
      addiere(nach, g, menge, einstand);
    }
    return menge;
  }

  // Aus dem Kontor direkt an den Markt der Stadt verkaufen
  kontorVerkaufen(stadt, g, wunsch, ausfuehren = true) {
    const k = this.kontor(stadt);
    const posten = k?.lager[g];
    if (!posten || !stadt.handelt(g)) return { menge: 0, betrag: 0, gewinn: 0 };
    const menge = Math.floor(Math.min(wunsch, posten.menge));
    const bestand = stadt.bestand[g];
    let betrag = 0;
    for (let i = 0; i < menge; i++) betrag += stadt.verkaufspreis(g, bestand + i);
    const gewinn = betrag - posten.einstand * menge;
    if (ausfuehren && menge > 0) {
      stadt.bestand[g] += menge;
      this.spiel.gulden += betrag;
      this.spiel.bilanz.verkauf += betrag;
      entnimm(k.lager, g, menge);
    }
    return { menge, betrag, gewinn };
  }

  // --- Ein Tag ------------------------------------------------------------------
  // Läuft nach dem Tag der Welt: eigene Betriebe arbeiten, Unterhalt wird fällig
  tag() {
    const spiel = this.spiel;
    const tag = spiel.welt.tag - 1;
    let kasseGesamt = 0;
    for (const b of this.eigene()) {
      const t = this.typ(b);
      const stadt = spiel.welt.stadt[b.stadt];
      const k = this.kontor(stadt);
      const insKontor = b.ziel === "kontor" && k;
      let kasse = -t.unterhalt;
      let menge = 0;
      let kosten = t.unterhalt;
      if (t.art === "produktion") {
        menge = t.leistung * Stadt.faktor(stadt.prodFaktor, t.ware, tag);
      } else {
        // Zutaten zuerst aus dem Kontor, dann vom Markt
        const rezept = Object.entries(this.D.rezepte[t.ware]);
        for (let n = 0; n < t.leistung; n++) {
          const moeglich = rezept.every(([z, m]) => (k?.lager[z]?.menge ?? 0) + (stadt.handelt(z) ? Math.max(0, stadt.bestand[z] - 2) : 0) >= m);
          if (!moeglich) break;
          let preis = 0;
          for (const [z, m] of rezept) {
            let rest = m;
            const ausKontor = Math.min(rest, Math.floor(k?.lager[z]?.menge ?? 0));
            if (ausKontor > 0) {
              preis += k.lager[z].einstand * ausKontor;
              entnimm(k.lager, z, ausKontor);
              rest -= ausKontor;
            }
            for (; rest > 0; rest--) {
              const p = stadt.mittelpreis(z);
              stadt.bestand[z] -= 1;
              kasse -= p;
              preis += p;
            }
          }
          if (spiel.gulden + kasse < 0) {
            // Kein Geld mehr für Zutaten: Betrieb steht für den Rest des Tages still
            kosten += preis;
            menge++;
            break;
          }
          kosten += preis;
          menge++;
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
          for (let i = 0; i < Math.floor(menge); i++) kasse += stadt.mittelpreis(t.ware, bestand + i);
          const rest = menge - Math.floor(menge);
          if (rest > 0) kasse += rest * stadt.mittelpreis(t.ware, bestand + Math.floor(menge));
          stadt.bestand[t.ware] += menge;
          b.verdorben = 0;
        }
      }
      b.gestern = { menge, kasse };
      b.summe += kasse;
      kasseGesamt += kasse;
    }
    for (const _ of Object.keys(this.kontore)) kasseGesamt -= this.bau.kontor.unterhalt;
    spiel.gulden += kasseGesamt;
    spiel.bilanz.betriebe += kasseGesamt;
    return kasseGesamt;
  }

  // --- Speichern ------------------------------------------------------------------
  zustand() {
    return { kontore: this.kontore, betriebe: this.betriebe };
  }

  laden(z) {
    this.kontore = z.kontore;
    this.betriebe = z.betriebe;
    this.wendeKapazitaetAn();
  }
}

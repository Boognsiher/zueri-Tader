// Zonen, Verbindungen und Netze: Jeder See, jeder Fluss und jede Landschaft ist eine eigene
// Wirtschaftszone. Schiffe und Fahrzeuge bleiben in ihrer Zone. Zwischen den Zonen gehen Waren von
// Kontor zu Kontor über Verbindungen (Fluss, Fuhrweg, Chaussee, Eisenbahn, Autobahn, Kanal), das
// Kontor am einen Ende schickt Ware, nach der Laufzeit liegt sie im Kontor am anderen Ende.
// Alle Zahlen stehen in data/zonen.json.
//
// Eine Zone muss erst erschlossen werden (Mindestrang, Jahr, Gebühr, ein Kontor am anderen Ende
// einer Verbindung). Jede Strecke (Verbindung oder Netz einer Landzone) hat Ausbaustufen: Der
// Staat baut sie nach seinem Fahrplan (staat_jahr), der Spieler kann sie früher selbst bauen
// (Gulden und Material über viele Tage, Material aus den Kontoren an der Strecke), wird dann
// Konzessionär und kassiert Maut, oder er kauft die Konzession einer Strecke, die der Staat gebaut hat.

import { kurve } from "./epochen.js";

const WERT_DRITTER = 60; // Gulden je Einheit, mit denen Dritte (KI-Verkehr) auf Verbindungen gerechnet werden
const ANTEIL_DRITTE = 0.3; // so viel der Kapazität einer Verbindung nutzen Dritte, wenn sie Maut zahlen

export class Zonen {
  constructor(spiel) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.z = spiel.D.zonen;
    this.erschlossen = this.z.zonen.filter((x) => !x.rang && !x.erschliessung).map((x) => x.id);
    this.strecken = {}; // Strecken-ID -> { stufe, besitzer, maut, projekt }
    this.unterwegs = []; // { v, nach, ware, menge, einstand, ankunft }
    this.heute = {}; // "ID|Stadt" -> heute verschickte Menge
    for (const s of this.alleStrecken()) this.strecken[s.id] = { stufe: 0, besitzer: null, maut: 0, projekt: null };
  }

  // --- Zonen -----------------------------------------------------------------------------
  zone(id) {
    return this.z.zonen.find((x) => x.id === id);
  }

  offen(id) {
    return this.erschlossen.includes(id);
  }

  zoneVon(stadt) {
    return this.zone(stadt.zone ?? stadt);
  }

  // --- Strecken: Verbindungen und Netze -----------------------------------------------------
  // Eine Strecke hat id, name, tage (Grundlaufzeit), vorlage und die Grundwerte fracht, kapazitaet, zoll
  alleStrecken() {
    if (!this._strecken) {
      const netze = (this.z.netze ?? []).map((n) => {
        const zone = this.zone(n.zone);
        return { id: `netz_${n.zone}`, typ: "netz", name: `Netz ${zone.name}`, zone: n.zone, tage: n.tage, vorlage: "strasse", fracht: 0, kapazitaet: 0, zoll: 1, text: n.text };
      });
      this._strecken = [...this.z.verbindungen.map((v) => ({ ...v, typ: "verbindung" })), ...netze, ...(this.z.kanaele ?? []).map((k) => ({ ...k }))];
    }
    return this._strecken;
  }

  strecke(id) {
    return this.alleStrecken().find((s) => s.id === id);
  }

  // Alte Bezeichnung: Verbindungen zwischen zwei Zonen
  verbindung(id) {
    return this.z.verbindungen.find((v) => v.id === id);
  }

  zustand_(id) {
    return (this.strecken[id] ??= { stufe: 0, besitzer: null, maut: 0, projekt: null });
  }

  stufen(s) {
    return this.z.vorlagen[s.vorlage];
  }

  stufe(s) {
    return this.zustand_(s.id).stufe;
  }

  // Werte einer Stufe: Grundwerte mal Faktor der Stufe; die Kapazität wächst zusätzlich mit der Epoche
  werteStufe(s, idx = this.stufe(s)) {
    const st = this.stufen(s)[idx];
    const f = st.faktor ?? { tage: 1, fracht: 1, kapazitaet: 1, zoll: 1 };
    const kap = kurve(this.D, "kapazitaet_verbindung", this.spiel.welt.jahr());
    return {
      art: st.art,
      name: st.name,
      tage: Math.max(1, Math.round(s.tage * f.tage)),
      fracht: s.fracht * f.fracht,
      kapazitaet: Math.round(s.kapazitaet * f.kapazitaet * kap),
      zoll: s.zoll * f.zoll,
      tempo: st.tempo ?? null,
      maut_max: st.maut_max ?? 0,
    };
  }

  werte(s) {
    return this.werteStufe(s);
  }

  naechsteStufe(s) {
    const i = this.stufe(s) + 1;
    return i < this.stufen(s).length ? i : null;
  }

  // Strecken, die an der Stadt enden, mit der Stadt am anderen Ende
  verbindungenVon(stadt) {
    const name = stadt.name ?? stadt;
    return this.z.verbindungen
      .filter((v) => v.von === name || v.nach === name)
      .map((v) => ({ v, ziel: this.spiel.welt.stadt[v.von === name ? v.nach : v.von] }));
  }

  // Ist die Strecke benutzbar? Beide Zonen müssen erschlossen sein
  benutzbar(v) {
    const w = this.spiel.welt.stadt;
    return this.offen(w[v.von].zone) && this.offen(w[v.nach].zone);
  }

  // --- Erschliessen einer Zone ------------------------------------------------------------
  // Zugang: Verbindung, bei der das eigene Kontor in einer offenen Zone steht und das andere Ende in der Zone liegt
  zugaenge(zoneId) {
    const s = this.spiel;
    const liste = [];
    for (const v of this.z.verbindungen) {
      for (const [hier, dort] of [[v.von, v.nach], [v.nach, v.von]]) {
        const stadtHier = s.welt.stadt[hier];
        const stadtDort = s.welt.stadt[dort];
        if (stadtDort.zone === zoneId && this.offen(stadtHier.zone) && s.ausbau.kontor(stadtHier)) liste.push({ v, hier: stadtHier, dort: stadtDort });
      }
    }
    return liste;
  }

  pruefeErschliessen(zoneId) {
    const s = this.spiel;
    const zone = this.zone(zoneId);
    if (this.offen(zoneId)) return "Diese Zone ist schon erschlossen.";
    if (s.ziel.rangIndex < zone.rang) return `Dafür brauchst du mindestens den Rang «${s.ziel.raenge[zone.rang].name}».`;
    if (s.jahr() < zone.ab_jahr) return `Frühestens ab ${zone.ab_jahr}.`;
    if (!this.zugaenge(zoneId).length) return "Dafür brauchst du ein Kontor am anderen Ende einer Verbindung in einer erschlossenen Zone.";
    if (s.gulden < zone.erschliessung) return "Zu wenig Gulden.";
    return null;
  }

  // Legt ein Kontor am Ziel einer Verbindung an: Das ist der Brückenkopf in der neuen Zone
  erschliesse(zoneId) {
    if (this.pruefeErschliessen(zoneId)) return false;
    const s = this.spiel;
    const zone = this.zone(zoneId);
    const { dort } = this.zugaenge(zoneId)[0];
    s.gulden -= zone.erschliessung;
    s.buche("erschliessung", -zone.erschliessung);
    this.erschlossen.push(zoneId);
    s.ausbau.kontore[dort.name] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
    s.melde(`${zone.name} erschlossen: Kontor in ${dort.name} angelegt. Dort kannst du Schiffe oder Fahrzeuge kaufen und handeln.`, "gut");
    return true;
  }

  // --- Fracht -------------------------------------------------------------------------
  pruefeFracht(v, vonStadt) {
    const s = this.spiel;
    const nachStadt = s.welt.stadt[v.von === vonStadt.name ? v.nach : v.von];
    if (!this.benutzbar(v)) return "Beide Zonen müssen erschlossen sein.";
    if (!s.ausbau.kontor(vonStadt)) return "Hier fehlt das Kontor.";
    if (!s.ausbau.kontor(nachStadt)) return `In ${nachStadt.name} fehlt das Kontor.`;
    return null;
  }

  richtung(v, vonStadt) {
    return `${v.id}|${vonStadt.name}`;
  }

  freieKapazitaet(v, vonStadt) {
    return Math.max(0, this.werte(v).kapazitaet - (this.heute[this.richtung(v, vonStadt)] ?? 0));
  }

  // Kosten einer Sendung: Fracht und Zoll der Zielstadt (Faktor der Verbindung)
  kosten(v, vonStadt, ware, menge) {
    const s = this.spiel;
    const w = this.werte(v);
    const nachStadt = s.welt.stadt[v.von === vonStadt.name ? v.nach : v.von];
    const einstand = s.ausbau.kontor(vonStadt)?.lager[ware]?.einstand ?? 0;
    const fracht = menge * w.fracht;
    const zoll = einstand * menge * s.zoll.satz(nachStadt, ware) * w.zoll;
    return { fracht, zoll, nachStadt };
  }

  // Schickt Ware aus dem Kontor in vonStadt über die Verbindung; gibt die verschickte Menge zurück
  schicken(v, vonStadt, ware, wunsch, ausfuehren = true) {
    if (this.pruefeFracht(v, vonStadt)) return 0;
    const s = this.spiel;
    const kontor = s.ausbau.kontor(vonStadt);
    const posten = kontor.lager[ware];
    if (!posten) return 0;
    let menge = Math.floor(Math.min(wunsch, s.ausbau.verfuegbar(vonStadt, ware), this.freieKapazitaet(v, vonStadt)));
    while (menge > 0) {
      const k = this.kosten(v, vonStadt, ware, menge);
      if (k.fracht + k.zoll <= s.gulden) break;
      menge = Math.floor(menge * 0.9) === menge ? menge - 1 : Math.floor(menge * 0.9);
    }
    if (menge <= 0 || !ausfuehren) return Math.max(0, menge);
    const k = this.kosten(v, vonStadt, ware, menge);
    const einstand = posten.einstand + (k.fracht + k.zoll) / menge;
    posten.menge -= menge;
    if (posten.menge <= 1e-9) delete kontor.lager[ware];
    s.gulden -= k.fracht + k.zoll;
    s.buche("fracht", -k.fracht);
    s.buche("zoll", -k.zoll);
    this.heute[this.richtung(v, vonStadt)] = (this.heute[this.richtung(v, vonStadt)] ?? 0) + menge;
    this.unterwegs.push({ v: v.id, nach: k.nachStadt.name, ware, menge, einstand, ankunft: s.welt.tag + this.werte(v).tage });
    return menge;
  }

  // Regel «weiterleiten» setzen: alles über ueber Stück geht täglich auf die Verbindung; ueber = null löscht sie
  setzeWeiter(stadt, ware, vId, ueber) {
    const kontor = this.spiel.ausbau.kontor(stadt);
    if (!kontor) return;
    kontor.weiter ??= {};
    if (ueber == null) delete kontor.weiter[ware];
    else kontor.weiter[ware] = { v: vId, ueber };
  }

  // --- Ausbau von Strecken (Bauprojekte) ----------------------------------------------------
  // Wirtschaftsfaktor der Epoche: Kosten und Material wachsen mit dem Wohnraum der Städte
  epochenfaktor() {
    return kurve(this.D, "wohnraum", this.spiel.welt.jahr());
  }

  // Kosten des Baus einer Stufe (jetzt): Gulden, Material gesamt, Bauzeit in Tagen
  baukosten(s, idx) {
    const e = this.epochenfaktor();
    if (s.typ === "kanal") {
      const material = {};
      for (const [g, m] of Object.entries(s.bau_material)) material[g] = Math.round(m * e);
      return { gulden: Math.round((s.bau_gulden * e) / 1000) * 1000, material, tage: s.bau_tage };
    }
    const b = this.stufen(s)[idx].bau;
    const material = {};
    for (const [g, m] of Object.entries(b.material_je_tag)) material[g] = Math.round(m * s.tage * e);
    return { gulden: Math.round((b.gulden_je_tag * s.tage * e) / 1000) * 1000, material, tage: Math.round(b.tage_je_tag * s.tage) };
  }

  // Kontore, aus denen der Bau Material nimmt: an den Enden einer Verbindung, in einer Zone beim Netz
  baukontore(s) {
    const a = this.spiel.ausbau;
    const w = this.spiel.welt.stadt;
    if (s.typ === "netz") return this.spiel.welt.staedte.filter((x) => x.zone === s.zone && a.kontor(x)).map((x) => x.name);
    if (s.typ === "kanal") return this.spiel.welt.staedte.filter((x) => (x.zone === s.zone_a || x.zone === s.zone_b) && a.kontor(x)).map((x) => x.name);
    return [s.von, s.nach].filter((n) => a.kontor(w[n]));
  }

  zoneOffen(s) {
    if (s.typ === "kanal") return this.offen(s.zone_a) && this.offen(s.zone_b);
    return s.typ === "netz" ? this.offen(s.zone) : this.benutzbar(s);
  }

  pruefeAusbau(s) {
    const sp = this.spiel;
    const z = this.zustand_(s.id);
    const i = this.naechsteStufe(s);
    if (i === null) return "Höchste Stufe erreicht.";
    const st = this.stufen(s)[i];
    if (z.projekt) return "Hier wird schon gebaut.";
    if (!this.zoneOffen(s)) return "Die Zone muss erschlossen sein.";
    const abJahr = s.typ === "kanal" ? s.ab_jahr : st.ab_jahr;
    if (sp.jahr() < abJahr) return `${st.name} (${s.name}) gibt es frühestens ab ${abJahr}.`;
    if (!this.baukontore(s).length) return "Dafür brauchst du ein Kontor an der Strecke (Material kommt aus den Kontoren).";
    const k = this.baukosten(s, i);
    if (sp.gulden < k.gulden * 0.1) return `Zum Start brauchst du mindestens ${Math.round(k.gulden * 0.1)} Gulden (ein Zehntel).`;
    return null;
  }

  starteAusbau(s) {
    if (this.pruefeAusbau(s)) return false;
    const i = this.naechsteStufe(s);
    const k = this.baukosten(s, i);
    this.zustand_(s.id).projekt = { ziel: i, start: this.spiel.welt.tag, tage: k.tage, gulden: k.gulden, material: k.material, fortschritt: 0 };
    this.spiel.melde(`Bau begonnen: ${this.stufen(s)[i].name} (${s.name}), ${k.tage} Tage, ${Math.round(k.gulden).toLocaleString("de-CH")} Gulden und viel Material aus deinen Kontoren.`, "gut");
    return true;
  }

  // Täglicher Fortschritt: Gulden und Material werden über die Bauzeit verbraucht; fehlt etwas, ruht der Bau anteilig
  projektTag(s) {
    const z = this.zustand_(s.id);
    const p = z.projekt;
    if (!p) return;
    const sp = this.spiel;
    const a = sp.ausbau;
    const tagGulden = p.gulden / p.tage;
    const kontore = this.baukontore(s).map((n) => a.kontor(sp.welt.stadt[n]));
    let anteil = tagGulden > 0 ? Math.min(1, sp.gulden / tagGulden) : 1;
    const bedarf = {};
    for (const [g, m] of Object.entries(p.material)) {
      bedarf[g] = m / p.tage;
      const da = kontore.reduce((x, k) => x + (k.lager[g]?.menge ?? 0), 0);
      anteil = Math.min(anteil, bedarf[g] > 0 ? da / bedarf[g] : 1);
    }
    anteil = Math.max(0, Math.min(1, anteil));
    if (anteil <= 0) return;
    sp.gulden -= tagGulden * anteil;
    sp.buche("bauten", -tagGulden * anteil);
    for (const [g, b] of Object.entries(bedarf)) {
      let rest = b * anteil;
      for (const k of kontore) {
        if (rest <= 0) break;
        const m = Math.min(rest, k.lager[g]?.menge ?? 0);
        if (m <= 0) continue;
        k.lager[g].menge -= m;
        if (k.lager[g].menge <= 1e-9) delete k.lager[g];
        rest -= m;
      }
    }
    p.fortschritt += anteil / p.tage;
    if (p.fortschritt >= 1 - 1e-9) this.fertig(s);
  }

  fertig(s) {
    const z = this.zustand_(s.id);
    z.stufe = z.projekt.ziel;
    z.projekt = null;
    z.besitzer = "spieler";
    z.maut = 0;
    const st = this.stufen(s)[z.stufe];
    this.spiel.melde(`${st.name} (${s.name}) fertig gebaut. Du hältst die Konzession: Du kannst einen Mautsatz festlegen.`, "gut");
    if (s.typ === "kanal") this.eroeffneKanal(s, false);
  }

  // Ein Kanal ist fertig: Schiffe und KI-Händler können zwischen den Zonen fahren
  eroeffneKanal(s, still) {
    const sp = this.spiel;
    const welt = sp.welt;
    if (welt.kanalPaare.some(([a, b]) => a === s.zone_a && b === s.zone_b)) return;
    sp.nav.fuegeHinzu(s.ufer);
    welt.nav?.fuegeHinzu(s.ufer);
    welt.kanalUfer.push(s.ufer);
    welt.kanalPaare.push([s.zone_a, s.zone_b]);
    // Distanzen zwischen allen Städten der nun verbundenen Zonen (nur wo sie bisher fehlten)
    const gruppe = welt.staedte.filter((x) => welt.verbunden(x.zone, s.zone_a));
    for (let i = 0; i < gruppe.length; i++) {
      for (let j = i + 1; j < gruppe.length; j++) {
        const a = gruppe[i];
        const b = gruppe[j];
        if (a.zone === b.zone) continue;
        const w = sp.nav.route(a.pos, b.pos);
        if (w) {
          let l = 0;
          for (let k = 1; k < w.length; k++) l += Math.hypot(w[k][0] - w[k - 1][0], w[k][1] - w[k - 1][1]);
          welt.kanalDistanzen[`${a.name}|${b.name}`] = Math.round(l * 100) / 100;
        }
      }
    }
    welt.tageCache = {};
    welt.wegCache = {};
    if (!still) sp.melde(`Der ${s.name} ist eröffnet: Schiffe fahren jetzt zwischen ${this.zone(s.zone_a).name} und ${this.zone(s.zone_b).name}.`, "gut");
  }

  kanalFertig(s) {
    return this.zustand_(s.id).stufe >= 1;
  }

  // Der Staat baut nach seinem Fahrplan (staat_jahr) jede Stufe kostenlos, ausser dort, wo der Spieler gerade selbst baut
  staatTag() {
    const jahr = this.spiel.jahr();
    for (const s of this.alleStrecken()) {
      const z = this.zustand_(s.id);
      const stufen = this.stufen(s);
      let ziel = z.stufe;
      for (let i = z.stufe + 1; i < stufen.length; i++) if (stufen[i].staat_jahr !== undefined && jahr >= stufen[i].staat_jahr) ziel = i;
      if (ziel === z.stufe) continue;
      if (z.projekt && z.projekt.ziel <= ziel) z.projekt = null; // Der Staat war schneller: Das Projekt entfällt
      z.stufe = ziel;
      const offen = s.typ === "netz" ? this.offen(s.zone) : this.benutzbar(s);
      if (offen) this.spiel.melde(`Der Staat hat ${stufen[ziel].name} (${s.name}) eröffnet.${z.besitzer === "spieler" ? " Deine Konzession gilt weiter." : ""}`, "ereignis");
    }
  }

  // --- Konzession und Maut ------------------------------------------------------------------
  konzessionspreis(s) {
    const i = this.stufe(s);
    if (i < 1) return 0;
    return Math.round((this.baukosten(s, i).gulden * 0.8) / 1000) * 1000;
  }

  pruefeKonzession(s) {
    const z = this.zustand_(s.id);
    if (z.besitzer === "spieler") return "Du hältst die Konzession schon.";
    if (z.stufe < 1) return "Auf dieser Stufe gibt es keine Konzession (kein Bau).";
    if (!this.zoneOffen(s)) return "Die Zone muss erschlossen sein.";
    if (this.spiel.gulden < this.konzessionspreis(s)) return "Zu wenig Gulden.";
    return null;
  }

  kaufeKonzession(s) {
    if (this.pruefeKonzession(s)) return false;
    const preis = this.konzessionspreis(s);
    this.spiel.gulden -= preis;
    this.spiel.buche("konzession", -preis);
    const z = this.zustand_(s.id);
    z.besitzer = "spieler";
    z.maut = 0;
    this.spiel.melde(`Konzession für ${s.name} (${this.werte(s).name}) gekauft, ${preis} Gulden. Setze den Mautsatz.`, "gut");
    return true;
  }

  setzeMaut(s, satz) {
    const z = this.zustand_(s.id);
    if (z.besitzer !== "spieler") return;
    z.maut = Math.max(0, Math.min(this.werte(s).maut_max, satz));
  }

  // Verkehrswert, auf den Maut erhoben wird: Handel der KI-Händler in der Zone (Netz) oder Dritte auf der Verbindung
  verkehrswert(s) {
    if (s.typ === "netz") return this.spiel.welt.handelswertGestern?.[s.zone] ?? 0;
    if (s.typ === "kanal") return 0.5 * ((this.spiel.welt.handelswertGestern?.[s.zone_a] ?? 0) + (this.spiel.welt.handelswertGestern?.[s.zone_b] ?? 0));
    return ANTEIL_DRITTE * this.werte(s).kapazitaet * WERT_DRITTER;
  }

  // Maut pro Tag: Satz mal Verkehr, der bei höherem Satz abnimmt (Verkehr weicht aus)
  mautErtrag(s, satz = this.zustand_(s.id).maut) {
    return satz * this.verkehrswert(s) * Math.max(0, 1 - 3 * satz);
  }

  mautTag() {
    let summe = 0;
    for (const s of this.alleStrecken()) {
      const z = this.zustand_(s.id);
      if (z.besitzer !== "spieler" || z.maut <= 0 || z.stufe < 1) continue;
      if (!this.zoneOffen(s)) continue;
      summe += this.mautErtrag(s);
    }
    if (summe > 0) {
      this.spiel.gulden += summe;
      this.spiel.buche("maut", summe);
    }
  }

  // --- Netze der Landzonen ------------------------------------------------------------------
  // Tempofaktor der Landfahrzeuge in einer Zone: Fahrplan des Staats (Kurve) oder eigenes Netz, je nachdem was schneller ist
  netzTempo(zoneId) {
    const kurvenTempo = kurve(this.D, "netz_tempo", this.spiel.welt.jahr());
    const s = this.strecke(`netz_${zoneId}`);
    if (!s) return 1;
    const eigenes = this.stufen(s)[this.stufe(s)].tempo ?? 0;
    return Math.max(kurvenTempo, eigenes);
  }

  // Stufe des Netzes (0 bis 3) nach dem Tempo
  netzStufe(zoneId) {
    const s = this.strecke(`netz_${zoneId}`);
    if (!s) return 0;
    const t = this.netzTempo(zoneId);
    let stufe = 0;
    this.stufen(s).forEach((st, i) => {
      if ((st.tempo ?? 0) <= t + 1e-6) stufe = i;
    });
    return stufe;
  }

  // --- Täglich -----------------------------------------------------------------------------
  tag() {
    const s = this.spiel;
    this.heute = {};
    this.staatTag();
    for (const str of this.alleStrecken()) if (this.zustand_(str.id).projekt) this.projektTag(str);
    this.mautTag();
    // Tempo der Landzonen für die KI-Händler der Welt
    for (const zone of this.z.zonen) if (zone.art === "land") s.welt.netzTempo[zone.id] = this.netzTempo(zone.id);
    const zugestellt = {};
    const rest = [];
    for (const l of this.unterwegs) {
      const kontor = l.ankunft <= s.welt.tag ? s.ausbau.kontor(s.welt.stadt[l.nach]) : null;
      if (!kontor) {
        rest.push(l);
        continue;
      }
      // Passt nicht alles ins Lager, wartet der Rest auf der Verbindung
      const platz = Math.floor(s.ausbau.lagerFrei(kontor));
      const menge = Math.min(l.menge, platz);
      if (menge <= 0) {
        rest.push(l);
        continue;
      }
      const p = (kontor.lager[l.ware] ??= { menge: 0, einstand: 0 });
      p.einstand = (p.einstand * p.menge + l.einstand * menge) / (p.menge + menge);
      p.menge += menge;
      const schluessel = `${l.nach}|${l.ware}`;
      zugestellt[schluessel] = (zugestellt[schluessel] ?? 0) + menge;
      if (menge < l.menge) rest.push({ ...l, menge: l.menge - menge });
    }
    this.unterwegs = rest;
    for (const [schluessel, menge] of Object.entries(zugestellt)) {
      const [nach, ware] = schluessel.split("|");
      s.melde(`Kontor ${nach}: ${menge} ${ware} über die Verbindung angekommen.`, "handel");
    }
    // Regeln «weiterleiten»: alles über der Reserve geht auf die Verbindung
    for (const [name, k] of Object.entries(s.ausbau.kontore)) {
      const stadt = s.welt.stadt[name];
      for (const [ware, r] of Object.entries(k.weiter ?? {})) {
        const v = this.verbindung(r.v);
        const vorhanden = k.lager[ware]?.menge ?? 0;
        if (!v || vorhanden <= r.ueber) continue;
        this.schicken(v, stadt, ware, vorhanden - r.ueber);
      }
    }
  }

  zustand() {
    return { erschlossen: this.erschlossen, strecken: this.strecken, unterwegs: this.unterwegs, heute: this.heute };
  }

  laden(z) {
    if (!z) return;
    this.erschlossen = z.erschlossen;
    for (const [id, st] of Object.entries(z.strecken ?? {})) this.strecken[id] = { stufe: 0, besitzer: null, maut: 0, projekt: null, ...st };
    for (const s of this.alleStrecken()) if (s.typ === "kanal" && this.zustand_(s.id).stufe >= 1) this.eroeffneKanal(s, true);
    this.unterwegs = z.unterwegs;
    this.heute = z.heute ?? {};
  }
}

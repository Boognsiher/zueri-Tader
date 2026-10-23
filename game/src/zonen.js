// Zonen und Verbindungen: Jeder See (und der Hochrhein) ist eine eigene Wirtschaftszone. Schiffe
// bleiben in ihrer Zone. Zwischen den Zonen gehen Waren von Kontor zu Kontor über Verbindungen
// (Fluss, Fuhrweg, Bahn): Das Kontor am einen Ende schickt Ware, nach der Laufzeit liegt sie im
// Kontor am anderen Ende, von dort handeln Schiffe und das Kontor selbst weiter.
// Alle Zahlen stehen in data/zonen.json. Eine Zone muss erst erschlossen werden (Mindestrang,
// Gebühr, ein Kontor am anderen Ende einer Verbindung), Bahnen müssen zusätzlich gebaut werden.

export class Zonen {
  constructor(spiel) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.z = spiel.D.zonen;
    this.erschlossen = this.z.zonen.filter((x) => !x.rang && !x.erschliessung).map((x) => x.id);
    this.bahnen = []; // gebaute Bahnen (Verbindungs-IDs)
    this.unterwegs = []; // { v, nach, ware, menge, einstand, ankunft }
    this.heute = {}; // "ID|Richtung" -> heute verschickte Menge
  }

  zone(id) {
    return this.z.zonen.find((x) => x.id === id);
  }

  offen(id) {
    return this.erschlossen.includes(id);
  }

  zoneVon(stadt) {
    return this.zone(stadt.zone ?? stadt);
  }

  verbindung(id) {
    return this.z.verbindungen.find((v) => v.id === id);
  }

  // Alle Verbindungen, die an der Stadt enden, mit der Stadt am anderen Ende
  verbindungenVon(stadt) {
    const name = stadt.name ?? stadt;
    return this.z.verbindungen
      .filter((v) => v.von === name || v.nach === name)
      .map((v) => ({ v, ziel: this.spiel.welt.stadt[v.von === name ? v.nach : v.von] }));
  }

  // Ist die Verbindung benutzbar? (Bahnen müssen gebaut sein)
  gebaut(v) {
    return v.art !== "bahn" || this.bahnen.includes(v.id);
  }

  // --- Erschliessen einer Zone ------------------------------------------------------------
  // Zugang: Verbindung, bei der das eigene Kontor in einer offenen Zone steht und das andere Ende in der Zone liegt
  zugaenge(zoneId) {
    const s = this.spiel;
    const liste = [];
    for (const v of this.z.verbindungen) {
      if (!this.gebaut(v)) continue;
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
    if (this.offen(zoneId)) return "Dieser See ist schon erschlossen.";
    if (s.ziel.rangIndex < zone.rang) return `Dafür brauchst du mindestens den Rang «${s.ziel.raenge[zone.rang].name}».`;
    if (s.jahr() < zone.ab_jahr) return `Frühestens ab ${zone.ab_jahr}.`;
    if (!this.zugaenge(zoneId).length) return "Dafür brauchst du ein Kontor am anderen Ende einer Verbindung (Fluss, Fuhrweg oder Bahn) in einem erschlossenen See.";
    if (s.gulden < zone.erschliessung) return "Zu wenig Gulden.";
    return null;
  }

  // Legt ein Kontor am Ziel einer Verbindung an: Das ist der Brückenkopf im neuen See
  erschliesse(zoneId) {
    if (this.pruefeErschliessen(zoneId)) return false;
    const s = this.spiel;
    const zone = this.zone(zoneId);
    const { dort } = this.zugaenge(zoneId)[0];
    s.gulden -= zone.erschliessung;
    s.buche("erschliessung", -zone.erschliessung);
    this.erschlossen.push(zoneId);
    s.ausbau.kontore[dort.name] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
    s.melde(`${zone.name} erschlossen: Kontor in ${dort.name} angelegt. Dort kannst du Schiffe kaufen und handeln.`, "gut");
    return true;
  }

  // --- Bahnbau ------------------------------------------------------------------------
  pruefeBahn(v) {
    const s = this.spiel;
    if (this.bahnen.includes(v.id)) return "Diese Bahn ist schon gebaut.";
    if (s.ziel.rangIndex < v.rang) return `Dafür brauchst du mindestens den Rang «${s.ziel.raenge[v.rang].name}».`;
    if (s.jahr() < (v.ab_jahr ?? 0)) return `Die Eisenbahn gibt es frühestens ab ${v.ab_jahr}.`;
    if (!this.offen(s.welt.stadt[v.von].zone) || !this.offen(s.welt.stadt[v.nach].zone)) return "Beide Seen müssen erschlossen sein.";
    if (s.gulden < v.bau_gulden) return "Zu wenig Gulden.";
    return null;
  }

  baueBahn(v) {
    if (this.pruefeBahn(v)) return false;
    const s = this.spiel;
    s.gulden -= v.bau_gulden;
    s.buche("bahnbau", -v.bau_gulden);
    this.bahnen.push(v.id);
    s.melde(`Die Bahn ${v.name} ist eröffnet: ${v.tage} ${v.tage === 1 ? "Tag" : "Tage"} Laufzeit, ${v.kapazitaet} Einheiten pro Tag.`, "gut");
    return true;
  }

  // --- Fracht -------------------------------------------------------------------------
  // Verbindung von stadt aus benutzen? Beide Kontore und eine offene Zone sind nötig
  pruefeFracht(v, vonStadt) {
    const s = this.spiel;
    const nachStadt = s.welt.stadt[v.von === vonStadt.name ? v.nach : v.von];
    if (!this.gebaut(v)) return "Die Bahn ist noch nicht gebaut.";
    if (!s.ausbau.kontor(vonStadt)) return "Hier fehlt das Kontor.";
    if (!s.ausbau.kontor(nachStadt)) return `In ${nachStadt.name} fehlt das Kontor.`;
    return null;
  }

  richtung(v, vonStadt) {
    return `${v.id}|${vonStadt.name}`;
  }

  freieKapazitaet(v, vonStadt) {
    return Math.max(0, v.kapazitaet - (this.heute[this.richtung(v, vonStadt)] ?? 0));
  }

  // Kosten einer Sendung: Fracht und Zoll der Zielstadt (Faktor der Verbindung)
  kosten(v, vonStadt, ware, menge) {
    const s = this.spiel;
    const nachStadt = s.welt.stadt[v.von === vonStadt.name ? v.nach : v.von];
    const einstand = s.ausbau.kontor(vonStadt)?.lager[ware]?.einstand ?? 0;
    const fracht = menge * v.fracht;
    const zoll = einstand * menge * s.zoll.satz(nachStadt, ware) * v.zoll;
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
      menge--;
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
    this.unterwegs.push({ v: v.id, nach: k.nachStadt.name, ware, menge, einstand, ankunft: s.welt.tag + v.tage });
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

  // Täglich: Lieferungen zustellen, Weiterleitungs-Regeln der Kontore ausführen
  tag() {
    const s = this.spiel;
    this.heute = {};
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
    return { erschlossen: this.erschlossen, bahnen: this.bahnen, unterwegs: this.unterwegs, heute: this.heute };
  }

  laden(z) {
    if (!z) return;
    this.erschlossen = z.erschlossen;
    this.bahnen = z.bahnen;
    this.unterwegs = z.unterwegs;
    this.heute = z.heute ?? {};
  }
}

// Stände am See: Krieg und Frieden zwischen den Ständen, Ruf des Spielers, Kaperbriefe.
// Alle Zahlen stehen in data/fraktionen.json. Kriege betreffen nur den Spieler und die
// Kriegsschiffe der Stände (kampf.js), nicht die KI-Händler: Die Wirtschaft bleibt so, wie sie
// die Simulation prüft.
//
// Der Spieler gehört zu keinem Stand. Feindlich ist ein Stand, wenn der Ruf beim Stand tief ist
// oder der Spieler einen Kaperbrief eines Gegners dieses Stands hat. Dann sind die Häfen des
// Stands gesperrt und seine Kriegsschiffe greifen an.

const paar = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class Diplomatie {
  constructor(spiel) {
    this.spiel = spiel;
    this.daten = spiel.D.fraktionen;
    this.liste = this.daten.fraktionen;
    this.kriege = {}; // "a|b" -> { seit, verluste: { a: 0, b: 0 } }
    this.ruhe = {}; // "a|b" -> Welt-Tag, bis zu dem kein neuer Krieg beginnt
    this.ruf = Object.fromEntries(this.liste.map((f) => [f.id, 0]));
    this.kaperbriefe = []; // Stände, die dem Spieler einen Kaperbrief ausgestellt haben
  }

  fraktion(id) {
    return this.daten.nach[id];
  }

  vonStadt(stadt) {
    return this.fraktion(this.daten.stadt[stadt.name ?? stadt]);
  }

  hauptort(id) {
    return this.spiel.welt.stadt[this.fraktion(id).staedte[0]];
  }

  // See, in dem der Hauptort des Stands liegt
  zoneVon(f) {
    return this.spiel.welt.stadt[f.staedte[0]].zone;
  }

  imKrieg(a, b) {
    return a !== b && !!this.kriege[paar(a, b)];
  }

  feinde(id) {
    return this.liste.filter((f) => this.imKrieg(id, f.id)).map((f) => f.id);
  }

  // Ist der Stand dem Spieler feindlich gesinnt?
  feindlich(id) {
    if (this.ruf[id] <= this.daten.ruf.feindlich) return true;
    return this.kaperbriefe.some((k) => this.imKrieg(k, id));
  }

  hafenGesperrt(stadt) {
    return this.feindlich(this.vonStadt(stadt).id);
  }

  // Rabatt auf die Handelsspanne in Städten eines Stands mit hohem Ruf
  spanneRabatt(stadt) {
    const f = this.vonStadt(stadt);
    return f && this.ruf[f.id] >= this.daten.ruf.vorzug ? this.daten.ruf.spanne_rabatt : 0;
  }

  aendereRuf(id, delta) {
    this.ruf[id] = Math.max(-100, Math.min(100, this.ruf[id] + delta));
  }

  // --- Kaperbriefe -------------------------------------------------------------------
  pruefeKaperbrief(stadt) {
    const f = this.vonStadt(stadt);
    const k = this.daten.kaperbrief;
    if (this.kaperbriefe.includes(f.id)) return `Du hast schon einen Kaperbrief vom ${f.name}.`;
    if (!this.feinde(f.id).length) return `Der ${f.name} führt keinen Krieg.`;
    if (!this.spiel.ausbau.vorOrt(stadt)) return "Dafür brauchst du ein Schiff im Hafen oder ein Kontor hier.";
    if (this.ruf[f.id] < k.ruf_min) return `Dein Ruf beim ${f.name} ist zu schlecht.`;
    if (this.spiel.gulden < k.gebuehr) return "Zu wenig Gulden.";
    return null;
  }

  kaufeKaperbrief(stadt) {
    if (this.pruefeKaperbrief(stadt)) return false;
    const f = this.vonStadt(stadt);
    const gebuehr = this.daten.kaperbrief.gebuehr;
    this.spiel.gulden -= gebuehr;
    this.spiel.buche("kaperbriefe", -gebuehr);
    this.kaperbriefe.push(f.id);
    const gegner = this.feinde(f.id).map((id) => this.fraktion(id).name).join(", ");
    this.spiel.melde(`Kaperbrief vom ${f.name} erhalten. Schiffe von ${gegner} sind jetzt deine Gegner, ihre Häfen bleiben dir verschlossen.`, "warnung");
    return true;
  }

  gibZurueck(id) {
    if (!this.kaperbriefe.includes(id)) return false;
    this.kaperbriefe = this.kaperbriefe.filter((k) => k !== id);
    this.spiel.melde(`Kaperbrief vom ${this.fraktion(id).name} zurückgegeben.`);
    return true;
  }

  // Ein Stand verliert ein Kriegsschiff (zählt für den Friedensschluss)
  verlust(id) {
    for (const [schluessel, k] of Object.entries(this.kriege)) {
      if (schluessel.split("|").includes(id)) k.verluste[id] = (k.verluste[id] ?? 0) + 1;
    }
  }

  // --- Tageslauf -----------------------------------------------------------------------
  tag() {
    const welt = this.spiel.welt;
    const z = this.spiel.kriegszufall;
    const k = this.daten.krieg;
    // Ruf erholt sich langsam Richtung 0
    const erholung = this.daten.ruf.erholung_pro_tag;
    for (const id of Object.keys(this.ruf)) {
      const r = this.ruf[id];
      this.ruf[id] = r > 0 ? Math.max(0, r - erholung) : Math.min(0, r + erholung);
    }
    for (let i = 0; i < this.liste.length; i++) {
      for (let j = i + 1; j < this.liste.length; j++) {
        const a = this.liste[i];
        const b = this.liste[j];
        if (this.zoneVon(a) !== this.zoneVon(b)) continue; // Stände verschiedener Seen führen keinen Krieg miteinander
        const schluessel = paar(a.id, b.id);
        const krieg = this.kriege[schluessel];
        if (krieg) {
          const dauer = welt.tag - krieg.seit;
          const verluste = Object.values(krieg.verluste).reduce((x, y) => x + y, 0);
          if (dauer >= k.mindestdauer_tage && z.zahl() < k.frieden_chance_pro_tag + k.frieden_je_verlust * verluste) {
            delete this.kriege[schluessel];
            this.ruhe[schluessel] = welt.tag + k.ruhe_tage;
            this.spiel.melde(`Frieden zwischen ${a.name} und ${b.name} nach ${dauer} Tagen Krieg.`, "ereignis");
            this.kaperbriefeNachFrieden();
          }
        } else if ((this.ruhe[schluessel] ?? 0) <= welt.tag) {
          if (z.zahl() < k.chance_pro_tag * this.konfessionsfaktor(a, b)) {
            this.kriege[schluessel] = { seit: welt.tag, verluste: { [a.id]: 0, [b.id]: 0 } };
            this.spiel.melde(`Krieg: ${a.name} und ${b.name} sind verfeindet. Ihre Kriegsschiffe greifen einander an.`, "warnung");
          }
        }
      }
    }
  }

  // Verschiedene Konfession erhöht die Kriegsgefahr, "gemischt" zählt halb
  konfessionsfaktor(a, b) {
    if (a.konfession === b.konfession) return 1;
    if (a.konfession === "gemischt" || b.konfession === "gemischt") return 1 + (this.daten.krieg.konfession_faktor - 1) / 2;
    return this.daten.krieg.konfession_faktor;
  }

  // Kaperbriefe gelten nur, solange der Stand Krieg führt
  kaperbriefeNachFrieden() {
    for (const id of [...this.kaperbriefe]) {
      if (!this.feinde(id).length) {
        this.kaperbriefe = this.kaperbriefe.filter((x) => x !== id);
        this.spiel.melde(`Der Kaperbrief vom ${this.fraktion(id).name} ist mit dem Frieden erloschen.`);
      }
    }
  }

  zustand() {
    return { kriege: this.kriege, ruhe: this.ruhe, ruf: this.ruf, kaperbriefe: this.kaperbriefe };
  }

  laden(z) {
    if (!z) return; // ältere Spielstände: alle in Frieden
    this.kriege = z.kriege;
    this.ruhe = z.ruhe;
    this.ruf = { ...this.ruf, ...z.ruf };
    this.kaperbriefe = z.kaperbriefe;
  }
}

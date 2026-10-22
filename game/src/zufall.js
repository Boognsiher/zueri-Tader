// Reproduzierbarer Zufallsgenerator (mulberry32). Gleicher Seed, gleicher Spielverlauf:
// Das macht Tests wiederholbar.

export class Zufall {
  constructor(seed) {
    this.zustand = seed | 0;
  }

  // Zahl in [0, 1)
  zahl() {
    this.zustand = (this.zustand + 0x6d2b79f5) | 0;
    let t = Math.imul(this.zustand ^ (this.zustand >>> 15), 1 | this.zustand);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  wahl(liste) {
    return liste[Math.floor(this.zahl() * liste.length)];
  }

  // Wie random.choices in Python: Auswahl mit Gewichten
  gewichtet(liste, gewichte) {
    const summe = gewichte.reduce((a, b) => a + b, 0);
    let r = this.zahl() * summe;
    for (let i = 0; i < liste.length; i++) {
      r -= gewichte[i];
      if (r < 0) return liste[i];
    }
    return liste[liste.length - 1];
  }

  // Mischt die Liste an Ort und Stelle (Fisher-Yates)
  mischen(liste) {
    for (let i = liste.length - 1; i > 0; i--) {
      const j = Math.floor(this.zahl() * (i + 1));
      [liste[i], liste[j]] = [liste[j], liste[i]];
    }
    return liste;
  }
}

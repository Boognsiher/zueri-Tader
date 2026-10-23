// Spielziel: Rang des Handelshauses und Ratssitze in den Städten.
// Alle Zahlen stehen in data/ziel.json. Der Rang hängt vom Vermögen und von den Ratssitzen ab,
// ein Ratssitz kostet Geld, braucht ein Kontor in der Stadt und einen Mindestrang und bringt
// weniger Handelsspanne und einen täglichen Anteil an den Marktgebühren.

export class Ziel {
  constructor(spiel) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.z = spiel.D.ziel;
    this.sitze = []; // Städte, in denen der Spieler einen Ratssitz hat
    this.rangIndex = 0;
  }

  // Vermögen: Bargeld, Waren zum Einstandspreis, Schiffe und Betriebe zum Verkaufswert
  vermoegen() {
    const s = this.spiel;
    const schiffe = s.schiffe.reduce((a, x) => a + s.werft.verkaufserloes(x), 0);
    const betriebe = s.ausbau.eigene().reduce((a, b) => a + s.ausbau.verkaufserloes(b), 0);
    return s.gulden + s.warenwert() + schiffe + betriebe;
  }

  get raenge() {
    return this.z.raenge;
  }

  // Höchster Rang, dessen Vermögen und Ratssitze erreicht sind
  berechneRang() {
    const v = this.vermoegen();
    let i = 0;
    this.raenge.forEach((r, k) => {
      if (v >= r.vermoegen && this.sitze.length >= r.ratssitze) i = k;
    });
    return i;
  }

  get rang() {
    return this.raenge[this.rangIndex];
  }

  get naechster() {
    return this.raenge[this.rangIndex + 1] ?? null;
  }

  amZiel() {
    return this.rangIndex === this.raenge.length - 1;
  }

  hatSitz(stadt) {
    return this.sitze.includes(stadt.name);
  }

  // --- Ratssitze ---------------------------------------------------------------------
  rangMin(stadt) {
    const r = this.z.ratssitz.rang_min;
    return r[stadt.name] ?? r.standard;
  }

  preis(stadt) {
    const r = this.z.ratssitz;
    return Math.round((stadt.einwohner * r.preis_je_einwohner * (1 + r.teuerung_je_sitz * this.sitze.length)) / 100) * 100;
  }

  pruefeRatssitz(stadt) {
    const s = this.spiel;
    if (this.hatSitz(stadt)) return "Du hast hier schon einen Ratssitz.";
    if (!s.ausbau.kontor(stadt)) return "Dafür brauchst du ein Kontor in der Stadt.";
    if (s.diplomatie.hafenGesperrt(stadt)) return `Der ${s.diplomatie.vonStadt(stadt).name} ist dir feindlich gesinnt.`;
    const min = this.rangMin(stadt);
    if (this.rangIndex + 1 < min) return `Dafür brauchst du mindestens den Rang «${this.raenge[min - 1].name}».`;
    if (s.gulden < this.preis(stadt)) return "Zu wenig Gulden.";
    return null;
  }

  kaufeRatssitz(stadt) {
    if (this.pruefeRatssitz(stadt)) return false;
    const preis = this.preis(stadt);
    this.spiel.gulden -= preis;
    this.spiel.buche("ratssitzKauf", -preis);
    this.sitze.push(stadt.name);
    this.spiel.melde(`Du erhältst einen Ratssitz in ${stadt.name} (${this.sitze.length} von ${this.spiel.welt.staedte.length}).`, "gut");
    this.pruefeRang();
    return true;
  }

  // Weniger Handelsspanne in Städten mit eigenem Ratssitz
  rabatt(stadt) {
    return this.hatSitz(stadt) ? this.z.ratssitz.spanne_rabatt : 0;
  }

  // --- Rang -----------------------------------------------------------------------
  // Meldet Aufstiege (und bei einem Rückfall den neuen Rang). Der Rang sinkt nicht von selbst:
  // Fällt das Vermögen unter die Schwelle, behält man den Titel, bis ein höherer erreicht ist.
  pruefeRang() {
    const neu = this.berechneRang();
    if (neu <= this.rangIndex) return;
    this.rangIndex = neu;
    const r = this.rang;
    if (this.amZiel()) this.spiel.melde(`Du bist ${r.name}! ${r.text} Das Ziel ist erreicht, du kannst weiterspielen.`, "gut");
    else this.spiel.melde(`Neuer Rang: ${r.name}. ${r.text}`, "gut");
  }

  tag() {
    let anteil = 0;
    for (const name of this.sitze) anteil += this.spiel.welt.stadt[name].einwohner * this.z.ratssitz.ratsanteil_je_einwohner;
    if (anteil) {
      this.spiel.gulden += anteil;
      this.spiel.buche("ratsanteil", anteil);
    }
    this.pruefeRang();
  }

  zustand() {
    return { sitze: this.sitze, rangIndex: this.rangIndex };
  }

  laden(z) {
    if (!z) {
      this.pruefeRang(); // ältere Spielstände ohne Ziel: Rang aus dem Vermögen
      return;
    }
    this.sitze = z.sitze;
    this.rangIndex = z.rangIndex;
  }
}

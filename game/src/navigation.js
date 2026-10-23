// Wegsuche über Wasser für die frei gesteuerten Schiffe des Spielers.
// Wasser = Innenfläche der Seeteile aus data/karte.json. Führt die direkte Linie über Land,
// wird ein kürzester Weg über Hilfspunkte gesucht (Durchfahrten, Häfen, Punkte knapp
// innerhalb des Ufers). Die KI-Händler nutzen weiter die festen Wege aus wirtschaft.js.

const SCHRITT = 0.4; // Prüfabstand entlang einer Linie in Karteneinheiten
const UFERABSTAND = 1.5; // wie weit die Hilfspunkte vom Ufer nach innen rücken

function imPolygon([x, y], ufer) {
  let drin = false;
  for (let i = 0, j = ufer.length - 1; i < ufer.length; j = i++) {
    const [x1, y1] = ufer[i];
    const [x2, y2] = ufer[j];
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) drin = !drin;
  }
  return drin;
}

// Umgebendes Rechteck [xmin, ymin, xmax, ymax] eines Ufers
function rechteck(ufer) {
  const xs = ufer.map((p) => p[0]);
  const ys = ufer.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function abstand(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function weglaenge(punkte) {
  let summe = 0;
  for (let i = 1; i < punkte.length; i++) summe += abstand(punkte[i - 1], punkte[i]);
  return summe;
}

// Punkt bei Anteil t (0..1) der Weglänge, dazu ob die Fahrt nach links geht
export function punktAufWeg(punkte, t) {
  const gesamt = weglaenge(punkte);
  let rest = Math.max(0, Math.min(1, t)) * gesamt;
  for (let i = 1; i < punkte.length; i++) {
    const [a, b] = [punkte[i - 1], punkte[i]];
    const l = abstand(a, b);
    if (rest <= l || i === punkte.length - 1) {
      const f = l ? Math.min(1, rest / l) : 0;
      return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, links: b[0] < a[0] };
    }
    rest -= l;
  }
  const p = punkte[punkte.length - 1];
  return { x: p[0], y: p[1], links: false };
}

export class Navigation {
  // medium: "wasser" (Seen, Flüsse, Kanäle), "land" (Landzonen) oder "alle" (Darstellung und Distanzen)
  constructor(D, medium = "alle") {
    this.D = D;
    this.medium = medium;
    this.teile = [];
    if (medium !== "land") this.teile.push(...Object.values(D.karte.seeteile).map((t) => t.ufer));
    if (medium !== "wasser") this.teile.push(...Object.values(D.karte.landteile ?? {}).map((t) => t.ufer));
    this.baueKnoten();
  }

  // Ein Kanal (Polygon) wird befahrbar
  fuegeHinzu(ufer) {
    this.teile.push(ufer);
    this.baueKnoten();
  }

  baueKnoten() {
    const D = this.D;
    // Rechtecke zuerst: imWasser prüft nur die Teile, in deren Rechteck der Punkt liegt
    this.rechtecke = this.teile.map(rechteck);
    const knoten = [];
    for (const d of D.karte.durchfahrten) knoten.push(d.position);
    for (const s of D.staedte) knoten.push(s.pos);
    for (const ufer of this.teile) {
      const mitte = [0, 1].map((k) => ufer.reduce((a, p) => a + p[k], 0) / ufer.length);
      for (let i = 0; i < ufer.length; i++) {
        // Punkt auf der Winkelhalbierenden der Ecke nach innen
        const p = ufer[i];
        const a = ufer[(i - 1 + ufer.length) % ufer.length];
        const b = ufer[(i + 1) % ufer.length];
        const ra = [(a[0] - p[0]) / abstand(a, p), (a[1] - p[1]) / abstand(a, p)];
        const rb = [(b[0] - p[0]) / abstand(b, p), (b[1] - p[1]) / abstand(b, p)];
        let r = [ra[0] + rb[0], ra[1] + rb[1]];
        if (Math.hypot(...r) < 1e-6) r = [mitte[0] - p[0], mitte[1] - p[1]];
        const l = Math.hypot(...r);
        for (const richtung of [1, -1]) {
          const q = [p[0] + (richtung * UFERABSTAND * r[0]) / l, p[1] + (richtung * UFERABSTAND * r[1]) / l];
          if (this.imWasser(q)) {
            knoten.push(q);
            break;
          }
        }
      }
    }
    this.knoten = knoten;
    this.nachbarn = null; // wird bei der ersten Suche berechnet
    this.komponente = null;
    this.vomStartMerk = null; // Sicht vom letzten Startpunkt (die Karte sucht von einem Schiff zu allen Städten)
  }

  imWasser(p) {
    const [x, y] = p;
    for (let i = 0; i < this.teile.length; i++) {
      const r = this.rechtecke[i];
      if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3] && imPolygon(p, this.teile[i])) return true;
    }
    return false;
  }

  // Führt die gerade Linie von a nach b ganz über Wasser?
  frei(a, b) {
    const n = Math.max(2, Math.ceil(abstand(a, b) / SCHRITT));
    for (let i = 0; i <= n; i++) {
      if (!this.imWasser([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])) return false;
    }
    return true;
  }

  // Kürzester Weg über Wasser als Punktliste, oder null, wenn das Ziel nicht erreichbar ist
  route(von, nach) {
    if (!this.imWasser(nach)) return null;
    if (this.frei(von, nach)) return [von, nach];
    const k = this.knoten;
    if (!this.nachbarn) {
      this.nachbarn = k.map(() => []);
      for (let i = 0; i < k.length; i++) {
        for (let j = i + 1; j < k.length; j++) {
          if (this.frei(k[i], k[j])) {
            const d = abstand(k[i], k[j]);
            this.nachbarn[i].push([j, d]);
            this.nachbarn[j].push([i, d]);
          }
        }
      }
    }
    // Zusammenhangskomponenten der Hilfspunkte (einmal): Liegen Start und Ziel in getrennten Gewässern, gibt es keinen Weg
    if (!this.komponente) {
      this.komponente = new Array(k.length).fill(-1);
      let nr = 0;
      for (let i = 0; i < k.length; i++) {
        if (this.komponente[i] >= 0) continue;
        const stapel = [i];
        this.komponente[i] = nr;
        while (stapel.length) {
          const x = stapel.pop();
          for (const [j] of this.nachbarn[x]) {
            if (this.komponente[j] < 0) {
              this.komponente[j] = nr;
              stapel.push(j);
            }
          }
        }
        nr++;
      }
    }
    // Freie Sicht vom Start und zum Ziel je Hilfspunkt, jede Linie nur einmal geprüft
    if (this.vomStartMerk?.von[0] !== von[0] || this.vomStartMerk.von[1] !== von[1]) {
      const frei = k.map((p) => this.frei(von, p));
      this.vomStartMerk = { von: [...von], frei, komponenten: new Set(k.map((_, j) => this.komponente[j]).filter((_, j) => frei[j])) };
    }
    const vonFrei = this.vomStartMerk.frei;
    const vomStart = this.vomStartMerk.komponenten;
    const nachFreiMerk = new Array(k.length);
    const nachFrei = (j) => (nachFreiMerk[j] ??= this.frei(k[j], nach));
    let erreichbar = false;
    for (let j = 0; j < k.length && !erreichbar; j++) if (vomStart.has(this.komponente[j]) && nachFrei(j)) erreichbar = true;
    if (!erreichbar) return null;
    // Dijkstra über die Hilfspunkte, Start = k.length, Ziel = k.length + 1
    const start = k.length;
    const ziel = k.length + 1;
    const punkt = (i) => (i === start ? von : i === ziel ? nach : k[i]);
    const kanten = (i) => {
      if (i === start) return k.map((p, j) => [j, abstand(von, p)]).filter(([j]) => vonFrei[j]);
      const liste = [...this.nachbarn[i]];
      if (nachFrei(i)) liste.push([ziel, abstand(k[i], nach)]);
      return liste;
    };
    const dist = new Map([[start, 0]]);
    const vorher = new Map();
    const erledigt = new Set();
    while (true) {
      let aktuell = null;
      for (const [i, d] of dist) if (!erledigt.has(i) && (aktuell === null || d < dist.get(aktuell))) aktuell = i;
      if (aktuell === null) return null;
      if (aktuell === ziel) break;
      erledigt.add(aktuell);
      for (const [j, d] of kanten(aktuell)) {
        const neu = dist.get(aktuell) + d;
        if (!dist.has(j) || neu < dist.get(j)) {
          dist.set(j, neu);
          vorher.set(j, aktuell);
        }
      }
    }
    const weg = [];
    for (let i = ziel; i !== undefined; i = vorher.get(i)) weg.unshift(punkt(i));
    return weg;
  }
}

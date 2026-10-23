// Kamera der Seekarte: Verschieben, Zoomen und Verfolgen des gewählten Schiffs.
// Die Karte bleibt ein SVG, die Kamera ändert nur dessen viewBox (wie bei einer Kartenapp).
// Ein Finger oder die Maus verschiebt, zwei Finger oder das Mausrad zoomen. Ein kurzes Tippen
// ohne Bewegung geht weiter an die Karte (Stadt, Schiff, Ziel auf dem See).

const ZOOM_MAX = 8; // mal der Stufe, bei der die ganze Karte sichtbar ist
const ZOOM_SCHIFF = 2.6; // Stufe, auf die ein gewähltes Schiff herangeholt wird
const SCHWELLE = 6; // Pixel, ab denen eine Berührung als Verschieben gilt
const FOLGE_TEMPO = 0.2; // Anteil des Wegs zum Schiff, der pro Bild zurückgelegt wird

export class Kamera {
  // grenzen = { x, y, b, h }: die ganze Karte in Karteneinheiten
  constructor(svg, grenzen, folgenGeaendert = () => {}) {
    this.svg = svg;
    this.g = grenzen;
    this.melde = folgenGeaendert;
    this.zoom = 1; // 1 = ganze Karte sichtbar
    this.cx = grenzen.x + grenzen.b / 2;
    this.cy = grenzen.y + grenzen.h / 2;
    this.folgen = false;
    this.zeiger = new Map();
    this.ziehen = null;
    this.klickUnterdruecken = false;
    this.viewBox = "";
    this.messe();
    new ResizeObserver(() => this.messe()).observe(svg);
    this.verdrahte();
  }

  // Grösse des Kartenfelds in Pixel; sMin = Pixel je Karteneinheit bei sichtbarer Gesamtkarte
  messe() {
    const r = this.svg.getBoundingClientRect();
    this.B = r.width;
    this.H = r.height;
    this.sMin = this.B > 0 && this.H > 0 ? Math.min(this.B / this.g.b, this.H / this.g.h) : 0;
    this.anwenden();
  }

  get massstab() {
    return this.sMin * this.zoom;
  }

  // Auf schmalen Bildschirmen ist die Karte klein: Das gewählte Schiff wird herangeholt
  schmal() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  anwenden() {
    const s = this.massstab;
    if (!s) return;
    const vb = this.B / s;
    const vh = this.H / s;
    const { x, y, b, h } = this.g;
    this.cx = vb >= b ? x + b / 2 : Math.min(Math.max(this.cx, x + vb / 2), x + b - vb / 2);
    this.cy = vh >= h ? y + h / 2 : Math.min(Math.max(this.cy, y + vh / 2), y + h - vh / 2);
    const text = `${(this.cx - vb / 2).toFixed(2)} ${(this.cy - vh / 2).toFixed(2)} ${vb.toFixed(2)} ${vh.toFixed(2)}`;
    if (text !== this.viewBox) {
      this.viewBox = text;
      this.svg.setAttribute("viewBox", text);
    }
  }

  setzeFolgen(an) {
    if (this.folgen === an) return;
    this.folgen = an;
    this.melde(an);
  }

  // Zoom um einen Bildschirmpunkt (px, py relativ zum Kartenfeld), der an Ort und Stelle bleibt
  zoomeUm(faktor, px = this.B / 2, py = this.H / 2) {
    const s0 = this.massstab;
    if (!s0) return;
    const wx = this.cx + (px - this.B / 2) / s0;
    const wy = this.cy + (py - this.H / 2) / s0;
    this.zoom = Math.min(ZOOM_MAX, Math.max(1, this.zoom * faktor));
    const s1 = this.massstab;
    this.cx = wx - (px - this.B / 2) / s1;
    this.cy = wy - (py - this.H / 2) / s1;
    this.anwenden();
  }

  verschiebe(dx, dy) {
    const s = this.massstab;
    if (!s) return;
    this.cx -= dx / s;
    this.cy -= dy / s;
    this.anwenden();
  }

  ganzeKarte() {
    this.setzeFolgen(false);
    this.zoom = 1;
    this.anwenden();
  }

  // Ein Schiff wurde gewählt: heranholen und verfolgen (am Computer nur verfolgen, wenn schon gezoomt)
  fokussiere(x, y) {
    this.setzeFolgen(true);
    if (this.schmal() && this.zoom < ZOOM_SCHIFF) this.zoom = ZOOM_SCHIFF;
    if (x !== undefined) {
      this.cx = x;
      this.cy = y;
    }
    this.anwenden();
  }

  // Bei jedem Bild: Kamera zieht dem Schiff nach
  folge(x, y) {
    if (!this.folgen || this.ziehen) return;
    const ferne = Math.hypot(x - this.cx, y - this.cy);
    const f = ferne < 0.05 ? 1 : FOLGE_TEMPO;
    this.cx += (x - this.cx) * f;
    this.cy += (y - this.cy) * f;
    this.anwenden();
  }

  verdrahte() {
    const svg = this.svg;
    const lokal = (e) => {
      const r = svg.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    // Ein Klick nach dem Verschieben oder Zoomen darf nichts auf der Karte auslösen
    svg.addEventListener(
      "click",
      (e) => {
        if (!this.klickUnterdruecken) return;
        this.klickUnterdruecken = false;
        e.stopPropagation();
      },
      true,
    );

    svg.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      this.klickUnterdruecken = false;
      this.zeiger.set(e.pointerId, lokal(e));
      this.ziehen = this.zeiger.size > 1 ? { pinch: true } : { start: lokal(e), aktiv: false };
      if (this.zeiger.size > 1) this.klickUnterdruecken = true;
    });

    svg.addEventListener("pointermove", (e) => {
      if (!this.zeiger.has(e.pointerId)) return;
      const alt = this.zeiger.get(e.pointerId);
      const neu = lokal(e);
      if (this.zeiger.size >= 2) {
        // Zwei Finger: Abstand ändert den Zoom, die Mitte verschiebt
        const [a, b] = [...this.zeiger.values()];
        const abstand0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mitte0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.zeiger.set(e.pointerId, neu);
        const [c, d] = [...this.zeiger.values()];
        const abstand1 = Math.hypot(c[0] - d[0], c[1] - d[1]);
        const mitte1 = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
        this.setzeFolgen(false);
        if (abstand0 > 0 && abstand1 > 0) this.zoomeUm(abstand1 / abstand0, mitte1[0], mitte1[1]);
        this.verschiebe(mitte1[0] - mitte0[0], mitte1[1] - mitte0[1]);
        return;
      }
      const z = this.ziehen;
      if (!z || z.pinch) return;
      if (!z.aktiv) {
        if (Math.hypot(neu[0] - z.start[0], neu[1] - z.start[1]) < SCHWELLE) return;
        z.aktiv = true;
        this.klickUnterdruecken = true;
        this.setzeFolgen(false);
        svg.setPointerCapture(e.pointerId);
        svg.classList.add("verschoben");
      }
      this.zeiger.set(e.pointerId, neu);
      this.verschiebe(neu[0] - alt[0], neu[1] - alt[1]);
    });

    const ende = (e) => {
      this.zeiger.delete(e.pointerId);
      if (this.zeiger.size === 0) {
        this.ziehen = null;
        svg.classList.remove("verschoben");
      } else if (this.zeiger.size === 1) {
        // Ein Finger bleibt liegen: weiter verschieben, ohne Sprung
        this.ziehen = { pinch: true };
      }
    };
    svg.addEventListener("pointerup", ende);
    svg.addEventListener("pointercancel", ende);

    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const [px, py] = lokal(e);
        // Folgt die Kamera einem Schiff, bleibt das Schiff in der Mitte
        if (this.folgen) this.zoomeUm(Math.exp(-e.deltaY * 0.0015));
        else this.zoomeUm(Math.exp(-e.deltaY * 0.0015), px, py);
      },
      { passive: false },
    );
  }
}

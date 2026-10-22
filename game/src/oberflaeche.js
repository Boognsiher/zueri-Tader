// Kopfzeile, Seitenleiste (Flotte, Besitz, Marktübersicht) und Handelsfenster mit den
// Reitern Markt, Kontor und Betriebe.
// Liest den Spielzustand und ruft Spiel-Methoden auf, rechnet selbst nichts.
//
// Steuerung: Klick auf den See schickt das gewählte Schiff dorthin, Klick auf eine Stadt
// lässt es dort anlegen. Liegt es schon dort, öffnet sich das Handelsfenster.
// Ohne gewähltes Schiff (abwählen per Klick auf das Schiff, Esc oder Knopf) hebt ein Klick auf
// eine Stadt sie nur hervor und zeigt sie in der Marktübersicht. Von dort öffnet ein Knopf das
// Stadtfenster (Markt, Kontor, Betriebe, Werft) ohne Schiff.
// Lenkt der Spieler ein Schiff mit Automatik von Hand, pausiert die Automatik.

import { weglaenge } from "./navigation.js";
import * as automatik from "./automatik.js";

const zahl = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
const f = (n) => zahl.format(Math.round(n));

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const MENGEN = [
  ["1", "1"],
  ["10", "10"],
  ["50", "50"],
  ["max", "alles"],
];

export class Oberflaeche {
  constructor(spiel, karte, elemente, zeit) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.karte = karte;
    this.e = elemente; // { datum, gulden, warenwert, flotte, besitz, markt, meldungen, handel, handelInhalt }
    this.zeit = zeit; // { anhalten(), fortsetzen() } für das Handelsfenster
    this.schiff = spiel.schiffe[0];
    this.stadt = this.schiff.ort ?? spiel.naechsteStadt(this.schiff.pos);
    this.menge = "10";
    this.reiter = "markt";
    this.handelOffen = false;
    this.fensterSchiff = null; // Schiff im Handelsfenster, null = Stadtfenster
    this.fensterStadt = null;
    this.routenfenster = null; // wird von main.js gesetzt
    this.e.flotte.addEventListener("click", (ev) => this.klickFlotte(ev));
    this.e.markt.addEventListener("click", (ev) => {
      if (ev.target.closest("[data-stadtfenster]")) this.oeffneStadt(this.stadt);
    });
    this.e.markt.addEventListener("change", (ev) => {
      if (ev.target.name === "stadtwahl") {
        this.stadt = this.spiel.welt.staedte[Number(ev.target.value)];
        this.aktualisiere();
      }
    });
    this.e.handel.addEventListener("click", (ev) => this.klickHandel(ev));
    this.e.handel.addEventListener("change", (ev) => {
      const nr = ev.target.dataset.betriebZiel;
      if (nr === undefined) return;
      const b = this.spiel.ausbau.betriebe.find((x) => x.nr === Number(nr));
      this.spiel.ausbau.setzeZiel(b, ev.target.value);
      this.aktualisiere();
    });
    this.e.handel.addEventListener("close", () => this.schliesseHandel());
  }

  // --- Steuerung über die Karte ---------------------------------------------
  // Ein Klick auf das schon gewählte Schiff wählt es ab
  waehleSchiff(schiff) {
    if (schiff === this.schiff) return this.abwaehlen();
    if (this.handelOffen) this.schliesseHandel();
    this.schiff = schiff;
    if (schiff.ort) this.stadt = schiff.ort;
    this.aktualisiere();
  }

  abwaehlen() {
    if (this.handelOffen && this.fensterSchiff) this.schliesseHandel();
    this.schiff = null;
    this.aktualisiere();
  }

  klickStadt(stadt) {
    this.stadt = stadt;
    if (!this.schiff) {
      // nur hervorheben; ein offenes Stadtfenster zeigt die neue Stadt
      if (this.handelOffen && !this.fensterSchiff) this.fensterStadt = stadt;
      return this.aktualisiere();
    }
    if (this.spiel.imHafen(this.schiff, stadt)) return this.oeffneHandel();
    this.segle({ stadt });
  }

  klickSee(punkt) {
    if (!this.schiff) {
      this.spiel.melde("Kein Schiff gewählt. Klicke zuerst ein Schiff an, um es zu steuern.", "warnung");
      return this.aktualisiere();
    }
    this.segle({ punkt });
  }

  segle(ziel) {
    if (!this.schiff) return;
    const vorher = this.schiff.auto?.pausiert;
    automatik.pausiere(this.spiel, this.schiff); // von Hand gelenkt: Automatik pausiert
    const r = this.spiel.segeln(this.schiff, ziel);
    if (!r.ok && this.schiff.auto && !vorher) this.schiff.auto.pausiert = false;
    if (!r.ok) this.spiel.melde(r.grund, "warnung");
    else if (this.handelOffen) this.schliesseHandel();
    this.aktualisiere();
  }

  // Nach einer Ankunft: Handelsfenster öffnen, wenn das Schiff in einem Hafen liegt
  angekommen(schiff) {
    this.schiff = schiff;
    if (schiff.ort) {
      this.stadt = schiff.ort;
      this.oeffneHandel();
    } else {
      this.aktualisiere();
    }
  }

  // Handelsfenster für das gewählte Schiff im Hafen
  oeffneHandel() {
    if (!this.schiff || !this.spiel.imHafen(this.schiff)) return;
    this.fensterSchiff = this.schiff;
    this.fensterStadt = this.schiff.ort;
    this.oeffneFenster();
  }

  // Stadtfenster ohne Schiff
  oeffneStadt(stadt) {
    this.fensterSchiff = null;
    this.fensterStadt = stadt;
    this.oeffneFenster();
  }

  oeffneFenster() {
    if (!this.handelOffen) {
      this.handelOffen = true;
      this.zeit.anhalten();
      this.e.handel.show();
    }
    this.aktualisiere();
  }

  schliesseHandel() {
    if (!this.handelOffen) return;
    this.handelOffen = false;
    this.e.handel.close();
    this.zeit.fortsetzen();
  }

  // --- Darstellung -----------------------------------------------------------
  aktualisiere() {
    if (this.handelOffen && this.fensterSchiff && !this.spiel.imHafen(this.fensterSchiff)) this.schliesseHandel();
    this.kopf();
    this.flotte();
    this.besitz();
    this.marktuebersicht();
    if (this.handelOffen) this.handelsfenster();
    this.meldungen();
    this.karte.waehle({ stadt: this.stadt, schiff: this.schiff });
    this.karte.aktualisiere();
  }

  kopf() {
    const s = this.spiel;
    this.e.datum.textContent = s.datum();
    this.e.gulden.textContent = f(s.gulden);
    this.e.gulden.classList.toggle("negativ", s.gulden < 0);
    this.e.warenwert.textContent = f(s.warenwert());
  }

  status(schiff) {
    const s = this.spiel;
    if (schiff.fahrt) {
      const w = schiff.fahrt.weg;
      const ziel = schiff.fahrt.ziel ? `nach ${schiff.fahrt.ziel.name}` : `zu einem Punkt vor ${s.naechsteStadt(w[w.length - 1]).name}`;
      return `segelt ${esc(ziel)}, Ankunft ${esc(s.datumWelt(schiff.fahrt.ende))}`;
    }
    if (schiff.ort) return `liegt in ${esc(schiff.ort.name)}`;
    return `ankert vor ${esc(s.naechsteStadt(schiff.pos).name)}`;
  }

  modus(schiff) {
    const a = schiff.auto;
    if (!a) return "";
    if (a.art === "route") return `Route: ${a.halte.map((h) => h.stadt).join(" – ")}`;
    return `Freier Handel, Einsatz bis ${f(a.einsatz)} Gulden`;
  }

  flotte() {
    const s = this.spiel;
    const D = this.D;
    let html = `<h2>Flotte</h2><ul class="schiffsliste">`;
    for (const schiff of s.schiffe) {
      const ladung = Object.entries(schiff.ladung)
        .map(([g, p]) => `${p.menge} ${esc(g)}`)
        .join(", ");
      const nr = s.schiffe.indexOf(schiff);
      const auto = schiff.auto
        ? schiff.auto.pausiert
          ? `<button class="autosymbol pausiert" data-aufnehmen="${nr}" title="Automatik pausiert, Klick nimmt sie wieder auf" aria-label="Automatik von ${esc(schiff.name)} wieder aufnehmen">▶</button>`
          : `<span class="autosymbol" title="Automatik läuft" aria-label="Automatik läuft">⟳</span>`
        : "";
      html += `<li class="schiffzeile">${auto}<button class="schiff ${schiff === this.schiff ? "gewaehlt" : ""}" data-schiff="${nr}">
        <span class="schiffsname">${esc(s.schiffstyp(schiff).name)} «${esc(schiff.name)}»${schiff.gebraucht ? " <small>gebraucht</small>" : ""}</span>
        <span class="laderaum">${s.ladungsmenge(schiff)} / ${s.laderaum(schiff)}</span>
        <span class="status">${this.status(schiff)}</span>
        ${schiff.auto ? `<span class="modus ${schiff.auto.pausiert ? "pausiert" : ""}">${schiff.auto.pausiert ? "pausiert: " : ""}${esc(this.modus(schiff))}</span>` : ""}
        ${ladung ? `<span class="ladung">${ladung}</span>` : ""}
      </button></li>`;
    }
    html += `</ul>`;
    const schiff = this.schiff;
    if (!schiff) {
      html += `<p class="steuerhilfe">Kein Schiff gewählt. Klick auf eine Stadt: Preise, Betriebe und Kontor ansehen. Ein Schiff wählst du per Klick in dieser Liste oder auf der Karte.</p>`;
    } else {
      const aktionen = [];
      if (s.imHafen(schiff)) aktionen.push(`<button data-handeln>Handelsfenster öffnen</button>`);
      if (schiff.fahrt) aktionen.push(`<button data-anhalten>Anhalten</button>`);
      if (schiff.auto?.pausiert) aktionen.push(`<button data-aufnehmen="${s.schiffe.indexOf(schiff)}">▶ Automatik fortsetzen</button>`);
      aktionen.push(`<button data-automatik>Automatik …</button>`);
      aktionen.push(`<button data-abwaehlen title="Auch mit Esc oder einem Klick auf das gewählte Schiff">Abwählen</button>`);
      html += `<div class="schiffsaktionen">${aktionen.join("")}</div>`;
    }
    if (schiff) html += `<p class="steuerhilfe">${
      automatik.aktiv(schiff)
        ? `«${esc(schiff.name)}» handelt automatisch. Lenkst du es mit einem Klick auf die Karte, pausiert die Automatik. Mit ▶ läuft sie weiter.`
        : `Klick auf den See: «${esc(schiff.name)}» segelt dorthin. Klick auf eine Stadt: anlegen und handeln. Abwählen, um Städte nur anzusehen.`
    }</p>`;
    html += `<p class="bilanz">Unterhalt ${f(s.schiffe.reduce((x, y) => x + s.unterhalt(y), 0))} Gulden pro Tag · bisher eingekauft ${f(s.bilanz.einkauf)},
      verkauft ${f(s.bilanz.verkauf)}, Unterhalt ${f(s.bilanz.unterhalt)} Gulden</p>`;
    this.e.flotte.innerHTML = html;
  }

  // Kontore und eigene Betriebe auf einen Blick
  besitz() {
    const a = this.spiel.ausbau;
    const eigene = a.eigene();
    const kontore = Object.entries(a.kontore);
    if (!eigene.length && !kontore.length) {
      this.e.besitz.innerHTML = `<h2>Besitz</h2><p class="hilfe">Noch keine Kontore und Betriebe. Im Handelsfenster unter «Betriebe» kannst du Betriebe der Stadt kaufen oder neue bauen.</p>`;
      return;
    }
    let html = `<h2>Besitz</h2>`;
    if (kontore.length) {
      html += `<h3>Kontore</h3><ul class="besitzliste">${kontore
        .map(([stadt, k]) => {
          const waren = Object.entries(k.lager)
            .sort((x, y) => y[1].menge - x[1].menge)
            .slice(0, 4)
            .map(([g, p]) => `${f(p.menge)} ${esc(g)}`)
            .join(", ");
          return `<li><b>${esc(stadt)}</b> ${f(a.lagerMenge(k))} / ${f(a.bau.kontor.lager)}${waren ? `<small>${waren}</small>` : ""}</li>`;
        })
        .join("")}</ul>`;
    }
    if (eigene.length) {
      const summe = eigene.reduce((x, b) => x + (b.gestern?.kasse ?? 0), 0);
      html += `<h3>Betriebe <small>gestern ${summe >= 0 ? "+" : "−"}${f(Math.abs(summe))} Gulden</small></h3><ul class="besitzliste">${eigene
        .map((b) => {
          const k = b.gestern?.kasse;
          const wert = k === undefined ? "–" : `${k >= 0 ? "+" : "−"}${f(Math.abs(k))}`;
          return `<li><b>${esc(a.typ(b).name)}</b> ${esc(b.stadt)}${b.ziel === "kontor" ? " → Kontor" : ""} <span class="zahl ${k < 0 ? "minus" : ""}">${wert}</span></li>`;
        })
        .join("")}</ul>`;
    }
    this.e.besitz.innerHTML = html;
  }

  // Stadtinfo und Preise einer beliebigen Stadt, ohne Handel
  marktuebersicht() {
    const welt = this.spiel.welt;
    const stadt = this.stadt;
    const zufr = Math.round(stadt.zufriedenheit);
    let html = `<h2>Marktübersicht</h2>
      <label class="stadtwahl">Stadt <select name="stadtwahl">${welt.staedte
        .map((x, i) => `<option value="${i}" ${x === stadt ? "selected" : ""}>${esc(x.name)}</option>`)
        .join("")}</select></label>
      <p class="stadtkopf">${f(stadt.einwohner)} Einwohner · Zufriedenheit
        <span class="balken" title="${zufr} von 100"><span style="width:${zufr}%"></span></span> ${zufr}</p>
      <button data-stadtfenster>Stadtfenster öffnen: Kontor, Betriebe${this.spiel.werft.istWerft(stadt) || this.spiel.werft.angeboteIn(stadt).length ? ", Werft" : ""}</button>`;
    html += this.stadtprofil(stadt);
    html += this.markttabelle(stadt, null);
    this.e.markt.innerHTML = html;
  }

  stadtprofil(stadt) {
    const s = this.spiel;
    const D = this.D;
    let html = "";
    if (stadt.ereignisse.length) {
      html += `<p class="ereignisse">${stadt.ereignisse
        .map((e) => `<span class="marke">${esc(e.name)} bis ${esc(s.datumWelt(e.bis))}</span>`)
        .join(" ")}</p>`;
    }
    const erzeugt = Object.keys(stadt.prod).join(", ");
    const werk = Object.entries(stadt.werk)
      .map(([g]) => `${g} aus ${Object.keys(D.rezepte[g]).join(" und ")}`)
      .join(", ");
    const werft = s.werft.istWerft(stadt) ? "<br><b>Werft:</b> neue Schiffe zu kaufen" : "";
    html += `<p class="profil"><b>Erzeugt:</b> ${esc(erzeugt || "nichts")}${werk ? `<br><b>Werkstätten:</b> ${esc(werk)}` : ""}${werft}</p>`;
    return html;
  }

  // Fahrzeit in Tagen (auf halbe Tage gerundet) für die Anzeige
  // tempo: Karteneinheiten pro Tag (Standard: Nauen)
  tage(von, nach, tempo = this.D.p.SPEED) {
    const w = this.spiel.nav.route(von, nach);
    return w ? Math.round((2 * weglaenge(w)) / tempo) / 2 : null;
  }

  // Markttabelle. Mit schiff: Laderaum-Spalte und Knöpfe zum Kaufen und Verkaufen.
  markttabelle(stadt, schiff) {
    const s = this.spiel;
    const D = this.D;
    const welt = s.welt;
    const farbe = D.spiel.preisfarbe;
    const wunsch = this.menge === "max" ? Infinity : Number(this.menge);
    let html = `<table class="markt"><thead><tr><th title="darunter: bestes Gebot in einer anderen Stadt">Ware</th>
      <th>Lager</th><th>Kauf</th><th>Verkauf</th>${schiff ? "<th>Laderaum</th><th></th>" : ""}</tr></thead><tbody>`;
    const ohneMarkt = [];
    for (const g of Object.keys(D.waren)) {
      if (!stadt.handelt(g)) {
        ohneMarkt.push(g);
        continue;
      }
      const verhaeltnis = stadt.mittelpreis(g) / D.waren[g];
      const klasse = verhaeltnis <= farbe.guenstig ? "guenstig" : verhaeltnis >= farbe.teuer ? "teuer" : "";
      let beste = null;
      for (const andere of welt.staedte) {
        if (andere === stadt || !andere.handelt(g)) continue;
        const p = andere.verkaufspreis(g);
        if (!beste || p > beste.p) beste = { stadt: andere, p };
      }
      const gebot = beste
        ? `<small title="Bester Verkaufspreis in einer anderen Stadt und Fahrzeit dorthin">→ ${esc(beste.stadt.name)} ${f(beste.p)} · ${this.tage(stadt.pos, beste.stadt.pos).toLocaleString("de-CH")} T.</small>`
        : "";
      html += `<tr><td class="ware"><span class="gruppe g-${esc(D.gruppen[g]).replace(/[^A-Za-z]/g, "")}"></span>${esc(g)}${gebot}</td>
        <td class="zahl">${f(stadt.bestand[g])}</td>
        <td class="zahl preis ${klasse}">${f(stadt.kaufpreis(g))}</td>
        <td class="zahl preis ${klasse}">${f(stadt.verkaufspreis(g))}</td>`;
      if (schiff) {
        const posten = schiff.ladung[g];
        const k = s.kaufen(schiff, g, wunsch, false);
        const v = s.verkaufen(schiff, g, wunsch, false);
        const kaufTitel = k.menge ? `${k.menge} Stück für ${f(k.betrag)} Gulden` : "nicht möglich (Geld, Laderaum oder Lager reichen nicht)";
        const verkaufTitel = v.menge
          ? `${v.menge} Stück für ${f(v.betrag)} Gulden, ${v.gewinn >= 0 ? "Gewinn" : "Verlust"} ${f(Math.abs(v.gewinn))}`
          : "nichts geladen";
        html += `<td class="zahl">${posten ? `${posten.menge}<small>Ø ${f(posten.einstand)}</small>` : "–"}</td>
          <td class="aktionen">
          <button data-kauf="${esc(g)}" ${k.menge ? "" : "disabled"} title="${esc(kaufTitel)}">kaufen</button>
          <button data-verkauf="${esc(g)}" ${v.menge ? "" : "disabled"} title="${esc(verkaufTitel)}">verkaufen</button></td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    if (ohneMarkt.length) html += `<p class="ohnemarkt">Kein Markt hier für: ${esc(ohneMarkt.join(", "))}</p>`;
    if (schiff) {
      const ohne = Object.entries(schiff.ladung).filter(([g]) => !stadt.handelt(g));
      if (ohne.length) html += `<p class="ohnemarkt">Im Laderaum, hier nicht verkäuflich: ${esc(ohne.map(([g, p]) => `${p.menge} ${g}`).join(", "))}</p>`;
    }
    return html;
  }

  handelsfenster() {
    const s = this.spiel;
    const D = this.D;
    const welt = s.welt;
    const schiff = this.fensterSchiff;
    const stadt = this.fensterStadt;
    const untertitel = schiff
      ? `${esc(s.schiffstyp(schiff).name)} «${esc(schiff.name)}» · ${s.ladungsmenge(schiff)} / ${s.laderaum(schiff)} geladen · ${f(s.gulden)} Gulden`
      : `${f(stadt.einwohner)} Einwohner · Zufriedenheit ${Math.round(stadt.zufriedenheit)} · ${f(s.gulden)} Gulden`;
    let html = `<header><div><h2>${schiff ? "Handel in " : ""}${esc(stadt.name)}</h2>
        <span class="untertitel">${untertitel}</span></div>
        <button class="schliessen" data-schliessen title="Schliessen (Esc)" aria-label="Schliessen">×</button></header>`;
    if (!schiff) {
      const imHafen = s.schiffe.filter((x) => s.imHafen(x, stadt));
      html += imHafen.length
        ? `<div class="mitschiff">${imHafen.map((x) => `<button class="haupt" data-handeln-mit="${s.schiffe.indexOf(x)}">Mit «${esc(x.name)}» handeln</button>`).join(" ")}</div>`
        : `<p class="hilfe">Keines deiner Schiffe liegt hier. Zum Handeln und Kaufen von Betrieben braucht es ein Schiff im Hafen.</p>`;
    }
    const kontor = s.ausbau.kontor(stadt);
    const eigene = s.ausbau.betriebeIn(stadt).filter((b) => b.besitzer === "spieler").length;
    const werftReiter = s.werft.istWerft(stadt) ? "Werft" : `Schiffe${s.werft.angeboteIn(stadt).length ? " (Angebot)" : ""}`;
    html += `<nav class="reiter" role="tablist">${[
      ["markt", "Markt"],
      ["kontor", kontor ? "Kontor" : "Kontor (keins)"],
      ["betriebe", `Betriebe${eigene ? ` (${eigene} eigene)` : ""}`],
      ["werft", werftReiter],
    ]
      .map(([w, t]) => `<button role="tab" data-reiter="${w}" aria-selected="${this.reiter === w}">${t}</button>`)
      .join("")}</nav>`;
    const mengenwahl = `<div class="mengenwahl" role="group" aria-label="Handelsmenge">Menge:
      ${MENGEN.map(([wert, text]) => `<button data-menge="${wert}" class="${this.menge === wert ? "aktiv" : ""}">${text}</button>`).join("")}
      ${schiff ? `<span class="frei">Frei im Laderaum: ${s.freierLaderaum(schiff)}</span>` : ""}</div>`;
    if (this.reiter === "kontor") {
      this.e.handelInhalt.innerHTML = html + this.kontorReiter(stadt, schiff, mengenwahl);
      return;
    }
    if (this.reiter === "betriebe") {
      this.e.handelInhalt.innerHTML = html + this.betriebeReiter(stadt);
      return;
    }
    if (this.reiter === "werft") {
      this.e.handelInhalt.innerHTML = html + this.werftReiter(stadt);
      return;
    }
    html += this.stadtprofil(stadt);
    if (!schiff) {
      html += this.markttabelle(stadt, null);
      this.e.handelInhalt.innerHTML = html;
      return;
    }
    html += mengenwahl;
    html += this.markttabelle(stadt, schiff);

    html += `<details class="direktfahrt"><summary>Direkt zu einem Hafen segeln</summary><div class="ziele">`;
    for (const ziel of welt.staedte) {
      if (ziel === stadt) continue;
      const gesperrt = ziel.gesperrt(welt.tag);
      const tage = this.tage(stadt.pos, ziel.pos, s.tempo(schiff));
      html += `<button class="ziel" data-ziel="${welt.staedte.indexOf(ziel)}" ${gesperrt || tage === null ? "disabled" : ""}
        title="${gesperrt ? "Föhnsturm: Der Hafen ist gesperrt" : ""}">${esc(ziel.name)}
        <small>${gesperrt ? "gesperrt" : `${tage.toLocaleString("de-CH")} T.`}</small></button>`;
    }
    html += `</div></details>`;
    this.e.handelInhalt.innerHTML = html;
  }

  kontorReiter(stadt, schiff, mengenwahl) {
    const s = this.spiel;
    const a = s.ausbau;
    const k = a.kontor(stadt);
    const kb = a.bau.kontor;
    if (!k) {
      const grund = a.pruefeKontorBau(stadt);
      const material = Object.entries(kb.baukosten)
        .filter(([g]) => g !== "gulden")
        .map(([g, n]) => `${n} ${g}`)
        .join(", ");
      return `<p>Ein Kontor ist dein Lager in ${esc(stadt.name)} (${f(kb.lager)} Einheiten). Betriebe können hineinliefern, Schiffe laden und entladen, und Handelsrouten nutzen es automatisch.</p>
        <p>Kosten: ${f(kb.baukosten.gulden)} Gulden und ${esc(material)} (aus dem Schiff), Unterhalt ${kb.unterhalt} Gulden pro Tag.</p>
        <button class="haupt" data-kontorbau ${grund ? "disabled" : ""} title="${esc(grund ?? "")}">Kontor bauen</button>
        ${grund ? `<p class="hinweis">${esc(grund)}</p>` : ""}`;
    }
    const wunsch = this.menge === "max" ? Infinity : Number(this.menge);
    const waren = Object.keys(this.D.waren).filter((g) => k.lager[g] || schiff?.ladung[g]);
    let html = `<p class="stadtkopf">Lager ${f(a.lagerMenge(k))} / ${f(kb.lager)} · Unterhalt ${kb.unterhalt} Gulden pro Tag</p>${mengenwahl}`;
    if (!waren.length) return html + `<p class="hilfe">${schiff ? "Kontor und Schiff sind leer." : "Das Kontor ist leer."}</p>`;
    html += `<table class="markt"><thead><tr><th>Ware</th><th>Kontor</th>${schiff ? "<th>Schiff</th>" : ""}<th></th></tr></thead><tbody>`;
    for (const g of waren) {
      const ins = schiff ? a.umlagern(schiff, g, wunsch, "insSchiff", false) : 0;
      const aus = schiff ? a.umlagern(schiff, g, wunsch, "insKontor", false) : 0;
      const v = a.kontorVerkaufen(stadt, g, wunsch, false);
      const posten = k.lager[g];
      const titel = v.menge ? `${v.menge} Stück für ${f(v.betrag)} Gulden` : stadt.handelt(g) ? "nichts im Kontor" : "kein Markt hier";
      html += `<tr><td class="ware">${esc(g)}</td>
        <td class="zahl">${posten ? `${f(posten.menge)}<small>Ø ${f(posten.einstand)}</small>` : "–"}</td>
        ${schiff ? `<td class="zahl">${schiff.ladung[g] ? f(schiff.ladung[g].menge) : "–"}</td>` : ""}
        <td class="aktionen breit">
          ${schiff ? `<button data-umlagern="${esc(g)}" data-richtung="insSchiff" ${ins ? "" : "disabled"}>ins Schiff</button>
          <button data-umlagern="${esc(g)}" data-richtung="insKontor" ${aus ? "" : "disabled"}>ins Kontor</button>` : ""}
          <button data-kontorverkauf="${esc(g)}" ${v.menge ? "" : "disabled"} title="${esc(titel)}">verkaufen</button></td></tr>`;
    }
    return html + `</tbody></table>`;
  }

  betriebeReiter(stadt) {
    const s = this.spiel;
    const a = s.ausbau;
    const k = a.kontor(stadt);
    const faktor = a.bau.eigenversorgung.zutaten_faktor;
    let html = `<p class="hilfe">Betriebe arbeiten jeden Tag, Gewinn oder Verlust geht an dich. <b>Versorgung Markt:</b> Zutaten und Erzeugnisse am Markt der Stadt, mit Handelsspanne. Werkstätten verdienen so wenig. <b>Versorgung Kontor:</b> Zutaten nur aus deinem Kontor, Erzeugnisse ins Kontor, ohne Spanne. Werkstätten brauchen dann nur ${f(faktor * 100)} % der Zutaten. Bring Rohstoffe günstig heran und fahr die Ware dorthin, wo sie teuer ist: Das lohnt sich.</p>`;
    html += `<h3>Betriebe in ${esc(stadt.name)}</h3><ul class="betriebe">`;
    for (const b of a.betriebeIn(stadt)) {
      const t = a.typ(b);
      const zutaten = t.art === "werkstatt" ? ` aus ${Object.entries(this.D.rezepte[t.ware]).map(([z, m]) => `${m * t.leistung} ${z}`).join(" und ")}` : "";
      const erwartet = a.tagesgewinn(b.typ, stadt);
      html += `<li class="betrieb ${b.besitzer === "spieler" ? "eigen" : ""}"><div class="betriebkopf"><b>${esc(t.name)}</b> <span class="klein">${t.leistung} ${esc(t.ware)} pro Tag${esc(zutaten)}${b.gebaut ? " · neu gebaut" : ""}</span></div>`;
      if (b.besitzer === "spieler") {
        const g = b.gestern;
        const gestern = g ? `${f(g.menge)} ${esc(t.ware)}, Kasse ${g.kasse >= 0 ? "+" : "−"}${f(Math.abs(g.kasse))}` : "–";
        const leer = b.ziel === "kontor" && t.art === "werkstatt" && g && g.menge === 0 ? ` · <span class="minus">keine Zutaten im Kontor</span>` : "";
        html += `<div class="betriebinfo">dein Betrieb · gestern: ${gestern} · seit Kauf ${b.summe >= 0 ? "+" : "−"}${f(Math.abs(b.summe))} Gulden${b.verdorben > 0 ? ` · <span class="minus">Kontor voll, ${f(b.verdorben)} verdorben</span>` : ""}${leer}</div>
          <div class="betriebknoepfe"><label>Versorgung <select data-betrieb-ziel="${b.nr}">
            <option value="markt" ${b.ziel === "markt" ? "selected" : ""}>Markt der Stadt</option>
            <option value="kontor" ${b.ziel === "kontor" ? "selected" : ""} ${k ? "" : "disabled"}>Kontor${k ? (t.art === "werkstatt" ? " (Zutaten aus dem Kontor, Ware ins Kontor)" : " (Ware ins Kontor)") : " (keins)"}</option></select></label>
            <button data-betrieb-verkauf="${b.nr}">an die Stadt verkaufen: ${f(a.verkaufserloes(b.typ, stadt))} Gulden</button></div>`;
      } else {
        const grund = a.pruefeKauf(b);
        const pot = a.potenzial(b.typ);
        html += `<div class="betriebinfo">gehört der Stadt · am Markt ${erwartet >= 0 ? "+" : "−"}${f(Math.abs(erwartet))} Gulden pro Tag${t.art === "werkstatt" ? ` · mit Eigenversorgung bis ${pot >= 0 ? "+" : "−"}${f(Math.abs(pot * 1))} (Zutaten günstig gekauft, Ware teuer verkauft, ohne Fahrtkosten)` : ""}</div>
          <div class="betriebknoepfe"><button class="haupt" data-betrieb-kauf="${b.nr}" ${grund ? "disabled" : ""} title="${esc(grund ?? "")}">kaufen: ${f(a.wert(b.typ, stadt))} Gulden</button>${grund ? ` <span class="hinweis">${esc(grund)}</span>` : ""}</div>`;
      }
      html += `</li>`;
    }
    html += `</ul>`;

    const frei = a.freiePlaetze(stadt);
    html += `<h3>Neu bauen <small>${frei} von ${a.bauplaetze(stadt)} Bauplätzen frei</small></h3>`;
    const moeglich = a.bau.betriebe.filter((t) => t.art === "werkstatt" || t.ware in a.basis[stadt.name].prod);
    html += `<table class="markt bauliste"><thead><tr><th>Betrieb</th><th>Kosten</th><th>erwartet</th><th></th></tr></thead><tbody>`;
    for (const t of moeglich) {
      const kosten = a.baukosten(t.id, stadt);
      const grund = a.pruefeBau(stadt, t.id);
      const erwartet = a.tagesgewinn(t.id, stadt);
      const material = Object.entries(kosten.material).map(([g, n]) => `${n} ${g}`).join(", ");
      html += `<tr><td class="ware">${esc(t.name)}<small>${t.leistung} ${esc(t.ware)} pro Tag</small></td>
        <td class="zahl">${f(kosten.gulden)}<small>+ ${esc(material)}</small></td>
        <td class="zahl ${erwartet < 0 ? "minus" : ""}">${erwartet >= 0 ? "+" : "−"}${f(Math.abs(erwartet))}<small>pro Tag</small></td>
        <td class="aktionen"><button data-bau="${t.id}" ${grund ? "disabled" : ""} title="${esc(grund ?? "")}">bauen</button></td></tr>`;
    }
    html += `</tbody></table><p class="ohnemarkt">Baumaterial muss im Kontor oder in einem deiner Schiffe hier liegen. Rohstoffbetriebe gehen nur, wo die Stadt den Rohstoff hat. Fährt der Mauszeiger über einen gesperrten Knopf, steht dort der Grund.</p>`;
    return html;
  }

  // Werft: neue Schiffe (nur in Werftstädten), gebrauchte Angebote, eigene Schiffe verkaufen
  werftReiter(stadt) {
    const s = this.spiel;
    const w = s.werft;
    const daten = this.D.schiffe;
    const schiffzeile = (t) => `<span class="klein">Laderaum ${t.laderaum} · Tempo ${f(t.tempo * 100)} % · Unterhalt ${t.unterhalt} Gulden/Tag</span>`;
    let html = "";
    if (w.istWerft(stadt)) {
      html += `<h3>Neue Schiffe</h3><ul class="betriebe">`;
      for (const t of daten.typen) {
        const grund = w.pruefeNeukauf(stadt, t.id);
        html += `<li class="betrieb"><div class="betriebkopf"><b>${esc(t.name)}</b> ${schiffzeile(t)}</div>
          <div class="betriebinfo">${esc(t.text)}</div>
          <div class="betriebknoepfe"><button class="haupt" data-neuschiff="${t.id}" ${grund ? "disabled" : ""} title="${esc(grund ?? "")}">kaufen: ${f(t.preis)} Gulden</button>${grund ? ` <span class="hinweis">${esc(grund)}</span>` : ""}</div></li>`;
      }
      html += `</ul>`;
    } else {
      html += `<p class="hilfe">${esc(stadt.name)} hat keine Werft. Neue Schiffe gibt es in ${esc(daten.werften.join(", "))}.</p>`;
    }
    const angebote = w.angeboteIn(stadt);
    html += `<h3>Gebrauchte Schiffe</h3>`;
    if (angebote.length) {
      html += `<ul class="betriebe">`;
      for (const a of angebote) {
        const t = w.typ(a.typ);
        const grund = w.pruefeGebraucht(a);
        html += `<li class="betrieb"><div class="betriebkopf"><b>${esc(t.name)}</b> ${schiffzeile(t)}</div>
          <div class="betriebinfo">gebraucht, Neupreis ${f(t.preis)} Gulden · Unterhalt ${f(t.unterhalt * daten.gebraucht.unterhalt_faktor)} statt ${t.unterhalt} Gulden/Tag · Angebot bis ${esc(s.datumWelt(a.bis))}</div>
          <div class="betriebknoepfe"><button class="haupt" data-gebraucht="${a.nr}" ${grund ? "disabled" : ""} title="${esc(grund ?? "")}">kaufen: ${f(a.preis)} Gulden</button>${grund ? ` <span class="hinweis">${esc(grund)}</span>` : ""}</div></li>`;
      }
      html += `</ul>`;
    } else {
      const anderswo = w.angebote.map((a) => `${w.typ(a.typ).name} in ${a.stadt}`).join(", ");
      html += `<p class="hilfe">Hier gerade keine. ${anderswo ? `Angebote anderswo: ${esc(anderswo)}.` : "Angebote tauchen ab und zu in irgendeiner Stadt auf."}</p>`;
    }
    const eigene = s.schiffe.filter((x) => s.imHafen(x, stadt));
    if (eigene.length) {
      html += `<h3>Eigene Schiffe verkaufen <small>${f(daten.verkaufsanteil * 100)} % des Neupreises</small></h3><ul class="betriebe">`;
      for (const x of eigene) {
        const grund = w.pruefeVerkauf(x);
        html += `<li class="betrieb eigen"><div class="betriebkopf"><b>${esc(s.schiffstyp(x).name)} «${esc(x.name)}»</b>${x.gebraucht ? " <span class=\"klein\">gebraucht</span>" : ""}</div>
          <div class="betriebknoepfe"><button data-schiffverkauf="${s.schiffe.indexOf(x)}" ${grund ? "disabled" : ""} title="${esc(grund ?? "")}">verkaufen: ${f(w.verkaufserloes(x))} Gulden</button>${grund ? ` <span class="hinweis">${esc(grund)}</span>` : ""}</div></li>`;
      }
      html += `</ul>`;
    }
    return html;
  }

  meldungen() {
    this.e.meldungen.innerHTML = this.spiel.meldungen
      .slice(0, 6)
      .map((m) => `<li class="${m.art}"><span class="wann">${esc(m.datum)}</span> ${esc(m.text)}</li>`)
      .join("");
  }

  // --- Klicks ----------------------------------------------------------------
  klickFlotte(ev) {
    const knopf = ev.target.closest("button");
    if (!knopf) return;
    if (knopf.dataset.aufnehmen !== undefined) {
      automatik.nimmAuf(this.spiel, this.spiel.schiffe[Number(knopf.dataset.aufnehmen)]);
      this.aktualisiere();
    } else if (knopf.dataset.schiff !== undefined) {
      this.waehleSchiff(this.spiel.schiffe[Number(knopf.dataset.schiff)]);
    } else if (knopf.dataset.handeln !== undefined) {
      this.oeffneHandel();
    } else if (knopf.dataset.anhalten !== undefined) {
      automatik.pausiere(this.spiel, this.schiff);
      this.spiel.anhalten(this.schiff);
      this.aktualisiere();
    } else if (knopf.dataset.abwaehlen !== undefined) {
      this.abwaehlen();
    } else if (knopf.dataset.automatik !== undefined) {
      this.schliesseHandel();
      this.zeit.anhalten();
      this.routenfenster.oeffne(this.schiff);
    }
  }

  klickHandel(ev) {
    const knopf = ev.target.closest("button");
    if (!knopf) return;
    const s = this.spiel;
    const wunsch = this.menge === "max" ? Infinity : Number(this.menge);
    if (knopf.dataset.schliessen !== undefined) {
      this.schliesseHandel();
      return;
    }
    const d = knopf.dataset;
    const a = s.ausbau;
    const stadt = this.fensterStadt;
    const schiff = this.fensterSchiff;
    if (d.handelnMit !== undefined) {
      this.schiff = s.schiffe[Number(d.handelnMit)];
      this.reiter = "markt";
      return this.oeffneHandel();
    }
    if (d.reiter) {
      this.reiter = d.reiter;
    } else if (d.menge) {
      this.menge = d.menge;
    } else if (d.kontorbau !== undefined) {
      a.kontorBauen(stadt);
    } else if (d.umlagern) {
      if (schiff) a.umlagern(schiff, d.umlagern, wunsch, d.richtung);
    } else if (d.kontorverkauf) {
      const r = a.kontorVerkaufen(stadt, d.kontorverkauf, wunsch);
      if (r.menge) s.melde(`${r.menge} ${d.kontorverkauf} aus dem Kontor für ${f(r.betrag)} Gulden verkauft.`, "handel");
    } else if (d.betriebKauf) {
      a.kaufen(a.betriebe.find((b) => b.nr === Number(d.betriebKauf)));
    } else if (d.betriebVerkauf) {
      a.verkaufen(a.betriebe.find((b) => b.nr === Number(d.betriebVerkauf)));
    } else if (d.bau) {
      a.bauen(stadt, d.bau);
    } else if (knopf.dataset.kauf) {
      const r = schiff ? s.kaufen(schiff, knopf.dataset.kauf, wunsch) : { menge: 0 };
      if (r.menge) s.melde(`${r.menge} ${knopf.dataset.kauf} für ${f(r.betrag)} Gulden gekauft.`, "handel");
    } else if (knopf.dataset.verkauf) {
      const r = schiff ? s.verkaufen(schiff, knopf.dataset.verkauf, wunsch) : { menge: 0 };
      if (r.menge) {
        const ergebnis = r.gewinn >= 0 ? `Gewinn ${f(r.gewinn)}` : `Verlust ${f(-r.gewinn)}`;
        s.melde(`${r.menge} ${knopf.dataset.verkauf} für ${f(r.betrag)} Gulden verkauft (${ergebnis}).`, r.gewinn >= 0 ? "gut" : "handel");
      }
    } else if (knopf.dataset.ziel !== undefined) {
      this.segle({ stadt: s.welt.staedte[Number(knopf.dataset.ziel)] });
      return;
    } else if (d.neuschiff) {
      s.werft.kaufeNeu(stadt, d.neuschiff);
    } else if (d.gebraucht) {
      s.werft.kaufeGebraucht(s.werft.angebote.find((x) => x.nr === Number(d.gebraucht)));
    } else if (d.schiffverkauf !== undefined) {
      const x = s.schiffe[Number(d.schiffverkauf)];
      if (s.werft.verkaufe(x)) {
        if (this.schiff === x) this.schiff = null;
        if (this.fensterSchiff === x) {
          this.fensterSchiff = null;
          this.reiter = "werft";
        }
      }
    }
    this.aktualisiere();
  }
}

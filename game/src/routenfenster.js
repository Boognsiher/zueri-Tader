// Fenster für den automatischen Handel eines Schiffs: selbst steuern, Handelsroute oder
// freier Handel. Bearbeitet einen Entwurf und übernimmt ihn erst mit "Übernehmen".

import { AUFTRAGSARTEN, starteRoute, starteFrei, beende } from "./automatik.js";

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

export class Routenfenster {
  constructor(spiel, dialog, inhalt, rueckrufe) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.dialog = dialog;
    this.inhalt = inhalt;
    this.rueckrufe = rueckrufe; // { geschlossen() }
    this.schiff = null;
    this.entwurf = null;
    this.fehler = "";
    dialog.addEventListener("click", (e) => this.klick(e));
    dialog.addEventListener("change", (e) => this.aenderung(e, true));
    dialog.addEventListener("input", (e) => this.aenderung(e, false));
    dialog.addEventListener("close", () => this.rueckrufe.geschlossen());
  }

  get offen() {
    return this.dialog.open;
  }

  oeffne(schiff) {
    this.schiff = schiff;
    const a = schiff.auto;
    const standard = this.standardRoute(schiff);
    this.entwurf = {
      art: a ? a.art : "selbst",
      einsatz: a?.art === "frei" ? a.einsatz : Math.max(1000, Math.round(this.spiel.gulden / 2 / 100) * 100),
      halte: a?.art === "route" ? JSON.parse(JSON.stringify(a.halte)) : standard,
    };
    this.fehler = "";
    this.zeichne();
    if (!this.dialog.open) this.dialog.show();
  }

  schliesse() {
    if (this.dialog.open) this.dialog.close();
  }

  standardRoute(schiff) {
    const start = schiff.ort ?? this.spiel.naechsteStadt(schiff.pos);
    const ziel = this.spiel.welt.staedte.find((s) => s !== start);
    return [
      { stadt: start.name, auftraege: [] },
      { stadt: ziel.name, auftraege: [] },
    ];
  }

  zeichne() {
    const e = this.entwurf;
    const staedte = this.spiel.welt.staedte.map((s) => s.name);
    const waren = Object.keys(this.D.waren);
    const option = (wert, text, aktiv) => `<option value="${esc(wert)}" ${aktiv ? "selected" : ""}>${esc(text)}</option>`;
    let html = `<header><div><h2>Automatik</h2><span class="untertitel">${esc(this.D.spiel.schiffstyp)} «${esc(this.schiff.name)}»</span></div>
      <button class="schliessen" data-abbrechen title="Schliessen ohne Änderung" aria-label="Schliessen">×</button></header>
      <div class="modi" role="radiogroup" aria-label="Steuerung">
        ${[["selbst", "Selbst steuern"], ["route", "Handelsroute"], ["frei", "Freier Handel"]]
          .map(([w, t]) => `<label class="${e.art === w ? "aktiv" : ""}"><input type="radio" name="art" value="${w}" data-feld="art" ${e.art === w ? "checked" : ""}> ${t}</label>`)
          .join("")}
      </div>`;
    if (e.art === "selbst") {
      html += `<p class="hilfe">Du steuerst das Schiff mit Klicks auf die Karte und handelst im Handelsfenster.</p>`;
    } else if (e.art === "frei") {
      html += `<p class="hilfe">Der Kapitän sucht in jedem Hafen das Geschäft mit dem höchsten Gewinn pro Tag, kauft, fährt hin und verkauft. Findet er länger nichts, wechselt er den Hafen.</p>
        <label class="einsatz">Einsatz pro Fahrt höchstens <input type="number" min="0" step="500" value="${e.einsatz}" data-feld="einsatz"> Gulden</label>`;
    } else {
      html += `<p class="hilfe">Das Schiff fährt die Häfen der Reihe nach ab und beginnt danach von vorn. Menge leer = alles bzw. so viel wie passt. Preis leer = egal, beim Kaufen Höchstpreis, beim Verkaufen Mindestpreis. Verkauft und entladen wird vor dem Kaufen und Laden.</p><ol class="halte">`;
      e.halte.forEach((h, i) => {
        const kontor = this.spiel.ausbau.kontor(h.stadt);
        html += `<li class="halt"><div class="haltkopf">
            <select data-feld="halte.${i}.stadt" aria-label="Hafen ${i + 1}">${staedte.map((s) => option(s, s, s === h.stadt)).join("")}</select>
            ${kontor ? `<span class="kontorhinweis">Kontor</span>` : ""}
            <span class="haltknoepfe">
              <button data-hoch="${i}" ${i === 0 ? "disabled" : ""} title="nach oben" aria-label="nach oben">↑</button>
              <button data-runter="${i}" ${i === e.halte.length - 1 ? "disabled" : ""} title="nach unten" aria-label="nach unten">↓</button>
              <button data-halt-weg="${i}" title="Hafen entfernen" aria-label="Hafen entfernen">×</button>
            </span></div>`;
        if (h.auftraege.length) {
          html += `<table class="auftraege"><thead><tr><th>Auftrag</th><th>Ware</th><th>Menge</th><th>Preis</th><th></th></tr></thead><tbody>`;
          h.auftraege.forEach((a, j) => {
            html += `<tr>
              <td><select data-feld="halte.${i}.auftraege.${j}.art">${Object.entries(AUFTRAGSARTEN)
                .map(([w, t]) => option(w, t, w === a.art))
                .join("")}</select></td>
              <td><select data-feld="halte.${i}.auftraege.${j}.ware">${waren.map((w) => option(w, w, w === a.ware)).join("")}</select></td>
              <td><input type="number" min="1" placeholder="alles" value="${a.menge ?? ""}" data-feld="halte.${i}.auftraege.${j}.menge" aria-label="Menge"></td>
              <td><input type="number" min="1" placeholder="egal" value="${a.preis ?? ""}" data-feld="halte.${i}.auftraege.${j}.preis" aria-label="Preisgrenze"></td>
              <td><button data-auftrag-weg="${i}.${j}" title="Auftrag entfernen" aria-label="Auftrag entfernen">×</button></td></tr>`;
          });
          html += `</tbody></table>`;
        }
        html += `<button class="klein" data-auftrag-neu="${i}">+ Auftrag</button></li>`;
      });
      html += `</ol><button class="klein" data-halt-neu>+ Hafen</button>`;
    }
    if (this.fehler) html += `<p class="fehler">${esc(this.fehler)}</p>`;
    html += `<div class="fensterknoepfe"><button data-abbrechen>Abbrechen</button><button class="haupt" data-uebernehmen>Übernehmen</button></div>`;
    this.inhalt.innerHTML = html;
  }

  setze(pfad, wert) {
    const teile = pfad.split(".");
    let ziel = this.entwurf;
    for (const t of teile.slice(0, -1)) ziel = ziel[t];
    ziel[teile[teile.length - 1]] = wert;
  }

  aenderung(ev, endgueltig) {
    const feld = ev.target.dataset?.feld;
    if (!feld) return;
    let wert = ev.target.value;
    if (ev.target.type === "number") {
      wert = wert === "" ? null : Number(wert);
      if (feld === "einsatz") wert = wert ?? 0;
    }
    this.setze(feld, wert);
    // Auswahlfelder ändern die Darstellung, Zahlenfelder nicht (Fokus bleibt beim Tippen)
    if (endgueltig && ev.target.tagName !== "INPUT") this.zeichne();
    if (endgueltig && ev.target.type === "radio") this.zeichne();
  }

  klick(ev) {
    const k = ev.target.closest("button");
    if (!k) return;
    const e = this.entwurf;
    const d = k.dataset;
    if (d.abbrechen !== undefined) return this.schliesse();
    if (d.uebernehmen !== undefined) return this.uebernimm();
    if (d.haltNeu !== undefined) {
      const letzte = e.halte[e.halte.length - 1]?.stadt;
      const naechste = this.spiel.welt.staedte.find((s) => s.name !== letzte);
      e.halte.push({ stadt: naechste.name, auftraege: [] });
    } else if (d.haltWeg !== undefined) {
      e.halte.splice(Number(d.haltWeg), 1);
    } else if (d.hoch !== undefined) {
      const i = Number(d.hoch);
      [e.halte[i - 1], e.halte[i]] = [e.halte[i], e.halte[i - 1]];
    } else if (d.runter !== undefined) {
      const i = Number(d.runter);
      [e.halte[i + 1], e.halte[i]] = [e.halte[i], e.halte[i + 1]];
    } else if (d.auftragNeu !== undefined) {
      const h = e.halte[Number(d.auftragNeu)];
      h.auftraege.push({ art: h.auftraege.length ? "kaufen" : "verkaufen", ware: Object.keys(this.D.waren)[0], menge: null, preis: null });
    } else if (d.auftragWeg !== undefined) {
      const [i, j] = d.auftragWeg.split(".").map(Number);
      e.halte[i].auftraege.splice(j, 1);
    } else {
      return;
    }
    this.fehler = "";
    this.zeichne();
  }

  uebernimm() {
    const e = this.entwurf;
    const spiel = this.spiel;
    if (e.art === "selbst") {
      beende(spiel, this.schiff);
    } else if (e.art === "frei") {
      if (!(e.einsatz > 0)) {
        this.fehler = "Der Einsatz muss grösser als 0 sein.";
        return this.zeichne();
      }
      starteFrei(spiel, this.schiff, e.einsatz);
    } else {
      const fehler = starteRoute(spiel, this.schiff, JSON.parse(JSON.stringify(e.halte)));
      if (fehler) {
        this.fehler = fehler;
        return this.zeichne();
      }
    }
    this.schliesse();
  }
}

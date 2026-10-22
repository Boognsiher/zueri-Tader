// Einstieg: Daten laden, Spiel starten, Zeit laufen lassen.
// Echtzeit mit Pause, intern in ganzen Tagen gerechnet (Empfehlung in docs/entscheidungen.md).

import { ladeImBrowser } from "./daten.js";
import { Spiel } from "./spiel.js";
import { Karte } from "./karte.js";
import { Oberflaeche } from "./oberflaeche.js";

const $ = (id) => document.getElementById(id);

async function start() {
  let D;
  try {
    D = await ladeImBrowser();
  } catch (fehler) {
    $("fehler").hidden = false;
    $("fehler-text").textContent = fehler.message;
    return;
  }

  const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) | 0;
  const spiel = new Spiel(D, seed);
  let ui;
  const karte = new Karte($("karte"), spiel, {
    stadt: (stadt) => ui.waehleStadt(stadt),
    schiff: (schiff) => ui.waehleSchiff(schiff),
  });
  ui = new Oberflaeche(spiel, karte, {
    datum: $("datum"),
    gulden: $("gulden"),
    warenwert: $("warenwert"),
    flotte: $("flotte"),
    stadt: $("stadt"),
    meldungen: $("meldungen"),
  });
  spiel.melde(`Dein ${D.spiel.schiffstyp} «${spiel.schiffe[0].name}» liegt in ${D.spiel.start.stadt} bereit.`);
  ui.aktualisiere();

  // --- Zeit ----------------------------------------------------------------
  let tempo = 0;
  let letzteStufe = 1;
  let vorrat = 0; // verstrichene Zeit im laufenden Tag (ms)
  let zuletzt = performance.now();
  const knoepfe = document.querySelectorAll("[data-tempo]");

  function setzeTempo(stufe) {
    tempo = stufe;
    if (stufe > 0) letzteStufe = stufe;
    knoepfe.forEach((k) => k.setAttribute("aria-pressed", String(Number(k.dataset.tempo) === tempo)));
    document.body.classList.toggle("pausiert", tempo === 0);
  }
  knoepfe.forEach((k) => k.addEventListener("click", () => setzeTempo(Number(k.dataset.tempo))));
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !e.target.closest("button, input, dialog")) {
      e.preventDefault();
      setzeTempo(tempo ? 0 : letzteStufe);
    }
  });

  function bild(jetzt) {
    const dt = Math.min(jetzt - zuletzt, 500);
    zuletzt = jetzt;
    const dauer = D.spiel.tageslaenge_ms[tempo || letzteStufe];
    if (tempo) {
      vorrat += dt;
      while (vorrat >= dauer) {
        vorrat -= dauer;
        const r = spiel.tagVoran();
        if (r.ankuenfte.length && $("anhalten").checked) {
          vorrat = 0;
          setzeTempo(0);
          if (r.ankuenfte.length === 1) ui.waehleSchiff(r.ankuenfte[0]);
        }
        ui.aktualisiere();
        if (!tempo) break;
      }
    }
    karte.zeichne(Math.min(vorrat / dauer, 1));
    requestAnimationFrame(bild);
  }
  setzeTempo(0);
  requestAnimationFrame(bild);

  const einleitung = $("einleitung");
  einleitung.showModal();
  einleitung.addEventListener("close", () => setzeTempo(1));
}

start();

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
    stadt: (stadt) => ui.klickStadt(stadt),
    schiff: (schiff) => ui.waehleSchiff(schiff),
    see: (punkt) => ui.klickSee(punkt),
  });
  // Das Handelsfenster hält die Zeit an und setzt sie beim Schliessen fort
  let tempoVorHandel = 0;
  const zeit = {
    anhalten: () => {
      tempoVorHandel = tempo;
      setzeTempo(0);
    },
    fortsetzen: () => {
      if (tempoVorHandel && tempo === 0) setzeTempo(tempoVorHandel);
      tempoVorHandel = 0;
    },
  };
  ui = new Oberflaeche(
    spiel,
    karte,
    {
      datum: $("datum"),
      gulden: $("gulden"),
      warenwert: $("warenwert"),
      flotte: $("flotte"),
      markt: $("markt"),
      meldungen: $("meldungen"),
      handel: $("handel"),
      handelInhalt: $("handel-inhalt"),
    },
    zeit,
  );
  spiel.melde(`Dein ${D.spiel.schiffstyp} «${spiel.schiffe[0].name}» liegt in ${D.spiel.start.stadt} bereit.`);

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
    if (e.key === "Escape" && ui.handelOffen) {
      ui.schliesseHandel();
      return;
    }
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
      let ankuenfte = [];
      let neuerTag = false;
      while (vorrat >= dauer && !ankuenfte.length) {
        vorrat -= dauer;
        ankuenfte = spiel.tagVoran().ankuenfte;
        neuerTag = true;
      }
      if (!ankuenfte.length) ankuenfte = spiel.vorruecken(vorrat / dauer);
      if (ankuenfte.length) {
        if ($("anhalten").checked) {
          // Im Hafen hält das Handelsfenster die Zeit an und setzt sie beim Schliessen fort
          if (!ankuenfte[0].ort) setzeTempo(0);
          ui.angekommen(ankuenfte[0]);
        } else {
          ui.aktualisiere();
        }
      } else if (neuerTag) {
        ui.aktualisiere();
      }
    }
    karte.zeichne(Math.min(vorrat / dauer, 1));
    requestAnimationFrame(bild);
  }
  setzeTempo(0);
  ui.aktualisiere();
  requestAnimationFrame(bild);

  const einleitung = $("einleitung");
  einleitung.showModal();
  einleitung.addEventListener("close", () => setzeTempo(1));
}

start();

// Einstieg: Daten laden, Spiel starten oder Spielstand laden, Zeit laufen lassen, Menü.
// Echtzeit mit Pause, intern in ganzen Tagen gerechnet (Empfehlung in docs/entscheidungen.md).

import { ladeImBrowser } from "./daten.js";
import { Spiel } from "./spiel.js";
import { Karte } from "./karte.js";
import { Oberflaeche } from "./oberflaeche.js";
import { Routenfenster } from "./routenfenster.js";
import { speichere, lade, pruefe } from "./speicher.js";

const $ = (id) => document.getElementById(id);

// Spielstände liegen im Browser (localStorage). Zum Laden wird der Stand in den
// sessionStorage gelegt und die Seite neu geladen: So startet alles sauber neu.
const SCHLUESSEL = { stand: "zueri-trade.stand", auto: "zueri-trade.auto", laden: "zueri-trade.laden" };

function lies(schluessel, speicher = "localStorage") {
  try {
    const text = window[speicher].getItem(schluessel);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function schreibe(schluessel, wert, speicher = "localStorage") {
  try {
    window[speicher].setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch {
    return false;
  }
}

function neuLaden(stand) {
  if (schreibe(SCHLUESSEL.laden, stand, "sessionStorage")) location.reload();
}

const zeitpunkt = (stand) => (stand ? `${stand.datum} (gespeichert ${new Date(stand.gespeichert).toLocaleString("de-CH")})` : "keiner");

async function start() {
  let D;
  try {
    D = await ladeImBrowser();
  } catch (fehler) {
    $("fehler").hidden = false;
    $("fehler-text").textContent = fehler.message;
    return;
  }

  // Spielstand vom Menü (Laden, Import) oder neues Spiel
  const auftrag = lies(SCHLUESSEL.laden, "sessionStorage");
  try {
    sessionStorage.removeItem(SCHLUESSEL.laden);
  } catch {}
  let spiel = null;
  let ladefehler = "";
  if (auftrag && auftrag !== "neu") {
    try {
      spiel = lade(D, auftrag);
      spiel.melde(`Spielstand vom ${auftrag.datum} geladen.`);
    } catch (e) {
      ladefehler = e.message;
    }
  }
  const geladen = !!spiel;
  if (!spiel) {
    spiel = new Spiel(D, (Date.now() ^ (Math.random() * 0x7fffffff)) | 0);
    spiel.melde(`Dein ${spiel.schiffstyp(spiel.schiffe[0]).name} «${spiel.schiffe[0].name}» liegt in ${D.spiel.start.stadt} bereit.`);
    if (ladefehler) spiel.melde(`Spielstand konnte nicht geladen werden: ${ladefehler}`, "warnung");
  }

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
  // Fenster (Handel, Automatik) halten die Zeit an und setzen sie beim Schliessen fort
  let tempoVorFenster = 0;
  const zeit = {
    anhalten: () => {
      if (tempo) tempoVorFenster = tempo;
      setzeTempo(0);
    },
    fortsetzen: () => {
      const offen = ui.handelOffen || routenfenster.offen || $("bilanz").open;
      if (tempoVorFenster && tempo === 0 && !offen) setzeTempo(tempoVorFenster);
      if (!offen) tempoVorFenster = 0;
    },
  };

  let ui;
  const karte = new Karte($("karte"), spiel, {
    stadt: (stadt) => ui.klickStadt(stadt),
    schiff: (schiff) => ui.waehleSchiff(schiff),
    see: (punkt) => ui.klickSee(punkt),
  });
  ui = new Oberflaeche(
    spiel,
    karte,
    {
      datum: $("datum"),
      gulden: $("gulden"),
      warenwert: $("warenwert"),
      flotte: $("flotte"),
      besitz: $("besitz"),
      markt: $("markt"),
      meldungen: $("meldungen"),
      handel: $("handel"),
      handelInhalt: $("handel-inhalt"),
      bilanzInhalt: $("bilanz-inhalt"),
    },
    zeit,
  );
  const routenfenster = new Routenfenster(spiel, $("automatik"), $("automatik-inhalt"), {
    geschlossen: () => {
      zeit.fortsetzen();
      ui.aktualisiere();
    },
  });
  ui.routenfenster = routenfenster;
  // Bilanzfenster: hält die Zeit an wie die anderen Fenster
  const bilanzDialog = $("bilanz");
  function bilanzZu() {
    if (!bilanzDialog.open) return;
    bilanzDialog.close();
    zeit.fortsetzen();
  }
  $("bilanzknopf").addEventListener("click", () => {
    if (bilanzDialog.open) return bilanzZu();
    ui.bilanz();
    zeit.anhalten();
    bilanzDialog.show();
  });
  bilanzDialog.addEventListener("click", (e) => {
    if (e.target.closest("[data-bilanz-zu]")) bilanzZu();
  });

  // Zugang für Tests und Fehlersuche in der Browser-Konsole
  window.zueriTrade = { spiel, ui };

  knoepfe.forEach((k) => k.addEventListener("click", () => setzeTempo(Number(k.dataset.tempo))));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (bilanzDialog.open) bilanzZu();
      else if (routenfenster.offen) routenfenster.schliesse();
      else if (ui.handelOffen) ui.schliesseHandel();
      else if (!e.target.closest("details")) ui.abwaehlen();
      return;
    }
    if (e.code === "Space" && !e.target.closest("button, input, select, dialog, summary")) {
      e.preventDefault();
      setzeTempo(tempo ? 0 : letzteStufe);
    }
  });

  // --- Speichern -------------------------------------------------------------
  const info = $("speicherinfo");
  function zeigeSpeicherinfo(text = "") {
    info.textContent = `${text ? text + " " : ""}Gespeichert: ${zeitpunkt(lies(SCHLUESSEL.stand))}. Automatisch: ${zeitpunkt(lies(SCHLUESSEL.auto))}.`;
  }
  function autoSpeichern() {
    schreibe(SCHLUESSEL.auto, speichere(spiel));
  }
  setInterval(autoSpeichern, D.spiel.autosave_sekunden * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") autoSpeichern();
  });

  let neuBestaetigen = false;
  $("menue").addEventListener("toggle", () => {
    zeigeSpeicherinfo();
    neuBestaetigen = false;
    document.querySelector('[data-menue="neu"]').textContent = "Neues Spiel";
  });
  $("menue").addEventListener("click", (e) => {
    const k = e.target.closest("[data-menue]");
    if (!k) return;
    const aktion = k.dataset.menue;
    if (aktion === "speichern") {
      const ok = schreibe(SCHLUESSEL.stand, speichere(spiel));
      zeigeSpeicherinfo(ok ? "Gespeichert." : "Speichern nicht möglich (Browser blockiert den Speicher).");
      if (ok) spiel.melde("Spiel gespeichert.");
      ui.aktualisiere();
    } else if (aktion === "laden" || aktion === "auto") {
      const stand = lies(aktion === "laden" ? SCHLUESSEL.stand : SCHLUESSEL.auto);
      if (stand) neuLaden(stand);
      else zeigeSpeicherinfo("Kein solcher Spielstand vorhanden.");
    } else if (aktion === "export") {
      const stand = speichere(spiel);
      const blob = new Blob([JSON.stringify(stand, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `zueri-trade-${stand.datum.replace(/\.?\s+/g, "-")}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (aktion === "import") {
      $("importdatei").click();
    } else if (aktion === "neu") {
      if (!neuBestaetigen) {
        neuBestaetigen = true;
        k.textContent = "Wirklich neu beginnen? Nochmals klicken";
        return;
      }
      autoSpeichern();
      neuLaden("neu");
    }
  });
  $("importdatei").addEventListener("change", async (e) => {
    const datei = e.target.files[0];
    if (!datei) return;
    try {
      const stand = JSON.parse(await datei.text());
      const fehler = pruefe(D, stand);
      if (fehler) zeigeSpeicherinfo(fehler);
      else neuLaden(stand);
    } catch {
      zeigeSpeicherinfo("Die Datei ist kein gültiger Spielstand.");
    }
    e.target.value = "";
  });

  // --- Spielschleife -----------------------------------------------------------
  function bild(jetzt) {
    const dt = Math.min(jetzt - zuletzt, 500);
    zuletzt = jetzt;
    const dauer = D.spiel.tageslaenge_ms[tempo || letzteStufe];
    if (tempo) {
      vorrat += dt;
      let ankuenfte = [];
      let neuerTag = false;
      // Nur selbst gesteuerte Schiffe halten an, automatische fahren weiter
      const selbst = (liste) => liste.filter((s) => !s.auto || s.auto.pausiert);
      while (vorrat >= dauer && !ankuenfte.length) {
        vorrat -= dauer;
        ankuenfte = selbst(spiel.tagVoran().ankuenfte);
        neuerTag = true;
      }
      if (!ankuenfte.length) ankuenfte = selbst(spiel.vorruecken(vorrat / dauer));
      if (ankuenfte.length && $("anhalten").checked) {
        // Im Hafen hält das Handelsfenster die Zeit an und setzt sie beim Schliessen fort
        if (!ankuenfte[0].ort) setzeTempo(0);
        ui.angekommen(ankuenfte[0]);
      } else if (ankuenfte.length || neuerTag) {
        ui.aktualisiere();
      }
    }
    karte.zeichne(Math.min(vorrat / dauer, 1));
    requestAnimationFrame(bild);
  }
  setzeTempo(0);
  ui.aktualisiere();
  requestAnimationFrame(bild);

  // --- Einleitung ------------------------------------------------------------------
  if (geladen) return;
  const einleitung = $("einleitung");
  const vorhanden = [lies(SCHLUESSEL.auto), lies(SCHLUESSEL.stand)].filter(Boolean).sort((a, b) => (a.gespeichert < b.gespeichert ? 1 : -1))[0];
  if (vorhanden && auftrag !== "neu") {
    const knopf = $("weiterspielen");
    knopf.hidden = false;
    knopf.textContent = `Weiterspielen (${vorhanden.datum})`;
  }
  einleitung.showModal();
  einleitung.addEventListener("close", () => {
    if (einleitung.returnValue === "weiter" && vorhanden) neuLaden(vorhanden);
    else setzeTempo(1);
  });
}

start();

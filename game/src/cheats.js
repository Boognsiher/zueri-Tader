// Cheat-Modus zum Ausprobieren des Spielprinzips: Zeitsprünge, Geld, Reparatur, Seen öffnen,
// Krieg und Frieden. Ein- und ausschalten im Menü «Spielstand», der Schalter wird im Browser
// gemerkt. Die Cheats ändern den Spielzustand direkt und laufen an den Regeln vorbei: Geld
// erscheint nicht in der Bilanz.

const SCHLUESSEL = "zueri-trade.cheat";
const HAEPPCHEN_MS = 300; // Rechenzeit am Stück beim Vorspulen

function an() {
  try {
    return localStorage.getItem(SCHLUESSEL) === "1";
  } catch {
    return false;
  }
}

export function richteCheatsEin(spiel, ui, { knopf, menue, liste, setzeTempo }) {
  const zeige = () => {
    menue.hidden = !an();
    knopf.textContent = an() ? "Cheat-Modus ausschalten" : "Cheat-Modus einschalten";
  };
  knopf.addEventListener("click", () => {
    try {
      localStorage.setItem(SCHLUESSEL, an() ? "0" : "1");
    } catch {}
    zeige();
  });
  zeige();

  liste.innerHTML = `
    <p class="klein">Zeit vorspulen (das Spiel hält dafür an)</p>
    <div class="cheatknoepfe">
      <button data-cheat-tage="1">+1 Tag</button><button data-cheat-tage="7">+7 Tage</button>
      <button data-cheat-tage="30">+30 Tage</button><button data-cheat-tage="365">+1 Jahr</button>
      <button data-cheat-tage="3650">+10 Jahre</button>
    </div>
    <p class="klein">Geld</p>
    <div class="cheatknoepfe"><button data-cheat-gulden="10000">+10'000</button><button data-cheat-gulden="100000">+100'000</button><button data-cheat-gulden="1000000">+1 Mio.</button></div>
    <p class="klein">Sonstiges</p>
    <div class="cheatknoepfe">
      <button data-cheat="reparieren">Alle Schiffe reparieren</button>
      <button data-cheat="seen">Alle Seen erschliessen</button>
      <button data-cheat="krieg">Krieg auslösen</button>
      <button data-cheat="frieden">Frieden überall</button>
    </div>
    <p class="klein" id="cheatstatus"></p>`;
  const status = liste.querySelector("#cheatstatus");

  let laeuft = false;
  // In Häppchen von gut einer Viertelsekunde vorspulen: Dazwischen zeichnet der Browser einmal
  // (Fortschritt, Karte). Häufigeres Zeichnen kostet bei langen Sprüngen mehr als das Rechnen.
  async function spule(tage) {
    if (laeuft) return;
    laeuft = true;
    setzeTempo(0);
    const knoepfe = liste.querySelectorAll("button");
    knoepfe.forEach((k) => (k.disabled = true));
    const start = performance.now();
    for (let t = 0; t < tage; ) {
      const haeppchen = performance.now();
      while (t < tage && performance.now() - haeppchen < HAEPPCHEN_MS) {
        spiel.tagVoran();
        t++;
      }
      status.textContent = `Spule vor … ${t} von ${tage} Tagen (${spiel.datum()})`;
      await new Promise((r) => setTimeout(r, 0));
    }
    // Nach langen Sprüngen nur den letzten Gefechtsbericht zeigen
    spiel.kampf.berichte.splice(0, Math.max(0, spiel.kampf.berichte.length - 1));
    status.textContent = `${tage} ${tage === 1 ? "Tag" : "Tage"} vorgespult in ${((performance.now() - start) / 1000).toFixed(1)} s, jetzt ${spiel.datum()}.`;
    knoepfe.forEach((k) => (k.disabled = false));
    laeuft = false;
    ui.aktualisiere();
  }

  liste.addEventListener("click", (ev) => {
    const k = ev.target.closest("button");
    if (!k) return;
    const d = k.dataset;
    if (d.cheatTage) return spule(Number(d.cheatTage));
    if (d.cheatGulden) {
      spiel.gulden += Number(d.cheatGulden);
      status.textContent = `${Number(d.cheatGulden).toLocaleString("de-CH")} Gulden dazu.`;
    } else if (d.cheat === "reparieren") {
      for (const s of spiel.schiffe) spiel.kampf.daten(s).schaden = 0;
      status.textContent = "Alle Schiffe repariert.";
    } else if (d.cheat === "seen") {
      spiel.zonen.erschlossen = spiel.D.zonen.zonen.map((z) => z.id);
      status.textContent = "Alle Seen und Zonen erschlossen.";
    } else if (d.cheat === "krieg") {
      // Das erste Paar von Ständen, das noch Frieden hat
      const dip = spiel.diplomatie;
      const ids = dip.liste.map((f) => f.id);
      let paar = null;
      for (let i = 0; i < ids.length && !paar; i++) for (let j = i + 1; j < ids.length && !paar; j++) if (!dip.imKrieg(ids[i], ids[j])) paar = [ids[i], ids[j]];
      if (!paar) {
        status.textContent = "Alle Stände führen schon Krieg gegeneinander.";
      } else {
        const [a, b] = paar.sort();
        dip.kriege[`${a}|${b}`] = { seit: spiel.welt.tag, verluste: { [a]: 0, [b]: 0 } };
        spiel.melde(`Krieg: ${dip.fraktion(a).name} und ${dip.fraktion(b).name} sind verfeindet (Cheat).`, "warnung");
        status.textContent = `Krieg zwischen ${dip.fraktion(a).name} und ${dip.fraktion(b).name}.`;
      }
    } else if (d.cheat === "frieden") {
      spiel.diplomatie.kriege = {};
      spiel.diplomatie.kaperbriefeNachFrieden();
      status.textContent = "Überall Frieden.";
    }
    ui.aktualisiere();
  });
}

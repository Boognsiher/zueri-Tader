#!/usr/bin/env python3
"""Prüft die Datenkonsistenz pro Zone (Regel 7 in CLAUDE.md): Angebot (Produktion plus Werkstätten)
gegen Bedarf (Verbrauch plus Zutaten der Werkstätten) je Ware. Soll: etwa +3 bis +8 %.

Aufruf:  python3 tools/daten/bilanz.py            # alle Zonen
         python3 tools/daten/bilanz.py walensee   # eine Zone
"""
import collections
import json
import os
import sys

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")
lies = lambda n: json.load(open(os.path.join(D, n), encoding="utf-8"))
cons = lies("consumption.json")["verbrauch_pro_1000_einwohner_und_tag"]
rez = lies("recipes.json")["rezepte"]
staedte = lies("cities.json")["staedte"]
zonen = [z["id"] for z in lies("zonen.json")["zonen"]]


def bilanz(cities):
    bedarf, angebot = collections.Counter(), collections.Counter()
    for c in cities:
        for g, v in cons.items():
            bedarf[g] += c["einwohner"] / 1000 * v
        for g, v in {**c["produktion"], **c.get("import", {})}.items():   # Einfuhr der Verteilzentren
            angebot[g] += v
        for g, n in c["werkstaetten"].items():
            angebot[g] += n
            for z, m in rez[g].items():
                bedarf[z] += n * m
    return bedarf, angebot


if __name__ == "__main__":
    wahl = sys.argv[1:] or zonen
    ok = True
    for z in wahl:
        cities = [c for c in staedte if c.get("zone", "zuerichsee") == z]
        bedarf, angebot = bilanz(cities)
        print(f"\n{z}: {len(cities)} Städte, {sum(c['einwohner'] for c in cities)} Einwohner")
        for g in sorted(set(bedarf) | set(angebot)):
            r = (angebot[g] / bedarf[g] - 1) * 100 if bedarf[g] else float("nan")
            kleiner_ueberschuss = angebot[g] - bedarf[g] <= 1.2  # bei winzigen Mengen sind Prozente grob
            marke = "" if 1.0 <= r <= 13 or (r > 13 and kleiner_ueberschuss) else "  <-- ausserhalb"
            ok &= not marke
            print(f"  {g:10s} Bedarf {bedarf[g]:7.1f}  Angebot {angebot[g]:7.1f}  {r:+6.1f} %{marke}")
    sys.exit(0 if ok else 1)

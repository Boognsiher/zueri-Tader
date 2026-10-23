#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wirtschaftssimulation fuer ein Handelsspiel (Zürichsee, 17. Jahrhundert)
==============================================================
Laesst die Wirtschaft ohne Spieler laufen: Staedte produzieren und verbrauchen,
Preise folgen Angebot und Nachfrage, KI-Haendler (greedy) handeln zwischen den
Staedten. Am Ende gibt es einen Bericht, ob die Wirtschaft stabil und
spielbar ist.

Alle Zahlen (Waren, Rezepte, Staedte, Ereignisse, Parameter) stehen in data/*.json.
Balance-Aenderungen sind reine Datenaenderungen, am Code muss nichts angefasst werden.

Aufruf (aus dem Repo-Hauptordner):
    python3 tools/sim/wirtschaft_sim.py
    python3 tools/sim/wirtschaft_sim.py --days 1080 --ships 40 --k 0.6 --seed 3
    python3 tools/sim/wirtschaft_sim.py --no-events --csv preise.csv
    python3 tools/sim/wirtschaft_sim.py --data pfad/zu/anderen/daten

Exit-Code: 0 = alle Checks bestanden, 1 = mindestens ein Check durchgefallen
(damit laesst sich die Simulation als automatischer Balance-Test nutzen).

Aufbau:
    1) DATEN        laedt data/*.json
    2) MODELL       Preisformel, Stadt, Schiff
    3) SIMULATION   Tagesschleife, Ereignisse
    4) BERICHT      Auswertung mit Ampel-Checks
"""
import argparse
import csv
import json
import math
import os
import random
import statistics
import sys
from collections import defaultdict

# ======================================================================
# 1) DATEN laden (alle Zahlen stehen in data/*.json, nicht im Code)
# ======================================================================
DEFAULT_DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data")

# Werden von load_data() gefuellt:
GOODS = {}        # Ware -> Basispreis
RECIPES = {}      # Ware -> {Zutat: Menge}
CONSUMPTION = {}  # Ware -> Verbrauch pro 1000 Einwohner und Tag
BASIC = []        # Grundbedarf (Zufriedenheit)
COMFORT = []      # gehobener Bedarf (Zufriedenheit)
CITIES = []       # Staedte (intern: name, pop, pos, prod, work)
EVENTS = []       # Zufallsereignisse (events.json)
DISTANZEN = {}    # (Stadt, Stadt) -> Weglaenge ueber Wasser (karte.json, tools/karte/distanzen.mjs)
ZONEN = {}        # Zone -> {Ware: Preisfaktor} (zonen.json)
ZONEN_ART = {}    # Zone -> see, fluss oder land (zonen.json)
KURVEN = {}       # Epochenkurven (epochen.json)
EP_FRACHT = 1.0   # Laderaum der KI-Schiffe heute (ki_fracht)
EP_TEMPO = 1.0    # Tempo der KI-Schiffe heute (ki_tempo)
EP_NETZ = 1.0     # Tempo in Landzonen heute (netz_tempo)
# Parameter (SPREAD, PRICE_MIN, ...) werden ebenfalls aus params.json als
# Modulvariablen gesetzt.


def _read(data_dir, name):
    with open(os.path.join(data_dir, name), encoding="utf-8") as f:
        return json.load(f)


def load_data(data_dir=DEFAULT_DATA_DIR):
    """Liest data/*.json in die Modulvariablen."""
    global GOODS, RECIPES, CONSUMPTION, BASIC, COMFORT, CITIES, EVENTS, DISTANZEN, ZONEN, ZONEN_ART, KURVEN
    GOODS = {n: v["basispreis"] for n, v in _read(data_dir, "goods.json")["waren"].items()}
    RECIPES = _read(data_dir, "recipes.json")["rezepte"]
    c = _read(data_dir, "consumption.json")
    CONSUMPTION = c["verbrauch_pro_1000_einwohner_und_tag"]
    BASIC = c["grundbedarf"]
    COMFORT = c["gehobener_bedarf"]
    CITIES = [{"name": s["name"], "pop": s["einwohner"], "pos": tuple(s["position"]),
               "prod": s["produktion"], "work": s["werkstaetten"],
               "zone": s.get("zone", "zuerichsee")}
              for s in _read(data_dir, "cities.json")["staedte"]]
    EVENTS = _read(data_dir, "events.json")["ereignisse"]
    ZONEN = {z["id"]: z.get("preisfaktor", {}) for z in _read(data_dir, "zonen.json")["zonen"]}   # Preisniveau je Zone und Ware
    ZONEN_ART = {z["id"]: z.get("art", "see") for z in _read(data_dir, "zonen.json")["zonen"]}
    KURVEN = _read(data_dir, "epochen.json")["kurven"]
    DISTANZEN = {}
    for paar, d in _read(data_dir, "karte.json")["distanzen"].items():
        a, b = paar.split("|")
        DISTANZEN[(a, b)] = DISTANZEN[(b, a)] = d
    for a in CITIES:
        for b in CITIES:
            # Zwischen Zonen (eigene Seen) gibt es keinen Wasserweg und keine KI-Fahrten
            if a is not b and a["zone"] == b["zone"] and (a["name"], b["name"]) not in DISTANZEN:
                raise ValueError(f"Distanz {a['name']} - {b['name']} fehlt in karte.json (node tools/karte/distanzen.mjs)")
    for name, p in _read(data_dir, "params.json")["parameter"].items():
        globals()[name] = p["wert"]


# ======================================================================
# 2) MODELL
# ======================================================================
def kurve(name, jahr):
    """Epochenkurve (epochen.json): lineare Zwischenwerte, ausserhalb der erste bzw. letzte Wert."""
    punkte = KURVEN[name]
    if jahr <= punkte[0][0]:
        return punkte[0][1]
    for (j0, w0), (j1, w1) in zip(punkte, punkte[1:]):
        if jahr <= j1:
            return w0 + (w1 - w0) * (jahr - j0) / (j1 - j0)
    return punkte[-1][1]


def price(base, target, stock, k):
    """Preis = Basispreis * (Zielbestand / Lagerbestand) ** k, begrenzt."""
    ratio = target / max(stock, 1.0)
    p = base * ratio ** k
    return min(max(p, base * PRICE_MIN), base * PRICE_MAX)


class City:
    def __init__(self, cfg):
        self.name = cfg["name"]
        self.zone = cfg["zone"]
        self.pf = ZONEN.get(self.zone, {})   # Preisniveau der Zone je Ware
        self.pop = cfg["pop"]
        self.pop0 = cfg["pop"]               # Startbevoelkerung, Bezug fuer das Wachstum
        self.satisfaction_bonus = 0.0        # Versorgungsgebaeude des Spielers (nur im Spiel)
        self.housing_bonus = 0.0             # zusaetzlicher Wohnraum (nur im Spiel)
        self.pos = cfg["pos"]
        self.epoch_housing = 1.0             # Epochenfaktor auf den Wohnraum (wohnraum)
        self.prod = cfg["prod"]
        self.work = cfg["work"]
        self.incoming = defaultdict(float)  # Ladung, die gerade hierher unterwegs ist
        self.ballast = 0                    # Schiffe, die leer hierher unterwegs sind
        self.prod_mult = {}      # Ware -> (Faktor, bis_Tag)   (Ereignisse)
        self.cons_mult = {}
        self.blockade_until = -1
        self.satisfaction = 60.0

        self.cons = {g: r * self.pop / 1000.0 for g, r in CONSUMPTION.items()}
        use = defaultdict(float)   # Zutatenbedarf der Werkstaetten pro Tag
        out = defaultdict(float)   # Ausstoss pro Tag
        for g, a in self.prod.items():
            out[g] += a
        for g, b in self.work.items():
            out[g] += b
            for inp, n in RECIPES[g].items():
                use[inp] += n * b

        self.target, self.cap, self.stock = {}, {}, {}
        for g in GOODS:
            t = (TARGET_DAYS_USE * (self.cons.get(g, 0) + use.get(g, 0))
                 + TARGET_DAYS_PROD * out.get(g, 0))
            if t > 0:                       # nur Waren, die hier eine Rolle spielen
                self.target[g] = max(t, 20.0)
                self.cap[g] = CAP_FACTOR * self.target[g]
                self.stock[g] = self.target[g]
        self.target0 = dict(self.target)
        self.cap0 = dict(self.cap)

    def scale(self):
        """Bevoelkerungsfaktor: Produktion, Werkstaetten, Verbrauch und Zielbestand wachsen mit."""
        return self.pop / self.pop0

    def rescale(self):
        f = self.scale()
        self.cons = {g: r * self.pop / 1000.0 for g, r in CONSUMPTION.items()}
        for g in self.target0:
            self.target[g] = self.target0[g] * f
            self.cap[g] = self.cap0[g] * f

    # --- Preise -------------------------------------------------------
    def base(self, g):
        """Basispreis der Ware in dieser Stadt (Basispreis mal Preisniveau der Zone)."""
        return GOODS[g] * self.pf.get(g, 1.0)

    def mid_price(self, g, k):
        return price(self.base(g), self.target[g], self.stock[g], k)

    def buy_price(self, g, k):
        return self.mid_price(g, k) * (1 + SPREAD / 2)

    def sell_price(self, g, k):
        return self.mid_price(g, k) * (1 - SPREAD / 2)

    def planned_sell_price(self, g, k):
        """Erwarteter Verkaufspreis unter Beruecksichtigung anderer Schiffe unterwegs."""
        s = self.stock[g] + self.incoming[g]
        return price(self.base(g), self.target[g], s, k) * (1 - SPREAD / 2)

    @staticmethod
    def _mult(table, g, day):
        v = table.get(g)
        return v[0] if v and v[1] > day else 1.0

    # --- ein Tag --------------------------------------------------------
    def step(self, day, stats):
        f = self.scale()
        # Produktion / Import (waechst mit der Bevoelkerung: mehr Arbeitskraefte)
        for g, a in self.prod.items():
            q = a * f * self._mult(self.prod_mult, g, day)
            self.stock[g] += q
            stats.produced[g] += q
        # Werkstaetten
        for g, cap_b in self.work.items():
            batches = cap_b * f
            for inp, n in RECIPES[g].items():
                batches = min(batches, self.stock.get(inp, 0.0) / n)
            if batches > 0:
                for inp, n in RECIPES[g].items():
                    self.stock[inp] -= n * batches
                self.stock[g] += batches
                stats.produced[g] += batches
        # Verbrauch
        basic, comfort, shortage = [], [], False
        for g, rate in self.cons.items():
            need = rate * self._mult(self.cons_mult, g, day)
            got = min(need, self.stock[g])
            self.stock[g] -= got
            ful = got / need if need > 0 else 1.0
            if g in BASIC:
                basic.append(ful)
                if ful < 0.9:
                    shortage = True
            elif g in COMFORT:
                comfort.append(ful)
        target_sat = min(100.0, SAT_BASIC * statistics.mean(basic) + SAT_COMFORT * statistics.mean(comfort)
                         + self.satisfaction_bonus)
        self.satisfaction += 0.1 * (target_sat - self.satisfaction)
        # Bevoelkerung: waechst ueber POP_SAT_NEUTRAL, schrumpft darunter, begrenzt durch Wohnraum
        n = POP_SAT_NEUTRAL
        if self.satisfaction > n:
            rate = POP_GROWTH * (self.satisfaction - n) / (100 - n)
        else:
            rate = -POP_SHRINK * (n - self.satisfaction) / n
        hoch = self.pop0 * (POP_MAX_FACTOR * self.epoch_housing + self.housing_bonus)
        tief = self.pop0 * POP_MIN_FACTOR
        self.pop = min(max(self.pop * (1 + rate), tief), max(hoch, tief))
        self.rescale()
        # Lagerkapazitaet: Ueberschuss verdirbt
        for g in self.stock:
            if self.stock[g] > self.cap[g]:
                stats.wasted[g] += self.stock[g] - self.cap[g]
                self.stock[g] = self.cap[g]
        return shortage


def route_length(a, b):
    """Weglaenge ueber Wasser, vorberechnet aus der Karte (tools/karte/distanzen.mjs)."""
    return DISTANZEN[(a.name, b.name)]


def travel_days(a, b):
    # Schiffe: ki_tempo; in Landzonen bestimmt das Strassen- und Schienennetz das Tempo (netz_tempo)
    tempo = round((EP_NETZ if ZONEN_ART.get(a.zone) == "land" else EP_TEMPO) * 20) / 20
    return max(1, math.ceil(route_length(a, b) / (SPEED * tempo)))


def quote(src, dst, g, money, k):
    """Optimale Ladungsmenge, simuliert mit Preiswirkung auf beiden Seiten."""
    s_src, s_dst = src.stock[g], dst.stock[g] + dst.incoming[g]
    cost = rev = 0.0
    q = 0
    ship_cap = round(SHIP_CAP * EP_FRACHT)
    # Grosse Schiffe (spaetere Epochen) in Stuecken von hoechstens 1/120 des Laderaums rechnen
    step = max(1, ship_cap // 120)
    while q + step <= ship_cap and s_src - q >= 1 + step:
        mb = price(src.base(g), src.target[g], s_src - q, k) * (1 + SPREAD / 2)
        ms = price(dst.base(g), dst.target[g], s_dst + q, k) * (1 - SPREAD / 2)
        if ms <= mb or cost + mb * step > money:
            break
        cost += mb * step
        rev += ms * step
        q += step
    return q, cost, rev


class Ship:
    def __init__(self, city):
        self.city = city
        self.money = START_MONEY
        self.cargo = None
        self.dest = None
        self.arrival = None

    def act(self, day, cities, rng, k, stats):
        self.money -= UPKEEP
        if self.dest is not None:
            if day < self.arrival:
                return
            if self.cargo is not None:
                self._sell(day, k, stats)
            else:                                   # Leerfahrt beendet
                self.dest.ballast -= 1
                self.city, self.dest, self.arrival = self.dest, None, None
        self._plan(day, cities, rng, k, stats)

    def _sell(self, day, k, stats):
        g, q, cost, src_name, t0 = self.cargo
        c = self.dest
        rev = 0.0
        for _ in range(q):
            rev += c.sell_price(g, k)
            c.stock[g] += 1
        self.money += rev
        c.incoming[g] -= q
        if stats.on:
            stats.tours.append(((rev - cost) / cost, rev - cost, day - t0, g))
            stats.vol_value[g] += cost
            stats.vol_units[g] += q
            stats.routes[(src_name, c.name)] += 1
        self.city, self.dest, self.cargo, self.arrival = c, None, None, None

    def _options(self, src, day, cities, k):
        """Alle sinnvollen Handelsfahrten ab src: (Rate, Ware, Ziel, Menge, Tage, Gewinn)."""
        options = []
        for g in src.stock:
            if src.stock[g] < 5:
                continue
            pb = src.buy_price(g, k)
            for d in cities:
                if d is src or d.zone != src.zone or day < d.blockade_until or g not in d.stock:
                    continue
                if d.planned_sell_price(g, k) < pb * (1 + MIN_ROI):
                    continue
                q, cost, rev = quote(src, d, g, self.money, k)
                profit = rev - cost
                if q <= 0 or profit < MIN_PROFIT or profit / cost < MIN_ROI:
                    continue
                days = travel_days(src, d) + 1
                options.append((profit / days, g, d, q, days, profit))
        return options

    def _plan(self, day, cities, rng, k, stats):
        src = self.city
        options = self._options(src, day, cities, k)
        if options:
            options.sort(key=lambda o: o[0], reverse=True)
            top = options[:3]
            _, g, d, q, days, _p = rng.choices(top, weights=[o[0] for o in top])[0]
            cost = 0.0
            for _ in range(q):
                cost += src.buy_price(g, k)
                src.stock[g] -= 1
            self.money -= cost
            self.cargo = (g, q, cost, src.name, day)
            d.incoming[g] += q
            self.dest = d
            self.arrival = day + days
            return
        # Nichts zu laden: leer zum aussichtsreichsten Hafen verlegen.
        # Schiffe, die schon leer dorthin unterwegs sind, mindern die Attraktivitaet.
        best, best_rate = None, 0.0
        for c in cities:
            if c is src or c.zone != src.zone or day < c.blockade_until:
                continue
            opts = self._options(c, day, cities, k)
            if not opts:
                continue
            move = travel_days(src, c)
            rate = max(o[5] / (move + o[4]) for o in opts) / (1 + c.ballast)
            if rate > best_rate:
                best, best_rate = c, rate
        if best is not None:
            best.ballast += 1
            self.dest = best
            self.arrival = day + travel_days(src, best)
            if stats.on:
                stats.ballast_trips += 1


# ======================================================================
# 3) SIMULATION
# ======================================================================
class Stats:
    def __init__(self):
        self.on = False
        self.produced = defaultdict(float)
        self.wasted = defaultdict(float)
        self.r_sum = defaultdict(float)
        self.r_sq = defaultdict(float)
        self.r_n = defaultdict(int)
        self.r_hi = defaultdict(int)
        self.r_lo = defaultdict(int)
        self.gap_sum = defaultdict(float)
        self.gap_n = defaultdict(int)
        self.sat_sum = defaultdict(float)
        self.sat_min = defaultdict(lambda: 100.0)
        self.sat_n = defaultdict(int)
        self.short_days = defaultdict(int)
        self.vol_value = defaultdict(float)
        self.vol_units = defaultdict(float)
        self.routes = defaultdict(int)
        self.tours = []
        self.events = defaultdict(int)
        self.money0 = 0.0
        self.injected = 0.0      # Startgeld von Schiffen, die nach dem Einlauf dazukommen
        self.ship_days = 0       # Schiffstage nach dem Einlauf
        self.ships_start = 0
        self.ballast_trips = 0


def spawn_event(city, day, rng, stats):
    ev = rng.choice(EVENTS)
    stats.events[ev["name"]] += 1
    until = day + ev["dauer"]
    if ev["art"] == "produktion":
        for g in ev["waren"]:
            if g in city.prod:
                city.prod_mult[g] = (ev["faktor"], until)
    elif ev["art"] == "verbrauch":
        for g in ev["waren"]:
            city.cons_mult[g] = (ev["faktor"], until)
    elif ev["art"] == "sperre":
        city.blockade_until = until
    else:
        raise ValueError(f"Unbekannte Ereignisart: {ev['art']}")


def record(day, cities, k, stats, writer):
    for g in GOODS:
        ps = []
        for c in cities:
            if g in c.stock:
                p = c.mid_price(g, k)
                ratio = p / c.base(g)
                stats.r_sum[g] += ratio
                stats.r_sq[g] += ratio * ratio
                stats.r_n[g] += 1
                if ratio >= PRICE_MAX - 0.01:
                    stats.r_hi[g] += 1
                if ratio <= PRICE_MIN + 0.01:
                    stats.r_lo[g] += 1
                ps.append(p)
                if writer and day % 5 == 0:
                    writer.writerow([day, c.name, g, round(p, 1), round(c.stock[g], 1)])
        if len(ps) >= 2:
            stats.gap_sum[g] += max(ps) / min(ps)
            stats.gap_n[g] += 1
    for c in cities:
        stats.sat_sum[c.name] += c.satisfaction
        stats.sat_min[c.name] = min(stats.sat_min[c.name], c.satisfaction)
        stats.sat_n[c.name] += 1


def ai_target(cities, args, zone):
    """Anzahl KI-Haendler einer Zone: AI_SHIPS_PER_1000 je 1000 Einwohner der Zone (--ships: feste
    Gesamtzahl, nach Einwohnern verteilt). Die Haendler bleiben in ihrer Zone."""
    pop = sum(c.pop0 for c in cities if c.zone == zone)   # Startbevoelkerung: wachsende Staedte -> groessere Schiffe, nicht mehr Schiffe
    if args.ships is not None:
        return round(args.ships * pop / sum(c.pop0 for c in cities))
    return round(AI_SHIPS_PER_1000 * pop / 1000)


def set_epoch(cities, year):
    """Epochenfaktoren fuer das Jahr setzen (wohnraum, ki_fracht, ki_tempo)."""
    global EP_FRACHT, EP_TEMPO, EP_NETZ
    EP_FRACHT = kurve("ki_fracht", year)
    EP_TEMPO = kurve("ki_tempo", year)
    EP_NETZ = kurve("netz_tempo", year)
    for c in cities:
        c.epoch_housing = kurve("wohnraum", year)


def land_traffic(cities, year):
    """Bahn und Lastwagen gleichen die Lager innerhalb einer Zone aus (epochen.json: ausgleich_*)."""
    for zone in dict.fromkeys(c.zone for c in cities):
        strength = kurve("ausgleich_" + ZONEN_ART.get(zone, "see"), year) * 0.25
        if strength <= 0:
            continue
        members = [c for c in cities if c.zone == zone]
        for g in GOODS:
            part = [c for c in members if g in c.stock]
            total_target = sum(c.target[g] for c in part)
            if total_target <= 0:
                continue
            mean = sum(c.stock[g] for c in part) / total_target
            for c in part:
                c.stock[g] = max(0.0, c.stock[g] + strength * (mean * c.target[g] - c.stock[g]))


def run(args):
    rng = random.Random(args.seed)
    cities = [City(c) for c in CITIES]
    set_epoch(cities, args.jahr)
    if args.jahr > 1651:                       # spaeter Start: die Staedte sind schon gewachsen
        for c in cities:
            c.pop = c.pop0 * kurve("wohnraum", args.jahr) * 0.9
            c.rescale()
            for g in c.stock:
                c.stock[g] = c.target[g]
    zones = list(dict.fromkeys(c.zone for c in cities))
    ships = [Ship(rng.choice([c for c in cities if c.zone == z])) for z in zones for _ in range(ai_target(cities, args, z))]
    stats = Stats()
    stats.ships_start = len(ships)
    writer = None
    fh = None
    if args.csv:
        fh = open(args.csv, "w", newline="", encoding="utf-8")
        writer = csv.writer(fh)
        writer.writerow(["tag", "stadt", "ware", "preis", "bestand"])

    for day in range(args.days):
        year = args.jahr + max(0, day - WARMUP) / 365.25
        set_epoch(cities, year)
        stats.on = day >= WARMUP
        if day == WARMUP:
            stats.money0 = sum(s.money for s in ships)
        if not args.no_events:
            for c in cities:
                if rng.random() < EVENT_RATE:
                    spawn_event(c, day, rng, stats)
        for c in cities:
            short = c.step(day, stats)
            if short and stats.on:
                stats.short_days[c.name] += 1
        land_traffic(cities, year)
        # Mit der Bevoelkerung kommen neue Haendler dazu (es verschwinden keine)
        for z in zones:
            while sum(1 for s in ships if s.city.zone == z) < ai_target(cities, args, z):
                ships.append(Ship(rng.choice([c for c in cities if c.zone == z])))
                if stats.on:
                    stats.injected += START_MONEY
        if stats.on:
            stats.ship_days += len(ships)
        order = ships[:]
        rng.shuffle(order)
        for s in order:
            s.act(day, cities, rng, args.k, stats)
        if stats.on:
            record(day, cities, args.k, stats, writer)
    if fh:
        fh.close()
    return cities, ships, stats


# ======================================================================
# 4) BERICHT
# ======================================================================
def pct(values, p):
    v = sorted(values)
    return v[min(len(v) - 1, int(len(v) * p))]


def report(args, cities, ships, stats):
    days = args.days - WARMUP
    ok = lambda b: "OK " if b else "!! "
    checks = []

    print(f"\nSimulation: {args.days} Tage ({WARMUP} Einlauf), {len(cities)} Staedte, "
          f"{stats.ships_start} -> {len(ships)} KI-Schiffe, k={args.k}, Seed={args.seed}, "
          f"Ereignisse={'aus' if args.no_events else 'an'}")
    if stats.events:
        print("Ereignisse:", ", ".join(f"{k} {v}" for k, v in sorted(stats.events.items())))

    # --- Preise ---------------------------------------------------------
    print("\n=== PREISE (in % vom Basispreis, ueber alle Staedte und Tage) ===")
    print(f"{'Ware':<11}{'Mittel':>8}{'Streuung':>10}{'am Deckel':>11}{'am Boden':>10}{'Gefaelle':>10}")
    worst = 0.0
    for g in GOODS:
        n = stats.r_n[g]
        if not n:
            continue
        mean = stats.r_sum[g] / n
        sd = math.sqrt(max(stats.r_sq[g] / n - mean * mean, 0))
        hi = 100 * stats.r_hi[g] / n
        lo = 100 * stats.r_lo[g] / n
        gap = stats.gap_sum[g] / stats.gap_n[g] if stats.gap_n[g] else 1
        worst = max(worst, hi, lo)
        print(f"{g:<11}{100*mean:>7.0f}%{100*sd/mean:>9.0f}%{hi:>10.1f}%{lo:>9.1f}%{gap:>9.2f}x")
    print("  Gefaelle = mittleres Verhaeltnis teuerste/billigste Stadt (Handelschance)")
    checks.append((f"Kein Preis dauerhaft am Deckel/Boden (schlimmster Wert {worst:.0f}% der Stadt-Tage, Ziel <= 20%)",
                   worst <= 20))

    # --- Zufriedenheit -----------------------------------------------------
    print("\n=== STAEDTE ===")
    print(f"{'Stadt':<15}{'Zufriedenh.':>12}{'Minimum':>9}{'Tage Mangel':>13}{'Einwohner':>18}")
    sats = []
    for c in cities:
        m = stats.sat_sum[c.name] / stats.sat_n[c.name]
        sats.append((m, stats.sat_min[c.name]))
        print(f"{c.name:<15}{m:>12.0f}{stats.sat_min[c.name]:>9.0f}"
              f"{100*stats.short_days[c.name]/days:>12.0f}%{c.pop0:>9.0f} -> {c.pop:>5.0f}")
    shrunk = [c.name for c in cities if c.pop < c.pop0]
    checks.append((f"Keine Stadt schrumpft (Einwohner am Ende mindestens wie am Anfang); geschrumpft: "
                   f"{', '.join(shrunk) or 'keine'}", not shrunk))
    checks.append((f"Zufriedenheit: Mittel {statistics.mean(s[0] for s in sats):.0f} (Ziel >= 55), "
                   f"niedrigster Stadtschnitt {min(s[0] for s in sats):.0f} (Ziel >= 40)",
                   statistics.mean(s[0] for s in sats) >= 55 and min(s[0] for s in sats) >= 40))

    # --- Handel ------------------------------------------------------------
    total_value = sum(stats.vol_value.values()) or 1.0
    print("\n=== HANDEL (Anteil am gehandelten Warenwert) ===")
    low_goods = []
    print(f"{'Ware':<11}{'Wertanteil':>11}{'Einheiten':>11}{'% der Produktion':>18}")
    for g in sorted(GOODS, key=lambda x: -stats.vol_value[x]):
        share = 100 * stats.vol_value[g] / total_value
        moved = 100 * stats.vol_units[g] / (stats.produced[g] or 1) * args.days / days
        print(f"{g:<11}{share:>10.1f}%{stats.vol_units[g]:>11.0f}{moved:>17.0f}%")
        if moved < 10.0:
            low_goods.append(g)
    checks.append((f"Jede Ware wird relevant verschifft (>= 10% der Produktion); darunter: "
                   f"{', '.join(low_goods) or 'keine'}", not low_goods))

    n_tours = len(stats.tours) or 1
    top_routes = sorted(stats.routes.items(), key=lambda x: -x[1])[:5]
    print("\nHaeufigste Routen:")
    for (a, b), n in top_routes:
        print(f"  {a} -> {b}: {100*n/n_tours:.1f}% aller Touren")
    top_share = 100 * top_routes[0][1] / n_tours if top_routes else 0
    checks.append((f"Keine dominante Route (Spitze {top_share:.1f}% der Touren, Ziel <= 12%)", top_share <= 12))

    # --- Rendite -----------------------------------------------------------
    rois = [t[0] for t in stats.tours]
    tdays = [t[2] for t in stats.tours]
    per_ship_day = (sum(s.money for s in ships) - stats.money0 - stats.injected) / max(stats.ship_days, 1)
    payback = SHIP_COST / per_ship_day if per_ship_day > 0 else float("inf")
    print("\n=== RENDITE ===")
    print(f"Touren: {len(rois)}, Dauer im Mittel {statistics.mean(tdays):.1f} Tage, "
          f"Leerfahrten: {stats.ballast_trips} ({100*stats.ballast_trips/(stats.ballast_trips+len(rois)):.0f}% aller Fahrten)")
    print(f"Rendite pro Tour: Mittel {100*statistics.mean(rois):.0f}%, Median {100*statistics.median(rois):.0f}%, "
          f"P10 {100*pct(rois,0.1):.0f}%, P90 {100*pct(rois,0.9):.0f}%")
    by_good = defaultdict(list)
    for t in stats.tours:
        by_good[t[3]].append(t[0])
    print("Rendite je Ware (Mittel, Touren): " + ", ".join(
        f"{g} {100*statistics.mean(v):.0f}% ({len(v)})"
        for g, v in sorted(by_good.items(), key=lambda x: -statistics.mean(x[1]))))
    print(f"Gewinn pro Schiff und Tag (nach Unterhalt): {per_ship_day:.1f} Gulden")
    print(f"Amortisation eines Schiffs ({SHIP_COST} Gulden): {payback:.0f} Tage")
    checks.append((f"Mittlere Tourrendite {100*statistics.mean(rois):.0f}% (Ziel 10-30%)",
                   0.10 <= statistics.mean(rois) <= 0.30))
    checks.append((f"Schiff amortisiert sich in {payback:.0f} Tagen (Ziel 30-300)", 30 <= payback <= 300))

    # --- Verderb -----------------------------------------------------------
    prod_total = sum(stats.produced.values()) or 1.0
    waste_share = 100 * sum(stats.wasted.values()) / prod_total
    worst_g = max(GOODS, key=lambda g: stats.wasted[g] / (stats.produced[g] or 1))
    print(f"\nVerderb durch volle Lager: {waste_share:.1f}% der Produktion "
          f"(am meisten: {worst_g})")
    checks.append((f"Verderb {waste_share:.1f}% der Produktion (Ziel <= 8%)", waste_share <= 8))

    print("\n=== ERGEBNIS ===")
    for text, good in checks:
        print(ok(good) + text)
    print()
    return all(good for _, good in checks)


def main():
    ap = argparse.ArgumentParser(description="Wirtschaftssimulation Handelsspiel")
    ap.add_argument("--days", type=int, default=720)
    ap.add_argument("--ships", type=int, help="feste Anzahl KI-Haendlerschiffe (Standard: AI_SHIPS_PER_1000 je 1000 Einwohner)")
    ap.add_argument("--k", type=float, help="Preisempfindlichkeit (Standard: K)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--no-events", action="store_true")
    ap.add_argument("--jahr", type=float, default=1650.25, help="Startjahr fuer die Epochenkurven (Standard 1650: alles wie bisher)")
    ap.add_argument("--csv", help="Preisverlauf in CSV schreiben (alle 5 Tage)")
    ap.add_argument("--data", default=DEFAULT_DATA_DIR, help="Ordner mit den JSON-Daten")
    args = ap.parse_args()
    load_data(args.data)
    if args.k is None:
        args.k = K
    cities, ships, stats = run(args)
    all_ok = report(args, cities, ships, stats)
    if args.jahr > 1700:
        # Die Checks beschreiben die Segelschiffzeit. In spaeteren Epochen gleichen Bahn und Lastwagen
        # die Zonen aus, weniger Schiffshandel ist dort gewollt: Die Ergebnisse sind nur Information.
        print(f"Hinweis: Startjahr {args.jahr:.0f}. Die Checks gelten fuer die Zeit der Segelschiffe (1650), hier nur zur Information.")
        sys.exit(0)
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()

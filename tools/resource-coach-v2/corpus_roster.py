#!/usr/bin/env python3
"""Where does a player appear in the evidence? One answer per player, from every source.

Status (the only thing that decides control eligibility):
  ORDINARY-EVIDENCE      has an ordinary Resource Coach preview in the scored evidence
  HIST-QUARANTINE-ONLY   only quarantined canonical-workbook ORDINARY COACH previews
  NO-ORDINARY-EVIDENCE   everything else; historic/legacy appearances are comparison only

Categories listed for comparison (a player can have several):
  ordinary-preview     scored ordinary Resource Coach preview (calibration partition or x59 prospective)
  hist-ordinary        canonical-workbook ORDINARY COACH preview (quarantined stratum)
  reward-preview       Reward Coach preview only (outside the ordinary model)
  prospective-record   21 Sep prospective record without complete tier/class
  card-only            player-card state in the canonical corpus with no preview
  control-card         card frozen for a preregistered control arm
  legacy-academy       name appears in the legacy Academy calibration records (profiles/)

Usage:
  python tools/resource-coach-v2/corpus_roster.py --names "Michal Kawa" "LJDark leo" ...
  python tools/resource-coach-v2/corpus_roster.py --roster calibration/resource-coach-identification/corpus-roster-20260924.json
"""
from __future__ import annotations

import argparse
import base64
import gzip
import importlib.util
import json
import pathlib
import unicodedata

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CRI = ROOT / "calibration" / "resource-coach-identification"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return " ".join(s.casefold().replace(".", " ").split())


def _audit():
    spec = importlib.util.spec_from_file_location("structure_audit", HERE / "structure_audit.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def sources():
    sa = _audit()
    found: dict[str, dict[str, set]] = {}

    def add(name, cat, ref):
        found.setdefault(norm(name), {}).setdefault(cat, set()).add(ref)

    for e in sa.load_events():
        add(e["playerName"], "hist-ordinary" if e["hist"] else "ordinary-preview", e["event"])
    canon = json.loads(gzip.decompress(base64.b64decode((ROOT / "calibration/longitudinal-corpus/canonical-corpus-v1.json.gz.b64").read_text().strip())))
    for p in canon["players"]:
        add(p["name"], "card-only", p["_stateId"])
    for x in canon["experiments"]:
        if str(x["preOutcome"]["coach"].get("transferClass")).lower() == "reward":
            add(x["preOutcome"]["player"]["name"], "reward-preview", x["id"])
    chat = json.loads((CRI / "chat-locked-tests-20260923.json").read_text(encoding="utf-8"))
    for t in chat["tests"]:
        if str(t["coach"].get("transferClass")).lower() == "reward":
            add(chat["playerStates"][t["playerStateId"]]["playerName"], "reward-preview", t["testId"])
    pros = json.loads((CRI / "prospective-evidence-20260921.json").read_text(encoding="utf-8"))
    for pv in pros["previews"]:
        add(pv["name"], "reward-preview" if pv["family"] == "Reward" else "prospective-record", pv["id"])
    for f in sorted(CRI.glob("control-card-*.json")):
        c = json.loads(f.read_text(encoding="utf-8"))
        add(c["name"], "control-card", f.name)
    legacy = "\n".join(norm(p.read_text(encoding="utf-8")) for p in (ROOT / "profiles/calibration_data.json", ROOT / "profiles/player_seeds.json"))
    return found, legacy


def lookup(name: str, found, legacy) -> dict:
    key = norm(name)
    cats = {k: sorted(v) for k, v in found.get(key, {}).items()}
    if key in legacy:
        cats["legacy-academy"] = ["profiles/calibration_data.json or profiles/player_seeds.json (full-name text match)"]
    # Only scored ordinary Resource Coach previews make a player part of the ordinary-model evidence.
    # Legacy Academy records, cards, Reward previews, incomplete records and frozen control cards are
    # listed for comparison only and never change a player's status.
    if "ordinary-preview" in cats:
        status = "ORDINARY-EVIDENCE"
    elif "hist-ordinary" in cats:
        status = "HIST-QUARANTINE-ONLY"
    else:
        status = "NO-ORDINARY-EVIDENCE"
    return dict(name=name, status=status, appearsIn=cats)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--names", nargs="+")
    g.add_argument("--roster")
    args = ap.parse_args()
    found, legacy = sources()
    if args.names:
        for n in args.names:
            print(json.dumps(lookup(n, found, legacy), ensure_ascii=False))
        return
    roster = json.loads(pathlib.Path(args.roster).read_text(encoding="utf-8"))
    for p in roster["players"]:
        r = lookup(p["name"], found, legacy)
        mark = "" if r["status"] == p["status"] else f"   <-- roster says {p['status']}"
        print(f"{r['status']:15s} {p['name']:22s} {', '.join(sorted(r['appearsIn']))}{mark}")


if __name__ == "__main__":
    main()

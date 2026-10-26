"""Summarize an exported hosting log locally; never connects to a service."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import re


def summarize(lines, excluded=()):
    counts = Counter()
    failures = Counter()
    saved = set()
    decided = set()
    workspaces = defaultdict(set)
    visits = defaultdict(set)
    seen_requests = set()
    dates = []
    for line in lines:
        # Render exports may prefix the JSON message with a timestamp/log level.
        start = line.find('{"schema":"renewai.pilot.v1"')
        if start < 0:
            continue
        try:
            event = json.loads(line[start:])
            at = datetime.fromisoformat(event["at"])
            if at.tzinfo is None:
                continue
            at = at.astimezone(timezone.utc)
            request = event["request_ref"]
            if not re.fullmatch(r"[a-f0-9]{32}", request):
                continue
        except (ValueError, KeyError, TypeError):
            continue
        name = event.get("event")
        if not isinstance(name, str):
            continue
        workspace = event.get("workspace_ref")
        if workspace in excluded:
            continue
        # Re-exported overlapping logs must not inflate counts.
        identity = (request, name)
        if identity in seen_requests:
            continue
        seen_requests.add(identity)
        dates.append(at)
        if name == "workflow_request" and isinstance(event.get("operation"), str) and event.get("operation") in {
            "analyze", "save", "decision", "ai_insight", "portfolio",
        } and isinstance(event.get("outcome"), str) and event.get("outcome") in {"success", "rejected", "failure"}:
            counts[f'{event["operation"]}:{event["outcome"]}'] += 1
            continue
        if event.get("outcome") == "failure" and name in {
            "extraction", "pdf_text", "reminder_generation_failed",
        }:
            failures[name] += 1
        if not isinstance(workspace, str) or not re.fullmatch(r"[a-f0-9]{24}", workspace):
            continue
        if name == "portfolio_loaded":
            visits[workspace].add(at.date().isoformat())
        contract = event.get("contract_ref")
        if not isinstance(contract, str) or not re.fullmatch(r"[a-f0-9]{24}", contract):
            continue
        if name == "contract_saved":
            saved.add((workspace, contract))
            workspaces["saved"].add(workspace)
        elif name == "decision_saved" and event.get("decision_recorded") is True:
            decided.add((workspace, contract))
            workspaces["decided"].add(workspace)
    return {
        "scope": "observed exported events only; excludes pre-release history and missing logs",
        "first_event": min(dates).isoformat() if dates else None,
        "last_event": max(dates).isoformat() if dates else None,
        "workflow_requests": dict(sorted(counts.items())),
        "stage_failures": dict(sorted(failures.items())),
        "unique_saved_contracts": len(saved),
        "workspaces_with_saved_contract": len(workspaces["saved"]),
        "unique_contracts_with_recorded_decision": len(decided),
        "workspaces_with_recorded_decision": len(workspaces["decided"]),
        "observed_saved_contracts_also_with_recorded_decision": len(saved & decided),
        "workspaces_loading_portfolio_on_multiple_utc_days": sum(len(days) > 1 for days in visits.values()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path)
    parser.add_argument("--exclude-workspace-ref", action="append", default=[],
                        help="Exclude a known internal/QA workspace pseudonym; repeat as needed")
    args = parser.parse_args()
    with args.log.open() as lines:
        print(json.dumps(summarize(lines, args.exclude_workspace_ref), indent=2))


if __name__ == "__main__":
    main()

"""Opt-in, reproducible Ask benchmark on checked-in fictional PDFs only.

No database/Auth client, email, production API or customer files are used.
The model is evaluated by explicit expectations, not a second model judge.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

BACKEND = Path(__file__).resolve().parents[1]
FIXTURES = BACKEND / "fixtures/ask_renewai_benchmark.json"
sys.path.insert(0, str(BACKEND))


def load_cases():
    data = json.loads(FIXTURES.read_text())
    if data.get("schema_version") != "renewai.ask-benchmark.v1":
        raise ValueError("Unsupported benchmark schema")
    cases = data["cases"]
    if len({case["id"] for case in cases}) != len(cases):
        raise ValueError("Duplicate benchmark IDs")
    for case in cases:
        if case["expect"]["status"] not in {"answered", "abstained"}:
            raise ValueError("Invalid expectation")
        pages = expanded_pages(case)
        if not 1 <= len(pages) <= 200 or any(not isinstance(p, str) for p in pages):
            raise ValueError("Invalid synthetic pages")
        if any(p > len(pages) or p < 1 for p in case["expect"].get("required_pages", [])):
            raise ValueError("Expected page is outside the fixture")
    return cases


def expanded_pages(case):
    prefix = case.get("prefix", {})
    return [prefix.get("page", "")] * prefix.get("count", 0) + case["pages"]


def synthetic_pdf(case):
    import pymupdf
    from pdf_input import extract_pdf_pages
    with pymupdf.open() as document:
        for text in expanded_pages(case):
            page = document.new_page()
            available = page.insert_textbox((48, 48, 547, 790), text, fontsize=10)
            if available < 0:
                raise ValueError("Synthetic page overflow; fix the fixture")
        content = document.tobytes()
    return extract_pdf_pages(content), hashlib.sha256(content).hexdigest()


def evaluate(case, pages, result, document_hash):
    failures = []
    expected = case["expect"]
    if result.get("status") != expected["status"]:
        failures.append("wrong_status")
    citations = result.get("citations", [])
    if not isinstance(citations, list) or len(citations) > 3:
        return failures + ["invalid_citation_list"]
    if result.get("document_sha256") != document_hash:
        failures.append("wrong_document_hash")
    if result.get("requires_human_review") is not True:
        failures.append("missing_human_review")
    cited_pages = set()
    for span in citations:
        try:
            page, start, end, quote = (span[key] for key in ("page", "start", "end", "quote"))
            if (type(page) is not int or not 1 <= page <= len(pages) or
                    type(start) is not int or type(end) is not int or
                    not 0 <= start < end <= len(pages[page - 1]) or
                    pages[page - 1][start:end] != quote):
                failures.append("non_exact_citation")
            else:
                cited_pages.add(page)
        except (KeyError, TypeError):
            failures.append("invalid_citation")
    if result.get("status") == "abstained" and citations:
        failures.append("abstention_has_citations")
    if result.get("status") == "answered" and not citations:
        failures.append("answer_has_no_citations")
    if expected["status"] == "answered":
        if not set(expected.get("required_pages", [])) <= cited_pages:
            failures.append("missing_required_page")
        if set(expected.get("forbidden_pages", [])) & cited_pages:
            failures.append("forbidden_page")
        text = " ".join(" ".join(span.get("quote", "").split()) for span in citations)
        if any(" ".join(anchor.split()) not in text for anchor in expected.get("required_text", [])):
            failures.append("missing_required_qualification")
    return failures


def signature():
    files = [BACKEND / "contract_assistant.py", BACKEND / "pdf_input.py", FIXTURES, Path(__file__)]
    return hashlib.sha256(b"\0".join(path.read_bytes() for path in files)).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true", help="Explicitly allow configured-provider requests")
    parser.add_argument("--env-file", type=Path, help="Read AI settings only; never copy database/email credentials")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=2, choices=range(1, 6))
    parser.add_argument("--interval-seconds", type=float, default=10)
    parser.add_argument("--only", help="Comma-separated fixture IDs; report is explicitly a subset")
    parser.add_argument("--resume", action="store_true", help="Reuse completed results at the identical source signature; rerun provider errors")
    args = parser.parse_args()
    if args.interval_seconds < 0:
        parser.error("Interval cannot be negative")
    if args.env_file:
        from dotenv import dotenv_values
        private = dotenv_values(args.env_file)
        for key in ("AI_PROVIDER", "GROQ_API_KEY", "GROQ_MODEL", "OLLAMA_MODEL"):
            if private.get(key):
                os.environ[key] = private[key]
        private.clear()
    import contract_assistant as assistant
    cases = load_cases()
    if args.only:
        chosen = set(args.only.split(","))
        if chosen - {case["id"] for case in cases}:
            parser.error("Unknown case ID")
        cases = [case for case in cases if case["id"] in chosen]
    source_signature = signature()
    report = {"schema_version": "renewai.ask-benchmark-result.v1", "signature": source_signature,
              "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=BACKEND, text=True).strip(),
              "provider": assistant.config.AI_PROVIDER, "model": assistant.config.GROQ_MODEL if assistant.config.AI_PROVIDER == "groq" else assistant.config.OLLAMA_MODEL,
              "live": args.live, "case_count": len(cases), "repeats": args.repeats,
              "subset": bool(args.only), "selected_case_ids": [case["id"] for case in cases], "results": []}
    if args.resume:
        old = json.loads(args.output.read_text())
        for key in ("signature", "provider", "model", "live", "case_count", "repeats", "subset", "selected_case_ids"):
            if old.get(key) != report[key]:
                parser.error("Resume must use identical source, model and selection settings")
        report["results"] = [row for row in old["results"] if row.get("outcome") != "provider_error"]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    last_call = 0
    calls = 0
    original = assistant.select_evidence

    def observed_select(question, candidates):
        nonlocal last_call, calls
        if not args.live:
            raise RuntimeError("Dry run unexpectedly requested a provider")
        remaining = args.interval_seconds - (time.monotonic() - last_call)
        if remaining > 0:
            time.sleep(remaining)
        last_call = time.monotonic()
        calls += 1
        return original(question, candidates)

    assistant.select_evidence = observed_select
    try:
        for repeat in range(1, args.repeats + 1):
            for case in cases:
                if any(row["id"] == case["id"] and row["repeat"] == repeat for row in report["results"]):
                    continue
                pages, document_hash = synthetic_pdf(case)
                started = time.monotonic()
                row = {"id": case["id"], "category": case["category"], "repeat": repeat,
                       "expected": case["expect"]["status"]}
                before = calls
                if not args.live:
                    candidates = assistant.retrieve_passages(pages, case["question"])
                    row.update(outcome="dry_run", candidate_pages=[p["page"] for p in candidates])
                else:
                    try:
                        result = assistant.answer_question(pages, case["question"], document_hash)
                        failures = evaluate(case, pages, result, document_hash)
                        row.update(outcome="failed" if failures else "passed", failures=failures,
                                   actual=result["status"], cited_pages=[p["page"] for p in result["citations"]])
                    except Exception as exc:
                        row.update(outcome="provider_error", error_type=type(exc).__name__,
                                   http_status=getattr(exc, "status_code", None))
                row.update(provider_calls=calls - before, duration_ms=round((time.monotonic() - started) * 1000))
                report["results"].append(row)
                report["summary"] = {name: sum(r["outcome"] == name for r in report["results"])
                                     for name in ("passed", "failed", "provider_error", "dry_run")}
                args.output.write_text(json.dumps(report, indent=2) + "\n")
                print(f'{case["id"]} repeat={repeat} {row["outcome"]} expected={row["expected"]} actual={row.get("actual", "-")}', flush=True)
        print(json.dumps(report["summary"]), flush=True)
        return 1 if report["summary"]["failed"] or report["summary"]["provider_error"] else 0
    finally:
        assistant.select_evidence = original


if __name__ == "__main__":
    raise SystemExit(main())

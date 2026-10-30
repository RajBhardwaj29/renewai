"""Deterministic benchmark checks; no live provider calls in unit tests."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).with_name("tools") / "benchmark_contract_assistant.py"
spec = importlib.util.spec_from_file_location("assistant_benchmark", path)
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


class BenchmarkTests(unittest.TestCase):
    def test_all_fictional_cases_roundtrip_pdf_with_valid_expectations(self):
        cases = benchmark.load_cases()
        self.assertEqual(len(cases), 26)
        self.assertEqual(len({case["id"] for case in cases}), 26)
        for case in cases:
            with self.subTest(case=case["id"]):
                pages, digest = benchmark.synthetic_pdf(case)
                self.assertEqual(len(digest), 64)
                self.assertEqual(len(pages), len(benchmark.expanded_pages(case)))
                for original, extracted in zip(benchmark.expanded_pages(case), pages):
                    self.assertEqual(" ".join(original.split()), " ".join(extracted.split()))

    def test_evaluator_rejects_made_up_quotes_and_missing_qualifications(self):
        case = {"expect": {"status": "answered", "required_pages": [1, 2], "required_text": ["except for breach"]}}
        pages = ["Fees are non-refundable", "except for breach"]
        spans = [{"page": n, "start": 0, "end": len(text), "quote": text} for n, text in enumerate(pages, 1)]
        result = {"status": "answered", "citations": spans, "document_sha256": "a" * 64, "requires_human_review": True}
        self.assertEqual(benchmark.evaluate(case, pages, result, "a" * 64), [])
        wrong = deepcopy(result); wrong["citations"][0]["quote"] = "Invented term"
        self.assertIn("non_exact_citation", benchmark.evaluate(case, pages, wrong, "a" * 64))
        wrong = deepcopy(result); wrong["citations"].pop()
        failures = benchmark.evaluate(case, pages, wrong, "a" * 64)
        self.assertIn("missing_required_page", failures)
        self.assertIn("missing_required_qualification", failures)

    def test_evaluator_never_counts_unsafe_answers_or_empty_answers_as_passes(self):
        result = {"status": "answered", "citations": [], "document_sha256": "a" * 64, "requires_human_review": True}
        self.assertIn("wrong_status", benchmark.evaluate({"expect": {"status": "abstained"}}, ["x"], result, "a" * 64))
        self.assertIn("answer_has_no_citations", benchmark.evaluate({"expect": {"status": "answered"}}, ["x"], result, "a" * 64))
        result.update(status="abstained", citations=[{"page": 1, "start": 0, "end": 1, "quote": "x"}])
        self.assertIn("abstention_has_citations", benchmark.evaluate({"expect": {"status": "abstained"}}, ["x"], result, "a" * 64))

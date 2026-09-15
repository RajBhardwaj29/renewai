import unittest

from datetime import (
    date,
    timedelta,
)

from types import SimpleNamespace

from dateutil.relativedelta import (
    relativedelta,
)

from renewal_engine import (
    calculate_renewal_intelligence,
)


def make_contract(
    *,
    end_date,
    renewal_date,
    cancellation_deadline,
):
    return SimpleNamespace(
        start_date=None,

        end_date=
            end_date.isoformat(),

        renewal_date=
            renewal_date.isoformat(),

        cancellation_deadline=
            cancellation_deadline.isoformat(),

        initial_term_months=12,
        renewal_term_months=12,

        renewal_structure=
            "fixed_term_auto_renewal",

        auto_renewal=True,

        notice_period_days=75,
        notice_period_value=75,
        notice_period_unit="days",
        notice_period_anchor="end_date",

        notice_window_start_value=None,
        notice_window_start_unit=None,
        notice_window_end_value=None,
        notice_window_end_unit=None,
    )


class ExplicitDeadlineTests(
    unittest.TestCase
):

    def test_explicit_deadline_beats_derived_deadline(
        self
    ):
        today = date.today()

        end_date = (
            today
            + timedelta(days=365)
        )

        renewal_date = (
            end_date
            + timedelta(days=1)
        )

        # Deliberately differs by one day from:
        # end_date - 75 days
        explicit_deadline = (
            end_date
            - timedelta(days=74)
        )

        contract = make_contract(
            end_date=end_date,
            renewal_date=renewal_date,
            cancellation_deadline=
                explicit_deadline,
        )

        result = (
            calculate_renewal_intelligence(
                contract
            )
        )

        self.assertEqual(
            result[
                "cancellation_deadline"
            ],
            explicit_deadline.isoformat(),
        )


    def test_explicit_deadline_not_reused_for_later_cycle(
        self
    ):
        today = date.today()

        first_renewal_date = (
            today
            - timedelta(days=30)
        )

        original_end_date = (
            first_renewal_date
            - timedelta(days=1)
        )

        original_explicit_deadline = (
            original_end_date
            - timedelta(days=75)
        )

        contract = make_contract(
            end_date=
                original_end_date,

            renewal_date=
                first_renewal_date,

            cancellation_deadline=
                original_explicit_deadline,
        )

        result = (
            calculate_renewal_intelligence(
                contract
            )
        )

        next_renewal_date = (
            first_renewal_date
            + relativedelta(months=12)
        )

        current_term_end = (
            next_renewal_date
            - timedelta(days=1)
        )

        expected_deadline = (
            current_term_end
            - timedelta(days=75)
        )

        self.assertEqual(
            result[
                "cancellation_deadline"
            ],
            expected_deadline.isoformat(),
        )

        self.assertNotEqual(
            result[
                "cancellation_deadline"
            ],
            original_explicit_deadline.isoformat(),
        )


if __name__ == "__main__":
    unittest.main()
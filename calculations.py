"""
Pure budgeting calculations for the household waterfall model.

Unchanged from every previous version of this app - pure Python, no UI or
database dependency, so it always ports without modification.
"""

from dataclasses import dataclass


@dataclass
class WaterfallResult:
    cal_income: float
    dani_income: float
    total_income: float

    bills_total: float

    allowance_per_person: float
    allowance_total: float

    savings_rate: float
    cal_individual_savings: float
    dani_individual_savings: float
    individual_savings_total: float

    remainder: float          # amount available for joint savings (can be negative)
    is_shortfall: bool

    easy_access_target: float
    current_easy_access_balance: float
    to_easy_access: float
    to_long_term: float


def calculate_waterfall(
    cal_income: float,
    dani_income: float,
    bills_total: float,
    allowance_per_person: float,
    savings_rate: float,
    easy_access_target: float,
    current_easy_access_balance: float,
) -> WaterfallResult:
    """Run the full monthly waterfall and return every intermediate figure.

    All monetary inputs are plain floats (GBP). savings_rate is a fraction
    (0.15 for 15%), never a whole number.
    """
    if savings_rate < 0 or savings_rate > 1:
        raise ValueError("savings_rate must be between 0 and 1 (e.g. 0.15 for 15%)")
    for name, value in (
        ("cal_income", cal_income),
        ("dani_income", dani_income),
        ("bills_total", bills_total),
        ("allowance_per_person", allowance_per_person),
        ("easy_access_target", easy_access_target),
        ("current_easy_access_balance", current_easy_access_balance),
    ):
        if value < 0:
            raise ValueError(f"{name} cannot be negative")

    total_income = cal_income + dani_income
    allowance_total = allowance_per_person * 2

    cal_individual_savings = round(cal_income * savings_rate, 2)
    dani_individual_savings = round(dani_income * savings_rate, 2)
    individual_savings_total = cal_individual_savings + dani_individual_savings

    remainder = round(
        total_income - bills_total - allowance_total - individual_savings_total, 2
    )
    is_shortfall = remainder < 0

    if is_shortfall:
        to_easy_access = 0.0
        to_long_term = 0.0
    else:
        easy_access_gap = max(0.0, easy_access_target - current_easy_access_balance)
        to_easy_access = round(min(remainder, easy_access_gap), 2)
        to_long_term = round(remainder - to_easy_access, 2)

    return WaterfallResult(
        cal_income=cal_income,
        dani_income=dani_income,
        total_income=total_income,
        bills_total=bills_total,
        allowance_per_person=allowance_per_person,
        allowance_total=allowance_total,
        savings_rate=savings_rate,
        cal_individual_savings=cal_individual_savings,
        dani_individual_savings=dani_individual_savings,
        individual_savings_total=individual_savings_total,
        remainder=remainder,
        is_shortfall=is_shortfall,
        easy_access_target=easy_access_target,
        current_easy_access_balance=current_easy_access_balance,
        to_easy_access=to_easy_access,
        to_long_term=to_long_term,
    )

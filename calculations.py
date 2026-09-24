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

    cal_personal_bills: float
    dani_personal_bills: float
    joint_bills_total: float
    cal_savings_base: float
    dani_savings_base: float

    allowance_per_person: float
    allowance_total: float

    savings_rate: float
    cal_individual_savings: float
    dani_individual_savings: float
    individual_savings_total: float

    # What each person actually needs to send to the joint account, once
    # their own bills (paid straight from their own account), their
    # allowance and their individual savings are set aside first. Can go
    # negative in an edge case (see calculate_waterfall docstring) - the UI
    # should flag that rather than transfer a negative amount.
    cal_to_joint: float
    dani_to_joint: float

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
    cal_personal_bills: float = 0.0,
    dani_personal_bills: float = 0.0,
) -> WaterfallResult:
    """Run the full monthly waterfall and return every intermediate figure.

    All monetary inputs are plain floats (GBP). savings_rate is a fraction
    (0.15 for 15%), never a whole number.

    cal_personal_bills / dani_personal_bills are each person's own
    Cal-tagged / Dani-tagged bills (a subset of bills_total, which still
    includes Joint-tagged bills too). Individual savings is calculated on
    each person's income *after* their own personal bills are deducted, so
    someone with larger personal bills (e.g. CMS, a repayment) doesn't have
    their savings base propped up by money that's already spoken for. This
    doesn't change how much money the household has overall - the joint
    pot still ends up with the exact same total either way - it just makes
    sure one person's personal bills aren't quietly reducing the other
    person's fair share of individual savings.

    Also returns cal_to_joint / dani_to_joint: the single transfer each
    person needs to make into the joint account, on the assumption that
    income lands in each person's own personal account first, personal
    bills are paid directly from there (no transfer needed), and the
    allowance and individual savings amounts are moved straight to that
    person's own everyday-spending and savings accounts rather than being
    routed via joint and back. This is a different way of physically
    moving the same money - not a different model - so the household
    totals (bills, allowances, individual savings, joint savings) are
    identical either way.
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
        ("cal_personal_bills", cal_personal_bills),
        ("dani_personal_bills", dani_personal_bills),
    ):
        if value < 0:
            raise ValueError(f"{name} cannot be negative")

    total_income = cal_income + dani_income
    allowance_total = allowance_per_person * 2

    # Savings base = income net of that person's own personal bills, floored
    # at 0 so someone whose personal bills exceed their income never gets a
    # negative savings figure.
    cal_savings_base = max(0.0, cal_income - cal_personal_bills)
    dani_savings_base = max(0.0, dani_income - dani_personal_bills)

    cal_individual_savings = round(cal_savings_base * savings_rate, 2)
    dani_individual_savings = round(dani_savings_base * savings_rate, 2)
    individual_savings_total = cal_individual_savings + dani_individual_savings

    joint_bills_total = round(bills_total - cal_personal_bills - dani_personal_bills, 2)

    cal_to_joint = round(cal_savings_base - cal_individual_savings - allowance_per_person, 2)
    dani_to_joint = round(dani_savings_base - dani_individual_savings - allowance_per_person, 2)

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
        cal_personal_bills=cal_personal_bills,
        dani_personal_bills=dani_personal_bills,
        joint_bills_total=joint_bills_total,
        cal_savings_base=cal_savings_base,
        dani_savings_base=dani_savings_base,
        allowance_per_person=allowance_per_person,
        allowance_total=allowance_total,
        savings_rate=savings_rate,
        cal_individual_savings=cal_individual_savings,
        dani_individual_savings=dani_individual_savings,
        individual_savings_total=individual_savings_total,
        cal_to_joint=cal_to_joint,
        dani_to_joint=dani_to_joint,
        remainder=remainder,
        is_shortfall=is_shortfall,
        easy_access_target=easy_access_target,
        current_easy_access_balance=current_easy_access_balance,
        to_easy_access=to_easy_access,
        to_long_term=to_long_term,
    )

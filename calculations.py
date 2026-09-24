"""
Pure budgeting calculations for the household waterfall model.

Pure Python, no UI or database dependency, so it always ports without
modification.

MODEL (v3 - "joint-first" with proportional personal savings):

1. Each person's income minus their own personal (Cal/Dani-tagged) bills
   is their "remainder" - paid straight from their own account, no
   transfer needed for the bills themselves.
2. Both remainders transfer 100% into the joint account (the "pot").
3. The pot pays joint-tagged bills.
4. The pot pays out each person's allowance (flat, equal amount each).
5. Of what's left, `savings_rate` goes to joint savings (split between an
   easy-access buffer and long-term, as before).
6. Everything remaining is the personal savings pot, split between Cal and
   Dani in proportion to how much each of them originally contributed to
   the pot in step 2 (their own remainder as a share of the combined pot).

This replaces the earlier model where each person's individual savings was
a fixed rate applied to their own net-of-bills income, with joint savings
as the leftover. Here it's joint savings that's the fixed-rate slice, and
personal savings that's the leftover, shared out by contribution.
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

    # What each person contributes to the joint pot before any of joint's
    # own deductions (income minus their own personal bills), and their
    # share of the combined pot.
    cal_remainder: float
    dani_remainder: float
    pot: float
    cal_contribution_share: float
    dani_contribution_share: float

    allowance_per_person: float
    allowance_total: float

    savings_rate: float  # the JOINT savings rate (applied after bills + allowance)

    # Pot after joint bills and allowances are paid out - the base the
    # savings_rate is applied to. Negative means a shortfall: bills and
    # allowances alone exceed the pot.
    remainder: float
    is_shortfall: bool

    joint_savings: float  # = to_easy_access + to_long_term
    personal_savings_total: float
    cal_personal_savings: float
    dani_personal_savings: float

    easy_access_target: float
    current_easy_access_balance: float
    to_easy_access: float
    to_long_term: float

    # The single transfer each person needs to make into the joint account,
    # netted so nothing round-trips: their own remainder, minus the
    # allowance and personal savings that come back to them.
    cal_to_joint: float
    dani_to_joint: float


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
    (e.g. 0.30 for 30%), never a whole number, and is now the JOINT savings
    rate - see the module docstring for the full model.
    """
    if savings_rate < 0 or savings_rate > 1:
        raise ValueError("savings_rate must be between 0 and 1 (e.g. 0.30 for 30%)")
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
    joint_bills_total = round(bills_total - cal_personal_bills - dani_personal_bills, 2)

    cal_remainder = max(0.0, cal_income - cal_personal_bills)
    dani_remainder = max(0.0, dani_income - dani_personal_bills)
    pot = round(cal_remainder + dani_remainder, 2)

    if pot > 0:
        cal_contribution_share = cal_remainder / pot
        dani_contribution_share = dani_remainder / pot
    else:
        cal_contribution_share = 0.5
        dani_contribution_share = 0.5

    # Pot after joint bills and allowances - the base the joint savings
    # rate applies to. Can go negative (a real shortfall).
    remainder = round(pot - joint_bills_total - allowance_total, 2)
    is_shortfall = remainder < 0

    if is_shortfall:
        joint_savings = 0.0
        personal_savings_total = 0.0
        cal_personal_savings = 0.0
        dani_personal_savings = 0.0
        to_easy_access = 0.0
        to_long_term = 0.0
    else:
        joint_savings = round(remainder * savings_rate, 2)
        personal_savings_total = round(remainder - joint_savings, 2)
        cal_personal_savings = round(personal_savings_total * cal_contribution_share, 2)
        # Dani gets the rest, rather than her own independently-rounded
        # figure, so the two always sum exactly to personal_savings_total.
        dani_personal_savings = round(personal_savings_total - cal_personal_savings, 2)

        easy_access_gap = max(0.0, easy_access_target - current_easy_access_balance)
        to_easy_access = round(min(joint_savings, easy_access_gap), 2)
        to_long_term = round(joint_savings - to_easy_access, 2)

    cal_to_joint = round(cal_remainder - allowance_per_person - cal_personal_savings, 2)
    dani_to_joint = round(dani_remainder - allowance_per_person - dani_personal_savings, 2)

    return WaterfallResult(
        cal_income=cal_income,
        dani_income=dani_income,
        total_income=total_income,
        bills_total=bills_total,
        cal_personal_bills=cal_personal_bills,
        dani_personal_bills=dani_personal_bills,
        joint_bills_total=joint_bills_total,
        cal_remainder=cal_remainder,
        dani_remainder=dani_remainder,
        pot=pot,
        cal_contribution_share=cal_contribution_share,
        dani_contribution_share=dani_contribution_share,
        allowance_per_person=allowance_per_person,
        allowance_total=allowance_total,
        savings_rate=savings_rate,
        remainder=remainder,
        is_shortfall=is_shortfall,
        joint_savings=joint_savings,
        personal_savings_total=personal_savings_total,
        cal_personal_savings=cal_personal_savings,
        dani_personal_savings=dani_personal_savings,
        easy_access_target=easy_access_target,
        current_easy_access_balance=current_easy_access_balance,
        to_easy_access=to_easy_access,
        to_long_term=to_long_term,
        cal_to_joint=cal_to_joint,
        dani_to_joint=dani_to_joint,
    )

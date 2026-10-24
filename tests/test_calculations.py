"""Tests for calculate_waterfall - the pure maths behind every figure the app
shows. Run with:  python3 -m pytest tests/ -v
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from calculations import calculate_waterfall  # noqa: E402


def worked_example(**overrides):
    """The worked example from the handoff: Cal £4,500, Dani £2,000, Cal bills
    £1,500, Dani bills £100, joint bills £2,000, £250 allowance each, 30%."""
    args = dict(
        cal_income=4500.0,
        dani_income=2000.0,
        bills_total=3600.0,
        allowance_per_person=250.0,
        savings_rate=0.30,
        easy_access_target=5000.0,
        current_easy_access_balance=0.0,
        cal_personal_bills=1500.0,
        dani_personal_bills=100.0,
    )
    args.update(overrides)
    return calculate_waterfall(**args)


def test_worked_example():
    r = worked_example()
    assert r.cal_remainder == 3000.0
    assert r.dani_remainder == 1900.0
    assert r.pot == 4900.0
    assert r.joint_bills_total == 2000.0
    assert r.allowance_total == 500.0
    assert r.remainder == 2400.0
    assert r.joint_savings == 720.0
    assert r.personal_savings_total == 1680.0
    assert round(r.cal_contribution_share * 100, 2) == 61.22
    assert round(r.dani_contribution_share * 100, 2) == 38.78
    assert r.cal_personal_savings == 1028.57
    assert r.dani_personal_savings == 651.43
    assert r.is_shortfall is False


def test_personal_savings_sum_exactly_to_total():
    # An awkward split that would leak a penny if both sides were rounded.
    r = worked_example(cal_income=3333.33, dani_income=1111.11, bills_total=2100.0)
    assert r.cal_personal_savings + r.dani_personal_savings == pytest.approx(
        r.personal_savings_total, abs=1e-9
    )


def test_total_savings_independent_of_rate():
    totals = set()
    for rate in (0.0, 0.15, 0.30, 0.35, 0.40, 1.0):
        r = worked_example(savings_rate=rate)
        totals.add(round(r.joint_savings + r.personal_savings_total, 2))
    assert totals == {2400.0}


def test_transfer_netting_reconciles():
    r = worked_example()
    assert r.cal_to_joint + r.dani_to_joint == pytest.approx(
        r.joint_bills_total + r.joint_savings, abs=0.005
    )
    assert r.cal_to_joint == 1721.43
    assert r.dani_to_joint == 998.57


def test_shortfall_zeroes_savings_but_keeps_allowances():
    r = worked_example(cal_income=2500.0, dani_income=500.0)
    assert r.is_shortfall is True
    assert r.remainder == -1100.0
    assert r.allowance_total == 500.0
    assert r.joint_savings == 0.0
    assert r.personal_savings_total == 0.0
    assert r.cal_personal_savings == 0.0
    assert r.dani_personal_savings == 0.0
    assert r.to_easy_access == 0.0
    assert r.to_long_term == 0.0


def test_personal_bills_default_to_zero():
    r = calculate_waterfall(3000.0, 1000.0, 1500.0, 250.0, 0.30, 5000.0, 0.0)
    assert r.cal_personal_bills == 0.0
    assert r.dani_personal_bills == 0.0
    assert r.joint_bills_total == 1500.0
    assert r.pot == 4000.0
    assert r.cal_contribution_share == 0.75


def test_remainder_floors_at_zero_when_personal_bills_exceed_income():
    r = worked_example(dani_income=50.0)
    assert r.dani_remainder == 0.0
    assert r.cal_contribution_share == 1.0
    assert r.dani_personal_savings == 0.0


def test_rejects_rate_outside_zero_to_one():
    with pytest.raises(ValueError):
        worked_example(savings_rate=30)
    with pytest.raises(ValueError):
        worked_example(savings_rate=-0.1)


def test_rejects_negative_money():
    with pytest.raises(ValueError):
        worked_example(cal_income=-1.0)
    with pytest.raises(ValueError):
        worked_example(dani_personal_bills=-5.0)


def test_easy_access_target_already_met_sends_all_to_long_term():
    r = worked_example(current_easy_access_balance=6000.0)
    assert r.to_easy_access == 0.0
    assert r.to_long_term == 720.0

    partly = worked_example(current_easy_access_balance=4800.0)
    assert partly.to_easy_access == 200.0
    assert partly.to_long_term == 520.0

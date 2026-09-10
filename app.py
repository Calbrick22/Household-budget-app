"""
Household Budget - Streamlit app.

Run locally with:  streamlit run app.py
Deploys via Streamlit Community Cloud pointed at this repo - see README.md
for the one-time Postgres + secrets setup.
"""

import calendar
import csv
import datetime
import io
import uuid
from contextlib import contextmanager

import plotly.graph_objects as go
import streamlit as st

import db
from calculations import calculate_waterfall

st.set_page_config(page_title="Household Budget", page_icon="💰", layout="wide")

EASY_ACCESS_COLOR = "#06A77D"
LONG_TERM_COLOR = "#D5573B"
BILLS_COLOR = "#4a6fa5"
PERSONAL_COLOR = "#F2C14E"
SAVINGS_COLOR = "#06A77D"
GAUGE_BANDS = [(0, 50, "#D5573B"), (50, 80, "#F2C14E"), (80, 100, "#06A77D")]

CAL_BG = "#CDEDD6"      # pastel green
CAL_TEXT = "#265C3E"
DANI_BG = "#FBD2C4"     # pastel coral
DANI_TEXT = "#8B3A2B"

TAG_OPTIONS = ["Joint", "Cal", "Dani"]

# Each card "type" gets its own gradient - marker div + CSS :has() is the
# reliable way to colour an actual st.container(border=True), since it
# targets Streamlit's own DOM structure rather than guessing test-ids.
CARD_PALETTE = {
    "card-overview": ("#E3EFFB", "#F5FAFF"),      # dusty blue
    "card-charts": ("#FFF3D2", "#FFFBEF"),        # warm yellow
    "card-bills": ("#F6E9D2", "#FFFAF1"),         # sand
    "card-cal-income": ("#D3F0DC", "#EFFBF2"),    # pastel green
    "card-dani-income": ("#FCDCD0", "#FEF3EF"),   # pastel coral
    "card-easy": ("#D9F2E6", "#F1FBF6"),          # mint
    "card-settings": ("#EBDFF6", "#F9F5FC"),      # lavender
    "card-recurring": ("#FCE4CF", "#FFF7EF"),     # peach
    "card-trends": ("#DCEAFB", "#F3F8FF"),        # sky blue
    "card-history": ("#FBEBC8", "#FFFBF0"),       # warm cream/gold
    "card-add-month": ("#E4F0DE", "#F5FAF2"),     # soft leaf green
}


def _card_css() -> str:
    blocks = []
    for cls, (start, end) in CARD_PALETTE.items():
        blocks.append(f"""
        div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] div.{cls}) {{
            background: linear-gradient(135deg, {start} 0%, {end} 100%) !important;
            border-radius: 20px !important;
            padding: 22px 24px !important;
            border: 1px solid rgba(0,0,0,0.05) !important;
            transition: transform 0.18s ease, box-shadow 0.18s ease;
        }}
        div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] div.{cls}):hover {{
            transform: translateY(-3px);
            box-shadow: 0 12px 24px rgba(74, 64, 58, 0.12);
        }}
        """)
    return "\n".join(blocks)


CUSTOM_CSS = f"""
<style>
/* Warm gradient backdrop for the whole app */
.stApp {{
    background: linear-gradient(160deg, #FFF3E6 0%, #FFFBF5 55%, #FFEFDD 100%);
}}

/* Sidebar */
section[data-testid="stSidebar"] {{
    background: linear-gradient(180deg, #F7E0C7 0%, #F2D2AE 100%);
}}

/* Buttons - soft lift on hover */
.stButton > button, .stDownloadButton > button {{
    border-radius: 12px !important;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}}
.stButton > button:hover, .stDownloadButton > button:hover {{
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(95, 163, 127, 0.30);
}}

/* Tabs - a little more breathing room and a warmer active indicator */
button[data-baseweb="tab"] {{
    border-radius: 10px 10px 0 0 !important;
}}

/* Person-specific accent cards (Transfers, etc.) */
.person-card {{
    border-radius: 20px;
    padding: 20px 22px;
    margin-bottom: 12px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.06);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
}}
.person-card:hover {{
    transform: translateY(-3px);
    box-shadow: 0 12px 24px rgba(0,0,0,0.10);
}}
.cal-card {{ background: linear-gradient(135deg, {CAL_BG} 0%, #E9F8ED 100%); color: {CAL_TEXT}; }}
.dani-card {{ background: linear-gradient(135deg, {DANI_BG} 0%, #FEEAE2 100%); color: {DANI_TEXT}; }}
.person-card h4 {{ margin-top: 0; margin-bottom: 10px; }}
.person-card p {{ margin: 4px 0; font-size: 0.95rem; }}
.person-card .total-line {{ font-weight: 700; margin-top: 10px; font-size: 1.05rem; }}

{_card_css()}
</style>
"""


def inject_custom_css():
    st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


@contextmanager
def styled_container(marker_class: str, border: bool = True):
    """A st.container(border=True) that's reliably colourable via CSS -
    injects a hidden marker div that the :has() rules above target."""
    c = st.container(border=border)
    c.markdown(f'<div class="{marker_class}"></div>', unsafe_allow_html=True)
    with c:
        yield c


def person_card_html(title: str, spending: float, bills: float, savings: float, total: float, css_class: str) -> str:
    return f"""
    <div class="person-card {css_class}">
        <h4>{title}</h4>
        <p>Spending - £{spending:,.2f}</p>
        <p>Bills - £{bills:,.2f}</p>
        <p>Savings - £{savings:,.2f}</p>
        <p class="total-line">Total - £{total:,.2f}</p>
    </div>
    """


# ---------- navigation helpers ----------

def go_to(view: str, month_id: int = None):
    st.session_state.view = view
    if month_id is not None:
        st.session_state.month_id = month_id
    st.rerun()


def render_sidebar():
    with st.sidebar:
        st.markdown("## 💰 Household Budget")
        if st.button("🏠 Dashboard", width="stretch"):
            go_to("dashboard")
        if st.button("⚙ Settings", width="stretch"):
            go_to("settings")
        st.divider()
        view_labels = {
            "dashboard": "Dashboard", "month_entry": "Editing a month",
            "results": "Results", "settings": "Settings",
        }
        st.caption(f"Viewing: {view_labels.get(st.session_state.view, '')}")


# ---------- calculation helper ----------

@st.cache_data(ttl=5)
def calculate_month(month_id: int):
    settings = db.get_settings()
    allowance = float(settings["allowance_per_person"])
    savings_rate = float(settings["savings_rate"])
    target = float(settings["easy_access_target"])

    fin = db.get_month_financials(month_id)
    if fin is None:
        return None, None

    result = calculate_waterfall(
        fin["cal_income"], fin["dani_income"], fin["bills_total"], allowance,
        savings_rate, target, fin["current_easy_access_balance"],
    )
    return result, fin


# ---------- chart builders ----------

def build_pie_figure(result):
    savings_total = result.individual_savings_total + result.to_easy_access + result.to_long_term
    slices = [
        ("Bills", max(result.bills_total, 0), BILLS_COLOR),
        ("Personal spending", max(result.allowance_total, 0), PERSONAL_COLOR),
        ("Savings", max(savings_total, 0), SAVINGS_COLOR),
    ]
    slices = [s for s in slices if s[1] > 0]
    if not slices:
        return None
    fig = go.Figure(data=[go.Pie(
        labels=[s[0] for s in slices], values=[s[1] for s in slices],
        marker=dict(colors=[s[2] for s in slices]),
        hovertemplate="%{label}: £%{value:,.2f}<extra></extra>",
    )])
    fig.update_layout(margin=dict(l=10, r=10, t=20, b=10), height=320, paper_bgcolor="rgba(0,0,0,0)")
    return fig


def build_gauge_figure(result):
    target = result.easy_access_target
    balance = result.current_easy_access_balance
    percent = (balance / target * 100) if target > 0 else 0
    fig = go.Figure(go.Indicator(
        mode="gauge+number",
        value=max(0, min(percent, 100)),
        number={"suffix": "%"},
        title={"text": f"£{balance:,.0f} of £{target:,.0f} target"},
        gauge={
            "axis": {"range": [0, 100]},
            "bar": {"color": "#333333"},
            "steps": [{"range": [s, e], "color": c} for s, e, c in GAUGE_BANDS],
        },
    ))
    fig.update_layout(margin=dict(l=20, r=20, t=50, b=10), height=280, paper_bgcolor="rgba(0,0,0,0)")
    return fig


def build_trend_figure(confirmed_months):
    labels, easy_vals, long_vals = [], [], []
    for m in confirmed_months:
        result, _ = calculate_month(m["id"])
        labels.append(f"{calendar.month_abbr[m['month']]} {m['year']}")
        easy_vals.append(result.to_easy_access)
        long_vals.append(result.to_long_term)

    fig = go.Figure(data=[
        go.Bar(name="Easy-access", x=labels, y=easy_vals, marker_color=EASY_ACCESS_COLOR),
        go.Bar(name="Long-term", x=labels, y=long_vals, marker_color=LONG_TERM_COLOR),
    ])
    fig.update_layout(
        barmode="stack", yaxis_title="£",
        margin=dict(l=40, r=10, t=10, b=40), height=320,
        legend=dict(orientation="h", y=1.1), paper_bgcolor="rgba(0,0,0,0)",
    )
    return fig


# ---------- CSV export ----------

def build_csv_bytes() -> bytes:
    months = db.get_all_months()
    fieldnames = [
        "year", "month", "confirmed",
        "cal_income", "dani_income", "total_income",
        "bills_total", "allowance_per_person", "allowance_total",
        "savings_rate", "cal_individual_savings", "dani_individual_savings",
        "remainder", "is_shortfall",
        "current_easy_access_balance", "easy_access_target",
        "to_easy_access", "to_long_term",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for m in months:
        result, _ = calculate_month(m["id"])
        writer.writerow({
            "year": m["year"], "month": m["month"], "confirmed": m["confirmed"],
            "cal_income": result.cal_income, "dani_income": result.dani_income,
            "total_income": result.total_income, "bills_total": result.bills_total,
            "allowance_per_person": result.allowance_per_person,
            "allowance_total": result.allowance_total,
            "savings_rate": result.savings_rate,
            "cal_individual_savings": result.cal_individual_savings,
            "dani_individual_savings": result.dani_individual_savings,
            "remainder": result.remainder, "is_shortfall": result.is_shortfall,
            "current_easy_access_balance": result.current_easy_access_balance,
            "easy_access_target": result.easy_access_target,
            "to_easy_access": result.to_easy_access, "to_long_term": result.to_long_term,
        })
    return output.getvalue().encode("utf-8")


# ---------- month string parsing ----------

def parse_month_string(value: str):
    value = (value or "").strip()
    for fmt in ("%B %Y", "%b %Y"):
        try:
            dt = datetime.datetime.strptime(value, fmt)
            return dt.year, dt.month
        except ValueError:
            continue
    return None


def money_delta(current, previous):
    if previous is None:
        return None
    diff = current - previous
    if abs(diff) < 0.005:
        return None
    return f"£{diff:,.2f}"


def render_add_month_section():
    with styled_container("card-add-month"):
        st.subheader("+ Add New Month")
        suggested = datetime.date.today().strftime("%B %Y")
        month_text = st.text_input("Month and year", value=suggested, key="new_month_text")
        if st.button("Add / Open Month"):
            parsed = parse_month_string(month_text)
            if not parsed:
                st.error("Please enter it like 'September 2026' or 'Sep 2026'.")
            else:
                year, month = parsed
                month_id = db.get_or_create_month(year, month)
                st.session_state.pop("loaded_month_id", None)
                go_to("month_entry", month_id=month_id)


# ---------- Dashboard ----------

def render_dashboard():
    st.title("💰 Household Budget")

    render_add_month_section()

    all_months = db.get_all_months()
    confirmed_sorted = sorted(
        [m for m in all_months if m["confirmed"]], key=lambda m: (m["year"], m["month"])
    )
    latest = confirmed_sorted[-1] if confirmed_sorted else None
    previous = confirmed_sorted[-2] if len(confirmed_sorted) >= 2 else None

    tab_overview, tab_transfers, tab_trends, tab_history = st.tabs(
        ["Overview", "Transfers", "Trends", "History"]
    )

    # ---------- Overview ----------
    with tab_overview:
        if latest is None:
            st.info("No confirmed months yet - add one above.")
        else:
            result, fin = calculate_month(latest["id"])
            prev_result, _ = calculate_month(previous["id"]) if previous else (None, None)

            st.subheader(f"{calendar.month_name[fin['month']]} {fin['year']}")

            with styled_container("card-overview"):
                c1, c2, c3 = st.columns(3)
                c1.metric(
                    "Total income", f"£{result.total_income:,.2f}",
                    delta=money_delta(result.total_income, prev_result.total_income if prev_result else None),
                )
                c2.metric(
                    "Bills", f"£{result.bills_total:,.2f}",
                    delta=money_delta(result.bills_total, prev_result.bills_total if prev_result else None),
                    delta_color="inverse",
                )
                c3.metric(
                    "Allowances (both)", f"£{result.allowance_total:,.2f}",
                    delta=money_delta(result.allowance_total, prev_result.allowance_total if prev_result else None),
                )
                c4, c5, c6 = st.columns(3)
                c4.metric(
                    "Individual savings", f"£{result.individual_savings_total:,.2f}",
                    delta=money_delta(
                        result.individual_savings_total,
                        prev_result.individual_savings_total if prev_result else None,
                    ),
                )
                c5.metric(
                    "To easy-access", f"£{result.to_easy_access:,.2f}",
                    delta=money_delta(result.to_easy_access, prev_result.to_easy_access if prev_result else None),
                )
                c6.metric(
                    "To long-term", f"£{result.to_long_term:,.2f}",
                    delta=money_delta(result.to_long_term, prev_result.to_long_term if prev_result else None),
                )

            if result.is_shortfall:
                st.error(f"⚠ Shortfall this month: £{-result.remainder:,.2f}")

            col_a, col_b = st.columns(2)
            with col_a:
                with styled_container("card-charts"):
                    st.markdown("**Where this month's income went**")
                    pie = build_pie_figure(result)
                    if pie:
                        st.plotly_chart(pie, width="stretch")
            with col_b:
                with styled_container("card-charts"):
                    st.markdown("**Easy-access savings progress**")
                    st.plotly_chart(build_gauge_figure(result), width="stretch")

    # ---------- Transfers ----------
    with tab_transfers:
        if latest is None:
            st.info("No confirmed months yet.")
        else:
            result, fin = calculate_month(latest["id"])
            st.caption(
                "What to move out of the joint account once both paychecks have "
                "landed in it."
            )
            cal_total = result.allowance_per_person + fin["cal_bills"] + result.cal_individual_savings
            dani_total = result.allowance_per_person + fin["dani_bills"] + result.dani_individual_savings

            col_cal, col_dani = st.columns(2)
            with col_cal:
                st.markdown(
                    person_card_html(
                        "To Cal", result.allowance_per_person, fin["cal_bills"],
                        result.cal_individual_savings, cal_total, "cal-card",
                    ),
                    unsafe_allow_html=True,
                )
            with col_dani:
                st.markdown(
                    person_card_html(
                        "To Dani", result.allowance_per_person, fin["dani_bills"],
                        result.dani_individual_savings, dani_total, "dani-card",
                    ),
                    unsafe_allow_html=True,
                )

            st.caption(
                "Bills tagged 'Joint' aren't listed here - they're paid directly from "
                "the joint account, not transferred out."
            )

    # ---------- Trends ----------
    with tab_trends:
        recent = confirmed_sorted[-6:]
        if recent:
            with styled_container("card-trends"):
                st.subheader("Joint savings trend (last 6 months)")
                st.plotly_chart(build_trend_figure(recent), width="stretch")
        else:
            st.caption("Not enough confirmed months yet to show a trend.")

    # ---------- History ----------
    with tab_history:
        if st.button("⬇ Prepare CSV export"):
            st.session_state.csv_export_bytes = build_csv_bytes()
        if "csv_export_bytes" in st.session_state:
            st.download_button(
                "Download CSV", data=st.session_state.csv_export_bytes,
                file_name="household_budget_export.csv", mime="text/csv",
            )

        st.write("")
        st.subheader("Past months")
        if not all_months:
            st.caption("No months yet.")
        for m in all_months:
            label = f"{calendar.month_name[m['month']]} {m['year']}"
            status = "✅ Confirmed" if m["confirmed"] else "📝 Draft"
            with styled_container("card-history"):
                row1, row2, row3 = st.columns([4, 2, 2])
                row1.write(f"**{label}**  ·  {status}")
                if row2.button("Open", key=f"open_{m['id']}"):
                    st.session_state.pop("loaded_month_id", None)
                    go_to("month_entry", month_id=m["id"])
                if row3.button("Delete", key=f"delete_{m['id']}"):
                    st.session_state.pending_delete_id = m["id"]
                    st.rerun()

                if st.session_state.get("pending_delete_id") == m["id"]:
                    st.warning(f"Permanently delete {label}? This can't be undone.")
                    yes_col, no_col = st.columns(2)
                    if yes_col.button("Yes, delete", key=f"confirm_delete_{m['id']}"):
                        db.delete_month(m["id"])
                        st.session_state.pending_delete_id = None
                        st.rerun()
                    if no_col.button("Cancel", key=f"cancel_delete_{m['id']}"):
                        st.session_state.pending_delete_id = None
                        st.rerun()


# ---------- Month Entry ----------

def render_month_entry():
    month_id = st.session_state.month_id

    if st.session_state.get("loaded_month_id") != month_id:
        bills = db.get_bill_entries(month_id)
        for b in bills:
            b["local_id"] = str(uuid.uuid4())
        st.session_state.bill_rows = bills

        income = {(r["person"], r["source"]): float(r["amount"]) for r in db.get_income_entries(month_id)}
        month = db.get_month(month_id)

        st.session_state["cal_salary_input"] = income.get(("Cal", "Salary"), 0.0)
        st.session_state["cal_raf_input"] = income.get(("Cal", "RAF"), 0.0)
        st.session_state["dani_income_input"] = income.get(("Dani", "Income"), 0.0)
        st.session_state["easy_access_input"] = float(month["current_easy_access_balance"])
        st.session_state.loaded_month_id = month_id

    month = db.get_month(month_id)
    st.title(f"{calendar.month_name[month['month']]} {month['year']}")
    if month["confirmed"]:
        st.warning("⚠ This month is already confirmed - edits will change saved figures.")

    with styled_container("card-bills"):
        st.subheader("Bills & expenses this month")

        for row in list(st.session_state.bill_rows):
            lid = row["local_id"]
            c1, c2, c3, c4 = st.columns([4, 2, 2, 1])
            c1.text_input("Name", value=row["name"], key=f"name_{lid}", label_visibility="collapsed")
            c2.number_input(
                "Amount", value=float(row["amount"]), step=1.0, format="%.2f",
                key=f"amount_{lid}", label_visibility="collapsed",
            )
            c3.selectbox(
                "Tag", TAG_OPTIONS, index=TAG_OPTIONS.index(row["tag"]),
                key=f"tag_{lid}", label_visibility="collapsed",
            )
            if c4.button("✕", key=f"remove_{lid}"):
                if row.get("id"):
                    db.delete_bill_entry(row["id"])
                st.session_state.bill_rows = [
                    r for r in st.session_state.bill_rows if r["local_id"] != lid
                ]
                st.rerun()

        if st.button("+ Add one-off bill / expense"):
            st.session_state.bill_rows.append(
                {"id": None, "name": "", "amount": 0.0, "tag": "Joint", "local_id": str(uuid.uuid4())}
            )
            st.rerun()

        st.caption(
            "One-off items here don't carry forward to next month. To add or change "
            "a *recurring* bill (so it keeps appearing automatically), use Settings → "
            "Recurring bills."
        )

    col_cal, col_dani = st.columns(2)
    with col_cal:
        with styled_container("card-cal-income"):
            st.markdown(f"<h4 style='color:{CAL_TEXT};'>🟢 Cal's income</h4>", unsafe_allow_html=True)
            st.number_input("Salary (£)", step=1.0, format="%.2f", key="cal_salary_input")
            st.number_input("RAF (£)", step=1.0, format="%.2f", key="cal_raf_input")
    with col_dani:
        with styled_container("card-dani-income"):
            st.markdown(f"<h4 style='color:{DANI_TEXT};'>🩷 Dani's income</h4>", unsafe_allow_html=True)
            st.number_input("Income (£)", step=1.0, format="%.2f", key="dani_income_input")

    with styled_container("card-easy"):
        st.subheader("Easy-access savings pot")
        st.number_input(
            "Current easy-access balance (£)", step=1.0, format="%.2f", key="easy_access_input",
            help="Used to work out how much of this month's leftover tops the pot up to target.",
        )

    def save_all_fields():
        for row in st.session_state.bill_rows:
            lid = row["local_id"]
            name = st.session_state[f"name_{lid}"]
            amount = st.session_state[f"amount_{lid}"]
            tag = st.session_state[f"tag_{lid}"]
            if not name.strip():
                continue
            if row.get("id"):
                db.update_bill_entry(row["id"], name, amount, tag)
            else:
                db.add_bill_entry(month_id, name, amount, tag)

        db.set_income(month_id, "Cal", "Salary", st.session_state["cal_salary_input"])
        db.set_income(month_id, "Cal", "RAF", st.session_state["cal_raf_input"])
        db.set_income(month_id, "Dani", "Income", st.session_state["dani_income_input"])
        db.set_easy_access_balance(month_id, st.session_state["easy_access_input"])

    col1, col2 = st.columns(2)
    with col1:
        if st.button("Confirm inputs"):
            save_all_fields()
            st.session_state.pop("loaded_month_id", None)
            st.toast("Bills and incomes have been saved.", icon="✅")
            st.rerun()
    with col2:
        if st.button("Confirm & Calculate >", type="primary"):
            save_all_fields()
            go_to("results", month_id=month_id)


# ---------- Results ----------

def render_results():
    month_id = st.session_state.month_id
    result, fin = calculate_month(month_id)

    st.title(f"{calendar.month_name[fin['month']]} {fin['year']} - Results")

    with styled_container("card-overview"):
        st.write(f"Cal income: £{result.cal_income:,.2f}")
        st.write(f"Dani income: £{result.dani_income:,.2f}")
        st.write(f"**Total income: £{result.total_income:,.2f}**")
        st.write(f"Bills & expenses: -£{result.bills_total:,.2f}")
        st.write(f"Allowances (£{result.allowance_per_person:,.2f} x 2): -£{result.allowance_total:,.2f}")
        st.write(f"Cal's individual savings ({result.savings_rate:.0%}): -£{result.cal_individual_savings:,.2f}")
        st.write(f"Dani's individual savings ({result.savings_rate:.0%}): -£{result.dani_individual_savings:,.2f}")
        st.write(f"**Remaining for joint savings: £{result.remainder:,.2f}**")
        st.divider()
        st.write(f"To easy-access pot: £{result.to_easy_access:,.2f}")
        st.write(f"To long-term pot: £{result.to_long_term:,.2f}")

    if result.is_shortfall:
        st.error(
            f"⚠ Shortfall this month: income doesn't cover bills, allowances and savings "
            f"by £{-result.remainder:,.2f}. Nothing has been adjusted automatically - "
            f"decide how to handle it and re-edit the month if needed."
        )

    col1, col2 = st.columns(2)
    with col1:
        if st.button("< Back to edit"):
            go_to("month_entry", month_id=month_id)
    with col2:
        if st.button("Save month", type="primary"):
            db.set_month_confirmed(month_id, True)
            st.toast("This month has been saved.", icon="✅")
            st.balloons()
            go_to("dashboard")


# ---------- Settings ----------

def render_settings():
    st.title("⚙ Settings")

    settings = db.get_settings()
    with styled_container("card-settings"):
        st.subheader("Waterfall settings")
        allowance = st.number_input(
            "Personal allowance per person (£)", value=float(settings["allowance_per_person"]),
            step=1.0, format="%.2f",
        )
        rate_pct = st.number_input(
            "Individual savings rate (%)", value=float(settings["savings_rate"]) * 100,
            step=1.0, format="%.1f", min_value=0.0, max_value=100.0,
        )
        target = st.number_input(
            "Easy-access savings target (£)", value=float(settings["easy_access_target"]),
            step=1.0, format="%.2f",
        )

        st.caption(
            "Changes apply the next time a month's figures are calculated - past "
            "confirmed months are not recalculated retroactively."
        )

        if st.button("Save settings", type="primary"):
            db.set_setting("allowance_per_person", allowance)
            db.set_setting("savings_rate", rate_pct / 100)
            db.set_setting("easy_access_target", target)
            st.toast("Settings updated.", icon="✅")
            st.rerun()

    st.write("")
    render_recurring_bills_section()


def render_recurring_bills_section():
    with styled_container("card-recurring"):
        st.subheader("Recurring bills")
        st.caption(
            "This is the master list new months are built from. Update an amount here "
            "the moment it changes (e.g. the water bill going up) rather than waiting "
            "for next month - it'll carry forward from here on."
        )

        if st.session_state.get("template_rows_loaded") != True:
            templates = db.get_active_bill_templates()
            for t in templates:
                t["local_id"] = str(uuid.uuid4())
            st.session_state.template_rows = templates
            st.session_state.template_rows_loaded = True

        for row in list(st.session_state.template_rows):
            lid = row["local_id"]
            c1, c2, c3, c4 = st.columns([4, 2, 2, 1])
            c1.text_input("Name", value=row["name"], key=f"tmpl_name_{lid}", label_visibility="collapsed")
            c2.number_input(
                "Amount", value=float(row["default_amount"]), step=1.0, format="%.2f",
                key=f"tmpl_amount_{lid}", label_visibility="collapsed",
            )
            c3.selectbox(
                "Tag", TAG_OPTIONS, index=TAG_OPTIONS.index(row["tag"]),
                key=f"tmpl_tag_{lid}", label_visibility="collapsed",
            )
            if c4.button("✕", key=f"tmpl_remove_{lid}"):
                if row.get("id"):
                    db.deactivate_bill_template(row["id"])
                st.session_state.template_rows = [
                    r for r in st.session_state.template_rows if r["local_id"] != lid
                ]
                st.rerun()

        if st.button("+ Add recurring bill"):
            st.session_state.template_rows.append(
                {"id": None, "name": "", "default_amount": 0.0, "tag": "Joint", "local_id": str(uuid.uuid4())}
            )
            st.rerun()

        if st.button("Save recurring bills", type="primary"):
            for row in st.session_state.template_rows:
                lid = row["local_id"]
                name = st.session_state[f"tmpl_name_{lid}"]
                amount = st.session_state[f"tmpl_amount_{lid}"]
                tag = st.session_state[f"tmpl_tag_{lid}"]
                if not name.strip():
                    continue
                if row.get("id"):
                    db.update_bill_template(row["id"], name, amount, tag)
                else:
                    db.add_bill_template(name, amount, tag)
            st.session_state.template_rows_loaded = False
            st.toast("Recurring bills updated.", icon="✅")
            st.rerun()

        st.caption(
            "Removing a bill here only stops it appearing in *future* new months - "
            "it won't touch any month you've already created."
        )


# ---------- password gate ----------

def check_password() -> bool:
    """Simple shared-password gate - no usernames, just one password for
    both of you, set in secrets.toml as app_password."""
    if st.session_state.get("password_correct", False):
        return True

    st.title("💰 Household Budget")
    entered = st.text_input("Password", type="password", key="password_input")
    if entered:
        if entered == st.secrets.get("app_password"):
            st.session_state.password_correct = True
            st.rerun()
        else:
            st.error("Incorrect password.")
    return False


# ---------- main ----------

def main():
    inject_custom_css()

    if not check_password():
        st.stop()

    if "view" not in st.session_state:
        st.session_state.view = "dashboard"

    db.init_db()
    render_sidebar()

    if st.session_state.view == "dashboard":
        render_dashboard()
    elif st.session_state.view == "month_entry":
        render_month_entry()
    elif st.session_state.view == "results":
        render_results()
    elif st.session_state.view == "settings":
        render_settings()
    else:
        st.session_state.view = "dashboard"
        st.rerun()


if __name__ == "__main__":
    main()

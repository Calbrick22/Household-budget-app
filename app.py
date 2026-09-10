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

CAL_BG = "#CDEDD6"      # pastel green
CAL_TEXT = "#265C3E"
DANI_BG = "#FBD2C4"     # pastel coral
DANI_TEXT = "#8B3A2B"

HERO_ACCENT = "#2F8F5B"   # sharper sage green for the hero card's headline number

TAG_OPTIONS = ["Joint", "Cal", "Dani"]

# Each card "type" gets its own gradient + accent border - marker div + CSS
# :has() is the reliable way to colour an actual st.container(border=True),
# since it targets Streamlit's own DOM structure rather than guessing.
# (start, end, accent-border)
CARD_PALETTE = {
    "card-overview": ("#E3EFFB", "#F5FAFF", "#5E8FC7"),
    "card-charts": ("#FFF3D2", "#FFFBEF", "#D9A335"),
    "card-bills": ("#F6E9D2", "#FFFAF1", "#C08A3E"),
    "card-cal-income": ("#D3F0DC", "#EFFBF2", "#3F8F5F"),
    "card-dani-income": ("#FCDCD0", "#FEF3EF", "#C1543A"),
    "card-easy": ("#D9F2E6", "#F1FBF6", "#2E9A6B"),
    "card-settings": ("#EBDFF6", "#F9F5FC", "#8E6FB5"),
    "card-recurring": ("#FCE4CF", "#FFF7EF", "#D68A4C"),
    "card-trends": ("#DCEAFB", "#F3F8FF", "#4E80C4"),
    "card-history": ("#FBEBC8", "#FFFBF0", "#C9A23A"),
    "card-add-month": ("#E4F0DE", "#F5FAF2", "#5B9C6E"),
}


def _card_css() -> str:
    blocks = []
    for cls, (start, end, accent) in CARD_PALETTE.items():
        blocks.append(f"""
        div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] div.{cls}) {{
            background: linear-gradient(135deg, {start} 0%, {end} 100%) !important;
            border-radius: 18px !important;
            padding: 22px 24px !important;
            border: none !important;
            border-left: 5px solid {accent} !important;
            box-shadow: 0 2px 10px rgba(74, 64, 58, 0.06);
            transition: transform 0.18s ease, box-shadow 0.18s ease;
        }}
        div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] div.{cls}):hover {{
            transform: translateY(-3px);
            box-shadow: 0 12px 24px rgba(74, 64, 58, 0.14);
        }}
        """)
    return "\n".join(blocks)


CUSTOM_CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');

html, body, [class*="css"], .stApp, p, span, div, label, li {{
    font-family: 'Inter', sans-serif;
}}
h1, h2, h3, h4, h5 {{
    font-family: 'Poppins', sans-serif !important;
    font-weight: 700 !important;
}}

/* Warm gradient backdrop for the whole app */
.stApp {{
    background: linear-gradient(160deg, #FFF3E6 0%, #FFFBF5 55%, #FFEFDD 100%);
}}

/* Sidebar */
section[data-testid="stSidebar"] {{
    background: linear-gradient(180deg, #F7E0C7 0%, #F2D2AE 100%);
}}

/* Buttons - soft lift on hover, pill-rounded */
.stButton > button, .stDownloadButton > button {{
    border-radius: 999px !important;
    font-weight: 600 !important;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}}
.stButton > button:hover, .stDownloadButton > button:hover {{
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(95, 163, 127, 0.30);
}}

/* Tabs -> rounded pill segmented control */
div[role="tablist"] {{
    display: inline-flex;
    gap: 4px;
    background-color: rgba(0,0,0,0.045);
    padding: 5px;
    border-radius: 999px;
    border-bottom: none !important;
}}
div[data-testid="stTab"] {{
    border-radius: 999px !important;
    padding: 6px 20px !important;
    transition: all 0.2s ease;
}}
div[data-testid="stTab"] p {{
    font-weight: 600 !important;
    font-size: 0.92rem !important;
}}
div[data-testid="stTab"][aria-selected="true"] {{
    background-color: {HERO_ACCENT} !important;
}}
div[data-testid="stTab"][aria-selected="true"] p {{
    color: white !important;
}}

/* Hero card */
.hero-card {{
    border-radius: 22px;
    padding: 26px 28px;
    margin-bottom: 16px;
    background: linear-gradient(135deg, #CFEBDB 0%, #E9F7EF 100%);
    box-shadow: 0 4px 16px rgba(47, 143, 91, 0.12);
    border-left: 6px solid {HERO_ACCENT};
}}
.hero-label {{ font-size: 0.9rem; opacity: 0.7; margin-bottom: 2px; }}
.hero-number {{
    font-family: 'Poppins', sans-serif;
    font-size: 2.5rem;
    font-weight: 800;
    color: {HERO_ACCENT};
}}
.hero-delta {{
    display: inline-block;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 700;
    margin-left: 12px;
    vertical-align: middle;
}}
.hero-rows {{ margin-top: 18px; }}
.stat-row {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 0;
}}
.stat-row-left {{ display: flex; align-items: center; }}
.icon-chip {{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    margin-right: 12px;
    font-size: 13px;
    flex-shrink: 0;
}}
.stat-row-value {{ font-weight: 700; }}

/* Status badges (History tab) */
.status-badge {{
    padding: 3px 12px;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    margin-left: 10px;
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
.cal-card {{ background: linear-gradient(135deg, {CAL_BG} 0%, #E9F8ED 100%); color: {CAL_TEXT}; border-left: 5px solid #3F8F5F; }}
.dani-card {{ background: linear-gradient(135deg, {DANI_BG} 0%, #FEEAE2 100%); color: {DANI_TEXT}; border-left: 5px solid #C1543A; }}
.person-card h4 {{ margin-top: 0; margin-bottom: 10px; font-family: 'Poppins', sans-serif; }}
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


def icon_chip(emoji: str, bg_color: str) -> str:
    return f'<span class="icon-chip" style="background:{bg_color};">{emoji}</span>'


def _flatten_html(html: str) -> str:
    """Collapses a multi-line HTML template to one line. Streamlit's
    markdown-to-HTML pipeline can misparse HTML blocks that span multiple
    lines with blank-line boundaries (a trailing tag can render as literal
    text) - a single unbroken line sidesteps that entirely."""
    return " ".join(html.split())


def stat_row_html(emoji: str, bg_color: str, label: str, value: str, delta_html: str = "") -> str:
    return _flatten_html(f"""
    <div class="stat-row">
        <div class="stat-row-left">{icon_chip(emoji, bg_color)}<span>{label}</span></div>
        <div><span class="stat-row-value">{value}</span>{delta_html}</div>
    </div>
    """)


def delta_pill_html(delta_str, good_if_positive=True):
    if not delta_str:
        return ""
    is_positive = not delta_str.startswith("-")
    is_good = is_positive if good_if_positive else not is_positive
    color = "#1E7A4C" if is_good else "#B23A2E"
    bg = "#DCEFE1" if is_good else "#FBE1DC"
    arrow = "↑" if is_positive else "↓"
    clean = delta_str.lstrip("-")
    return f'<span class="hero-delta" style="background:{bg};color:{color};">{arrow} {clean}</span>'


def hero_card_html(month_label: str, result, prev_result) -> str:
    total_delta = delta_pill_html(money_delta(result.total_income, prev_result.total_income if prev_result else None))

    rows = stat_row_html(
        "🧾", BILLS_COLOR, "Bills", f"£{result.bills_total:,.2f}",
        delta_pill_html(
            money_delta(result.bills_total, prev_result.bills_total if prev_result else None),
            good_if_positive=False,
        ),
    )
    rows += stat_row_html(
        "💸", PERSONAL_COLOR, "Allowances (both)", f"£{result.allowance_total:,.2f}",
        delta_pill_html(money_delta(result.allowance_total, prev_result.allowance_total if prev_result else None)),
    )
    rows += stat_row_html(
        "💰", SAVINGS_COLOR, "Individual savings", f"£{result.individual_savings_total:,.2f}",
        delta_pill_html(
            money_delta(
                result.individual_savings_total,
                prev_result.individual_savings_total if prev_result else None,
            )
        ),
    )
    to_savings = result.to_easy_access + result.to_long_term
    prev_to_savings = (prev_result.to_easy_access + prev_result.to_long_term) if prev_result else None
    rows += stat_row_html(
        "📈", LONG_TERM_COLOR, "To joint savings", f"£{to_savings:,.2f}",
        delta_pill_html(money_delta(to_savings, prev_to_savings)),
    )

    return _flatten_html(f"""
    <div class="hero-card">
        <div class="hero-label">{month_label} · Total income</div>
        <span class="hero-number">£{result.total_income:,.2f}</span>{total_delta}
        <div class="hero-rows">{rows}</div>
    </div>
    """)


def person_card_html(title: str, spending: float, bills: float, savings: float, total: float, css_class: str) -> str:
    rows = stat_row_html("💸", PERSONAL_COLOR, "Spending", f"£{spending:,.2f}")
    rows += stat_row_html("🧾", BILLS_COLOR, "Bills", f"£{bills:,.2f}")
    rows += stat_row_html("💰", SAVINGS_COLOR, "Savings", f"£{savings:,.2f}")
    return _flatten_html(f"""
    <div class="person-card {css_class}">
        <h4>{title}</h4>
        {rows}
        <p class="total-line">Total - £{total:,.2f}</p>
    </div>
    """)


# ---------- navigation helpers ----------

def go_to(view: str, month_id: int = None):
    st.session_state.view = view
    if month_id is not None:
        st.session_state.month_id = month_id
    st.rerun()


def render_sidebar():
    with st.sidebar:
        st.markdown("## 💰 Household Budget")
        dashboard_active = st.session_state.view == "dashboard"
        settings_active = st.session_state.view == "settings"
        if st.button(
            "🏠 Dashboard", width="stretch", type="primary" if dashboard_active else "secondary"
        ):
            go_to("dashboard")
        if st.button(
            "⚙ Settings", width="stretch", type="primary" if settings_active else "secondary"
        ):
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


def build_progress_ring_figure(result):
    target = result.easy_access_target
    balance = result.current_easy_access_balance
    percent = (balance / target * 100) if target > 0 else 0
    display_percent = max(0, min(percent, 100))

    fig = go.Figure(data=[go.Pie(
        values=[display_percent, 100 - display_percent],
        hole=0.78,
        marker=dict(colors=[EASY_ACCESS_COLOR, "#EDE6D8"], line=dict(width=0)),
        textinfo="none",
        sort=False,
        direction="clockwise",
        rotation=0,
        hoverinfo="skip",
    )])
    fig.update_layout(
        showlegend=False,
        margin=dict(l=10, r=10, t=10, b=10),
        height=260,
        paper_bgcolor="rgba(0,0,0,0)",
        annotations=[dict(
            text=(
                f"<b style='font-size:30px;color:#2F8F5B'>{percent:.0f}%</b>"
                f"<br><span style='font-size:12px;color:#8a8378'>"
                f"£{balance:,.0f} of £{target:,.0f}</span>"
            ),
            x=0.5, y=0.5, showarrow=False, align="center",
        )],
    )
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

            st.markdown(hero_card_html(
                f"{calendar.month_name[fin['month']]} {fin['year']}", result, prev_result
            ), unsafe_allow_html=True)

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
                    st.plotly_chart(build_progress_ring_figure(result), width="stretch")

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
            if m["confirmed"]:
                badge = '<span class="status-badge" style="background:#DCEFE1;color:#1E7A4C;">✓ Confirmed</span>'
            else:
                badge = '<span class="status-badge" style="background:#FBE9C8;color:#8A6A1E;">✎ Draft</span>'
            with styled_container("card-history"):
                row1, row2, row3 = st.columns([4, 2, 2])
                row1.markdown(f"**{label}**{badge}", unsafe_allow_html=True)
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

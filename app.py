"""
Household Budget - Streamlit app.

Run locally with:  streamlit run app.py
Deploys via Streamlit Community Cloud pointed at this repo - see README.md
for the one-time Postgres + secrets setup.
"""

import base64
import calendar
import csv
import datetime
import io
import uuid
from contextlib import contextmanager
from pathlib import Path

import plotly.graph_objects as go
import streamlit as st

import db
from calculations import calculate_waterfall

st.set_page_config(page_title="Household Budget", page_icon="assets/logo_icon.png", layout="wide")

# ---------- design tokens ----------
# One ground, one ink, one action colour, and a fixed colour for each of the
# three "owners" of money - Cal, Dani and the joint account. Every badge,
# panel and chart uses these, so Cal is always green, Dani always coral and
# joint always blue.

GROUND = "#FAF6F0"
PANEL = "#F2ECE3"
PANEL_STRONG = "#E8E0D4"
INK = "#25302A"
INK_SOFT = "#5C635E"
ACTION = "#2F7A55"

CAL = "#2E6B48"
CAL_MID = "#7DB894"
CAL_FILL = "#D3EDDA"
DANI = "#A4472F"
DANI_MID = "#E59C85"
DANI_FILL = "#F8D8CC"
JOINT = "#3D5F8C"
JOINT_MID = "#93AED3"
JOINT_FILL = "#D8E3F1"

# Neutral steps for things that belong to nobody in particular (bills,
# allowances, totals) - kept out of the three owner colours on purpose.
NEUTRAL_DARK = "#5E574F"
NEUTRAL_MID = "#A39A8E"
NEUTRAL_LIGHT = "#D6CEC2"

GOOD = "#2F7A55"
BAD = "#9B2C24"
BAD_FILL = "#F6D5D2"

PERSON_COLORS = {"Cal": (CAL, CAL_FILL), "Dani": (DANI, DANI_FILL)}

TAG_OPTIONS = ["Joint", "Cal", "Dani"]

FONT_STACK = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"

_CSS_TEMPLATE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
    --ground: %(GROUND)s;
    --panel: %(PANEL)s;
    --panel-strong: %(PANEL_STRONG)s;
    --ink: %(INK)s;
    --ink-soft: %(INK_SOFT)s;
    --action: %(ACTION)s;
    --cal: %(CAL)s;
    --cal-fill: %(CAL_FILL)s;
    --dani: %(DANI)s;
    --dani-fill: %(DANI_FILL)s;
    --joint: %(JOINT)s;
    --joint-mid: %(JOINT_MID)s;
    --joint-fill: %(JOINT_FILL)s;
    --neutral-dark: %(NEUTRAL_DARK)s;
    --neutral-mid: %(NEUTRAL_MID)s;
    --neutral-light: %(NEUTRAL_LIGHT)s;
    --good: %(GOOD)s;
    --bad: %(BAD)s;
    --bad-fill: %(BAD_FILL)s;
    --radius: 6px;
    --text-xl: 2.5rem;
    --text-l: 1.5rem;
    --text-m: 1.125rem;
    --text-s: 0.875rem;
}

/* One typeface everywhere, except Streamlit's own icon glyphs */
.stApp, .stApp *:not([data-testid="stIconMaterial"]) {
    font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.stApp { background: var(--ground); color: var(--ink); }
.stApp h1, .stApp h2, .stApp h3, .stApp h4 {
    color: var(--ink);
    font-weight: 700;
    letter-spacing: -0.02em;
}
.stApp h1 { font-size: var(--text-xl); line-height: 1.05; padding: 0; }
.stApp h2 { font-size: var(--text-l); line-height: 1.2; padding: 0; }
.stApp h3 { font-size: var(--text-m); line-height: 1.3; padding: 0; }
.stApp input, .amt, .figure { font-variant-numeric: tabular-nums; }

div[data-testid="stMainBlockContainer"] {
    max-width: 1080px;
    margin: 0 auto;
    padding-top: 3rem;
}

section[data-testid="stSidebar"] { background: var(--panel); }

/* Buttons: one shape, flat fill, colour change only on hover */
.stButton > button, .stDownloadButton > button, .stFormSubmitButton > button {
    border-radius: var(--radius);
    font-weight: 600;
    box-shadow: none;
    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

/* Streamlit's tab bar keeps its own underline; just set the type */
div[data-testid="stTab"] p { font-size: 1rem; font-weight: 600; }

/* ---- panels (marker div + :has(), see styled_container) ---- */
div[data-testid="stElementContainer"]:has(> div[data-testid="stMarkdown"] .mk) { display: none; }
div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk) {
    border: none;
    border-radius: var(--radius);
    padding: 24px;
}
div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-panel) { background: var(--panel); }
div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-cal) { background: var(--cal-fill); }
div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-dani) { background: var(--dani-fill); }
div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-joint) { background: var(--joint-fill); }
div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-white) { background: #fff; }

/* Headings here are labels, not link targets: drop Streamlit's anchor icons */
.stApp [data-testid="stHeaderActionElements"] { display: none; }

.rows-head {
    color: var(--ink-soft);
    font-size: var(--text-s);
    font-weight: 600;
}

/* Inputs sit on white so they stand out from the panels around them */
.stApp div[data-baseweb="input"], .stApp div[data-baseweb="base-input"], .stApp input,
.stApp div[data-baseweb="select"] > div, .stApp div[data-testid="stNumberInputContainer"] button {
    background-color: #fff;
}

/* Bill rows (Month Entry, Settings): on a phone the name takes its own line,
   amount, whose bill and remove share the next one. */
@media (max-width: 640px) {
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"] {
        flex: 1 1 0;
        min-width: 0;
    }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"]:first-child {
        flex: 1 1 100%;
    }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] {
        row-gap: 8px;
        margin-bottom: 12px;
    }
    div[data-testid="stHorizontalBlock"]:has(.rows-head) { display: none; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"]:last-child {
        flex: 0 0 44px;
    }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"]:last-child button {
        min-width: 44px;
        padding: 0;
    }
    /* Steppers squeeze the amount on a phone; typing is quicker anyway */
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] button[data-testid^="stNumberInputStep"] {
        display: none;
    }
    /* History rows stay on one line: month, open, delete */
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-history) div[data-testid="stHorizontalBlock"] {
        flex-wrap: nowrap;
    }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-history) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"] {
        min-width: 0;
        flex: 0 0 auto;
        width: auto;
    }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-history) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"]:first-child {
        flex: 1 1 auto;
    }
    .slip-row .delta { display: block; text-align: right; margin-left: 0; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk) { padding: 18px 16px; }
    .stApp h1 { font-size: 2rem; }
    div[data-testid="stMainBlockContainer"] { padding-top: 3.5rem; }
}

/* ---- the slip: labelled amounts in one column, figures on the right ---- */
.slip { color: var(--ink); }
.slip h3 { margin: 0 0 4px 0; }
.slip-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.slip-head h3 { margin: 0; }
.slip-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    padding: 6px 0;
}
.slip-row .label { display: flex; align-items: center; gap: 10px; min-width: 0; }
.slip-row .amt { font-weight: 600; white-space: nowrap; text-align: right; }
.slip-row.indent .label { padding-left: 38px; }
.slip-row.total {
    background: var(--panel-strong);
    margin: 8px -12px 0 -12px;
    padding: 10px 12px;
    border-radius: var(--radius);
    font-weight: 700;
}
.slip-row.total .amt { font-weight: 700; }
.slip-note { color: var(--ink-soft); font-size: var(--text-s); line-height: 1.5; margin: 4px 0 0 0; }
.slip-section + .slip-section { margin-top: 28px; }
.delta { font-size: var(--text-s); font-weight: 600; margin-left: 8px; }
.delta.good { color: var(--good); }
.delta.bad { color: var(--bad); }

.badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: #fff;
    font-weight: 700;
    flex-shrink: 0;
}

/* Person slips on the Transfers tab */
.person-slip { border-radius: var(--radius); padding: 24px; }
.person-slip.cal { background: var(--cal-fill); }
.person-slip.dani { background: var(--dani-fill); }
.person-slip .arrives { margin: 4px 0 16px 0; line-height: 1.5; }
.person-slip .arrives strong { font-size: var(--text-m); }
.person-slip ol.moves { margin: 0; padding-left: 1.5em; }
.person-slip ol.moves li { padding: 6px 0; font-weight: 500; }
.person-slip ol.moves li::marker { font-weight: 700; }
.person-slip ol.moves .move { display: flex; justify-content: space-between; gap: 16px; }
.person-slip ol.moves .move small { display: block; color: var(--ink-soft); font-size: var(--text-s); font-weight: 400; }
.person-slip .slip-row.total { background: rgba(255,255,255,0.55); }
.person-slip .in-card-warning {
    background: var(--bad-fill);
    color: var(--bad);
    border-radius: var(--radius);
    padding: 10px 12px;
    margin-top: 12px;
    font-size: var(--text-s);
    line-height: 1.5;
}

.joint-slip { background: var(--joint-fill); border-radius: var(--radius); padding: 20px 24px; margin-top: 16px; }
.joint-slip p { margin: 0; line-height: 1.6; }
.joint-slip p + p { margin-top: 6px; }

/* Overview */
.lead-label { color: var(--ink-soft); font-size: 1rem; margin: 0; }
.lead-figure { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.lead-figure .amt { font-size: 3rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; margin: 4px 0 0 0; }
.split-bar { display: flex; height: 28px; border-radius: var(--radius); overflow: hidden; margin: 12px 0 14px 0; }
.split-bar span { display: block; height: 100%; }
.split-key { display: flex; flex-wrap: wrap; gap: 8px 24px; }
.split-key div { display: flex; align-items: center; gap: 8px; }
.swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
.progress { height: 14px; background: #fff; border-radius: 999px; overflow: hidden; margin: 12px 0; }
.progress span { display: block; height: 100%; background: var(--joint); }

.status { font-size: var(--text-s); font-weight: 600; margin-left: 10px; }
.status.confirmed { color: var(--good); }
.status.draft { color: var(--dani); }

.empty { color: var(--ink-soft); padding: 24px 0; line-height: 1.6; }
.subtitle { color: var(--ink-soft); margin: 6px 0 0 0; }
</style>
"""

# Fill the :root tokens from the Python constants (plain replace, because the
# CSS itself is full of % signs).
_CSS_TOKENS = dict(
    GROUND=GROUND, PANEL=PANEL, PANEL_STRONG=PANEL_STRONG, INK=INK, INK_SOFT=INK_SOFT,
    ACTION=ACTION, CAL=CAL, CAL_FILL=CAL_FILL, DANI=DANI, DANI_FILL=DANI_FILL,
    JOINT=JOINT, JOINT_MID=JOINT_MID, JOINT_FILL=JOINT_FILL, NEUTRAL_DARK=NEUTRAL_DARK,
    NEUTRAL_MID=NEUTRAL_MID, NEUTRAL_LIGHT=NEUTRAL_LIGHT, GOOD=GOOD, BAD=BAD, BAD_FILL=BAD_FILL,
)
CUSTOM_CSS = _CSS_TEMPLATE
for _name, _value in _CSS_TOKENS.items():
    CUSTOM_CSS = CUSTOM_CSS.replace(f"%({_name})s", _value)


def inject_custom_css():
    st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


@contextmanager
def styled_container(marker_class: str, border: bool = True):
    """A st.container(border=True) that's reliably colourable via CSS -
    injects a hidden marker div that the :has() rules above target."""
    c = st.container(border=border)
    c.markdown(f'<div class="mk {marker_class}"></div>', unsafe_allow_html=True)
    with c:
        yield c


@st.cache_data
def _get_logo_base64(variant: str = "icon") -> str:
    filename = "logo_icon.png" if variant == "icon" else "logo_full.png"
    logo_path = Path(__file__).parent / "assets" / filename
    return base64.b64encode(logo_path.read_bytes()).decode()


def logo_img_html(size: int = 40, variant: str = "icon") -> str:
    b64 = _get_logo_base64(variant)
    return f'<img src="data:image/png;base64,{b64}" width="{size}" alt="Household Budget logo" style="vertical-align:middle;">'


def _flatten_html(html: str) -> str:
    """Collapses a multi-line HTML template to one line. Streamlit's
    markdown-to-HTML pipeline can misparse HTML blocks that span multiple
    lines with blank-line boundaries (a trailing tag can render as literal
    text) - a single unbroken line sidesteps that entirely."""
    return " ".join(html.split())


def html(markup: str):
    st.markdown(_flatten_html(markup), unsafe_allow_html=True)


def money(value: float) -> str:
    if value < 0:
        return f"−£{-value:,.2f}"
    return f"£{value:,.2f}"


def pct(share: float) -> str:
    return f"{share * 100:.2f}%"


def avatar_html(letter: str, person: str, size: int = 28) -> str:
    color = PERSON_COLORS[person][0]
    return (
        f'<span class="badge" style="width:{size}px;height:{size}px;'
        f'background:{color};font-size:{int(size * 0.46)}px;" aria-hidden="true">{letter}</span>'
    )


def slip_row_html(label: str, value: str, person: str = None, cls: str = "", extra: str = "") -> str:
    badge = avatar_html(person[0], person) if person else ""
    return (
        f'<div class="slip-row {cls}"><span class="label">{badge}<span>{label}</span></span>'
        f'<span><span class="amt">{value}</span>{extra}</span></div>'
    )


def delta_html(delta_str, good_if_positive=True, versus: str = ""):
    if not delta_str:
        return ""
    # money_delta formats a fall as "£-12.00", so look for the minus anywhere
    is_positive = "-" not in delta_str
    is_good = is_positive if good_if_positive else not is_positive
    sign = "+" if is_positive else "−"
    clean = delta_str.replace("-", "")
    suffix = f" vs {versus}" if versus else ""
    return f'<span class="delta {"good" if is_good else "bad"}">{sign}{clean}{suffix}</span>'


def empty_state_html(message: str) -> str:
    return f'<p class="empty">{message}</p>'


def month_label(month: int, year: int) -> str:
    return f"{calendar.month_name[month]} {year}"


# ---------- navigation helpers ----------

def go_to(view: str, month_id: int = None):
    st.session_state.view = view
    if month_id is not None:
        st.session_state.month_id = month_id
    st.rerun()


def render_sidebar():
    with st.sidebar:
        html(
            f'<div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">'
            f'{logo_img_html(40)}<span style="font-weight:700; font-size:1.125rem;">Household Budget</span>'
            f'</div>'
        )
        dashboard_active = st.session_state.view in ("dashboard", "month_entry", "results")
        settings_active = st.session_state.view == "settings"
        if st.button("Dashboard", width="stretch", type="primary" if dashboard_active else "secondary"):
            go_to("dashboard")
        if st.button("Settings", width="stretch", type="primary" if settings_active else "secondary"):
            go_to("settings")


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
        cal_personal_bills=fin["cal_bills"], dani_personal_bills=fin["dani_bills"],
    )
    return result, fin


# ---------- charts ----------

CHART_CONFIG = {"displayModeBar": False}


def _style_chart(fig, height: int = 320):
    fig.update_layout(
        height=height,
        margin=dict(l=8, r=8, t=8, b=8),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family=FONT_STACK, size=13, color=INK),
        legend=dict(orientation="h", x=0, xanchor="left", y=1.02, yanchor="bottom", title=None),
        hoverlabel=dict(font=dict(family=FONT_STACK)),
    )
    fig.update_xaxes(showgrid=False, linecolor=NEUTRAL_LIGHT, tickfont=dict(color=INK_SOFT))
    fig.update_yaxes(gridcolor=PANEL_STRONG, zeroline=False, tickfont=dict(color=INK_SOFT), title=None)
    return fig


def income_split_html(result) -> str:
    """One bar for where the month's income went - the same three figures the
    old pie showed (bills, allowances, savings), read left to right."""
    savings_total = result.personal_savings_total + result.to_easy_access + result.to_long_term
    parts = [
        ("Bills", max(result.bills_total, 0), NEUTRAL_DARK),
        ("Allowances", max(result.allowance_total, 0), NEUTRAL_LIGHT),
        ("Savings", max(savings_total, 0), JOINT),
    ]
    total = sum(p[1] for p in parts)
    if total <= 0:
        return ""
    bar = "".join(
        f'<span style="width:{v / total * 100:.3f}%;background:{c};" title="{n}: {money(v)}"></span>'
        for n, v, c in parts if v > 0
    )
    key = "".join(
        f'<div><span class="swatch" style="background:{c};"></span>'
        f'<span>{n} <span class="amt" style="font-weight:600;">{money(v)}</span> '
        f'<span style="color:{INK_SOFT};">({v / total * 100:.0f}%)</span></span></div>'
        for n, v, c in parts
    )
    return f'<div class="split-bar" role="img" aria-label="Income split">{bar}</div><div class="split-key">{key}</div>'


def easy_access_html(result) -> str:
    target = result.easy_access_target
    balance = result.current_easy_access_balance
    percent = (balance / target * 100) if target > 0 else 0
    display_percent = max(0, min(percent, 100))
    to_go = max(0.0, target - balance)
    if to_go > 0:
        status = f"{money(to_go)} to go. This month adds {money(result.to_easy_access)}."
    else:
        status = "Target reached. This month's joint savings all go to the long-term pot."
    return _flatten_html(f"""
    <div class="slip">
        <h3>Easy-access pot: {percent:.0f}% of target</h3>
        <div class="progress" role="img" aria-label="{percent:.0f}% of target"><span style="width:{display_percent:.2f}%;"></span></div>
        <div class="slip-row" style="padding:0;"><span>{money(balance)} of {money(target)}</span></div>
        <p class="slip-note">{status}</p>
    </div>
    """)


def build_trend_figure(confirmed_months):
    labels, easy_vals, long_vals = [], [], []
    for m in confirmed_months:
        result, _ = calculate_month(m["id"])
        labels.append(f"{calendar.month_abbr[m['month']]} {m['year']}")
        easy_vals.append(result.to_easy_access)
        long_vals.append(result.to_long_term)

    fig = go.Figure(data=[
        go.Bar(name="Easy-access", x=labels, y=easy_vals, marker_color=JOINT_MID,
               hovertemplate="Easy-access: £%{y:,.2f}<extra></extra>"),
        go.Bar(name="Long-term", x=labels, y=long_vals, marker_color=JOINT,
               hovertemplate="Long-term: £%{y:,.2f}<extra></extra>"),
    ])
    fig.update_layout(barmode="stack", bargap=0.45)
    fig.update_yaxes(tickprefix="£", tickformat=",.0f")
    return _style_chart(fig)


def build_sankey_figure(result):
    """Money-flow diagram for a single month: each person's income joins the
    total, which splits into bills, allowances, each person's personal
    savings and joint savings - and joint savings splits into its two pots."""
    labels = [
        "Cal income", "Dani income", "Total income",
        "Bills", "Allowances", "Cal personal savings", "Dani personal savings", "Joint savings",
        "Easy-access", "Long-term",
    ]
    node_colors = [
        CAL, DANI, NEUTRAL_DARK,
        NEUTRAL_MID, NEUTRAL_LIGHT, CAL, DANI, JOINT,
        JOINT_MID, JOINT,
    ]
    idx = {name: i for i, name in enumerate(labels)}
    links = [
        (idx["Cal income"], idx["Total income"], result.cal_income, CAL_FILL),
        (idx["Dani income"], idx["Total income"], result.dani_income, DANI_FILL),
        (idx["Total income"], idx["Bills"], result.bills_total, NEUTRAL_LIGHT),
        (idx["Total income"], idx["Allowances"], result.allowance_total, PANEL_STRONG),
        (idx["Total income"], idx["Cal personal savings"], result.cal_personal_savings, CAL_FILL),
        (idx["Total income"], idx["Dani personal savings"], result.dani_personal_savings, DANI_FILL),
        (idx["Total income"], idx["Joint savings"], max(result.joint_savings, 0), JOINT_FILL),
        (idx["Joint savings"], idx["Easy-access"], result.to_easy_access, JOINT_FILL),
        (idx["Joint savings"], idx["Long-term"], result.to_long_term, JOINT_FILL),
    ]
    links = [l for l in links if l[2] > 0]

    fig = go.Figure(data=[go.Sankey(
        node=dict(label=labels, color=node_colors, pad=18, thickness=14, line=dict(width=0),
                  hovertemplate="%{label}: £%{value:,.2f}<extra></extra>"),
        link=dict(
            source=[l[0] for l in links], target=[l[1] for l in links],
            value=[l[2] for l in links], color=[l[3] for l in links],
            hovertemplate="£%{value:,.2f}<extra></extra>",
        ),
    )])
    _style_chart(fig, height=400)
    fig.update_traces(textfont=dict(family=FONT_STACK, size=13, color=INK))
    return fig


def savings_rates(result):
    """(total savings rate, personal savings rate) as % of income."""
    if result.total_income <= 0:
        return 0.0, 0.0
    total_saved = result.personal_savings_total + result.to_easy_access + result.to_long_term
    return (total_saved / result.total_income * 100,
            result.personal_savings_total / result.total_income * 100)


def build_savings_rate_figure(confirmed_months):
    """Two lines: the total savings rate (personal + joint) and the personal
    savings rate on its own, both as a share of income."""
    labels, personal_rate, total_rate = [], [], []
    for m in confirmed_months:
        result, _ = calculate_month(m["id"])
        labels.append(f"{calendar.month_abbr[m['month']]} {m['year']}")
        total, personal = savings_rates(result)
        total_rate.append(total)
        personal_rate.append(personal)

    fig = go.Figure(data=[
        go.Scatter(
            x=labels, y=total_rate, name="All savings", mode="lines+markers",
            line=dict(color=JOINT, width=3), marker=dict(size=8),
            hovertemplate="All savings: %{y:.1f}%<extra></extra>",
        ),
        go.Scatter(
            x=labels, y=personal_rate, name="Personal savings only", mode="lines+markers",
            line=dict(color=NEUTRAL_MID, width=2), marker=dict(size=6),
            hovertemplate="Personal savings: %{y:.1f}%<extra></extra>",
        ),
    ])
    fig.update_layout(hovermode="x unified")
    fig.update_yaxes(ticksuffix="%", rangemode="tozero")
    return _style_chart(fig)


def build_bills_by_tag_figure(confirmed_months):
    """100%-stacked area showing each month's bill total as a share
    between Joint / Cal / Dani - makes a shift in who's covering what
    (e.g. as Dani's income grows) visible at a glance."""
    labels, joint_vals, cal_vals, dani_vals = [], [], [], []
    for m in confirmed_months:
        _, fin = calculate_month(m["id"])
        labels.append(f"{calendar.month_abbr[m['month']]} {m['year']}")
        joint_vals.append(max(fin["bills_total"] - fin["cal_bills"] - fin["dani_bills"], 0))
        cal_vals.append(fin["cal_bills"])
        dani_vals.append(fin["dani_bills"])

    fig = go.Figure(data=[
        go.Scatter(x=labels, y=joint_vals, name="Joint", mode="lines", stackgroup="one",
                   groupnorm="percent", line=dict(width=0, color=JOINT), fillcolor=JOINT_MID,
                   hovertemplate="Joint: %{y:.0f}%<extra></extra>"),
        go.Scatter(x=labels, y=cal_vals, name="Cal", mode="lines", stackgroup="one",
                   line=dict(width=0, color=CAL), fillcolor=CAL_MID,
                   hovertemplate="Cal: %{y:.0f}%<extra></extra>"),
        go.Scatter(x=labels, y=dani_vals, name="Dani", mode="lines", stackgroup="one",
                   line=dict(width=0, color=DANI), fillcolor=DANI_MID,
                   hovertemplate="Dani: %{y:.0f}%<extra></extra>"),
    ])
    fig.update_layout(hovermode="x unified")
    fig.update_yaxes(ticksuffix="%", range=[0, 100])
    return _style_chart(fig)


# ---------- CSV export ----------

def build_csv_bytes() -> bytes:
    months = db.get_all_months()
    fieldnames = [
        "year", "month", "confirmed",
        "cal_income", "dani_income", "total_income",
        "bills_total", "allowance_per_person", "allowance_total",
        "savings_rate", "cal_personal_savings", "dani_personal_savings",
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
            "cal_personal_savings": result.cal_personal_savings,
            "dani_personal_savings": result.dani_personal_savings,
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
    with styled_container("mk-panel"):
        col_text, col_btn = st.columns([3, 1], vertical_alignment="bottom")
        suggested = datetime.date.today().strftime("%B %Y")
        month_text = col_text.text_input(
            "Add or open a month", value=suggested, key="new_month_text",
            help="Type it like 'September 2026' or 'Sep 2026'.",
        )
        if col_btn.button("Add / open month", width="stretch"):
            parsed = parse_month_string(month_text)
            if not parsed:
                st.error("Please enter it like 'September 2026' or 'Sep 2026'.")
            else:
                year, month = parsed
                month_id = db.get_or_create_month(year, month)
                st.session_state.pop("loaded_month_id", None)
                go_to("month_entry", month_id=month_id)


# ---------- Dashboard ----------

def person_transfer_card_html(
    person: str, income: float, to_joint: float, to_spending: float, to_savings: float,
    personal_bills: float, remainder: float, total_out: float, warning: str = "",
) -> str:
    """The transfers to make out of a person's income account, in the order
    to make them: joint first (savings & bills), then personal spending,
    then personal savings - whatever's left after those three covers that
    person's own bills, and never has to move at all."""
    css = person.lower()
    warning_html = f'<div class="in-card-warning" role="alert">{warning}</div>' if warning else ""
    return _flatten_html(f"""
    <section class="person-slip {css}" aria-label="Transfers from {person}'s account">
        <div class="slip-head">{avatar_html(person[0], person, 32)}<h3>From {person}'s account</h3></div>
        <p class="arrives">{money(income)} income − {money(personal_bills)} personal bills
            = <strong class="amt">{money(remainder)}</strong> to move, in this order:</p>
        <ol class="moves">
            <li><div class="move"><span>Joint account<small>joint savings and bills</small></span><span class="amt">{money(max(to_joint, 0))}</span></div></li>
            <li><div class="move"><span>Personal account<small>allowance</small></span><span class="amt">{money(to_spending)}</span></div></li>
            <li><div class="move"><span>Personal savings</span><span class="amt">{money(to_savings)}</span></div></li>
        </ol>
        {slip_row_html("Left in account for personal bills", money(personal_bills), cls="stays")}
        {slip_row_html("Total transferred out", money(max(total_out, 0)), cls="total")}
        {warning_html}
    </section>
    """)


def render_overview(latest, previous, drafts):
    if latest is None:
        html(empty_state_html(
            "No confirmed months yet. Add a month above, enter its bills and income, "
            "then press Save month on the results screen."
        ))
        return
    result, fin = calculate_month(latest["id"])
    prev_result, _ = calculate_month(previous["id"]) if previous else (None, None)
    prev_name = calendar.month_name[previous["month"]] if previous else ""

    def d(cur, prev_attr, good_if_positive=True):
        prev = getattr(prev_result, prev_attr) if prev_result else None
        return delta_html(money_delta(cur, prev), good_if_positive, prev_name)

    to_savings = result.to_easy_access + result.to_long_term
    prev_to_savings = (prev_result.to_easy_access + prev_result.to_long_term) if prev_result else None

    with styled_container("mk-panel"):
        html(f"""
        <div class="slip">
            <div class="lead-label">{month_label(fin['month'], fin['year'])} · total income</div>
            <div class="lead-figure"><span class="amt">{money(result.total_income)}</span>{d(result.total_income, 'total_income')}</div>
        </div>
        """)
        if result.is_shortfall:
            st.error(f"Shortfall this month: {money(-result.remainder)}")
        html(income_split_html(result))
        html(
            '<div class="slip" style="margin-top:20px;">'
            + slip_row_html("Bills", money(result.bills_total),
                            extra=d(result.bills_total, "bills_total", good_if_positive=False))
            + slip_row_html("Allowances (both)", money(result.allowance_total),
                            extra=d(result.allowance_total, "allowance_total"))
            + slip_row_html("Personal savings", money(result.personal_savings_total),
                            extra=d(result.personal_savings_total, "personal_savings_total"))
            + slip_row_html("To joint savings", money(to_savings),
                            extra=delta_html(money_delta(to_savings, prev_to_savings), True, prev_name))
            + "</div>"
        )

    with styled_container("mk-joint"):
        html(easy_access_html(result))

    if drafts:
        names = ", ".join(month_label(m["month"], m["year"]) for m in drafts)
        st.caption(f"Still a draft: {names}. Open it from History to finish it.")


def render_transfers(latest):
    if latest is None:
        html(empty_state_html("No confirmed months yet. Transfers show once a month is saved."))
        return
    result, fin = calculate_month(latest["id"])
    html(f"""
    <h2 style="margin-bottom:6px;">Transfers for {month_label(fin['month'], fin['year'])}</h2>
    <p class="subtitle" style="margin-bottom:20px;">Income lands in each person's own account. Make these
    three transfers out of it, in order. Whatever's left afterwards is exactly enough for that person's
    own bills, so it never has to move at all.</p>
    """)
    cal_total_out = result.cal_to_joint + result.allowance_per_person + result.cal_personal_savings
    dani_total_out = result.dani_to_joint + result.allowance_per_person + result.dani_personal_savings

    cal_warning = (
        "Cal's allowance and savings add up to more than what's left "
        "after his own bills this month - the joint transfer can't go "
        "negative, so the shortfall needs covering another way."
    ) if result.cal_to_joint < 0 else ""
    dani_warning = (
        "Dani's allowance and savings add up to more than what's left "
        "after her own bills this month - the joint transfer can't go "
        "negative, so the shortfall needs covering another way."
    ) if result.dani_to_joint < 0 else ""

    col_cal, col_dani = st.columns(2)
    with col_cal:
        html(person_transfer_card_html(
            "Cal", result.cal_income, result.cal_to_joint, result.allowance_per_person,
            result.cal_personal_savings, result.cal_personal_bills, result.cal_remainder,
            cal_total_out, cal_warning,
        ))
    with col_dani:
        html(person_transfer_card_html(
            "Dani", result.dani_income, result.dani_to_joint, result.allowance_per_person,
            result.dani_personal_savings, result.dani_personal_bills, result.dani_remainder,
            dani_total_out, dani_warning,
        ))

    # Reconciliation: the two joint transfers add up to exactly what the joint
    # account pays out (joint bills + joint savings).
    into_joint = result.cal_to_joint + result.dani_to_joint
    html(f"""
    <div class="joint-slip">
        <p><strong>Into the joint account:</strong> Cal {money(result.cal_to_joint)} + Dani
        {money(result.dani_to_joint)} = <strong class="amt">{money(into_joint)}</strong>.</p>
        <p>That pays joint bills of {money(result.joint_bills_total)} and joint savings of
        {money(result.joint_savings)} ({result.savings_rate:.0%} of the {money(max(result.remainder, 0))}
        left after bills and allowances).</p>
        <p>Personal savings are split {pct(result.cal_contribution_share)} Cal /
        {pct(result.dani_contribution_share)} Dani, by what each of you put into the joint pot.</p>
    </div>
    """)


def render_trends(confirmed_sorted, latest):
    recent = confirmed_sorted[-6:]
    if not recent:
        html(empty_state_html("Not enough confirmed months yet to show a trend."))
        return
    latest_result, _ = calculate_month(latest["id"])
    latest_name = month_label(latest["month"], latest["year"])
    short_name = calendar.month_name[latest["month"]]

    with styled_container("mk-panel"):
        if latest_result.is_shortfall:
            st.subheader(f"{latest_name}: short by {money(-latest_result.remainder)}, nothing saved")
        else:
            saved = latest_result.personal_savings_total + latest_result.joint_savings
            st.subheader(f"{latest_name}: {money(saved)} of {money(latest_result.total_income)} saved")
        st.caption("Where the month's money goes. Hover any flow for the exact amount.")
        st.plotly_chart(build_sankey_figure(latest_result), width="stretch", config=CHART_CONFIG)

    total_now, _ = savings_rates(latest_result)
    if len(recent) >= 2:
        prev_result, _ = calculate_month(recent[-2]["id"])
        total_prev, _ = savings_rates(prev_result)
        direction = "up" if total_now > total_prev else "down" if total_now < total_prev else "level"
        rate_title = (
            f"{total_now:.0f}% of income saved in {short_name}, "
            + (f"{direction} from {total_prev:.0f}%" if direction != "level" else "same as the month before")
        )
    else:
        rate_title = f"{total_now:.0f}% of income saved in {short_name}"

    _, fin = calculate_month(latest["id"])
    bills = fin["bills_total"]
    cal_share = fin["cal_bills"] / bills * 100 if bills > 0 else 0
    dani_share = fin["dani_bills"] / bills * 100 if bills > 0 else 0

    col_a, col_b = st.columns(2)
    with col_a:
        with styled_container("mk-panel"):
            st.subheader(rate_title)
            st.caption("Share of income saved, last 6 confirmed months.")
            st.plotly_chart(build_savings_rate_figure(recent), width="stretch", config=CHART_CONFIG)
    with col_b:
        with styled_container("mk-panel"):
            st.subheader(f"Cal's own bills are {cal_share:.0f}% of {short_name}'s bills, Dani's {dani_share:.0f}%")
            st.caption("Who each month's bills belong to: joint, Cal's own or Dani's own.")
            st.plotly_chart(build_bills_by_tag_figure(recent), width="stretch", config=CHART_CONFIG)

    joint_total = sum(
        calculate_month(m["id"])[0].to_easy_access + calculate_month(m["id"])[0].to_long_term
        for m in recent
    )
    with styled_container("mk-panel"):
        st.subheader(f"{money(joint_total)} into joint savings over the last {len(recent)} months")
        st.caption("Each month's joint savings, split between the easy-access and long-term pots.")
        st.plotly_chart(build_trend_figure(recent), width="stretch", config=CHART_CONFIG)


def render_history(all_months):
    head_l, head_r = st.columns([3, 2], vertical_alignment="center")
    head_l.subheader("All months")
    with head_r:
        if st.button("Prepare CSV export", width="stretch"):
            st.session_state.csv_export_bytes = build_csv_bytes()
        if "csv_export_bytes" in st.session_state:
            st.download_button(
                "Download CSV", data=st.session_state.csv_export_bytes,
                file_name="household_budget_export.csv", mime="text/csv", width="stretch",
            )

    if not all_months:
        html(empty_state_html("No months yet. Add one above."))
        return

    with styled_container("mk-panel mk-history"):
        for m in all_months:
            label = month_label(m["month"], m["year"])
            badge = (
                '<span class="status confirmed">Confirmed</span>' if m["confirmed"]
                else '<span class="status draft">Draft</span>'
            )
            row1, row2, row3 = st.columns([4, 1.4, 1.4], vertical_alignment="center")
            row1.markdown(f"**{label}**{badge}", unsafe_allow_html=True)
            if row2.button("Open", key=f"open_{m['id']}", width="stretch"):
                st.session_state.pop("loaded_month_id", None)
                go_to("month_entry", month_id=m["id"])
            if row3.button("Delete", key=f"delete_{m['id']}", width="stretch"):
                st.session_state.pending_delete_id = m["id"]
                st.rerun()

            if st.session_state.get("pending_delete_id") == m["id"]:
                st.warning(f"Permanently delete {label}? This can't be undone.")
                yes_col, no_col = st.columns(2)
                if yes_col.button("Yes, delete", key=f"confirm_delete_{m['id']}", width="stretch"):
                    db.delete_month(m["id"])
                    st.session_state.pending_delete_id = None
                    st.rerun()
                if no_col.button("Cancel", key=f"cancel_delete_{m['id']}", width="stretch"):
                    st.session_state.pending_delete_id = None
                    st.rerun()


def render_dashboard():
    all_months = db.get_all_months()
    confirmed_sorted = sorted(
        [m for m in all_months if m["confirmed"]], key=lambda m: (m["year"], m["month"])
    )
    latest = confirmed_sorted[-1] if confirmed_sorted else None
    previous = confirmed_sorted[-2] if len(confirmed_sorted) >= 2 else None
    drafts = [
        m for m in all_months
        if not m["confirmed"] and (latest is None or (m["year"], m["month"]) > (latest["year"], latest["month"]))
    ]

    st.title("Household Budget")
    html(
        f'<p class="subtitle">Latest confirmed month: {month_label(latest["month"], latest["year"])}</p>'
        if latest else '<p class="subtitle">No confirmed months yet.</p>'
    )
    st.write("")
    render_add_month_section()

    tab_overview, tab_transfers, tab_trends, tab_history = st.tabs(
        ["Overview", "Transfers", "Trends", "History"]
    )
    with tab_overview:
        render_overview(latest, previous, drafts)
    with tab_transfers:
        render_transfers(latest)
    with tab_trends:
        render_trends(confirmed_sorted, latest)
    with tab_history:
        render_history(all_months)


# ---------- Month Entry ----------

def render_bill_rows_header(amount_label: str):
    c1, c2, c3, c4 = st.columns([4, 2, 2, 1])
    for col, text in ((c1, "Bill"), (c2, amount_label), (c3, "Whose bill"), (c4, "")):
        col.markdown(f'<div class="rows-head">{text}</div>', unsafe_allow_html=True)


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
    st.title(month_label(month["month"], month["year"]))
    if month["confirmed"]:
        st.warning("This month is already confirmed - edits will change saved figures.")
    else:
        html('<p class="subtitle">Draft. Enter this month\'s bills and income, then calculate.</p>')
    st.write("")

    with styled_container("mk-panel mk-rows"):
        st.subheader("Bills and expenses this month")
        render_bill_rows_header("Amount (£)")

        for row in list(st.session_state.bill_rows):
            lid = row["local_id"]
            c1, c2, c3, c4 = st.columns([4, 2, 2, 1])
            c1.text_input("Name", value=row["name"], key=f"name_{lid}", label_visibility="collapsed",
                          placeholder="Bill name")
            c2.number_input(
                "Amount", value=float(row["amount"]), step=1.0, format="%.2f",
                key=f"amount_{lid}", label_visibility="collapsed",
            )
            c3.selectbox(
                "Tag", TAG_OPTIONS, index=TAG_OPTIONS.index(row["tag"]),
                key=f"tag_{lid}", label_visibility="collapsed",
            )
            if c4.button("✕", key=f"remove_{lid}", help="Remove this bill"):
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
        with styled_container("mk-cal"):
            html(f'<div class="slip-head">{avatar_html("C", "Cal", 30)}<h3>Cal\'s income</h3></div>')
            st.number_input("Salary (£)", step=1.0, format="%.2f", key="cal_salary_input")
            st.number_input("RAF (£)", step=1.0, format="%.2f", key="cal_raf_input")
    with col_dani:
        with styled_container("mk-dani"):
            html(f'<div class="slip-head">{avatar_html("D", "Dani", 30)}<h3>Dani\'s income</h3></div>')
            st.number_input("Income (£)", step=1.0, format="%.2f", key="dani_income_input")

    with styled_container("mk-joint"):
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

    st.write("")
    col1, col2, _ = st.columns([1, 1, 1.2])
    with col1:
        if st.button("Confirm inputs", width="stretch"):
            save_all_fields()
            st.session_state.pop("loaded_month_id", None)
            st.toast("Bills and incomes have been saved.", icon=":material/check_circle:")
            st.rerun()
    with col2:
        if st.button("Confirm & calculate", type="primary", width="stretch"):
            save_all_fields()
            go_to("results", month_id=month_id)


# ---------- Results ----------

def render_results():
    month_id = st.session_state.month_id
    result, fin = calculate_month(month_id)

    st.title(f"{month_label(fin['month'], fin['year'])} results")
    if fin.get("confirmed"):
        html('<p class="subtitle">Saved. These figures are on the dashboard.</p>')
    else:
        html('<p class="subtitle">Draft. Check the working, then save the month to put it on the dashboard.</p>')
    st.write("")

    with styled_container("mk-panel"):
        html(f"""
        <div class="slip">
          <div class="slip-section">
            <h3>Income</h3>
            {slip_row_html("Cal income", money(result.cal_income), "Cal")}
            {slip_row_html("Dani income", money(result.dani_income), "Dani")}
            {slip_row_html("Total income", money(result.total_income), cls="total")}
          </div>
          <div class="slip-section">
            <h3>Personal bills, paid from each person's own account</h3>
            {slip_row_html("Cal's personal bills", "−" + money(result.cal_personal_bills), "Cal")}
            {slip_row_html("Dani's personal bills", "−" + money(result.dani_personal_bills), "Dani")}
            {slip_row_html("Into the joint account (the pot)", money(result.pot), cls="total")}
            <p class="slip-note">Cal puts in {money(result.cal_remainder)} ({pct(result.cal_contribution_share)}),
            Dani {money(result.dani_remainder)} ({pct(result.dani_contribution_share)}).</p>
          </div>
          <div class="slip-section">
            <h3>Paid from the joint account</h3>
            {slip_row_html("Joint bills", "−" + money(result.joint_bills_total))}
            {slip_row_html(f"Allowances ({money(result.allowance_per_person)} × 2)", "−" + money(result.allowance_total))}
            {slip_row_html("Left after bills and allowances", money(result.remainder), cls="total")}
            <p class="slip-note">All bills this month: {money(result.bills_total)}
            (Cal {money(result.cal_personal_bills)}, Dani {money(result.dani_personal_bills)},
            joint {money(result.joint_bills_total)}).</p>
          </div>
        </div>
        """)

        if result.is_shortfall:
            st.error(
                f"Shortfall this month: income doesn't cover bills and allowances "
                f"by {money(-result.remainder)}. Nothing has been adjusted automatically - "
                f"decide how to handle it and re-edit the month if needed."
            )

        html(f"""
        <div class="slip" style="padding-top:20px;">
          <div class="slip-section">
            <h3>Joint savings ({result.savings_rate:.0%} of what's left)</h3>
            {slip_row_html("Joint savings", money(result.joint_savings), cls="total")}
            {slip_row_html("To easy-access pot", money(result.to_easy_access), cls="indent")}
            {slip_row_html("To long-term pot", money(result.to_long_term), cls="indent")}
          </div>
          <div class="slip-section">
            <h3>Personal savings (the rest)</h3>
            {slip_row_html("Personal savings pot", money(result.personal_savings_total), cls="total")}
            {slip_row_html(f"Cal ({pct(result.cal_contribution_share)} of pot)", money(result.cal_personal_savings), "Cal")}
            {slip_row_html(f"Dani ({pct(result.dani_contribution_share)} of pot)", money(result.dani_personal_savings), "Dani")}
            <p class="slip-note">Personal savings pot = what's left after bills, allowances and joint
            savings, split between you in proportion to what each of you put into the joint pot
            (your income minus your own personal bills).</p>
          </div>
        </div>
        """)

    st.write("")
    col1, col2, _ = st.columns([1, 1, 1.2])
    with col1:
        if st.button("Back to edit", width="stretch"):
            go_to("month_entry", month_id=month_id)
    with col2:
        if st.button("Save month", type="primary", width="stretch"):
            db.set_month_confirmed(month_id, True)
            st.toast("This month has been saved.", icon=":material/check_circle:")
            go_to("dashboard")


# ---------- Settings ----------

SETTINGS_CAPTION = (
    "Changes apply to every month, including ones you've already confirmed: "
    "past figures are recalculated with these settings."
)


def render_settings():
    st.title("Settings")
    st.write("")

    settings = db.get_settings()
    with styled_container("mk-panel"):
        st.subheader("How each month is split")
        c1, c2, c3 = st.columns(3)
        allowance = c1.number_input(
            "Personal allowance per person (£)", value=float(settings["allowance_per_person"]),
            step=1.0, format="%.2f",
        )
        rate_pct = c2.number_input(
            "Joint savings rate (%)", value=float(settings["savings_rate"]) * 100,
            step=1.0, format="%.1f", min_value=0.0, max_value=100.0,
        )
        target = c3.number_input(
            "Easy-access savings target (£)", value=float(settings["easy_access_target"]),
            step=1.0, format="%.2f",
        )
        st.caption(
            "The joint savings rate is the share of what's left (after bills and allowances) that "
            "goes to joint savings - everything else becomes personal savings, "
            "split between Cal and Dani by how much each of you contributed."
        )
        st.caption(SETTINGS_CAPTION)

        if st.button("Save settings", type="primary"):
            db.set_setting("allowance_per_person", allowance)
            db.set_setting("savings_rate", rate_pct / 100)
            db.set_setting("easy_access_target", target)
            st.toast("Settings updated.", icon=":material/check_circle:")
            st.rerun()

    st.write("")
    render_recurring_bills_section()


def render_recurring_bills_section():
    with styled_container("mk-panel mk-rows"):
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

        render_bill_rows_header("Usual amount (£)")
        for row in list(st.session_state.template_rows):
            lid = row["local_id"]
            c1, c2, c3, c4 = st.columns([4, 2, 2, 1])
            c1.text_input("Name", value=row["name"], key=f"tmpl_name_{lid}", label_visibility="collapsed",
                          placeholder="Bill name")
            c2.number_input(
                "Amount", value=float(row["default_amount"]), step=1.0, format="%.2f",
                key=f"tmpl_amount_{lid}", label_visibility="collapsed",
            )
            c3.selectbox(
                "Tag", TAG_OPTIONS, index=TAG_OPTIONS.index(row["tag"]),
                key=f"tmpl_tag_{lid}", label_visibility="collapsed",
            )
            if c4.button("✕", key=f"tmpl_remove_{lid}", help="Remove from future months"):
                if row.get("id"):
                    db.deactivate_bill_template(row["id"])
                st.session_state.template_rows = [
                    r for r in st.session_state.template_rows if r["local_id"] != lid
                ]
                st.rerun()

        b1, b2, _ = st.columns([1, 1, 1.2])
        if b1.button("+ Add recurring bill", width="stretch"):
            st.session_state.template_rows.append(
                {"id": None, "name": "", "default_amount": 0.0, "tag": "Joint", "local_id": str(uuid.uuid4())}
            )
            st.rerun()

        if b2.button("Save recurring bills", type="primary", width="stretch"):
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
            st.toast("Recurring bills updated.", icon=":material/check_circle:")
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

    html('<div style="height: 8vh;"></div>')
    col1, col2, col3 = st.columns([1, 1.1, 1])
    with col2:
        with styled_container("mk-white"):
            html(
                f'<div style="text-align:center;">'
                f'<div style="margin-bottom:12px;">{logo_img_html(180, variant="full")}</div>'
                f'<h1 style="font-size:1.5rem;margin:0 0 6px 0;">Household Budget</h1>'
                f'<p style="color:{INK_SOFT};margin:0 0 16px 0;">Enter the shared password to continue</p>'
                f'</div>'
            )
            with st.form("login_form", border=False):
                entered = st.text_input(
                    "Password", type="password", placeholder="Password",
                    label_visibility="collapsed",
                )
                submitted = st.form_submit_button("Unlock", type="primary", width="stretch")
            if submitted:
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

    try:
        db.init_db()
    except Exception as exc:  # the database is unreachable or misconfigured
        st.error(
            "Couldn't reach the database. Check the connection details in the app's "
            "secrets, then reload the page."
        )
        with st.expander("Technical details"):
            st.code(str(exc))
        st.stop()
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

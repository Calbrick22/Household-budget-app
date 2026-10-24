"""
Household Budget - Streamlit app.

Run locally with:  streamlit run app.py
Deploys via Streamlit Community Cloud pointed at this repo - see README.md
for the one-time Postgres + secrets setup.

Screens (st.navigation, one URL each):
    This month   /          the three lanes - Cal, Joint, Dani - and the working
    Edit month   /edit      bills, income and easy-access balance, with a live preview
    History      /history   every month with its key figures, open / delete, CSV
    Trends       /trends    the last six confirmed months as charts
    Settings     /settings  the split settings and the recurring bills
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
# Style: pastel consumer. White cards on an off-white ground, one 20px radius,
# and one hue per owner of money - Cal green, Dani coral, Joint cobalt - each
# with a pale tint for avatars and small tiles and a dark ink for figures.
# The hues sit at about 145, 15 and 218 degrees, so they never read as one.

GROUND = "#F3F5F7"
SURFACE = "#FFFFFF"
WELL = "#F6F7F9"
BORDER = "#E6E6E6"
RULE = "#EEF0F2"
TEXT = "#1B1D1F"
MUTED = "#5C6064"
PRIMARY = "#1B1D1F"

CAL = "#1F6B3D"
CAL_MID = "#3F9A63"
CAL_SOFT = "#DCF3E3"
DANI = "#9A3412"
DANI_MID = "#D0643A"
DANI_SOFT = "#FDE4D9"
JOINT = "#0A3A80"
JOINT_MID = "#1D5FD6"
JOINT_SOFT = "#DCF1FF"

# Neutral data steps for money that belongs to nobody in particular.
NEUTRAL_DARK = "#6B7076"
NEUTRAL_LIGHT = "#C5CAD0"

NEGATIVE = "#C41C29"
NEGATIVE_SOFT = "#FFEDEA"
NEGATIVE_INK = "#831C1E"
WARNING_SOFT = "#FFFBEB"
WARNING_INK = "#92400E"

PEOPLE = {
    "Cal": dict(ink=CAL, mid=CAL_MID, soft=CAL_SOFT),
    "Dani": dict(ink=DANI, mid=DANI_MID, soft=DANI_SOFT),
    "Joint": dict(ink=JOINT, mid=JOINT_MID, soft=JOINT_SOFT),
}

TAG_OPTIONS = ["Joint", "Cal", "Dani"]
FONT_STACK = "Manrope, Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"

_CSS_TEMPLATE = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap');

:root {
    --ground: %(GROUND)s; --surface: %(SURFACE)s; --well: %(WELL)s;
    --border: %(BORDER)s; --rule: %(RULE)s;
    --text: %(TEXT)s; --muted: %(MUTED)s; --primary: %(PRIMARY)s;
    --cal: %(CAL)s; --cal-mid: %(CAL_MID)s; --cal-soft: %(CAL_SOFT)s;
    --dani: %(DANI)s; --dani-mid: %(DANI_MID)s; --dani-soft: %(DANI_SOFT)s;
    --joint: %(JOINT)s; --joint-mid: %(JOINT_MID)s; --joint-soft: %(JOINT_SOFT)s;
    --negative: %(NEGATIVE)s; --negative-soft: %(NEGATIVE_SOFT)s; --negative-ink: %(NEGATIVE_INK)s;
    --warning-soft: %(WARNING_SOFT)s; --warning-ink: %(WARNING_INK)s;
    --radius-card: 20px; --radius-inner: 10px; --radius-chip: 999px;
    --gap: 24px; --pad: 24px;
    --fs-title: 28px; --fs-section: 20px; --fs-kpi: 32px; --fs-body: 16px; --fs-small: 14px;
}

/* One typeface everywhere, except Streamlit's own icon glyphs */
.stApp, .stApp *:not([data-testid="stIconMaterial"]) {
    font-family: Manrope, Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.stApp { background: var(--ground); color: var(--text); }
.stApp h1, .stApp h2, .stApp h3 { color: var(--text); padding: 0; letter-spacing: -0.01em; }
.stApp h1 { font-size: var(--fs-title); font-weight: 600; line-height: 1.2; }
.stApp h2 { font-size: var(--fs-section); font-weight: 600; line-height: 1.3; }
.stApp h3 { font-size: var(--fs-body); font-weight: 600; line-height: 1.4; }
.stApp [data-testid="stHeaderActionElements"] { display: none; }
.stApp input, .num { font-variant-numeric: tabular-nums; }

div[data-testid="stMainBlockContainer"] { max-width: 1240px; padding: 4.25rem 2.5rem 4rem; }
section[data-testid="stSidebar"] { background: var(--ground); border-right: 1px solid var(--border); }

/* Controls: 40px, radius 10, flat; the one primary is near-black */
.stButton > button, .stDownloadButton > button, .stFormSubmitButton > button, div[data-testid="stPopover"] button {
    border-radius: var(--radius-inner); min-height: 40px; font-weight: 600; box-shadow: none;
    transition: background-color .15s ease, border-color .15s ease;
}
.stApp div[data-baseweb="input"], .stApp div[data-baseweb="base-input"], .stApp input,
.stApp div[data-baseweb="select"] > div, .stApp div[data-testid="stNumberInputContainer"] button {
    background-color: var(--surface);
}
.stApp div[data-baseweb="input"], .stApp div[data-baseweb="select"] > div { border-radius: var(--radius-inner); }

/* ---- cards that hold widgets: marker div + :has(), see styled_container ---- */
div[data-testid="stElementContainer"]:has(> div[data-testid="stMarkdown"] .mk) { display: none; }
div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk) {
    background: var(--surface); border: none; border-radius: var(--radius-card); padding: var(--pad);
}
div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-bare) {
    background: transparent; padding: 0; border-radius: 0;
}
div[data-testid="stColumn"]:has(.mk-sticky) { position: sticky; top: 1rem; align-self: flex-start; }

/* ---- cards drawn in HTML ---- */
.card { background: var(--surface); border-radius: var(--radius-card); padding: var(--pad); }
.lane { display: flex; flex-direction: column; }
.lane .foot { margin-top: auto; }
.stack { display: flex; flex-direction: column; gap: var(--gap); }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gap); align-items: stretch; }
.grid-2-1 { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--gap); align-items: start; }
.subtitle { color: var(--muted); font-size: var(--fs-body); line-height: 1.5; margin: 4px 0 0 0; }
.finding { font-size: var(--fs-body); line-height: 1.5; margin: 6px 0 0 0; }
.muted { color: var(--muted); }
.small { font-size: var(--fs-small); }

.avatar {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    border-radius: 50%; font-weight: 700;
}
.pill {
    display: inline-flex; align-items: center; flex: none; white-space: nowrap;
    height: 24px; padding: 0 10px; border-radius: var(--radius-chip);
    font-size: 13px; font-weight: 600; vertical-align: middle;
}
.pill.confirmed { background: #EEF1F4; color: #3A3D40; }
.pill.draft { background: var(--warning-soft); color: var(--warning-ink); }

.lane-head { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.lane-head h2 { margin: 0; font-size: var(--fs-section); }
.lane-label { color: var(--muted); font-size: var(--fs-small); margin: 0; }
.stApp .big { font-size: var(--fs-kpi); font-weight: 600; line-height: 1.15; letter-spacing: -0.02em; margin: 2px 0 4px 0; font-variant-numeric: tabular-nums; }
.stApp .big .pence { font-size: 0.6em; color: var(--muted); font-weight: 500; }
.calc { color: var(--muted); font-size: var(--fs-small); line-height: 1.5; margin: 0 0 16px 0; }
.row {
    display: flex; justify-content: space-between; align-items: baseline; gap: 16px;
    padding: 10px 0; border-top: 1px solid var(--rule); font-variant-numeric: tabular-nums;
}
.row .amt { font-weight: 600; white-space: nowrap; text-align: right; }
.row .sub { display: block; color: var(--muted); font-size: var(--fs-small); font-weight: 400; }
.row.indent > span:first-child { padding-left: 16px; color: var(--muted); }
.row.total { font-weight: 600; border-top: 1px solid var(--border); }
ol.moves { margin: 0; padding: 0 0 0 1.4em; }
ol.moves li { border-top: 1px solid var(--rule); }
ol.moves li::marker { font-weight: 700; }
ol.moves li .row { border-top: none; }
.group-label { color: var(--muted); font-size: var(--fs-small); margin: 18px 0 2px 0; }
.alert { border-radius: var(--radius-inner); padding: 12px 14px; font-size: var(--fs-small); line-height: 1.5; margin-top: 14px; }
.alert.bad { background: var(--negative-soft); color: var(--negative-ink); }

.track { position: relative; height: 10px; border-radius: 999px; background: var(--well); overflow: hidden; margin: 10px 0 6px 0; display: flex; }
.track span { display: block; height: 100%; }
.track-ends { display: flex; justify-content: space-between; color: var(--muted); font-size: var(--fs-small); font-variant-numeric: tabular-nums; }

.working h2 { margin: 0 0 4px 0; }
.working .step { margin-top: 18px; }
.working .step h3 { margin: 0 0 2px 0; font-size: var(--fs-small); color: var(--muted); font-weight: 600; }
.cmp { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; border: none; }
.stApp .cmp th, .stApp .cmp td { border: none; background: none; }
.stApp .cmp tr { border: none; background: none; }
.cmp th { font-size: var(--fs-small); color: var(--muted); font-weight: 500; text-align: right; padding: 0 0 8px 8px; }
.cmp th:first-child { text-align: left; padding-left: 0; }
.stApp .cmp td { padding: 10px 0 10px 8px; border-top: 1px solid var(--rule); text-align: right; white-space: nowrap; }
.cmp td:first-child { text-align: left; padding-left: 0; white-space: normal; }
.chg { color: var(--muted); font-size: var(--fs-small); }
.chg.bad { color: var(--negative); font-weight: 600; }

.rows-head { color: var(--muted); font-size: var(--fs-small); font-weight: 500; }
.tag-totals { display: flex; flex-wrap: wrap; gap: 8px 20px; color: var(--muted); font-size: var(--fs-small); font-variant-numeric: tabular-nums; }
.tag-totals b { color: var(--text); font-weight: 600; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }

.hist-month { font-weight: 600; }
.hist-sub { display: none; color: var(--muted); font-size: var(--fs-small); font-variant-numeric: tabular-nums; }
.hist-num { text-align: right; font-variant-numeric: tabular-nums; }
.hist-head { color: var(--muted); font-size: var(--fs-small); }
.hist-head.r { text-align: right; }

.settings-label h2 { margin: 0 0 6px 0; }
.settings-label p { color: var(--muted); font-size: var(--fs-small); line-height: 1.5; margin: 0 0 8px 0; }
.preview { background: var(--well); border-radius: var(--radius-inner); padding: 14px 16px; margin-top: 4px; }
.empty { color: var(--muted); line-height: 1.6; margin: 0; }

/* Phone navigation: one row of page links above every screen, hidden on wider screens */
div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-phonenav) { display: none; }

@media (max-width: 900px) {
    .grid-3, .grid-2-1 { grid-template-columns: minmax(0, 1fr); }
    div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .mk-sticky) { flex-direction: column; }
    div[data-testid="stHorizontalBlock"]:has(> div[data-testid="stColumn"] .mk-sticky) > div[data-testid="stColumn"] { width: 100%; flex: 1 1 auto; position: static; }
    div[data-testid="stHorizontalBlock"]:has(.hist-head):not(:has(div[data-testid="stHorizontalBlock"])) { display: none; }
    div[data-testid="stHorizontalBlock"]:has(.hist-month) { overflow: visible; padding: 4px 0 12px; }
    .hist-sub { padding-bottom: 16px; }
    div[data-testid="stHorizontalBlock"]:has(.hist-month) > div[data-testid="stColumn"]:first-child { flex: 1 1 0; min-width: 0; }
    div[data-testid="stHorizontalBlock"]:has(.hist-month) > div[data-testid="stColumn"]:last-child { flex: 0 0 auto; width: auto; }
    div[data-testid="stHorizontalBlock"]:has(.hist-month) > div[data-testid="stColumn"]:is(:nth-child(2), :nth-child(3), :nth-child(4), :nth-child(5)) { display: none; }
    .hist-sub { display: block; }
}
@media (max-width: 640px) {
    div[data-testid="stMainBlockContainer"] { padding: 3.5rem 1rem 3rem; }
    .stApp div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-phonenav) {
        display: flex; background: var(--surface); border-radius: var(--radius-inner); padding: 4px; margin-bottom: 8px;
    }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-phonenav) div[data-testid="stElementContainer"] { flex: 1 1 0; min-width: 0; width: auto; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-phonenav) a[data-testid="stPageLink-NavLink"] { justify-content: center; padding: 8px 0; margin: 0; gap: 0; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-phonenav) a[data-testid="stPageLink-NavLink"] * { margin: 0; padding: 0; font-size: 15px; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-phonenav) [data-testid="stIconMaterial"] { display: none; }
    .stApp h1 { font-size: 24px; }
    .card, div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk) { padding: 18px 16px; }
    .stApp .big { font-size: 28px; }
    div[data-testid="stColumn"]:has(.mk-sticky) { position: static; }

    /* Bill rows: the name takes its own line; amount, whose bill and remove share the next */
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"] { flex: 1 1 0; min-width: 0; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"]:first-child { flex: 1 1 100%; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"]:last-child { flex: 0 0 44px; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] > div[data-testid="stColumn"]:last-child button { min-width: 44px; padding: 0; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) div[data-testid="stHorizontalBlock"] { row-gap: 8px; margin-bottom: 14px; }
    div[data-testid="stVerticalBlock"]:has(> div[data-testid="stElementContainer"] .mk-rows) button[data-testid^="stNumberInputStep"] { display: none; }
    div[data-testid="stHorizontalBlock"]:has(.rows-head):not(:has(div[data-testid="stHorizontalBlock"])) { display: none; }
}
</style>
"""

# Fill the :root tokens from the Python constants (plain replace, because the
# CSS itself is full of % signs).
CUSTOM_CSS = _CSS_TEMPLATE
for _name, _value in dict(
    GROUND=GROUND, SURFACE=SURFACE, WELL=WELL, BORDER=BORDER, RULE=RULE, TEXT=TEXT,
    MUTED=MUTED, PRIMARY=PRIMARY, CAL=CAL, CAL_MID=CAL_MID, CAL_SOFT=CAL_SOFT, DANI=DANI,
    DANI_MID=DANI_MID, DANI_SOFT=DANI_SOFT, JOINT=JOINT, JOINT_MID=JOINT_MID,
    JOINT_SOFT=JOINT_SOFT, NEGATIVE=NEGATIVE, NEGATIVE_SOFT=NEGATIVE_SOFT,
    NEGATIVE_INK=NEGATIVE_INK, WARNING_SOFT=WARNING_SOFT, WARNING_INK=WARNING_INK,
).items():
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


def html(markup: str, target=st):
    target.markdown(_flatten_html(markup), unsafe_allow_html=True)


# ---------- formatting ----------

def money(value: float) -> str:
    if value < 0:
        return f"−£{-value:,.2f}"
    return f"£{value:,.2f}"


def big_money(value: float) -> str:
    """A headline figure with the pence set smaller and grey."""
    pounds, pence = money(value).rsplit(".", 1)
    return f'{pounds}<span class="pence">.{pence}</span>'


def pct(share: float) -> str:
    return f"{share * 100:.2f}%"


def month_label(month: int, year: int) -> str:
    return f"{calendar.month_name[month]} {year}"


def avatar_html(person: str, size: int = 32) -> str:
    p = PEOPLE[person]
    return (
        f'<span class="avatar" style="width:{size}px;height:{size}px;background:{p["soft"]};'
        f'color:{p["ink"]};font-size:{int(size * 0.44)}px;" aria-hidden="true">{person[0]}</span>'
    )


def row_html(label: str, value: str, cls: str = "", sub: str = "") -> str:
    sub_html = f'<span class="sub">{sub}</span>' if sub else ""
    return f'<div class="row {cls}"><span>{label}{sub_html}</span><span class="amt">{value}</span></div>'


def status_pill(confirmed: bool) -> str:
    return '<span class="pill confirmed">Confirmed</span>' if confirmed else '<span class="pill draft">Draft</span>'


# ---------- calculation helpers ----------

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


def sorted_months():
    """All months, oldest first."""
    return sorted(db.get_all_months(), key=lambda m: (m["year"], m["month"]))


def next_month_after(months):
    if not months:
        today = datetime.date.today()
        return today.year, today.month
    last = months[-1]
    return (last["year"] + 1, 1) if last["month"] == 12 else (last["year"], last["month"] + 1)


def previous_confirmed(months, month):
    earlier = [m for m in months if m["confirmed"] and (m["year"], m["month"]) < (month["year"], month["month"])]
    return earlier[-1] if earlier else None


# ---------- navigation ----------

PAGES = {}


def open_month(month_id: int):
    st.switch_page(PAGES["month"], query_params={"month": str(month_id)})


def edit_month(month_id: int):
    st.session_state.pop("loaded_month_id", None)
    st.switch_page(PAGES["edit"], query_params={"month": str(month_id)})


def start_month(year: int, month: int):
    edit_month(db.get_or_create_month(year, month))


def month_from_query(months):
    """The month named in the URL, else the latest confirmed one, else the latest."""
    raw = st.query_params.get("month")
    ids = {m["id"]: m for m in months}
    if raw and raw.isdigit() and int(raw) in ids:
        return ids[int(raw)]
    confirmed = [m for m in months if m["confirmed"]]
    if confirmed:
        return confirmed[-1]
    return months[-1] if months else None


def month_picker_popover(months, key: str, label: str = "Other month", target=st):
    """Any month and year, for back-filling or skipping ahead."""
    year, month = next_month_after(months)
    with target.popover(label, width="stretch"):
        pm = st.selectbox("Month", list(range(1, 13)), index=month - 1,
                          format_func=lambda m: calendar.month_name[m], key=f"{key}_m")
        py = st.number_input("Year", min_value=2000, max_value=2100, value=year, step=1, key=f"{key}_y")
        if st.button("Open month", key=f"{key}_go", type="primary", width="stretch"):
            start_month(int(py), int(pm))


def render_new_month_controls(months, key: str):
    """'Start <next month>' as one click, and any other month behind a popover."""
    year, month = next_month_after(months)
    c1, c2 = st.columns([3, 2], gap="small")
    if c1.button(f"Start {calendar.month_name[month]} {year}", key=f"{key}_next", type="primary", width="stretch"):
        start_month(year, month)
    month_picker_popover(months, key, target=c2)


# ---------- This month: the three lanes ----------

def person_lane_html(result, person: str) -> str:
    """The transfers to make out of a person's income account, in the order
    to make them: joint first (savings & bills), then personal spending,
    then personal savings - whatever's left after those three covers that
    person's own bills, and never has to move at all."""
    if person == "Cal":
        income, bills = result.cal_income, result.cal_personal_bills
        to_joint, savings = result.cal_to_joint, result.cal_personal_savings
    else:
        income, bills = result.dani_income, result.dani_personal_bills
        to_joint, savings = result.dani_to_joint, result.dani_personal_savings
    total_out = to_joint + result.allowance_per_person + savings
    joint_sub = "joint savings and bills"
    if to_joint < 0:
        joint_sub = f'<span style="color:{NEGATIVE};">would be {money(to_joint)}, see the note above</span>'
    return f"""
    <section class="card lane" aria-label="{person}'s account">
        <div class="lane-head">{avatar_html(person)}<h2>{person}'s account</h2></div>
        <p class="lane-label">Transferred out, in this order</p>
        <div class="big">{big_money(max(total_out, 0))}</div>
        <p class="calc">{money(income)} income − {money(bills)} personal bills</p>
        <ol class="moves">
            <li>{row_html("Joint account", money(max(to_joint, 0)), sub=joint_sub)}</li>
            <li>{row_html("Personal account", money(result.allowance_per_person), sub="allowance")}</li>
            <li>{row_html("Personal savings", money(savings))}</li>
        </ol>
        <div class="foot">{row_html("Left in account for personal bills", money(bills), cls="total")}</div>
    </section>
    """


def easy_access_html(result) -> str:
    """The easy-access pot as a track: the balance before this month in the
    joint hue, this month's top-up in its pale tint, both ends labelled."""
    target = result.easy_access_target
    balance = result.current_easy_access_balance
    if target <= 0:
        return '<section class="card"><h2>Easy-access pot</h2><p class="empty">No target set. Add one in Settings.</p></section>'
    before = max(0.0, min(balance / target, 1.0)) * 100
    added = max(0.0, min(result.to_easy_access / target, 1.0 - before / 100)) * 100
    return f"""
    <section class="card"><h2>Easy-access pot</h2>
    <p class="calc" style="margin:4px 0 0 0;">{money(result.to_easy_access)} goes in this month, {money(result.to_long_term)} to the long-term pot.</p>
    <div class="track" role="img" aria-label="{money(balance)} of {money(target)}, plus {money(result.to_easy_access)} this month">
        <span style="width:{before:.2f}%;background:{JOINT_MID};"></span>
        <span style="width:{added:.2f}%;background:#9DBDF0;"></span>
    </div>
    <div class="track-ends"><span>{money(balance)} + {money(result.to_easy_access)}</span><span>{money(target)} target</span></div>
    </section>"""


def joint_lane_html(result) -> str:
    into_joint = result.cal_to_joint + result.dani_to_joint
    return f"""
    <section class="card lane" aria-label="Joint account">
        <div class="lane-head">{avatar_html("Joint")}<h2>Joint account</h2></div>
        <p class="lane-label">Comes in from you both</p>
        <div class="big">{big_money(into_joint)}</div>
        <p class="calc">Cal {money(result.cal_to_joint)} + Dani {money(result.dani_to_joint)}</p>
        {row_html("Joint bills", money(result.joint_bills_total), sub="paid from the joint account")}
        {row_html("Joint savings", money(result.joint_savings), sub=f"{result.savings_rate:.0%} of the {money(max(result.remainder, 0))} left after bills and allowances")}
        {row_html("To easy-access pot", money(result.to_easy_access), cls="indent")}
        {row_html("To long-term pot", money(result.to_long_term), cls="indent")}
        <div class="foot">{row_html("Paid out", money(result.joint_bills_total + result.joint_savings), cls="total")}</div>
    </section>
    """


def working_html(result) -> str:
    """The waterfall, step by step in the model's own order."""
    shortfall = ""
    if result.is_shortfall:
        shortfall = (
            f'<div class="alert bad" role="alert">Shortfall this month: income doesn\'t cover bills and '
            f"allowances by {money(-result.remainder)}. Nothing has been adjusted automatically - "
            f"decide how to handle it and re-edit the month if needed.</div>"
        )
    return f"""
    <section class="card working">
        <h2>How the split is worked out</h2>
        <div class="step"><h3>1. Income, less each person's own bills</h3>
            {row_html("Cal", money(result.cal_remainder), sub=f"{money(result.cal_income)} income − {money(result.cal_personal_bills)} personal bills")}
            {row_html("Dani", money(result.dani_remainder), sub=f"{money(result.dani_income)} income − {money(result.dani_personal_bills)} personal bills")}
            {row_html("Into the joint pot", money(result.pot), cls="total", sub=f"Cal {pct(result.cal_contribution_share)} · Dani {pct(result.dani_contribution_share)}")}
        </div>
        <div class="step"><h3>2. Paid from the pot</h3>
            {row_html("Joint bills", "−" + money(result.joint_bills_total))}
            {row_html(f"Allowances ({money(result.allowance_per_person)} × 2)", "−" + money(result.allowance_total))}
            {row_html("Left after bills and allowances", money(result.remainder), cls="total")}
        </div>
        {shortfall}
        <div class="step"><h3>3. What's left is saved</h3>
            {row_html(f"Joint savings ({result.savings_rate:.0%})", money(result.joint_savings))}
            {row_html("Personal savings", money(result.personal_savings_total), sub="the rest, split by what each of you put into the pot")}
            {row_html(f"Cal ({pct(result.cal_contribution_share)})", money(result.cal_personal_savings), cls="indent")}
            {row_html(f"Dani ({pct(result.dani_contribution_share)})", money(result.dani_personal_savings), cls="indent")}
        </div>
        <p class="calc" style="margin:14px 0 0 0;">All bills this month: {money(result.bills_total)}
        (Cal {money(result.cal_personal_bills)}, Dani {money(result.dani_personal_bills)}, joint {money(result.joint_bills_total)}).</p>
    </section>
    """


def comparison_html(result, prev_result, prev_name: str) -> str:
    """This month against the previous confirmed one. Colour only on a change
    in the bad direction; everything else grey."""
    if prev_result is None:
        return ('<section class="card"><h2>Against last month</h2><p class="empty" style="margin-top:8px;">'
                'No earlier confirmed month to compare with yet.</p></section>')

    def change(cur, prev, bad_if_up):
        diff = round(cur - prev, 2)
        if abs(diff) < 0.005:
            return '<span class="chg">—</span>'
        sign = "+" if diff > 0 else "−"
        bad = (bad_if_up is True and diff > 0) or (bad_if_up is False and diff < 0)
        return f'<span class="chg{" bad" if bad else ""}">{sign}£{abs(diff):,.2f}</span>'

    lines = [
        ("Income", result.total_income, prev_result.total_income, False),
        ("All bills", result.bills_total, prev_result.bills_total, True),
        ("Joint savings", result.joint_savings, prev_result.joint_savings, False),
        ("Personal savings", result.personal_savings_total, prev_result.personal_savings_total, False),
        ("Into joint", result.cal_to_joint + result.dani_to_joint,
         prev_result.cal_to_joint + prev_result.dani_to_joint, None),
    ]
    body = "".join(
        f"<tr><td>{n}</td><td>{money(c)}</td><td>{change(c, p, b)}</td></tr>" for n, c, p, b in lines
    )
    return f"""
    <section class="card"><h2>Against {prev_name}</h2>
    <table class="cmp" style="margin-top:12px;"><thead><tr><th>Figure</th><th>This month</th><th>Change</th></tr></thead>
    <tbody>{body}</tbody></table></section>
    """


def finding_text(result) -> str:
    """The one line under the title: what this month comes to."""
    if result.is_shortfall:
        return (f'<span style="color:{NEGATIVE};font-weight:600;">Short by {money(-result.remainder)}.</span> '
                f"Bills and allowances are more than the pot, so nothing is saved this month.")
    saved = result.joint_savings + result.personal_savings_total
    return (f"{money(saved)} saved: {money(result.joint_savings)} joint and "
            f"{money(result.personal_savings_total)} personal, split {pct(result.cal_contribution_share)} Cal / "
            f"{pct(result.dani_contribution_share)} Dani.")


def page_month():
    months = sorted_months()
    month = month_from_query(months)

    if month is None:
        st.title("This month")
        st.write("")
        with styled_container("mk-card"):
            html('<h2 style="margin:0 0 6px 0;">No months yet</h2><p class="empty">Start the first month, '
                 'enter its bills and income, and the transfers for each of you appear here.</p>')
            render_new_month_controls(months, "empty")
        return

    result, _ = calculate_month(month["id"])
    title_col, pick_col, action_col = st.columns([5, 2.2, 3.4], vertical_alignment="center")
    html(f'<h1 style="margin:0;">{month_label(month["month"], month["year"])} {status_pill(month["confirmed"])}</h1>', title_col)
    with pick_col:
        ids = [m["id"] for m in reversed(months)]
        labels = {m["id"]: month_label(m["month"], m["year"]) + ("" if m["confirmed"] else " (draft)") for m in months}
        chosen = st.selectbox("Month", ids, index=ids.index(month["id"]), format_func=labels.get,
                              label_visibility="collapsed")
        if chosen != month["id"]:
            open_month(chosen)
    with action_col:
        a1, a2 = st.columns(2, gap="small", wrap=False)
        if a1.button("Edit month" if month["confirmed"] else "Finish month",
                     type="secondary" if month["confirmed"] else "primary", width="stretch"):
            edit_month(month["id"])
        year, mon = next_month_after(months)
        if a2.button(f"Start {calendar.month_abbr[mon]} {year}", width="stretch",
                     type="primary" if month["confirmed"] else "secondary"):
            start_month(year, mon)

    note = ""
    if not month["confirmed"]:
        note = ('<p class="finding" style="color:var(--warning-ink);">Draft: these figures are a preview until '
                'you finish the month.</p>')
    for person, to_joint, pronoun in (("Cal", result.cal_to_joint, "his"), ("Dani", result.dani_to_joint, "her")):
        if to_joint < 0:
            note += (f'<div class="alert bad" role="alert">{person}\'s allowance and savings add up to more than '
                     f"what's left after {pronoun} own bills this month - the joint transfer can't go negative, "
                     f"so the shortfall needs covering another way.</div>")
    html(f'<p class="finding">{finding_text(result)}</p>{note}')
    st.write("")

    html(f'<div class="grid-3">{person_lane_html(result, "Cal")}{joint_lane_html(result)}{person_lane_html(result, "Dani")}</div>')
    st.write("")

    prev = previous_confirmed(months, month)
    prev_result = calculate_month(prev["id"])[0] if prev else None
    prev_name = calendar.month_name[prev["month"]] if prev else ""
    settings_used = f"""<section class="card"><h2>Settings used</h2>
        {row_html("Allowance per person", money(result.allowance_per_person))}
        {row_html("Joint savings rate", f"{result.savings_rate:.0%}")}
        {row_html("Easy-access target", money(result.easy_access_target))}
        <p class="calc" style="margin:10px 0 0 0;">Today's settings, applied to every month. Change them in Settings.</p></section>"""
    html(f'<div class="grid-2-1">{working_html(result)}<div class="stack">{easy_access_html(result)}'
         f'{comparison_html(result, prev_result, prev_name)}{settings_used}</div></div>')


# ---------- Edit month ----------

def render_bill_rows_header(amount_label: str):
    c1, c2, c3, c4 = st.columns([4, 2, 2, 1])
    for col, text in ((c1, "Bill"), (c2, amount_label), (c3, "Whose bill"), (c4, "")):
        html(f'<div class="rows-head">{text}</div>', col)


def preview_from_inputs():
    """Run the waterfall on what's typed in right now, before it's saved -
    the same inputs save_all_fields() writes, so it matches once saved."""
    settings = db.get_settings()
    bills_total = cal_bills = dani_bills = 0.0
    for row in st.session_state.bill_rows:
        lid = row["local_id"]
        if not st.session_state.get(f"name_{lid}", "").strip():
            continue
        amount = float(st.session_state.get(f"amount_{lid}", 0.0) or 0.0)
        tag = st.session_state.get(f"tag_{lid}", "Joint")
        bills_total += amount
        if tag == "Cal":
            cal_bills += amount
        elif tag == "Dani":
            dani_bills += amount
    cal_income = float(st.session_state["cal_salary_input"] or 0) + float(st.session_state["cal_raf_input"] or 0)
    try:
        return calculate_waterfall(
            cal_income, float(st.session_state["dani_income_input"] or 0), round(bills_total, 2),
            float(settings["allowance_per_person"]), float(settings["savings_rate"]),
            float(settings["easy_access_target"]), float(st.session_state["easy_access_input"] or 0),
            cal_personal_bills=round(cal_bills, 2), dani_personal_bills=round(dani_bills, 2),
        )
    except ValueError as exc:
        return str(exc)


def preview_html(preview) -> str:
    if isinstance(preview, str):
        return f'<section class="card"><h2>Preview</h2><div class="alert bad">{preview}</div></section>'
    alerts = ""
    if preview.is_shortfall:
        alerts = f'<div class="alert bad">Shortfall: bills and allowances are {money(-preview.remainder)} more than the pot.</div>'
    elif preview.cal_to_joint < 0 or preview.dani_to_joint < 0:
        alerts = '<div class="alert bad">A joint transfer would go below zero this month.</div>'
    return f"""
    <section class="card working">
        <h2>Preview</h2>
        <p class="calc" style="margin:2px 0 0 0;">Updates as you type. Nothing is saved until you press a button below.</p>
        <div class="step"><h3>Transfers</h3>
            {row_html("Cal → joint account", money(max(preview.cal_to_joint, 0)))}
            {row_html("Dani → joint account", money(max(preview.dani_to_joint, 0)))}
            {row_html("Each personal account (allowance)", money(preview.allowance_per_person))}
        </div>
        <div class="step"><h3>The working</h3>
            {row_html("Into the joint pot", money(preview.pot), sub=f"Cal {pct(preview.cal_contribution_share)} · Dani {pct(preview.dani_contribution_share)}")}
            {row_html("Joint bills", "−" + money(preview.joint_bills_total))}
            {row_html("Allowances", "−" + money(preview.allowance_total))}
            {row_html("Left after bills and allowances", money(preview.remainder), cls="total")}
            {row_html(f"Joint savings ({preview.savings_rate:.0%})", money(preview.joint_savings))}
            {row_html("Cal personal savings", money(preview.cal_personal_savings))}
            {row_html("Dani personal savings", money(preview.dani_personal_savings))}
        </div>
        {alerts}
    </section>
    """


def page_edit():
    months = sorted_months()
    raw = st.query_params.get("month")
    if not raw or not raw.isdigit() or int(raw) not in {m["id"] for m in months}:
        st.switch_page(PAGES["month"])
    month_id = int(raw)
    st.session_state.month_id = month_id

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
    name = month_label(month["month"], month["year"])

    t1, t2 = st.columns([7, 2], vertical_alignment="center")
    html(f'<h1 style="margin:0;">Edit {name} {status_pill(month["confirmed"])}</h1>', t1)
    if t2.button(f"Back to {calendar.month_abbr[month['month']]} {month['year']}", width="stretch"):
        open_month(month_id)
    if month["confirmed"]:
        html('<p class="finding" style="color:var(--warning-ink);">This month is already confirmed - '
             'edits will change saved figures.</p>')
    else:
        html('<p class="finding muted">Enter this month\'s bills and income, check the preview, then '
             'finish the month.</p>')
    st.write("")

    form_col, preview_col = st.columns([3, 2], gap="medium")

    with form_col:
        with styled_container("mk-card mk-rows"):
            html('<h2 style="margin:0;">Bills and expenses</h2>')
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
                if c4.button("", icon=":material/close:", key=f"remove_{lid}", help="Remove this bill now"):
                    if row.get("id"):
                        db.delete_bill_entry(row["id"])
                    st.session_state.bill_rows = [
                        r for r in st.session_state.bill_rows if r["local_id"] != lid
                    ]
                    st.rerun()

            totals = {"Joint": 0.0, "Cal": 0.0, "Dani": 0.0}
            for row in st.session_state.bill_rows:
                lid = row["local_id"]
                if st.session_state.get(f"name_{lid}", "").strip():
                    totals[st.session_state.get(f"tag_{lid}", "Joint")] += float(st.session_state.get(f"amount_{lid}", 0.0) or 0.0)
            html('<div class="tag-totals">' + "".join(
                f'<span><span class="dot" style="background:{PEOPLE[t]["mid"]};"></span>{t} <b>{money(v)}</b></span>'
                for t, v in totals.items()
            ) + f'<span>Total <b>{money(sum(totals.values()))}</b></span></div>')

            if st.button("+ Add one-off bill / expense"):
                st.session_state.bill_rows.append(
                    {"id": None, "name": "", "amount": 0.0, "tag": "Joint", "local_id": str(uuid.uuid4())}
                )
                st.rerun()
            st.caption(
                "One-off items here don't carry forward to next month. Editing a bill that came from "
                "your recurring list also updates that list for future months. The cross removes a bill straight away."
            )

        with styled_container("mk-card"):
            html('<h2 style="margin:0;">Income</h2>')
            c_cal, c_dani = st.columns(2, gap="medium")
            with c_cal:
                html(f'<div class="lane-head" style="margin:0;">{avatar_html("Cal", 28)}<h3 style="margin:0;">Cal</h3></div>')
                st.number_input("Salary (£)", step=1.0, format="%.2f", key="cal_salary_input")
                st.number_input("RAF (£)", step=1.0, format="%.2f", key="cal_raf_input")
            with c_dani:
                html(f'<div class="lane-head" style="margin:0;">{avatar_html("Dani", 28)}<h3 style="margin:0;">Dani</h3></div>')
                st.number_input("Income (£)", step=1.0, format="%.2f", key="dani_income_input")

        with styled_container("mk-card"):
            html(f'<div class="lane-head" style="margin:0;">{avatar_html("Joint")}<h2>Easy-access pot</h2></div>')
            st.number_input(
                "Balance at the start of this month (£)", step=1.0, format="%.2f", key="easy_access_input",
                help="Used to work out how much of this month's joint savings tops the pot up to target.",
            )
            prev = previous_confirmed(months, month)
            if prev:
                prev_result, _ = calculate_month(prev["id"])
                suggestion = round(prev_result.current_easy_access_balance + prev_result.to_easy_access, 2)
                if abs(suggestion - float(st.session_state["easy_access_input"] or 0)) >= 0.005:
                    html(f'<p class="calc" style="margin:0;">{calendar.month_name[prev["month"]]} started at '
                         f'{money(prev_result.current_easy_access_balance)} and added '
                         f'{money(prev_result.to_easy_access)}, which makes {money(suggestion)}.</p>')
                    st.button(f"Use {money(suggestion)}",
                              on_click=lambda v=suggestion: st.session_state.update(easy_access_input=v))

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

    with preview_col:
        with styled_container("mk-bare mk-sticky"):
            html(preview_html(preview_from_inputs()))
            b1, b2 = st.columns(2, gap="small")
            if b1.button("Save draft", width="stretch"):
                save_all_fields()
                st.session_state.pop("loaded_month_id", None)
                st.toast("Bills and incomes have been saved.", icon=":material/check_circle:")
                st.rerun()
            if month["confirmed"]:
                if b2.button("Save changes", type="primary", width="stretch"):
                    save_all_fields()
                    st.toast("Changes saved.", icon=":material/check_circle:")
                    open_month(month_id)
            elif b2.button("Finish month", type="primary", width="stretch",
                           help="Saves everything and confirms the month."):
                save_all_fields()
                db.set_month_confirmed(month_id, True)
                st.toast(f"{name} has been saved.", icon=":material/check_circle:")
                open_month(month_id)


# ---------- History ----------

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


HIST_SPEC = [3, 1.6, 1.6, 1.6, 1.6, 2.4]


def page_history():
    oldest_first = sorted_months()
    months = list(reversed(oldest_first))
    t1, t3, t2 = st.columns([4, 1.4, 1.4], vertical_alignment="center")
    with t1:
        st.title("History")
        html(f'<p class="subtitle">{len(months)} month{"s" if len(months) != 1 else ""}, newest first.</p>')
    month_picker_popover(oldest_first, "hist_add", "Add a month", target=t3)
    with t2:
        if "csv_export_bytes" in st.session_state:
            st.download_button(
                "Download CSV", data=st.session_state.csv_export_bytes,
                file_name="household_budget_export.csv", mime="text/csv", width="stretch",
            )
        elif st.button("Prepare CSV export", width="stretch"):
            st.session_state.csv_export_bytes = build_csv_bytes()
            st.rerun()
    st.write("")

    if not months:
        with styled_container("mk-card"):
            html('<p class="empty">No months yet. Start one and it will be listed here.</p>')
            render_new_month_controls([], "hist_empty")
        return

    with styled_container("mk-card mk-history"):
        heads = st.columns(HIST_SPEC, vertical_alignment="bottom")
        for col, text, right in zip(heads, ["Month", "Income", "Saved", "Cal → joint", "Dani → joint", ""],
                                    [False, True, True, True, True, False]):
            html(f'<div class="hist-head{" r" if right else ""}">{text}</div>', col)

        for m in months:
            label = month_label(m["month"], m["year"])
            result, _ = calculate_month(m["id"])
            saved = result.joint_savings + result.personal_savings_total
            if result.is_shortfall:
                saved_text = f'<span style="color:{NEGATIVE};">Short {money(-result.remainder)}</span>'
                saved_sub = f"short {money(-result.remainder)}"
            else:
                saved_text = money(saved)
                saved_sub = f"saved {money(saved)}"
            cal_j, dani_j = money(max(result.cal_to_joint, 0)), money(max(result.dani_to_joint, 0))
            cols = st.columns(HIST_SPEC, vertical_alignment="center", wrap=False)
            html(f'<div class="hist-month">{label} {status_pill(m["confirmed"])}</div>'
                 f'<div class="hist-sub">{money(result.total_income)} in · {saved_sub}<br>'
                 f'Cal {cal_j} · Dani {dani_j} to joint</div>', cols[0])
            html(f'<div class="hist-num">{money(result.total_income)}</div>', cols[1])
            html(f'<div class="hist-num">{saved_text}</div>', cols[2])
            html(f'<div class="hist-num">{cal_j}</div>', cols[3])
            html(f'<div class="hist-num">{dani_j}</div>', cols[4])
            with cols[5]:
                actions = st.container(horizontal=True, horizontal_alignment="right", gap="small")
                if actions.button("Open", key=f"open_{m['id']}"):
                    open_month(m["id"])
                if actions.button("Delete", key=f"delete_{m['id']}"):
                    st.session_state.pending_delete_id = m["id"]
                    st.rerun()

            if st.session_state.get("pending_delete_id") == m["id"]:
                st.warning(f"Permanently delete {label}? This can't be undone.")
                yes_col, no_col, _ = st.columns([1, 1, 2])
                if yes_col.button("Yes, delete", key=f"confirm_delete_{m['id']}", width="stretch"):
                    db.delete_month(m["id"])
                    st.session_state.pending_delete_id = None
                    st.session_state.pop("csv_export_bytes", None)
                    st.rerun()
                if no_col.button("Cancel", key=f"cancel_delete_{m['id']}", width="stretch"):
                    st.session_state.pending_delete_id = None
                    st.rerun()


# ---------- Trends ----------

CHART_CONFIG = {"displayModeBar": False}


def _style_chart(fig, height: int = 260):
    fig.update_layout(
        height=height,
        margin=dict(l=4, r=4, t=4, b=4),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family=FONT_STACK, size=13, color=TEXT),
        legend=dict(orientation="h", x=0, xanchor="left", y=1.02, yanchor="bottom", title=None,
                    font=dict(color=MUTED, size=13)),
        hoverlabel=dict(font=dict(family=FONT_STACK), bgcolor=SURFACE, bordercolor=BORDER),
    )
    fig.update_xaxes(showgrid=False, showline=True, linecolor=BORDER, tickfont=dict(color=MUTED, size=12))
    fig.update_yaxes(gridcolor="#ECEEF0", zeroline=False, showline=False,
                     tickfont=dict(color=MUTED, size=12), title=None, nticks=5)
    return fig


def build_trend_figure(confirmed_months):
    labels, easy_vals, long_vals = [], [], []
    for m in confirmed_months:
        result, _ = calculate_month(m["id"])
        labels.append(f"{calendar.month_abbr[m['month']]} {m['year']}")
        easy_vals.append(result.to_easy_access)
        long_vals.append(result.to_long_term)

    fig = go.Figure(data=[
        go.Bar(name="Easy-access", x=labels, y=easy_vals, marker_color=JOINT_MID, marker_line_width=0,
               hovertemplate="Easy-access: £%{y:,.2f}<extra></extra>"),
        go.Bar(name="Long-term", x=labels, y=long_vals, marker_color=JOINT, marker_line_width=0,
               hovertemplate="Long-term: £%{y:,.2f}<extra></extra>"),
    ])
    fig.update_layout(barmode="stack", bargap=0.5, legend_traceorder="normal")
    fig.update_yaxes(tickprefix="£", tickformat=",.0f", rangemode="tozero")
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
    node_colors = [CAL_MID, DANI_MID, NEUTRAL_DARK, NEUTRAL_DARK, NEUTRAL_LIGHT, CAL_MID, DANI_MID,
                   JOINT_MID, JOINT_MID, JOINT]
    idx = {name: i for i, name in enumerate(labels)}
    links = [
        (idx["Cal income"], idx["Total income"], result.cal_income, CAL_SOFT),
        (idx["Dani income"], idx["Total income"], result.dani_income, DANI_SOFT),
        (idx["Total income"], idx["Bills"], result.bills_total, "#E3E6EA"),
        (idx["Total income"], idx["Allowances"], result.allowance_total, "#EEF0F2"),
        (idx["Total income"], idx["Cal personal savings"], result.cal_personal_savings, CAL_SOFT),
        (idx["Total income"], idx["Dani personal savings"], result.dani_personal_savings, DANI_SOFT),
        (idx["Total income"], idx["Joint savings"], max(result.joint_savings, 0), JOINT_SOFT),
        (idx["Joint savings"], idx["Easy-access"], result.to_easy_access, JOINT_SOFT),
        (idx["Joint savings"], idx["Long-term"], result.to_long_term, JOINT_SOFT),
    ]
    links = [l for l in links if l[2] > 0]

    fig = go.Figure(data=[go.Sankey(
        node=dict(label=labels, color=node_colors, pad=20, thickness=12, line=dict(width=0),
                  hovertemplate="%{label}: £%{value:,.2f}<extra></extra>"),
        link=dict(
            source=[l[0] for l in links], target=[l[1] for l in links],
            value=[l[2] for l in links], color=[l[3] for l in links],
            hovertemplate="£%{value:,.2f}<extra></extra>",
        ),
    )])
    _style_chart(fig, height=380)
    fig.update_traces(textfont=dict(family=FONT_STACK, size=13, color=TEXT))
    return fig


def savings_rates(result):
    """(total savings rate, personal savings rate) as % of income."""
    if result.total_income <= 0:
        return 0.0, 0.0
    total_saved = result.personal_savings_total + result.to_easy_access + result.to_long_term
    return (total_saved / result.total_income * 100,
            result.personal_savings_total / result.total_income * 100)


def build_savings_rate_figure(confirmed_months):
    """The total savings rate (personal + joint) in the joint hue, and the
    personal savings rate on its own in grey, both as a share of income."""
    labels, personal_rate, total_rate = [], [], []
    for m in confirmed_months:
        result, _ = calculate_month(m["id"])
        labels.append(f"{calendar.month_abbr[m['month']]} {m['year']}")
        total, personal = savings_rates(result)
        total_rate.append(total)
        personal_rate.append(personal)

    fig = go.Figure(data=[
        go.Scatter(x=labels, y=total_rate, name="All savings", mode="lines",
                   line=dict(color=JOINT_MID, width=2.5),
                   hovertemplate="All savings: %{y:.1f}%<extra></extra>"),
        go.Scatter(x=labels, y=personal_rate, name="Personal savings only", mode="lines",
                   line=dict(color=NEUTRAL_DARK, width=2),
                   hovertemplate="Personal savings: %{y:.1f}%<extra></extra>"),
    ])
    fig.update_layout(hovermode="x unified")
    fig.update_yaxes(ticksuffix="%", rangemode="tozero")
    # Name the event behind a drop to zero: a shortfall month saves nothing.
    for label, m in zip(labels, confirmed_months):
        if calculate_month(m["id"])[0].is_shortfall:
            fig.add_annotation(x=label, y=0, text="Shortfall", showarrow=True, arrowhead=0, arrowwidth=1,
                               arrowcolor=NEGATIVE, ax=0, ay=-48, font=dict(size=12, color=NEGATIVE))
    return _style_chart(fig)


def build_bills_by_tag_figure(confirmed_months):
    """100%-stacked columns showing each month's bill total as a share
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
        go.Bar(x=labels, y=v, name=n, marker_color=c, marker_line=dict(color=SURFACE, width=2),
               hovertemplate=n + ": %{y:.0f}%<extra></extra>")
        for n, v, c in (("Joint", joint_vals, JOINT_MID), ("Cal", cal_vals, CAL_MID), ("Dani", dani_vals, DANI_MID))
    ])
    fig.update_layout(barmode="stack", barnorm="percent", bargap=0.5, legend_traceorder="normal")
    fig.update_yaxes(ticksuffix="%", range=[0, 100], dtick=25)
    return _style_chart(fig)


def page_trends():
    confirmed = [m for m in sorted_months() if m["confirmed"]]
    recent = confirmed[-6:]
    st.title("Trends")
    if not recent:
        html('<p class="subtitle">The last six confirmed months, once there are some.</p>')
        st.write("")
        with styled_container("mk-card"):
            html('<p class="empty">No confirmed months yet. Finish a month and its figures start here.</p>')
        return

    latest = recent[-1]
    latest_result, latest_fin = calculate_month(latest["id"])
    latest_name = month_label(latest["month"], latest["year"])
    short = calendar.month_name[latest["month"]]
    total_now, _ = savings_rates(latest_result)
    if len(recent) >= 2:
        total_prev, _ = savings_rates(calculate_month(recent[-2]["id"])[0])
        direction = "up from" if total_now > total_prev else "down from" if total_now < total_prev else "the same as"
        rate_title = f"{total_now:.0f}% of income saved in {short}, {direction} {total_prev:.0f}%"
    else:
        rate_title = f"{total_now:.0f}% of income saved in {short}"
    html(f'<p class="subtitle">The last {len(recent)} confirmed month{"s" if len(recent) != 1 else ""}, '
         f'{month_label(recent[0]["month"], recent[0]["year"])} to {latest_name}.</p>')
    st.write("")

    with styled_container("mk-card"):
        if latest_result.is_shortfall:
            st.subheader(f"{latest_name}: short by {money(-latest_result.remainder)}, nothing saved")
        else:
            saved = latest_result.personal_savings_total + latest_result.joint_savings
            st.subheader(f"{latest_name}: {money(saved)} of {money(latest_result.total_income)} saved")
        st.caption("Where the month's income goes. Hover any flow for the exact amount.")
        st.plotly_chart(build_sankey_figure(latest_result), width="stretch", config=CHART_CONFIG)

    bills = latest_fin["bills_total"]
    cal_share = latest_fin["cal_bills"] / bills * 100 if bills > 0 else 0
    dani_share = latest_fin["dani_bills"] / bills * 100 if bills > 0 else 0
    joint_total = sum(
        calculate_month(m["id"])[0].to_easy_access + calculate_month(m["id"])[0].to_long_term for m in recent
    )

    c1, c2 = st.columns(2, gap="medium")
    with c1:
        with styled_container("mk-card"):
            st.subheader(rate_title)
            st.caption("Share of income saved each month.")
            st.plotly_chart(build_savings_rate_figure(recent), width="stretch", config=CHART_CONFIG)
    with c2:
        with styled_container("mk-card"):
            st.subheader(f"Cal's own bills: {cal_share:.0f}% of {short}'s, Dani's {dani_share:.0f}%")
            st.caption("Each month's bills by whose they are.")
            st.plotly_chart(build_bills_by_tag_figure(recent), width="stretch", config=CHART_CONFIG)

    c3, c4 = st.columns(2, gap="medium")
    with c3:
        with styled_container("mk-card"):
            st.subheader(f"{money(joint_total)} into joint savings")
            st.caption("Each month's joint savings, by pot.")
            st.plotly_chart(build_trend_figure(recent), width="stretch", config=CHART_CONFIG)
    with c4:
        with styled_container("mk-card"):
            st.subheader("Each month at a glance")
            body = ""
            income_sum = saved_sum = 0.0
            for m in reversed(recent):
                r = calculate_month(m["id"])[0]
                saved_cell = (money(r.joint_savings + r.personal_savings_total) if not r.is_shortfall
                              else f'<span style="color:{NEGATIVE};">Short</span>')
                body += (f"<tr><td>{calendar.month_abbr[m['month']]} {m['year']}</td><td>{money(r.total_income)}</td>"
                         f"<td>{saved_cell}</td><td>{savings_rates(r)[0]:.1f}%</td></tr>")
                income_sum += r.total_income
                saved_sum += r.joint_savings + r.personal_savings_total
            rate_sum = saved_sum / income_sum * 100 if income_sum > 0 else 0.0
            body += (f'<tr style="font-weight:600;"><td>All {len(recent)}</td><td>{money(income_sum)}</td>'
                     f"<td>{money(saved_sum)}</td><td>{rate_sum:.1f}%</td></tr>")
            html(f'<table class="cmp"><thead><tr><th>Month</th><th>Income</th><th>Saved</th><th>Rate</th></tr></thead>'
                 f'<tbody>{body}</tbody></table>')


# ---------- Settings ----------

SETTINGS_CAPTION = (
    "Changes apply to every month, including ones you've already confirmed: "
    "past figures are recalculated with these settings."
)


def page_settings():
    st.title("Settings")
    html('<p class="subtitle">How each month is split, and the bills every new month starts with.</p>')
    st.write("")
    settings = db.get_settings()
    months = sorted_months()

    label_col, panel_col = st.columns([2, 3], gap="large")
    with label_col:
        html(f"""<div class="settings-label"><h2>How each month is split</h2>
        <p>The allowance goes to each of you every month. The joint savings rate is the share of what's
        left (after bills and allowances) that goes to joint savings - everything else becomes personal
        savings, split between Cal and Dani by how much each of you contributed.</p>
        <p>{SETTINGS_CAPTION}</p></div>""")
    with panel_col:
        with styled_container("mk-card"):
            c1, c2, c3 = st.columns(3)
            allowance = c1.number_input(
                "Allowance per person (£)", value=float(settings["allowance_per_person"]),
                step=1.0, format="%.2f",
            )
            rate_pct = c2.number_input(
                "Joint savings rate (%)", value=float(settings["savings_rate"]) * 100,
                step=1.0, format="%.1f", min_value=0.0, max_value=100.0,
            )
            target = c3.number_input(
                "Easy-access target (£)", value=float(settings["easy_access_target"]),
                step=1.0, format="%.2f",
            )
            confirmed = [m for m in months if m["confirmed"]]
            if confirmed:
                latest = confirmed[-1]
                fin = db.get_month_financials(latest["id"])
                try:
                    r = calculate_waterfall(
                        fin["cal_income"], fin["dani_income"], fin["bills_total"], allowance,
                        rate_pct / 100, target, fin["current_easy_access_balance"],
                        cal_personal_bills=fin["cal_bills"], dani_personal_bills=fin["dani_bills"],
                    )
                    html(f"""<div class="preview"><p class="calc" style="margin:0 0 6px 0;">With these settings,
                    {month_label(latest["month"], latest["year"])} comes out as:</p>
                    {row_html("Joint savings", money(r.joint_savings))}
                    {row_html("Personal savings, Cal / Dani", f"{money(r.cal_personal_savings)} / {money(r.dani_personal_savings)}")}
                    {row_html("Cal / Dani → joint account", f"{money(max(r.cal_to_joint, 0))} / {money(max(r.dani_to_joint, 0))}")}
                    </div>""")
                except ValueError as exc:
                    html(f'<div class="alert bad">{exc}</div>')
            if st.button("Save settings", type="primary"):
                db.set_setting("allowance_per_person", allowance)
                db.set_setting("savings_rate", rate_pct / 100)
                db.set_setting("easy_access_target", target)
                st.toast("Settings updated.", icon=":material/check_circle:")
                st.rerun()

    st.write("")
    st.write("")
    label_col, panel_col = st.columns([2, 3], gap="large")
    with label_col:
        html("""<div class="settings-label"><h2>Recurring bills</h2>
        <p>The master list new months are built from. Update an amount here the moment it changes
        (e.g. the water bill going up) rather than waiting for next month - it'll carry forward from here on.</p>
        <p>Removing a bill here only stops it appearing in future new months - it won't touch any month
        you've already created.</p></div>""")
    with panel_col:
        render_recurring_bills_section()


def render_recurring_bills_section():
    with styled_container("mk-card mk-rows"):
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
            if c4.button("", icon=":material/close:", key=f"tmpl_remove_{lid}", help="Remove from future months"):
                if row.get("id"):
                    db.deactivate_bill_template(row["id"])
                st.session_state.template_rows = [
                    r for r in st.session_state.template_rows if r["local_id"] != lid
                ]
                st.rerun()

        actions = st.container(horizontal=True, gap="small")
        if actions.button("+ Add recurring bill"):
            st.session_state.template_rows.append(
                {"id": None, "name": "", "default_amount": 0.0, "tag": "Joint", "local_id": str(uuid.uuid4())}
            )
            st.rerun()

        if actions.button("Save recurring bills", type="primary"):
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


# ---------- password gate ----------

def check_password() -> bool:
    """Simple shared-password gate - no usernames, just one password for
    both of you, set in secrets.toml as app_password."""
    if st.session_state.get("password_correct", False):
        return True

    html('<div style="height: 8vh;"></div>')
    col1, col2, col3 = st.columns([1, 1.1, 1])
    with col2:
        with styled_container("mk-card"):
            html(
                f'<div style="text-align:center;">'
                f'<div style="margin-bottom:12px;">{logo_img_html(160, variant="full")}</div>'
                f'<h1 style="font-size:24px;margin:0 0 6px 0;">Household Budget</h1>'
                f'<p class="subtitle" style="margin:0 0 16px 0;">Enter the shared password to continue</p>'
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

    st.logo(str(Path(__file__).parent / "assets" / "logo_icon.png"), size="large")

    PAGES["month"] = st.Page(page_month, title="This month", icon=":material/swap_horiz:", default=True)
    PAGES["edit"] = st.Page(page_edit, title="Edit month", url_path="edit", visibility="hidden")
    PAGES["history"] = st.Page(page_history, title="History", icon=":material/list:", url_path="history")
    PAGES["trends"] = st.Page(page_trends, title="Trends", icon=":material/show_chart:", url_path="trends")
    PAGES["settings"] = st.Page(page_settings, title="Settings", icon=":material/settings:", url_path="settings")
    nav = st.navigation(list(PAGES.values()))

    with st.sidebar:
        html('<p style="font-weight:700;font-size:18px;margin:0;">Household Budget</p>'
             '<p class="small muted" style="margin:0 0 4px 0;">Cal &amp; Dani</p>')

    # On a phone the sidebar stays open after choosing a page, so the pages
    # also sit in one row at the top of the screen there.
    with styled_container("mk-bare mk-phonenav"):
        row = st.container(horizontal=True, gap="small", horizontal_alignment="distribute", wrap=False)
        for key, short in (("month", "Month"), ("history", "History"), ("trends", "Trends"), ("settings", "Settings")):
            row.page_link(PAGES[key], label=short)

    nav.run()

    with st.sidebar:
        st.write("")
        if st.button("Lock", icon=":material/lock:", help="Ask for the password again on this device"):
            st.session_state.password_correct = False
            st.rerun()


if __name__ == "__main__":
    main()

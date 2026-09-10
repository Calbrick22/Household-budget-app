"""
Persistence layer, backed by a hosted Postgres database (e.g. Supabase or
Neon's free tier) via Streamlit's built-in SQL connection.

This replaces SQLite from the desktop version - it needs a real database
because Streamlit Community Cloud's filesystem is wiped on every restart,
so a local file would lose data.

Requires a [connections.postgresql] section in .streamlit/secrets.toml
(locally) or in the app's secrets on Streamlit Community Cloud. See
README.md for exactly what that section needs.
"""

import streamlit as st
from sqlalchemy import text

VALID_TAGS = ("Joint", "Cal", "Dani")
VALID_PEOPLE = ("Cal", "Dani")

DEFAULT_SETTINGS = {
    "allowance_per_person": "250",
    "savings_rate": "0.15",
    "easy_access_target": "5000",
}

STARTER_BILLS = [
    ("Mortgage", 1533.26, "Joint"),
    ("Water", 73.00, "Joint"),
    ("Utilities", 106.00, "Joint"),
    ("Council Tax", 152.00, "Joint"),
    ("Building & Contents Insurance", 45.42, "Joint"),
    ("Life Insurance", 73.35, "Cal"),
    ("WiFi", 33.00, "Joint"),
    ("Mobile Phone (Cal)", 11.00, "Cal"),
    ("Van", 380.00, "Joint"),
    ("Van Tax", 28.00, "Joint"),
    ("Van Insurance", 59.46, "Joint"),
    ("CMS", 514.00, "Cal"),
    ("Bodhi Pocket Money", 20.00, "Cal"),
    ("Spotify", 18.00, "Joint"),
    ("Pet Insurance", 15.08, "Joint"),
    ("Dad House Payment", 200.00, "Cal"),
    ("Mobile Phone (Dani)", 42.00, "Dani"),
    ("Car Tax (Dani)", 17.06, "Dani"),
    ("Dog Food", 60.00, "Joint"),
    ("Amazon Prime", 9.00, "Joint"),
]


def get_conn():
    return st.connection("postgresql", type="sql")


# ---------- schema + one-time setup ----------

SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS months (
        id SERIAL PRIMARY KEY,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        current_easy_access_balance NUMERIC NOT NULL DEFAULT 0,
        UNIQUE(year, month)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS bill_templates (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        default_amount NUMERIC NOT NULL DEFAULT 0,
        tag TEXT NOT NULL CHECK (tag IN ('Joint','Cal','Dani')),
        active BOOLEAN NOT NULL DEFAULT TRUE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS bill_entries (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        amount NUMERIC NOT NULL DEFAULT 0,
        tag TEXT NOT NULL CHECK (tag IN ('Joint','Cal','Dani')),
        template_id INTEGER REFERENCES bill_templates(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS income_entries (
        id SERIAL PRIMARY KEY,
        month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
        person TEXT NOT NULL CHECK (person IN ('Cal','Dani')),
        source TEXT NOT NULL,
        amount NUMERIC NOT NULL DEFAULT 0
    )
    """,
]


def init_db():
    conn = get_conn()
    with conn.session as s:
        for statement in SCHEMA_STATEMENTS:
            s.execute(text(statement))
        s.commit()

    with conn.session as s:
        for key, value in DEFAULT_SETTINGS.items():
            s.execute(
                text(
                    "INSERT INTO settings (key, value) VALUES (:key, :value) "
                    "ON CONFLICT (key) DO NOTHING"
                ),
                {"key": key, "value": value},
            )
        s.commit()

    templates = conn.query("SELECT id FROM bill_templates", ttl=0)
    if templates.empty:
        with conn.session as s:
            for name, amount, tag in STARTER_BILLS:
                s.execute(
                    text(
                        "INSERT INTO bill_templates (name, default_amount, tag, active) "
                        "VALUES (:name, :amount, :tag, TRUE)"
                    ),
                    {"name": name, "amount": amount, "tag": tag},
                )
            s.commit()


# ---------- settings ----------

def get_settings():
    conn = get_conn()
    rows = conn.query("SELECT key, value FROM settings", ttl=0)
    return {r["key"]: r["value"] for _, r in rows.iterrows()}


def set_setting(key, value):
    conn = get_conn()
    with conn.session as s:
        s.execute(
            text(
                "INSERT INTO settings (key, value) VALUES (:key, :value) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"
            ),
            {"key": key, "value": str(value)},
        )
        s.commit()


# ---------- bill templates ----------

def get_active_bill_templates():
    conn = get_conn()
    rows = conn.query(
        "SELECT id, name, default_amount, tag FROM bill_templates WHERE active = TRUE ORDER BY name",
        ttl=0,
    )
    return rows.to_dict("records")


# ---------- months ----------

def get_or_create_month(year: int, month: int) -> int:
    conn = get_conn()
    existing = conn.query(
        "SELECT id FROM months WHERE year = :year AND month = :month",
        params={"year": year, "month": month}, ttl=0,
    )
    if not existing.empty:
        return int(existing.iloc[0]["id"])

    with conn.session as s:
        result = s.execute(
            text(
                "INSERT INTO months (year, month, confirmed, current_easy_access_balance) "
                "VALUES (:year, :month, FALSE, 0) RETURNING id"
            ),
            {"year": year, "month": month},
        )
        month_id = result.scalar()
        s.commit()

    other_months = conn.query(
        "SELECT id, year, month FROM months WHERE id != :id ORDER BY year DESC, month DESC LIMIT 1",
        params={"id": month_id}, ttl=0,
    )

    with conn.session as s:
        if not other_months.empty:
            prev_id = int(other_months.iloc[0]["id"])
            prev_bills = conn.query(
                "SELECT name, amount, tag, template_id FROM bill_entries WHERE month_id = :mid",
                params={"mid": prev_id}, ttl=0,
            )
            for _, b in prev_bills.iterrows():
                s.execute(
                    text(
                        "INSERT INTO bill_entries (month_id, name, amount, tag, template_id) "
                        "VALUES (:mid, :name, :amount, :tag, :tid)"
                    ),
                    {
                        "mid": month_id, "name": b["name"], "amount": float(b["amount"]),
                        "tag": b["tag"], "tid": b["template_id"] if b["template_id"] == b["template_id"] else None,
                    },
                )
        else:
            templates = conn.query(
                "SELECT id, name, default_amount, tag FROM bill_templates WHERE active = TRUE",
                ttl=0,
            )
            for _, t in templates.iterrows():
                s.execute(
                    text(
                        "INSERT INTO bill_entries (month_id, name, amount, tag, template_id) "
                        "VALUES (:mid, :name, :amount, :tag, :tid)"
                    ),
                    {
                        "mid": month_id, "name": t["name"], "amount": float(t["default_amount"]),
                        "tag": t["tag"], "tid": int(t["id"]),
                    },
                )
        s.commit()

    return int(month_id)


def get_all_months():
    conn = get_conn()
    rows = conn.query(
        "SELECT id, year, month, confirmed, current_easy_access_balance "
        "FROM months ORDER BY year DESC, month DESC",
        ttl=0,
    )
    return rows.to_dict("records")


def get_latest_confirmed_month():
    conn = get_conn()
    rows = conn.query(
        "SELECT id, year, month, confirmed, current_easy_access_balance "
        "FROM months WHERE confirmed = TRUE ORDER BY year DESC, month DESC LIMIT 1",
        ttl=0,
    )
    return rows.to_dict("records")[0] if not rows.empty else None


def get_month(month_id: int):
    conn = get_conn()
    rows = conn.query(
        "SELECT id, year, month, confirmed, current_easy_access_balance "
        "FROM months WHERE id = :id",
        params={"id": month_id}, ttl=0,
    )
    return rows.to_dict("records")[0] if not rows.empty else None


def set_month_confirmed(month_id: int, confirmed: bool):
    conn = get_conn()
    with conn.session as s:
        s.execute(
            text("UPDATE months SET confirmed = :confirmed WHERE id = :id"),
            {"confirmed": confirmed, "id": month_id},
        )
        s.commit()


def set_easy_access_balance(month_id: int, balance: float):
    conn = get_conn()
    with conn.session as s:
        s.execute(
            text("UPDATE months SET current_easy_access_balance = :balance WHERE id = :id"),
            {"balance": balance, "id": month_id},
        )
        s.commit()


def delete_month(month_id: int):
    conn = get_conn()
    with conn.session as s:
        s.execute(text("DELETE FROM months WHERE id = :id"), {"id": month_id})
        s.commit()


# ---------- bill entries ----------

def get_bill_entries(month_id: int):
    conn = get_conn()
    rows = conn.query(
        "SELECT id, name, amount, tag FROM bill_entries WHERE month_id = :mid ORDER BY name",
        params={"mid": month_id}, ttl=0,
    )
    return rows.to_dict("records")


def add_bill_entry(month_id: int, name: str, amount: float, tag: str) -> int:
    if tag not in VALID_TAGS:
        raise ValueError(f"tag must be one of {VALID_TAGS}")
    conn = get_conn()
    with conn.session as s:
        result = s.execute(
            text(
                "INSERT INTO bill_entries (month_id, name, amount, tag) "
                "VALUES (:mid, :name, :amount, :tag) RETURNING id"
            ),
            {"mid": month_id, "name": name, "amount": amount, "tag": tag},
        )
        new_id = result.scalar()
        s.commit()
    return int(new_id)


def update_bill_entry(entry_id: int, name: str, amount: float, tag: str):
    if tag not in VALID_TAGS:
        raise ValueError(f"tag must be one of {VALID_TAGS}")
    conn = get_conn()
    with conn.session as s:
        s.execute(
            text("UPDATE bill_entries SET name = :name, amount = :amount, tag = :tag WHERE id = :id"),
            {"name": name, "amount": amount, "tag": tag, "id": entry_id},
        )
        s.commit()


def delete_bill_entry(entry_id: int):
    conn = get_conn()
    with conn.session as s:
        s.execute(text("DELETE FROM bill_entries WHERE id = :id"), {"id": entry_id})
        s.commit()


def get_bills_total(month_id: int) -> float:
    conn = get_conn()
    rows = conn.query(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM bill_entries WHERE month_id = :mid",
        params={"mid": month_id}, ttl=0,
    )
    return float(rows.iloc[0]["total"])


# ---------- income entries ----------

def set_income(month_id: int, person: str, source: str, amount: float):
    if person not in VALID_PEOPLE:
        raise ValueError(f"person must be one of {VALID_PEOPLE}")
    conn = get_conn()
    with conn.session as s:
        existing = s.execute(
            text(
                "SELECT id FROM income_entries WHERE month_id = :mid AND person = :person AND source = :source"
            ),
            {"mid": month_id, "person": person, "source": source},
        ).fetchone()
        if existing:
            s.execute(
                text("UPDATE income_entries SET amount = :amount WHERE id = :id"),
                {"amount": amount, "id": existing[0]},
            )
        else:
            s.execute(
                text(
                    "INSERT INTO income_entries (month_id, person, source, amount) "
                    "VALUES (:mid, :person, :source, :amount)"
                ),
                {"mid": month_id, "person": person, "source": source, "amount": amount},
            )
        s.commit()


def get_income_entries(month_id: int):
    conn = get_conn()
    rows = conn.query(
        "SELECT person, source, amount FROM income_entries WHERE month_id = :mid",
        params={"mid": month_id}, ttl=0,
    )
    return rows.to_dict("records")


def get_income_total_for_person(month_id: int, person: str) -> float:
    conn = get_conn()
    rows = conn.query(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM income_entries "
        "WHERE month_id = :mid AND person = :person",
        params={"mid": month_id, "person": person}, ttl=0,
    )
    return float(rows.iloc[0]["total"])

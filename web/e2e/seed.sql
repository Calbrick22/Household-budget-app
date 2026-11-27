-- Test data for the LOCAL database only (sh e2e/up.sh creates it). The app
-- adds its later columns itself on start-up, so this is the original schema.
DROP TABLE IF EXISTS income_entries, bill_entries, months, bill_templates, settings CASCADE;
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE months (id SERIAL PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE, current_easy_access_balance NUMERIC NOT NULL DEFAULT 0, UNIQUE(year, month));
CREATE TABLE bill_templates (id SERIAL PRIMARY KEY, name TEXT NOT NULL, default_amount NUMERIC NOT NULL DEFAULT 0,
  tag TEXT NOT NULL CHECK (tag IN ('Joint','Cal','Dani')), active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE bill_entries (id SERIAL PRIMARY KEY, month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  name TEXT NOT NULL, amount NUMERIC NOT NULL DEFAULT 0, tag TEXT NOT NULL CHECK (tag IN ('Joint','Cal','Dani')),
  template_id INTEGER REFERENCES bill_templates(id));
CREATE TABLE income_entries (id SERIAL PRIMARY KEY, month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  person TEXT NOT NULL CHECK (person IN ('Cal','Dani')), source TEXT NOT NULL, amount NUMERIC NOT NULL DEFAULT 0);
-- The waterfall's settings, as before the joint share existed (the app adds joint_share = 0.45).
INSERT INTO settings VALUES ('allowance_per_person','250'), ('savings_rate','0.3'), ('easy_access_target','5000');
INSERT INTO bill_templates (name, default_amount, tag) VALUES
  ('Mortgage',1500,'Joint'), ('Utilities',300,'Joint'), ('Council Tax',200,'Joint'),
  ('CMS',1300,'Cal'), ('Dad House Payment',200,'Cal'), ('Mobile Phone (Dani)',100,'Dani');
-- Four confirmed months (June normal, July shortfall, August Cal's transfer negative,
-- September the worked example) and an October draft. The confirmed ones have no
-- frozen settings yet: the app freezes them as waterfall months on start-up.
INSERT INTO months (year, month, confirmed, current_easy_access_balance) VALUES
  (2026,6,TRUE,2400), (2026,7,TRUE,2700), (2026,8,TRUE,2700), (2026,9,TRUE,3000), (2026,10,FALSE,3720);
INSERT INTO bill_entries (month_id, name, amount, tag, template_id)
  SELECT m.id, t.name, t.default_amount, t.tag, t.id FROM months m CROSS JOIN bill_templates t;
INSERT INTO income_entries (month_id, person, source, amount)
  SELECT m.id, x.person, x.source, x.amount FROM months m JOIN (VALUES
    (6,'Cal','Salary',4000), (6,'Cal','RAF',300), (6,'Dani','Income',2000),
    (7,'Cal','Salary',2300), (7,'Cal','RAF',200), (7,'Dani','Income',500),
    (8,'Cal','Salary',1500), (8,'Cal','RAF',200), (8,'Dani','Income',4000),
    (9,'Cal','Salary',4000), (9,'Cal','RAF',500), (9,'Dani','Income',2000),
    (10,'Cal','Salary',4000), (10,'Cal','RAF',600), (10,'Dani','Income',2100)) AS x(m, person, source, amount) ON x.m = m.month;

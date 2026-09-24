CREATE TABLE IF NOT EXISTS daily_receivings (
  id SERIAL PRIMARY KEY,
  manager_id INTEGER REFERENCES managers(id),
  is_owner BOOLEAN NOT NULL DEFAULT false,
  employee_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  work_date DATE NOT NULL,
  closed BOOLEAN NOT NULL DEFAULT false,
  opened_at TIMESTAMP NOT NULL DEFAULT now(),
  closed_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_recv_open
  ON daily_receivings (manager_id, kind, work_date)
  WHERE closed = false;

CREATE INDEX IF NOT EXISTS idx_daily_recv_date
  ON daily_receivings (work_date DESC, manager_id);

CREATE INDEX IF NOT EXISTS idx_recv_items_daily
  ON receiving_items (daily_receiving_id)
  WHERE daily_receiving_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recv_items_order_number
  ON receiving_items (order_number);

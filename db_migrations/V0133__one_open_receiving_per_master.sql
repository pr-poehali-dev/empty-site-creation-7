-- Одна открытая приёмка на мастера: вид + дата + сотрудник.
-- Держалось только на коде — двойное нажатие или два окна создавали вторую.
-- Два индекса, потому что владелец опознаётся через manager_id IS NULL,
-- а NULL в уникальном индексе не сравнивается сам с собой.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_receiving_manager
  ON daily_receivings (manager_id, kind, work_date)
  WHERE closed = false AND manager_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_receiving_owner
  ON daily_receivings (kind, work_date)
  WHERE closed = false AND manager_id IS NULL AND is_owner = true;
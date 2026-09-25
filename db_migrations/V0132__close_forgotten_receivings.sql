UPDATE daily_receivings
SET closed = true,
    auto_closed = true,
    closed_at = COALESCE(closed_at, work_date::timestamp + interval '23 hours 59 minutes')
WHERE closed = false
  AND work_date < '2026-09-26';
-- Толкатель: белый список функций, которым разрешён запуск по расписанию
CREATE TABLE IF NOT EXISTS scheduler_allowed (
    id SERIAL PRIMARY KEY,
    func_name VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    func_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

-- Толкатель: расписание (какую функцию как часто будить)
CREATE TABLE IF NOT EXISTS scheduler_jobs (
    id SERIAL PRIMARY KEY,
    func_name VARCHAR(100) NOT NULL UNIQUE,
    interval_minutes INTEGER NOT NULL DEFAULT 1 CHECK (interval_minutes >= 1),
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMP,
    last_status VARCHAR(20),
    last_error TEXT,
    created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_enabled ON scheduler_jobs(enabled);

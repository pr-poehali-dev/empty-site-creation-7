CREATE TABLE IF NOT EXISTS t_p69702834_empty_site_creation_.ttn_files (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    s3_key TEXT NOT NULL,
    cdn_url TEXT NOT NULL,
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
);
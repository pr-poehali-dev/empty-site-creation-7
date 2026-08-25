UPDATE tg_route_state
SET fail_count = 0, failed_at = NULL, last_error = NULL
WHERE route = 'https://api.telegram.org';
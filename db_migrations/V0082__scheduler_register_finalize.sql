-- Регистрируем подведение итогов аукциона в белом списке Толкателя
INSERT INTO scheduler_allowed (func_name, title, description, func_url)
VALUES (
    'auction-finalize',
    'Подведение итогов аукциона',
    'Завершает истёкшие лоты, отбирает победителей, шлёт уведомления, передаёт право при неоплате.',
    'https://functions.poehali.dev/3f94a72a-ba55-4115-8c49-5d52407baf86'
)
ON CONFLICT (func_name) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    func_url = EXCLUDED.func_url;

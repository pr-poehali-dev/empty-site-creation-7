-- Регистрируем Сервер сообщений в белом списке Толкателя
INSERT INTO scheduler_allowed (func_name, title, description, func_url)
VALUES (
    'message-server',
    'Сервер сообщений (рассылка)',
    'Разбирает очередь и отправляет созревшие сообщения с учётом настроек скорости и повторов.',
    'https://functions.poehali.dev/5196ad48-3bd4-4763-bb20-ca8c9b91b508?action=run'
)
ON CONFLICT (func_name) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    func_url = EXCLUDED.func_url;

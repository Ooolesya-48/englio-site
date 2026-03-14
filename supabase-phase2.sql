-- Фаза 2: разрешить чтение слов через join из user_words
-- Запустить в SQL Editor если слова не подгружаются

-- Политика на чтение words через join уже есть из schema.
-- Если нужно — можно проверить:
-- select * from pg_policies where tablename = 'words';

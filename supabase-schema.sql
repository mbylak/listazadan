-- Przejdź do Supabase -> SQL Editor i wklej u uruchom ten kod:

-- 1. Tworzenie tabeli na stan aplikacji
CREATE TABLE app_state (
  user_id TEXT PRIMARY KEY,
  tasks JSONB DEFAULT '[]'::jsonb,
  categories JSONB DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Zezwolenie na logowanie zanonimizowane (żeby apka działała bez hasła)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Zezwol wszyskto na app_state" ON app_state FOR ALL USING (true) WITH CHECK (true);

-- 3. Aktywacja Real-time (aktualizacje na żywo między urządzeniami)
alter publication supabase_realtime add table app_state;

-- 4. Inicjalizacja Twojego stanu
INSERT INTO app_state (user_id, tasks, categories, settings) 
VALUES ('michal_bylak', '[]', '[{"id": "cat_1", "name": "Praca", "color": "#0078D4"}, {"id": "cat_2", "name": "Dom", "color": "#107C10"}]', '{"themeMode": "auto", "timeTrackingEnabled": true}');

-- 5. Migracja: Dodanie kolumny nawyków (uruchom jeśli tabela już istnieje)
ALTER TABLE app_state ADD COLUMN IF NOT EXISTS habits JSONB DEFAULT '[]'::jsonb;

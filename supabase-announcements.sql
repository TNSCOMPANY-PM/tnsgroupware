-- =============================================
-- 공지사항 테이블 (announcements)
-- =============================================
CREATE TABLE IF NOT EXISTS announcements (
  id text PRIMARY KEY,
  title text NOT NULL,
  body text,
  date date NOT NULL,
  is_important boolean DEFAULT false,
  author_id text,
  author_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_announcements" ON announcements;
CREATE POLICY "allow_all_announcements" ON announcements USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_announcements_date ON announcements(date DESC);

-- announcements 테이블 생성
CREATE TABLE IF NOT EXISTS public.announcements (
  id text PRIMARY KEY,
  title text NOT NULL,
  body text,
  date date NOT NULL,
  is_important boolean DEFAULT false,
  author_id uuid REFERENCES employees(id),
  author_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON public.announcements
  FOR ALL USING (true) WITH CHECK (true);

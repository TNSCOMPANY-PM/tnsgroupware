-- 전략 로드맵 저장 테이블
CREATE TABLE IF NOT EXISTS public.roadmap_data (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month_key   text NOT NULL UNIQUE,          -- 예: "26.04"
  blocks      jsonb NOT NULL DEFAULT '[]',   -- RoadmapBlock[] JSON
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.roadmap_data ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='roadmap_data' AND policyname='anon_select_roadmap') THEN
    CREATE POLICY "anon_select_roadmap" ON public.roadmap_data FOR SELECT TO anon USING (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='roadmap_data' AND policyname='anon_insert_roadmap') THEN
    CREATE POLICY "anon_insert_roadmap" ON public.roadmap_data FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='roadmap_data' AND policyname='anon_update_roadmap') THEN
    CREATE POLICY "anon_update_roadmap" ON public.roadmap_data FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

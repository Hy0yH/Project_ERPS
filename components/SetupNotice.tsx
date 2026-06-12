import { isSupabaseConfigured } from "@/lib/supabase";

export function SetupNotice() {
  if (isSupabaseConfigured()) return null;
  return (
    <div className="empty">
      Supabase 환경 변수가 아직 설정되지 않았습니다. `.env.local`에
      `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ETERNAL_RETURN_API_KEY`,
      `OPENAI_API_KEY`를 넣고 마이그레이션을 적용하면 실제 데이터가 표시됩니다.
    </div>
  );
}

import { RecommendationForm } from "@/components/RecommendationForm";
import { SnapshotStatus } from "@/components/SnapshotStatus";
import { SetupNotice } from "@/components/SetupNotice";
import { getCharacters } from "@/lib/data";
export const dynamic = "force-dynamic";

export default async function RecommendPage() {
  const characters = await getCharacters().catch(() => []);

  return (
    <>
      <section className="page-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <h1>실험체 추천</h1>
          <p>
            상위권 조합 통계, 현재 패치 표본, 플레이어의 실제 사용 기록을 함께 분석해 최적의 후보를 찾습니다.
          </p>
        </div>
      </section>
      <div className="stack">
        <SetupNotice />
        <SnapshotStatus />
        <RecommendationForm characters={characters} />
      </div>
    </>
  );
}

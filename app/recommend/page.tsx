import { RecommendationForm } from "@/components/RecommendationForm";
import { SetupNotice } from "@/components/SetupNotice";
import { getCharacters } from "@/lib/data";

export default async function RecommendPage() {
  const characters = await getCharacters().catch(() => []);

  return (
    <>
      <section className="page-head">
        <div>
          <h1>혼합 추천</h1>
          <p>팀원 픽, 내 선호 캐릭터, 최근 플레이 이력을 함께 반영합니다.</p>
        </div>
      </section>
      <div className="stack">
        <SetupNotice />
        <RecommendationForm characters={characters} />
      </div>
    </>
  );
}

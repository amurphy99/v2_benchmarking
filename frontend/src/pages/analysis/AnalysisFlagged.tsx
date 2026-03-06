import { useAuth } from "@/context/AuthProvider";
import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { groupSessionsByWeek } from "@/utils/functions/getChatWeeks";
import { averageScore, getExemplarDays, getFlaggedBiomarkers, getFlaggedDays, getPerformance } from "@/utils/misc/scores";
import { colStyle } from "@/utils/styling/sharedStyles";
import BiomarkerCard from "./components/BiomarkerCard";

export function AnalysisFlagged() {
    const role = useAuth().account.role == "patient" ? "patient" : "caregiver";
    const { data: sessions, isLoading } = useChatSessions();

    if (isLoading) { 
        return <p>Loading...</p>; 
    }

    const weeks = groupSessionsByWeek(sessions);
    const currentWeek = weeks[weeks.length - 1];
    const avg = averageScore(currentWeek.sessions);
    const flagged = getFlaggedBiomarkers(avg);

    return (
        <div className={colStyle}>
            {flagged.map((biomarker, idx) => {
                const flagged = getFlaggedDays(currentWeek.sessions, biomarker)
                const exemplar = getExemplarDays(currentWeek.sessions, biomarker)
                const performance = getPerformance(avg[biomarker]);
                return (
                    <BiomarkerCard key={idx} biomarker={biomarker} week={currentWeek} flaggedDays={flagged} exemplarDays={exemplar} performance={performance} />
                )
            })}
        </div>
    );
}
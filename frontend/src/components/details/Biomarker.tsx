import { cardStyle } from "@/utils/styling/sharedStyles";
import { BiomarkerType, ChatSessionSummary } from "@/api";

import AnalysisButton from "@/components/details/AnalysisButton";

// --------------------------------------------------------------------
// Helper Function
// --------------------------------------------------------------------
function getImprovement(current: number, previous: number) {
    const diff  = current - previous;
    const score = Math.abs(Math.round(diff * 1000) / 10);
    const styles = {Improved: { color: "bg-green-500", sign: "+", label: "Improved" },
                    Declined: { color: "bg-red-500",   sign: "-", label: "Declined" },
                    Steady:   { color: "bg-gray-300",  sign: "+", label: "Steady"   }, };

    const { color, sign, label } =
        diff > 0 ? styles.Improved :
        diff < 0 ? styles.Declined :
                   styles.Steady;

    return (
        <div className="flex flex-row gap-3 items-center">
            <p className={`rounded-full ${color} p-2 size-[3rem] aspect-square items-center justify-center flex font-bold`}>{sign}{score}</p>
            <p className="font-bold">{label}</p>
        </div>
    );
}

// ====================================================================
// Biomarker Card UI Component
// ====================================================================
export default function Biomarker({ name, current, previous, session }: {
    name     : BiomarkerType,
    current  : number,
    previous : number,
    session  : ChatSessionSummary, 
}) {
    // Per-biomarker configuration
    const cardText = `Here would be an overview of the ${name} analysis.`;

    // Return a UI component
    return (
    <div className={cardStyle} key={session.id}>
        <h4> {name} Review </h4>
        {getImprovement(current, previous)}
        <p>{cardText}</p>
        <AnalysisButton session={session} analysis_choice={name} />
    </div>
    );
}

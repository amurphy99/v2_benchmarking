/*
Summary stats for the currently selected biomarker type.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/BiomarkerStatsBar`

*/
import { ChatBiomarkerScore } from "@/api";

interface Props {
    biomarkers       : ChatBiomarkerScore[];
    selectedBiomarker: string;
}

// Parameters for styling the pills
const base    = "flex items-center gap-2 rounded-full border px-3 py-1 text-sm whitespace-nowrap";
const neutral = "bg-black/5 border-black/10 text-black/80";

function scorePillCls(score: number) {
    return score < 0.4 ? `${base} bg-red-50    text-red-700    border-red-200`
         : score < 0.7 ? `${base} bg-amber-50  text-amber-700  border-amber-200`
         :               `${base} bg-green-50  text-green-700  border-green-200`;
}


// ================================================================================
// Shows score count, average score, and worst (lowest) score
// ================================================================================
export default function BiomarkerStatsBar({ biomarkers, selectedBiomarker }: Props) {
    if (!selectedBiomarker) return null;

    // Only count instances that have a time window (i.e. are mapped to transcript regions)
    const instances = biomarkers.filter(b =>
        b.score_type === selectedBiomarker && b.start_ts && b.end_ts
    );
    if (instances.length === 0) return null;

    const avg   = instances.reduce((s, b) => s + b.score, 0) / instances.length;
    const worst = Math.min(...instances.map(b => b.score));

    return (
        <div className="flex items-center gap-2 px-1">

            {/* Score Count ("neutral" pill) */}
            <div className={`${base} ${neutral}`}>
                <span className="opacity-80">Count</span>
                <span className="font-medium">{instances.length}</span>
            </div>

            {/* Average Score (color-coded by severity) */}
            <div className={scorePillCls(avg)}>
                <span className="opacity-80">Average</span>
                <span className="font-medium">{avg.toFixed(4)}</span>
            </div>

            {/* Worst Score (color-coded by severity) */}
            <div className={scorePillCls(worst)}>
                <span className="opacity-80">Worst</span>
                <span className="font-medium">{worst.toFixed(4)}</span>
            </div>

        </div>
    );
}

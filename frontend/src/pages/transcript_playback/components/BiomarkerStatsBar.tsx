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

    // Scores are color coded by severity
    const scoreCls = (score: number) =>
        score < 0.4 ? "text-red-600    font-semibold" :
        score < 0.7 ? "text-yellow-600 font-semibold" :
                      "text-green-600  font-semibold";

    const sep = <span className="text-gray-300 mx-1">·</span>;

    return (
        <div className="flex items-center gap-1 text-sm text-gray-500 px-1">
            <span>{instances.length} {instances.length === 1 ? "instance" : "instances"}</span>
            {sep}
            <span>avg: <span className={scoreCls(avg)}>{avg.toFixed(2)}</span></span>
            {sep}
            <span>worst: <span className={scoreCls(worst)}>{worst.toFixed(2)}</span></span>
        </div>
    );
}

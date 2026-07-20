/*
Select which biomarker to highlight in the transcript.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/BiomarkerSelector`

Select the biomarker score from the dropdown (only shows options that have any
existing scores for the chat). Also shows a "legend" explaining the meaning of
the highlights.

TODO: Probably should define 'BIOMARKER_LABELS' universally somewhere

*/
import { ChatBiomarkerScore } from "@/api";

// Biomarker display name mapping 
const BIOMARKER_LABELS: Record<string, string> = {
    alteredgrammar : "Altered Grammar",
    anomia         : "Anomia",
    pragmatic      : "Pragmatic Impairment",
    pronunciation  : "Pronunciation",
    prosody        : "Prosody",
    turntaking     : "Turn Taking",
    perplexity     : "Perplexity Difference",
};

interface Props {
    biomarkers        : ChatBiomarkerScore[];
    selectedBiomarker : string;
    onChange          : (value: string) => void;
}

// ================================================================================
// Select a biomarker score type to view transcript highlighting for
// ================================================================================
// Renders a dropdown that only appears when the session has biomarker scores
// with associated time windows (start_ts / end_ts).
export default function BiomarkerSelector({ biomarkers, selectedBiomarker, onChange }: Props) {
    // Get biomarkers during the session
    // TODO: Maybe we don't need to worry about the timestamps here? There shouldn't be biomarkers out of the session time range...
    const available = Array.from(new Set(
        biomarkers.filter(b => b.start_ts && b.end_ts).map(b => b.score_type)
    ));

    // Don't show if there are no biomarkers 
    if (available.length === 0) return null;

    // Style helper
    const selectStyle = "p-2 border border-solid border-gray-400 rounded-lg text-lg text-violet-600 font-bold hover:cursor-pointer bg-white";

    // Three reference highlights (not all the way to the actual 0.0 or 1.0 highlights because 0 would have nothing)
    const highlights = [
        { alpha: 0.9, label: "0.0" },  // dark   (score≈0.0)
        { alpha: 0.5, label: "0.5" },  // medium (score≈0.5)
        { alpha: 0.1, label: "1.0" },  // light  (score≈1.0)
    ];

    // Final UI Component
    return (
        <div className="flex flex-wrap items-center gap-x-[1.5rem] gap-y-[0.5rem]">

            {/* Biomarker Dropdown */}
            <div className="flex items-center gap-[1rem]">
                <label className="font-medium text-lg text-gray-600 whitespace-nowrap">Highlight Biomarker:</label>
                <select value={selectedBiomarker} onChange={(e) => onChange(e.target.value)} className={selectStyle}>

                    <option value="">None</option>
                    {available.map(type => (
                        <option key={type} value={type}>
                            {BIOMARKER_LABELS[type] ?? type}
                        </option>
                    ))}

                </select>
            </div>

            {/* Severity Color Legend */}
            <div className="flex items-center gap-[0.75rem]">
                <span className="font-medium text-lg text-gray-500 whitespace-nowrap">Severity:</span>
                {highlights.map(({ alpha, label }) => (
                    <span key={label} className="flex items-center gap-[0.25rem]">

                        <span
                            className ="inline-block rounded px-[0.4rem] py-[0.1rem] text-base font-mono text-gray-700"
                            style     ={{ backgroundColor: `rgba(139, 92, 246, ${alpha})` }}
                        >
                            {label}
                        </span>

                    </span>
                ))}
            </div>

        </div>
    );
}

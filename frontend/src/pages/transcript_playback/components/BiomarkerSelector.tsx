import { ChatBiomarkerScore } from "@/api";

// Biomarker display name mapping 
// TODO: Probably should be defined universally somewhere
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

// --------------------------------------------------------------------------------
// Select a biomarker score type to view transcript highlighting for
// --------------------------------------------------------------------------------
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
    const selectStyle = "p-2 border border-solid border-gray-400 rounded-lg text-lg hover:cursor-pointer bg-white";

    return (
        <div className="flex items-center gap-[1rem]">
            <label className="font-medium text-gray-600 whitespace-nowrap">Highlight Biomarker:</label>
            <select value={selectedBiomarker} onChange={(e) => onChange(e.target.value)} className={selectStyle} >

                <option value="">None</option>
                {available.map(type => (
                    <option key={type} value={type}>
                        {BIOMARKER_LABELS[type] ?? type}
                    </option>
                ))}
            
            </select>
        </div>
    );
}

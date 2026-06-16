/* Severity color key for biomarker highlights.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/SeverityLegend.tsx`

Three reference swatches (severe / moderate / mild) matching the traffic-light
scale used to highlight words in the transcript. Purely presentational --
the parent decides when to show it (e.g. only when a biomarker is selected).
*/
import { SEVERITY_HEX } from "../biomarkers/severity";

// ================================================================================
// SeverityLegend
// ================================================================================
export default function SeverityLegend({ vertical = false }: { vertical?: boolean }) {
    // Swatches matching the traffic-light scale (alpha mirrors the highlight fill)
    const swatches = [
        { color: SEVERITY_HEX.severe,   alpha: 0.75, label: "Severe"   },
        { color: SEVERITY_HEX.moderate, alpha: 0.45, label: "Moderate" },
        { color: SEVERITY_HEX.mild,     alpha: 0.20, label: "Mild"     },
    ];

    return (
        <div className={vertical ? "flex flex-col items-start gap-1.5" : "flex items-center gap-3"}>
            <span className="text-xs uppercase tracking-wide text-admin-subtext">Severity</span>
            {swatches.map(({ color, alpha, label }) => (
                <span key={label} className="flex items-center gap-1.5">
                    <span
                        className ="inline-block w-4 h-4 rounded"
                        style     ={{ backgroundColor: hexAlpha(color, alpha) }}
                    />
                    <span className="text-xs text-admin-text">{label}</span>
                </span>
            ))}
        </div>
    );
}

function hexAlpha(hex: string, alpha: number): string {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

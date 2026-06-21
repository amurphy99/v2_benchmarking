/* Severity color key for biomarker highlights.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/SeverityLegend.tsx`

Three reference swatches (severe / moderate / mild) matching the traffic-light
scale used to highlight words in the transcript. Purely presentational --
the parent decides when to show it (e.g. only when a biomarker is selected).

The info button on the header opens a modal explaining the score -> MoCA scale.
*/
import { useState } from "react";
import { LuInfo   } from "react-icons/lu";

import { SEVERITY_HEX     } from "../biomarkers/severity";
import { SeverityInfoModal } from "./SeverityInfoModal";

// ================================================================================
// SeverityLegend
// ================================================================================
export default function SeverityLegend({ vertical = false }: { vertical?: boolean }) {
    const [infoOpen, setInfoOpen] = useState(false);

    // Swatches matching the traffic-light scale (alpha mirrors the highlight fill)
    const swatches = [
        { color: SEVERITY_HEX.severe,   alpha: 0.75, label: "Severe"   },
        { color: SEVERITY_HEX.moderate, alpha: 0.45, label: "Moderate" },
        { color: SEVERITY_HEX.mild,     alpha: 0.20, label: "Mild"     },
    ];

    // "Severity" label + info button. In the vertical (side-panel) layout the
    // button is pushed all the way to the right of the subsection.
    const header = (
        <div className={`flex items-center gap-1.5 ${vertical ? "w-full justify-between" : ""}`}>
            <span className="text-xs uppercase tracking-wide text-admin-subtext">Severity</span>
            <button
                type      ="button"
                onClick   ={() => setInfoOpen(true)}
                className ="p-0.5 rounded text-admin-subtext hover:text-admin-text hover:bg-admin-muted cursor-pointer"
                aria-label="About the severity scale"
                title     ="About the severity scale"
            >
                <LuInfo size={14} />
            </button>
        </div>
    );

    return (
        <>
            <div className={vertical ? "flex flex-col items-start gap-1.5 w-full" : "flex items-center gap-3"}>
                {header}
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

            <SeverityInfoModal isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
        </>
    );
}

function hexAlpha(hex: string, alpha: number): string {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

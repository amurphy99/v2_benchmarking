/* Modal explaining the score -> MoCA severity scale.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/SeverityInfoModal.tsx`

Opened from the little info button on the SeverityLegend header. Shows how the
0..1 scores map to (informal) MoCA cognitive-impairment ranges.
*/
import { useEffect  } from "react";
import { createPortal } from "react-dom";
import { LuX        } from "react-icons/lu";

import { AdminButton  } from "@/pages/admin/components/ui/AdminButton";
import { SEVERITY_HEX } from "../biomarkers/severity";

interface Props {
    isOpen  : boolean;
    onClose : () => void;
}

// Cognition ranges (see the "Color Ranges" block in biomarkers/severity.ts)
const RANGES = [
    { label: "Healthy Cognition",               moca: "26-30", score: "0.8667-1.0000", color: SEVERITY_HEX.none     },
    { label: "Mild Cognitive Impairment (MCI)", moca: "18-25", score: "0.6000-0.8667", color: SEVERITY_HEX.mild     },
    { label: "Moderate Cognitive Impairment",   moca: "11-17", score: "0.3333-0.6000", color: SEVERITY_HEX.moderate },
    { label: "Severe Cognitive Impairment",     moca: "0-10",  score: "0.0000-0.3333", color: SEVERITY_HEX.severe   },
];

// ================================================================================
// SeverityInfoModal
// ================================================================================
export function SeverityInfoModal({ isOpen, onClose }: Props) {
    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Portal to <body> so the overlay escapes the sticky side panel's stacking
    // context and sits above the pinned header (otherwise its z-50 is trapped
    // beneath the header's z-10).
    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick  ={onClose}
        >
            <div
                className="w-full max-w-xl rounded-xl bg-admin-panel border border-admin-border shadow-xl overflow-hidden"
                onClick  ={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-admin-border">
                    <div className="text-lg font-semibold text-admin-text">Severity &amp; score scale</div>
                    <button
                        onClick   ={onClose}
                        className ="p-1.5 rounded text-admin-subtext hover:text-admin-text hover:bg-admin-muted cursor-pointer"
                        aria-label="Close"
                    >
                        <LuX size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-4">
                    <p className="text-sm text-admin-text/90 leading-relaxed">
                        Biomarker models attempt to rank samples in relation to the training data;
                        scores reflect the MoCA score associated with the percentile the sample was
                        ranked at (divided by 30). Color ranges are defined by informal MoCA
                        diagnostic ranges.
                    </p>

                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="text-xs uppercase tracking-wide text-admin-subtext">
                                <th className="py-1.5 pr-3 font-semibold text-left">Cognition</th>
                                <th className="py-1.5 px-3 font-semibold text-left">MoCA</th>
                                <th className="py-1.5 pl-6 font-semibold text-right">Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {RANGES.map((r) => (
                                <tr key={r.label} className="border-t border-admin-border/60">
                                    <td className="py-1.5 pr-3 text-admin-text">
                                        <span className="inline-flex items-center gap-2">
                                            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: r.color }} />
                                            {r.label}
                                        </span>
                                    </td>
                                    <td className="py-1.5 px-3 text-admin-subtext tabular-nums whitespace-nowrap">{r.moca}</td>
                                    <td className="py-1.5 pl-3 text-admin-subtext tabular-nums whitespace-nowrap text-right">{r.score}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="flex justify-end px-5 py-3 border-t border-admin-border bg-admin-muted">
                    <AdminButton variant="primary" size="sm" onClick={onClose}>Close</AdminButton>
                </div>
            </div>
        </div>,
        document.body,
    );
}

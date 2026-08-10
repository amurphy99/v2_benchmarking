/* Modal explaining what a biomarker measures and how its score is calculated.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/biomarkers/BiomarkerInfoModal`

UI components for displaying more detailed information about each biomarker. The
data used to fill in the components is pulled from other files in the project.
*/
import { useEffect } from "react";
import { LuX       } from "react-icons/lu";

// From this project
import { AdminButton      } from "../ui/AdminButton";
import { getBiomarkerInfo } from "./biomarkerInfo";

interface Props {
    isOpen        : boolean;
    biomarkerType : string | null;
    onClose       : () => void;
}

// ================================================================================
// Modal view for all biomarker information
// ================================================================================
export function BiomarkerInfoModal({ isOpen, biomarkerType, onClose }: Props) {
    // Close if they use the escape key
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    if (!isOpen || !biomarkerType) return null;

    const info = getBiomarkerInfo(biomarkerType);

    // UI Components
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick  ={onClose}
        >
            <div
                className="w-full max-w-xl rounded-xl bg-admin-panel border border-admin-border shadow-xl overflow-hidden"
                onClick  ={(e) => e.stopPropagation()}
            >
                {/* -------------------------------------------------------------------------------- */}
                {/* Header */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-admin-border">
                    <div>
                        <div className="text-lg font-semibold text-admin-text">
                            {info?.name ?? biomarkerType}
                        </div>
                        {info?.shortDesc && (
                            <div className="text-sm text-admin-subtext">{info.shortDesc}</div>
                        )}
                    </div>
                    <button
                        onClick   ={onClose}
                        className ="p-1.5 rounded text-admin-subtext hover:text-admin-text hover:bg-admin-muted cursor-pointer"
                        aria-label="Close"
                    >
                        <LuX size={18} />
                    </button>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Body */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="px-5 py-4 space-y-4">
                    {info ? (
                        <>
                            <Section title="What it measures">
                                <p className="text-sm text-admin-text/90 leading-relaxed">{info.definition}</p>
                            </Section>

                            <Section title="How it's calculated">
                                <p className="text-sm text-admin-text/90 leading-relaxed">{info.howCalculated}</p>
                            </Section>

                            <Section title="Examples">
                                <p className="text-sm text-admin-subtext italic">
                                    Examples coming soon.
                                </p>
                            </Section>
                        </>
                    ) : (
                        <p className="text-sm text-admin-subtext">
                            No information available for biomarker type "{biomarkerType}".
                        </p>
                    )}
                </div>
                
                {/* -------------------------------------------------------------------------------- */}
                {/* Footer */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex justify-end px-5 py-3 border-t border-admin-border bg-admin-muted">
                    <AdminButton variant="primary" size="sm" onClick={onClose}>Close</AdminButton>
                </div>
            </div>
        </div>
    );
}

// Helper
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-admin-subtext mb-1.5">
                {title}
            </div>
            {children}
        </div>
    );
}

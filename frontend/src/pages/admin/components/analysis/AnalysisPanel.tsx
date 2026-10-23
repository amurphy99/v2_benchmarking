/* Panel view of the post-chat analysis results generated on the backend.
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/analysis/AnalysisPanel.tsx`

This includes:
  1) Summary & list of topics for the chat
  2) Emotion & sentiment classification
  3) Risk factor analysis based on specific user quotes

*/
import { memo, useMemo } from "react";

// From this project
import { Pill } from "../ui/Pill";
import { sentimentBadge, emotionBadge, riskBadge, topicsBadges } from "./analysisBadges";

import      { deriveSessionAnalysis } from "./deriveSessionAnalysis";
import type { SessionLike           } from "./deriveSessionAnalysis";

// ================================================================================
// Post-chat Analysis Panel
// ================================================================================
export const AnalysisPanel = memo(function SessionAnalysisPanel({
    session,
    className = "",
}: {
    session    : SessionLike;
    className? : string;
}) {
    const analysis = useMemo(() => deriveSessionAnalysis(session), [session]);
    const { summary, risk_rating, risk_quotes, risk_reasoning } = analysis;

    // Style
    const cardClass    = "rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden flex flex-col h-full";
    const headerStyle  = "px-5 py-3 border-b border-admin-border";
    const sectionTitle = "text-base font-semibold text-admin-text";
    const sectionSub   = "text-xs text-admin-subtext mt-0.5";

    // --------------------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------------------
    return (
        <section className={className}>

            {/* -------------------------------------------------------------------------------- */}
            {/* Top "analysis" Pills */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <Pill label="Topics"   >{topicsBadges  (session.topics   )}</Pill>
                <Pill label="Sentiment">{sentimentBadge(session.sentiment)}</Pill>
                <Pill label="Emotion"  >{emotionBadge  (session.emotion  )}</Pill>
                <Pill label="Risk"     >{riskBadge     (risk_rating      )}</Pill>
            </div>

            {/* ================================================================================ */}
            {/* Main Cards (Summary + Risk Factors) */}
            {/* ================================================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">

                {/* Summary */}
                <div className={cardClass}>
                    <div className={headerStyle}>
                        <div className={sectionTitle}>Summary</div>
                        <div className={sectionSub  }>3-5 sentences of what the conversation covered.</div>
                    </div>
                    <div className="px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap text-admin-text/90 flex-1">
                        {summary || "—"}
                    </div>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Risk Factors */}
                {/* -------------------------------------------------------------------------------- */}
                <div className={cardClass}>
                    <div className={`${headerStyle} flex items-center justify-between gap-2`}>
                        {/* Risk Rating */}
                        <div>
                            <div className={sectionTitle}>Risk Factors</div>
                            <div className={sectionSub  }>Rating, supporting quotes, and rationale.</div>
                        </div>
                        {riskBadge(risk_rating)}
                    </div>

                    <div className="px-5 py-4 flex-1">
                        {/* Quotes */}
                        <div className="text-xs font-semibold uppercase tracking-wide text-admin-subtext mb-2">Flagged quotes</div>
                        {risk_quotes && risk_quotes.length > 0 ? (
                            <ul className="space-y-2">
                                {risk_quotes.slice(0, 6).map((q, i) => (
                                    <li key={i} className="rounded-md border border-admin-border bg-admin-muted px-3 py-2 text-sm leading-snug text-admin-text/90">
                                        <span className="text-admin-subtext">"</span>{q}<span className="text-admin-subtext">"</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="text-sm text-admin-subtext">No flagged quotes.</div>
                        )}

                        {/* Reasoning */}
                        <div className="text-xs font-semibold uppercase tracking-wide text-admin-subtext mt-4 mb-2">Justification</div>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap text-admin-text/85">{risk_reasoning || "—"}</div>
                    </div>
                </div>
            </div>
        </section>
    );
});

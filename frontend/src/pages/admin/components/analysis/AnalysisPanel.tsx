import { memo, useMemo, useRef } from "react";

// From this project
import { InfoPill } from "../admin_header/StatusComponents";
import { sentimentBadge, emotionBadge, riskBadge, topicsBadges } from "./analysisBadges";
import { cardClass } from "../common/commonStyle";

import { formatTopics, parseNotes, deriveSessionAnalysis } from "./deriveSessionAnalysis";
import type { SessionLike } from "./deriveSessionAnalysis";

// Misc. Helpers
import { useElementHeight } from "@/hooks/style/useElementHeight";

// ================================================================================
// Post Chat Analysis Panel
// ================================================================================
export const AnalysisPanel = memo(function SessionAnalysisPanel({
    session,
    notesSeparator = "\n<|ANALYSIS|>\n",
    className      = "",
}: {
    session          : SessionLike;
    notesSeparator ? : string;
    className      ? : string;
}) {
    // Prepare text from the given session data
    const topicsText = useMemo(() => formatTopics(session.topics), [session.topics]);

    // Analysis fields (summary + risk) with notes fallback handled inside the helper
    const analysis = useMemo(() => deriveSessionAnalysis(session, notesSeparator), [session, notesSeparator]);
    const { summary, risk_rating, risk_quotes, risk_reasoning } = analysis;

    // Sync the heights of both sides
    const leftRef  = useRef<HTMLDivElement | null>(null);
    const rightRef = useRef<HTMLDivElement | null>(null);

    const leftHeight  = useElementHeight(leftRef);
    const rightHeight = useElementHeight(rightRef);
    const syncHeight  = (leftHeight && rightHeight)     ? 
        Math.max(leftHeight, rightHeight) : leftHeight  ? 
        leftHeight                        : rightHeight ? 
        rightHeight                       : null;
    const syncStyle = syncHeight ? { minHeight: syncHeight } : undefined;

    // Style
    const section_header = "flex flex-row items-end gap-[1rem] ";

    // --------------------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------------------
    // <InfoPill label="Topics"    ><span className="max-w-[40ch] truncate">{topicsText}</span></InfoPill>
    return (
        <section className={`px-[1rem] py-[1rem] ${className}`}>
        
        {/* -------------------------------------------------------------------------------- */}
        {/* Top "analysis" Pills */}
        {/* -------------------------------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
            <InfoPill label="Topics"    >{topicsBadges  (topicsText       )}</InfoPill>
            <InfoPill label="Sentiment" >{sentimentBadge(session.sentiment)}</InfoPill>
            <InfoPill label="Emotion"   >{emotionBadge  (session.emotion  )}</InfoPill>
            <InfoPill label="Risk"      >{riskBadge     (risk_rating      )}</InfoPill>
        </div>

        {/* ================================================================================ */}
        {/* Main Cards (Summary + Risk Factors) */}
        {/* ================================================================================ */}
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">

            {/* Summary */}
            <div className={cardClass("")} ref={leftRef}  style={syncStyle} >
                <div className="px-[1.5rem] py-[1rem] border-b border-black/10">
                    <div className={section_header}>
                        <div className="text-lg   font-semibold">Summary</div>
                        <div className="text-base text-black/60">3-5 sentences of what the conversation covered.</div>
                    </div>
                </div>

                <div className="px-4 py-3 text-base leading-relaxed whitespace-pre-wrap">{summary || "—"}</div>
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Risk Factors */}
            {/* -------------------------------------------------------------------------------- */}
            <div className={cardClass("")} ref={rightRef} style={syncStyle} >

                {/* Risk Rating */}
                <div className="px-[1.5rem] py-[1rem] border-b border-black/10 flex items-center justify-between gap-2">
                    <div className={section_header}>
                        <div className="text-lg   font-semibold">Risk Factors</div>
                        <div className="text-base text-black/60">Rating, supporting quotes, and rationale.</div>
                    </div>
                    {riskBadge(risk_rating)}
                </div>

                {/* Quotes */}
                <div className="px-4 py-3">
                    <div className="text-base font-semibold text-black/70 mb-2">Flagged quotes</div>
                    {risk_quotes && risk_quotes.length > 0 ? (
                        <ul className="space-y-2">
                            {risk_quotes.slice(0, 6).map((q, i) => (
                            <li key={i} className="rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-base leading-snug">
                                <span className="text-black/70">"</span>{q}<span className="text-black/70">"</span>
                            </li>
                            ))}
                        </ul>
                    ) : ( 
                        <div className="text-base text-black/50">No flagged quotes.</div> 
                    )}
                </div>

                {/* Reasoning */}
                <div className="px-4 pb-4">
                    <div className="text-base font-semibold text-black/70 mb-2">Justification</div>
                    <div className="text-base leading-relaxed whitespace-pre-wrap text-black/80">{risk_reasoning || "—"}</div>
                </div>

            </div>
        </div>
        </section>
    );
});

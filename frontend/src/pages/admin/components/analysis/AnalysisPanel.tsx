import { memo, useMemo } from "react";

// From this project
import { InfoPill } from "../admin_header/StatusComponents";
import { sentimentBadge, riskBadge } from "./analysisBadges";

// --------------------------------------------------------------------------------
// Style Helpers
// --------------------------------------------------------------------------------
function cardClass(extra = "") {
    return `rounded-xl border border-black/10 bg-white shadow-sm ${extra}`;
}

// Parse the topics string
function formatTopics(raw: unknown): string {
    if (Array.isArray(raw)     ) { return raw.filter(Boolean).join(", "); }
    if (typeof raw !== "string") { return "—"; }
    const s = raw.trim();

    // Try JSON array first
    try { 
        const parsed = JSON.parse(s); 
        if (Array.isArray(parsed)) return parsed.filter(Boolean).join(", ");
    } catch {}

    // Fallback
    return s
        .replace(/[\[\]"']/g, "")
        .split  (",")
        .map    ((t) => t.trim())
        .filter (Boolean)
        .join   (", ");
}

// --------------------------------------------------------------------------------
// Temporary "Notes" field parser
// --------------------------------------------------------------------------------
// Since the DB object isn't fully set up yet, for now we are just putting multiple
// fields into the "notes" field and separating them via a tag.
type ParsedNotes = {
    summary        ? : string | null;
    risk_rating    ? : number | null;
    risk_quotes    ? : string[];
    risk_reasoning ? : string | null;
};

// Temporary demo data
const DEMO_NOTES: ParsedNotes = {
  summary        : "Demo summary: The user and Buddy discussed a recent daily routine update, including sleep quality and a few errands. The user reported mild stress but also mentioned a positive coping strategy. The conversation ended with Buddy suggesting a simple plan for the rest of the day.",
  risk_rating    : 1,
  risk_quotes    : ["I've been feeling a little overwhelmed lately.", "I didn't sleep great last night.", ],
  risk_reasoning : "Demo reasoning: Low risk due to mild, non-specific stress statements without urgency or escalation. No indications of immediate harm. Suggested follow-up is to check in on sleep and stress coping strategies.",
};

// Notes will contain these separated in order: 
// summary, risk_rating, risk_quotes, risk_reasoning
function parseNotes(notes?: string | null, sep = "\n<|ANALYSIS|>\n"): ParsedNotes {
    // Start with some default data 
    // If notes is empty or isn't in the separated format yet, return placeholders
    const raw = (notes ?? "").trim();
    if (!raw              ) return DEMO_NOTES;
    if (!raw.includes(sep)) return DEMO_NOTES;

    // Split on the parts
    const parts = notes.split(sep).map((p) => p.trim());
    const [summary, ratingStr, quotesRaw, reasoning] = parts;

    // Risk rating
    const risk_rating = ratingStr && ratingStr.length > 0 ? Number.parseInt(ratingStr.trim(), 10) : null;

    // Risk quotes (pulled from the transcript)
    const risk_quotes =
        quotesRaw && quotesRaw.length > 0
        ? quotesRaw
            .split(/\r?\n/)
            .map((q) => q.trim())
            .filter(Boolean)
        : [];

    // Return all fields
    return {
        summary        : summary || null,
        risk_rating    : Number.isFinite(risk_rating as number) ? risk_rating : null,
        risk_quotes,
        risk_reasoning : reasoning || null,
    };
}

// Fake, temporary version of the session object with all fields accessable
type SessionLike = {
    // Existing DB fields
    topics         ? : unknown;
    sentiment      ? : string | null;
    notes          ? : string | null;

    // Future DB fields
    summary        ? : string | null;
    risk_rating    ? : number | null;
    risk_quotes    ? : string[] | null;
    risk_reasoning ? : string | null;
};

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
    const parsed = useMemo(() => parseNotes(session.notes, notesSeparator), [session.notes, notesSeparator]);
    const topicsText = useMemo(() => formatTopics(session.topics), [session.topics]);

    // Prefer future DB fields; fall back to parsed notes
    const summary        = session.summary        ?? parsed.summary        ?? "—";
    const risk_rating    = session.risk_rating    ?? parsed.risk_rating    ?? null;
    const risk_quotes    = session.risk_quotes    ?? parsed.risk_quotes    ?? [];
    const risk_reasoning = session.risk_reasoning ?? parsed.risk_reasoning ?? "—";

    // --------------------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------------------
    return (
        <section className={`px-4 py-4 ${className}`}>
        
        {/* -------------------------------------------------------------------------------- */}
        {/* Top "analysis" Pills */}
        {/* -------------------------------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
            <InfoPill label="Topics"    ><span className="max-w-[40ch] truncate">{topicsText}</span></InfoPill>
            <InfoPill label="Sentiment" >{sentimentBadge(session.sentiment)}                        </InfoPill>
            <InfoPill label="Risk"      >{riskBadge(risk_rating)}                                   </InfoPill>
        </div>

        {/* ================================================================================ */}
        {/* Main Cards (Summary + Risk Factors) */}
        {/* ================================================================================ */}
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {/* Summary (wide) */}
            <div className={cardClass("")}>
                <div className="px-4 py-3 border-b border-black/10">
                    <div className="text-sm font-semibold">Summary</div>
                    <div className="text-xs text-black/60">3-5 sentences of what the conversation covered.</div>
                </div>

                <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">{summary || "—"}</div>
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Risk Factors */}
            {/* -------------------------------------------------------------------------------- */}
            <div className={cardClass("")}>

                {/* Risk Rating */}
                <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between gap-2">
                    <div>
                        <div className="text-sm font-semibold">Risk Factors</div>
                        <div className="text-xs text-black/60">Rating, supporting quotes, and rationale.</div>
                    </div>
                    {riskBadge(risk_rating)}
                </div>

                {/* Quotes */}
                <div className="px-4 py-3">
                    <div className="text-xs font-semibold text-black/70 mb-2">Flagged quotes</div>
                    {risk_quotes && risk_quotes.length > 0 ? (
                        <ul className="space-y-2">
                            {risk_quotes.slice(0, 6).map((q, i) => (
                            <li key={i} className="rounded-lg border border-black/10 bg-black/5 px-3 py-2 text-xs leading-snug">
                                <span className="text-black/70">"</span>{q}<span className="text-black/70">"</span>
                            </li>
                            ))}
                        </ul>
                    ) : ( 
                        <div className="text-xs text-black/50">No flagged quotes.</div> 
                    )}
                </div>

                {/* Reasoning */}
                <div className="px-4 pb-4">
                    <div className="text-xs font-semibold text-black/70 mb-2">Justification</div>
                    <div className="text-xs leading-relaxed whitespace-pre-wrap text-black/80">{risk_reasoning || "—"}</div>
                </div>

            </div>
        </div>
        </section>
    );
});


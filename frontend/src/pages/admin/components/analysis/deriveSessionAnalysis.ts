
// --------------------------------------------------------------------------------
// Parse the topics string from a ChatSession
// --------------------------------------------------------------------------------
export function formatTopics(raw: unknown): string {
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
export type ParsedNotes = {
    summary        ? : string | null;
    risk_rating    ? : number | null;
    risk_quotes    ? : string[];
    risk_reasoning ? : string | null;
    emotion        ? : string | null;
};

// Temporary demo data
const DEMO_NOTES: ParsedNotes = {
  summary        : "Demo summary: The user and Buddy discussed a recent daily routine update, including sleep quality and a few errands. The user reported mild stress but also mentioned a positive coping strategy. The conversation ended with Buddy suggesting a simple plan for the rest of the day.",
  risk_rating    : 1,
  risk_quotes    : ["I've been feeling a little overwhelmed lately.", "I didn't sleep great last night.", ],
  risk_reasoning : "Demo reasoning: Low risk due to mild, non-specific stress statements without urgency or escalation. No indications of immediate harm. Suggested follow-up is to check in on sleep and stress coping strategies.",
  emotion        : "Neutral",
};

// Notes will contain these separated in order: 
// summary, risk_rating, risk_quotes, risk_reasoning, emotion
export function parseNotes(notes?: string | null, sep = "\n<|ANALYSIS|>\n"): ParsedNotes {
    // Start with some default data 
    // If notes is empty or isn't in the separated format yet, return placeholders
    const raw = (notes ?? "").trim();
    if (!raw              ) return DEMO_NOTES;
    if (!raw.includes(sep)) return DEMO_NOTES;

    // Split on the parts
    const parts = notes.split(sep).map((p) => p.trim());
    const [summary, ratingStr, quotesRaw, reasoning, emotion] = parts;

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
        emotion        : emotion   || null,
    };
}

// --------------------------------------------------------------------------------
// Fake, temporary version of the session object with all fields accessable
// --------------------------------------------------------------------------------
export type SessionLike = {
    // Existing DB fields
    topics         ? : unknown;
    sentiment      ? : string | null;
    emotion        ? : string | null;
    notes          ? : string | null;

    // Future DB fields
    summary        ? : string | null;
    risk_rating    ? : number | null;
    risk_quotes    ? : string[] | null;
    risk_reasoning ? : string | null;
};

export function deriveSessionAnalysis(session: SessionLike, sep = "\n<|ANALYSIS|>\n") {
    const parsed     = parseNotes  (session.notes, sep);
    const topicsText = formatTopics(session.topics    );

    // Prefer future DB fields -- only on fallback use the parsed notes
    return {
        // Actual fields
        topics         : topicsText,
        sentiment      : session.sentiment                   ?? "neutral",
        emotion        : session.emotion   ?? parsed.emotion ?? "neutral",
        notes          : session.notes                       ?? "",
        // Parsed from notes (for now)
        summary        : session.summary        ?? parsed.summary        ?? "—",
        risk_rating    : session.risk_rating    ?? parsed.risk_rating    ?? null,
        risk_quotes    : session.risk_quotes    ?? parsed.risk_quotes    ?? [],
        risk_reasoning : session.risk_reasoning ?? parsed.risk_reasoning ?? "—",
    };
}

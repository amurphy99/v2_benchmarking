
// Chat Sentiment (old version)
export function sentimentBadge_old(sentiment?: string | null) {
    const s    = (sentiment ?? "").toLowerCase();
    const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

    if (s.includes("pos")) return <span className={`${base} bg-green-50 text-green-700 border-green-200`}>Positive</span>;
    if (s.includes("neg")) return <span className={`${base} bg-red-50   text-red-700   border-red-200`  }>Negative</span>;
    if (s.includes("neu")) return <span className={`${base} bg-gray-50  text-gray-700  border-gray-200` }>Neutral</span>;
    if (s.includes("mix")) return <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>Mixed</span>;

    return <span className={`${base} bg-gray-50 text-gray-700 border-gray-200`}>{sentiment || "—"}</span>;
}

// Chat Sentiment
export function sentimentBadge(sentiment?: string | null) {
    const s    = (sentiment ?? "").toLowerCase().trim();
    const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

    switch (s) {
        case "very_positive": return <span className={`${base} bg-green-200 text-green-800 border-green-200`}>Very positive</span>;
        case      "positive": return <span className={`${base} bg-green-100 text-green-700 border-green-200`}>Positive     </span>;
        case       "neutral": return <span className={`${base} bg-gray-50   text-gray-700  border-gray-200` }>Neutral      </span>;
        case      "negative": return <span className={`${base} bg-red-100   text-red-700   border-red-200`  }>Negative     </span>;
        case "very_negative": return <span className={`${base} bg-red-200   text-red-800   border-red-200`  }>Very negative</span>;
        default:              return <span className={`${base} bg-gray-50   text-gray-700  border-gray-200` }>{sentiment || "—"}</span>;
    }
}

// Chat Risk Rating (1-4)
export function riskBadge(rating?: number | null) {
    const r = rating ?? null;
    const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

    if (r == null || Number.isNaN(r)) return <span className={`${base} bg-gray-50 text-gray-700 border-gray-200`}>—</span>;
    if (r <=  0) return <span className={`${base} bg-green-50  text-green-700  border-green-200` }>0 (None)    </span>;
    if (r === 1) return <span className={`${base} bg-lime-50   text-lime-800   border-lime-200`  }>1 (Low)     </span>;
    if (r === 2) return <span className={`${base} bg-amber-50  text-amber-700  border-amber-200` }>2 (Moderate)</span>;
    if (r === 3) return <span className={`${base} bg-orange-50 text-orange-700 border-orange-200`}>3 (High)    </span>;
    return              <span className={`${base} bg-red-50    text-red-700    border-red-200`   }>4 (Critical)</span>;
}


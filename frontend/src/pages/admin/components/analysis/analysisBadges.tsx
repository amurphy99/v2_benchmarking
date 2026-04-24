
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

// Chat Emotion
export function emotionBadge(emotion?: string | null) {
    const e    = (emotion ?? "").toLowerCase().trim();
    const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

    switch (e) {
        case    "neutral": return <span className={`${base} bg-gray-50    text-gray-700   border-gray-200`  }>Neutral    </span>;
        case      "happy": return <span className={`${base} bg-green-100  text-green-700  border-green-200` }>Happy      </span>;
        case        "sad": return <span className={`${base} bg-blue-100   text-blue-700   border-blue-200`  }>Sad        </span>;
        case     "scared": return <span className={`${base} bg-yellow-100 text-yellow-800 border-yellow-200`}>Scared     </span>;
        case  "surprised": return <span className={`${base} bg-purple-100 text-purple-700 border-purple-200`}>Surprised  </span>;
        case      "angry": return <span className={`${base} bg-red-100    text-red-700    border-red-200`   }>Angry      </span>;
        case "frustrated": return <span className={`${base} bg-orange-100 text-orange-700 border-orange-200`}>Frustrated </span>;
        case   "confused": return <span className={`${base} bg-indigo-100 text-indigo-700 border-indigo-200`}>Confused   </span>;
        default:           return <span className={`${base} bg-gray-50    text-gray-700   border-gray-200`  }>{emotion || "—"}</span>;
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

// --------------------------------------------------------------------------------
// Topic Badges
// --------------------------------------------------------------------------------
export function topicBadge(topic?: string | null) {
    const t    = (topic ?? "").trim();
    const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

    if (!t) return <span className={`${base} bg-gray-50 text-gray-700 border-gray-200`}>—  </span>;
    return         <span className={`${base} bg-gray-50 text-gray-700 border-gray-200`}>{t}</span>;
}

export function topicsBadges(topics?: string[] | string | null) {
    const list: string[] = Array.isArray(topics)
        ? topics.map((s) => s.trim()).filter(Boolean)
        : (topics ?? "").split(",").map((s) => s.trim()).filter(Boolean);

    if (list.length === 0) return topicBadge(null);
    return (
        <div className="flex flex-wrap gap-1">
            {list.map((t, i) => (
                <span key={`${t}-${i}`}>{topicBadge(t)}</span>
            ))}
        </div>
    );
}

/* ChatSessionCard view for the Admin chat lists page.
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/chat_lists/ChatSessionCard.tsx`

*/
import { memo, useMemo } from "react";

// From this project
import { ChatSession } from "@/api";
import { dateFormatLong, formatElapsedTime } from "@/utils/styling/numFormatting";
import { formatTimeAgo } from "./timeGrouping";

// Components
import { deriveSessionAnalysis } from "../analysis/deriveSessionAnalysis";
import { Pill                  } from "../ui/Pill";
import { sentimentBadge, emotionBadge, riskBadge, topicsBadges } from "../analysis/analysisBadges";


// ================================================================================
// ChatSessionCard view for the Admin Page
// ================================================================================
export const ChatSessionCard = memo(function ChatSessionCard({ session, onClick }: {session: ChatSession; onClick: () => void}) {
    // Load analysis
    const isActive = session.is_active;
    const analysis = useMemo(() => {
        if (isActive) return null;
        return deriveSessionAnalysis(session);
    }, [session, isActive]);

    // Header values
    const startDate = session.start_ts ? new Date(session.start_ts) : null;
    const dateText  = startDate ? dateFormatLong.format(startDate) : "—";
    const agoText   = formatTimeAgo(startDate);
    const title     = `${session.profile.account.user.first_name} ${session.profile.account.user.last_name}`;
    const sessionLabel = `Session #${session.id ?? "—"}`;

    // Active vs completed accent on the left edge.
    const accentBorder = isActive ? "border-l-status-live" : "border-l-admin-border";

    // UI Component
    return (
        <button
            onClick   = {onClick}
            className = {`group h-full text-left w-full rounded-xl border border-admin-border border-l-4 ${accentBorder} bg-admin-panel shadow-sm px-4 py-3 hover:bg-admin-muted hover:border-admin-accent/40 transition-colors cursor-pointer flex flex-col`}
        >
            {/* -------------------------------------------------------------------------------- */}
            {/* Header => Name + Session Number */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-lg font-semibold text-admin-text truncate">{title}</div>
                    <div className="text-base text-admin-text/80 font-medium">{sessionLabel}</div>
                </div>

                <div className="flex gap-2 flex-wrap justify-end">
                    {isActive
                        ? <Pill variant="live" dot value="Live" />
                        : <Pill variant="info" value={agoText} />
                    }
                </div>
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Date */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="text-sm text-admin-subtext mt-0.5">{dateText}</div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Stats row */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex gap-2 flex-wrap mt-2">
                <Pill label="Messages" value={session.messages.length ?? "—"     } />
                <Pill label="Duration" value={formatElapsedTime(session.duration)} />
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Summary & Topics (only inactive) */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex-1 flex flex-col">
                {!isActive && analysis && (
                    <>
                        <div className="text-sm text-admin-text/85 line-clamp-3 mt-3 leading-snug">
                            {analysis.summary}
                        </div>
                        {session.topics && session.topics.length > 0 && (
                            <div className="mt-2">{topicsBadges(session.topics.slice(0, 4))}</div>
                        )}
                    </>
                )}
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Risk | Sentiment | Emotion (only for inactive chats) */}
            {/* -------------------------------------------------------------------------------- */}
            {!isActive && analysis && (
                <div className="mt-3 flex gap-2 flex-wrap">
                    <Pill label="Risk"      value={     riskBadge(analysis.risk_rating )} />
                    <Pill label="Sentiment" value={sentimentBadge(analysis.sentiment   )} />
                    <Pill label="Emotion"   value={  emotionBadge(analysis.emotion     )} />
                </div>
            )}
        </button>
    );
});

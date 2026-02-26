import { memo, useMemo } from "react";

// From this project
import { ChatSession    } from "@/api";
import { dateFormatLong } from "@/utils/styling/numFormatting";

// Components
import { InfoPill                  } from "../admin_header/StatusComponents";
import { sentimentBadge, riskBadge } from "../analysis/analysisBadges";
import { deriveSessionAnalysis     } from "../analysis/deriveSessionAnalysis";

// ================================================================================
// ChatSession Card View for the Admin Page
// ================================================================================
export const ChatSessionCard = memo(function ChatSessionCard({ session, onClick }: {session: ChatSession; onClick: () => void}) {
    // Only get analysis for inactive sessions
    const isActive = session.is_active;
    const analysis = useMemo(() => {
        if (isActive) return null;
        return deriveSessionAnalysis(session);
    }, [session, isActive]);

    // Header values
    const s_date   = `${session.start_ts ? dateFormatLong.format(new Date(session.start_ts)) : "-"}`;
    const title    = `${session.profile.account.user.username}`;
    const subtitle = `Session #${session.id ?? "—"}`;
    
    // Style
    const buttonStyle = "w-full text-left rounded-xl border border-black/10 bg-white shadow-sm hover:bg-black/100 transition px-4 py-3";

    // Return UI component
    return (
        <button onClick={onClick} className={buttonStyle} >
            
            {/* Header / Title */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-base font-semibold truncate">{title }</div>
                    <div className="text-sm   text-black/60 truncate">{s_date}</div>
                </div>

                {/* Sentiment & Risk (only for inactive chats) */}
                {!isActive && analysis && (
                <div className="flex gap-2 flex-wrap justify-end">
                    <InfoPill label="Risk"      value={     riskBadge(analysis.risk_rating)} />
                    <InfoPill label="Sentiment" value={sentimentBadge(analysis.sentiment  )} />
                </div>
                )}
            </div>

            {/* Date & Summary (only show summary for inactive chats) */}
            <div className="flex flex-col mt-[0.25rem]">
                <div className="text-sm text-black/60 truncate">{subtitle}</div>
                {!isActive && analysis && (
                    <div className="text-sm text-black/80 line-clamp-2">{analysis.summary}</div>
                )}
            </div>

            {/* Messages & Duration */}
            <div className="mt-3 flex gap-2 flex-wrap">
                <InfoPill label="Messages" value={session.messages.length ?? "—"} />
                <InfoPill label="Duration" value={session.duration        ?? "—"} />
            </div>

        </button>
    );
});

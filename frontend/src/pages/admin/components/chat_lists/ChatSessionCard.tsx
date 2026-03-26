import { memo, useMemo } from "react";

// From this project
import { ChatSession } from "@/api";
import { dateFormatLong, formatElapsedTime } from "@/utils/styling/numFormatting";

// Components
import { InfoPill                  } from "../admin_header/StatusComponents";
import { sentimentBadge, emotionBadge, riskBadge, topicsBadges } from "../analysis/analysisBadges";
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

                {/* Risk / Sentiment / Emotion (only for inactive chats) */}
                {!isActive && analysis && (
                <div className="flex gap-2 flex-wrap justify-end">
                    <InfoPill label="Risk"      value={     riskBadge(analysis.risk_rating )} />
                    <InfoPill label="Sentiment" value={sentimentBadge(analysis.sentiment   )} />
                    <InfoPill label="Emotion"   value={  emotionBadge(analysis.emotion     )} />
                </div>
                )}
            </div>

            {/* Subtitle / Summary / Topics (only for inactive chats) */}
            <div className="flex flex-col mt-[0.25rem]">
                <div className="text-sm text-black/60 truncate">{subtitle}</div>
                {!isActive && analysis && (<>
                    <div className="text-sm text-black/80 line-clamp-2 mt-0.5">{analysis.summary}</div>
                    {session.topics && session.topics.length > 0 && (
                        <div className="mt-1.5">{topicsBadges(session.topics.slice(0, 4))}</div>
                    )}
                </>)}
            </div>

            {/* Messages & Duration */}
            <div className="mt-3 flex gap-2 flex-wrap">
                <InfoPill label="Messages" value={session.messages.length ?? "—"     } />
                <InfoPill label="Duration" value={formatElapsedTime(session.duration)} />
            </div>

        </button>
    );
});

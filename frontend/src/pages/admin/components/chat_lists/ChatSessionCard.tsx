import { memo, useMemo } from "react";

// From this project
import { InfoPill } from "../admin_header/StatusComponents";
import { sentimentBadge, riskBadge } from "../analysis/analysisBadges";
import { deriveSessionAnalysis } from "../analysis/deriveSessionAnalysis";

import { ChatSession } from "@/api";

// ================================================================================
// Post Chat Analysis Panel
// ================================================================================
export const ChatSessionCard = memo(function ChatSessionCard({ session, onClick }: {session: ChatSession; onClick: () => void}) {
    const analysis = useMemo(() => deriveSessionAnalysis(session), [session]);

    // Style
    const buttonStyle = "w-full text-left rounded-xl border border-black/10 bg-white shadow-sm hover:bg-black/100 transition px-4 py-3";

    // Return UI component
    return (
        <button onClick={onClick} className={buttonStyle} >
            
            {/* Header / Title */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{`Session #${session.id ?? "—"}`}</div>
                    <div className="text-xs text-black/60 truncate">{session.start_ts       ?? ""   }</div>
                </div>

                {/* Sentiment & Risk */}
                <div className="flex gap-2 flex-wrap justify-end">
                    <InfoPill label="Sentiment" value={sentimentBadge(analysis.sentiment  )} />
                    <InfoPill label="Risk"      value={     riskBadge(analysis.risk_rating)} />
                </div>

            </div>

            {/* Summary (probably not keeping this one...?) */}
            <div className="mt-2 text-sm text-black/80 line-clamp-2">{analysis.summary}</div>

            {/* Messages & Duration */}
            <div className="mt-3 flex gap-2 flex-wrap">
                <InfoPill label="Messages" value={session.messages.length ?? "—"} />
                <InfoPill label="Duration" value={session.duration        ?? "—"} />
            </div>

        </button>
    );
});

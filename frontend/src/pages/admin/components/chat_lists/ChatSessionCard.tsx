/* ChatSessionCard view for the Admin chat lists page.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/chat_lists/ChatSessionCard`

*/
import { memo, useMemo } from "react";

// From this project
import { ChatSession                                        } from "@/api";
import { dateFormatLong, formatElapsedTime                  } from "@/utils/styling/numFormatting";
import { chatRunLabel, chatTypePresentation, isTaskChatType } from "./chatTypePresentation";
import { formatTimeAgo                                      } from "./timeGrouping";

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
    const startDate    = session.start_ts ? new Date(session.start_ts) : null;
    const dateText     = startDate ? dateFormatLong.format(startDate) : "—";
    const agoText      = formatTimeAgo(startDate);
    const title        = `${session.profile.account.user.first_name} ${session.profile.account.user.last_name}`;
    const sessionLabel = `Session #${session.id ?? "—"}`;
    const task         = chatTypePresentation(session.chat_type);
    const TaskIcon     = task.icon;
    const isTask       = isTaskChatType(session.chat_type);
    const runTags      = [session.variant, session.condition].filter((value: string) => value !== "");

    // Active vs completed accent on the left edge.
    const accentBorder = isActive ? "border-l-status-live!" : "border-l-admin-border!";

    // UI Component
    return (
        <button
            onClick   = {onClick}
            className = {`group h-full text-left w-full rounded-xl! border border-admin-border border-l-4! ${accentBorder} bg-admin-panel shadow-sm px-4 py-3 hover:bg-admin-muted hover:border-admin-accent/40 transition-colors cursor-pointer flex flex-col`}
        >
            {/* -------------------------------------------------------------------------------- */}
            {/* Chat Type and Session Number */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="mb-3 flex w-full items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-semibold ${task.className}`}>
                    <TaskIcon aria-hidden="true" size={18} />{task.label}
                </span>
                <span className="text-xs text-admin-subtext">{sessionLabel}</span>
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Participant and Recency */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-lg font-semibold text-admin-text truncate">{title}</div>
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
            {/* Variant, Condition, and Stats */}
            {/* -------------------------------------------------------------------------------- */}
            {(runTags.length > 0) ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-admin-subtext">
                    {runTags.map((value: string) => <span key={value} className="rounded-md bg-admin-muted px-2 py-1">{chatRunLabel(value)}</span>)}
                </div>
            ) : null}
            <div className="flex gap-2 flex-wrap mt-2">
                <Pill label="Messages" value={session.messages.length ?? "—"     } />
                <Pill label="Duration" value={formatElapsedTime(session.duration)} />
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* What the History Page Shows */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="flex-1 flex flex-col">
                {/* Task chats: what their history page holds */}
                {isTask ? <p className="mt-3 mb-0 text-sm text-admin-subtext">{(session.chat_type === "map_task") ? "Maps, route, and conversation" : "Scenario, constraints, and decisions"}</p> : null}

                {/* Other completed chats: the post-chat summary and topics */}
                {!isActive && !isTask && analysis && (
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
            {!isActive && !isTask && analysis && (
                <div className="mt-3 flex gap-2 flex-wrap">
                    <Pill label="Risk"      value={     riskBadge(analysis.risk_rating )} />
                    <Pill label="Sentiment" value={sentimentBadge(analysis.sentiment   )} />
                    <Pill label="Emotion"   value={  emotionBadge(analysis.emotion     )} />
                </div>
            )}
        </button>
    );
});

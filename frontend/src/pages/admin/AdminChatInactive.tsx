/* Review a completed conversation or task, with its transcript and saved results.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/AdminChatInactive`

This is the inactive counterpart of the AdminChat page. On this page, Admin 
users can view all analysis for a ChatSession that has already been completed. 

Admin users can view the full transcript from the ChatSession as well as graphs
showing values each of the biomarkers as the chat went on. Additionally, they
can view the automatically generated analysis for the chat, including a list of
topics, short summary of the chat, and an analysis of any potential risk factors
identified from the users speech. This page also has a button that takes them to
the secondary analysis page, "TranscriptPlayback.tsx". A Map Task, cooperative
planning, or speech elicitation chat also gets a button beside it, styled like
its chat type's pill on the session cards, that opens its task details page
(`AdminTaskDetails`: its maps, decisions, or threads, with stats). Under it all,
the Response timing card shows how long each reply took (`ResponseTimingCard`),
and the header marks a session started in debug mode.

*/
import { useNavigate, useParams } from "react-router-dom";
import { LuChevronRight, LuPlay } from "react-icons/lu";

// Components
import { SessionHeader      } from "./components/admin_header/SessionHeader";
import { SessionHistory     } from "./components/common/SessionHistory";
import { AnalysisPanel      } from "./components/analysis/AnalysisPanel";
import { ResponseTimingCard } from "./components/ResponseTimingCard";
import { AdminPage          } from "./components/ui/AdminPage";
import { AdminButton        } from "./components/ui/AdminButton";

// Misc. Helpers
import { useChatSession                                             } from "@/hooks/queries/useChatSessions";
import { CHAT_TYPE_PILL_CLASS, chatTypePresentation, hasTaskDetails } from "./components/chat_lists/chatTypePresentation";


// ================================================================================
// [FOR INACTIVE SESSIONS] Admin view for completed chats
// ================================================================================
export function AdminChatInactive() {
    // Load data for the given chat (ID received on page load)
    const { id                       } = useParams();
    const { data: session, isLoading, isError } = useChatSession(id ?? "");
    const navigate = useNavigate();

    if (isError) return <div role="alert" className="p-6 text-admin-subtext">Unable to load this session. <AdminButton onClick={() => navigate("/admin")}>Back to Chat History</AdminButton></div>;
    if (isLoading || !session.id) return <div className="p-6 text-admin-subtext">Loading session...</div>;

    // A task chat's button to its details page, styled like its chat type's pill on the session cards
    const task          = chatTypePresentation(session.chat_type);
    const TaskIcon      = task.icon;
    const detailsButton = hasTaskDetails(session.chat_type) ? (
        <button className={`${CHAT_TYPE_PILL_CLASS} ${task.className} cursor-pointer shadow-sm transition hover:brightness-95`} onClick={() => navigate(`/admin/chat/inactive/${session.id}/task`)} type="button">
            <TaskIcon aria-hidden="true" size={18} /> {task.label} details <LuChevronRight aria-hidden="true" size={16} />
        </button>
    ) : null;

    // "Transcript Playback" button takes us to the biomarker highlighting analysis page
    // (pass only the session ID so the playback page always re-fetches fresh data)
    const playbackButton = (
        <AdminButton
            variant  = "primary"
            size     = "md"
            iconLeft = {<LuPlay size={18} />}
            onClick  = {() => navigate("/transcript-playback", { state: { sessionId: session.id } })}
            className= "shadow-md text-base"
        >
            Transcript Playback
        </AdminButton>
    );

    // --------------------------------------------------------------------------------
    // UI Components
    // --------------------------------------------------------------------------------
    return (
        <AdminPage contained={false}>
            {/* Page Header */}
            <SessionHeader
                title         = "Viewing Chat Session"
                sessionId     = {id}
                username      = {session?.profile.account.user.username ?? "sample_username"}
                source        = {session?.source ?? "unknown"}
                chatRun       = {session}
                mode          = {"history"}
                wsState       = {"offline"}
                messageCount  = {session?.messages.length ?? 0}
                inactive_chat = {true}
                duration      = {session?.duration}
                rightActions  = {<>{detailsButton}{playbackButton}</>}
            />

            {/* Page Body (a task chat's task is on its details page) */}
            <div className="px-4 md:px-6 pt-4 pb-6 flex flex-col gap-6">
                <AnalysisPanel      session={session} />
                <SessionHistory     session={session} />
                <ResponseTimingCard session={session} />
            </div>
        </AdminPage>
    );
}

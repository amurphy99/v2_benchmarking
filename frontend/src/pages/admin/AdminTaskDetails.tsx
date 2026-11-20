/* A completed task chat's details: its maps, decisions, or threads, with stats.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/AdminTaskDetails`

Opened from the completed-chat page's task button
(`/admin/chat/inactive/<id>/task`) for a Map Task, cooperative planning, or
speech elicitation chat. The task's part reads the private task-history
endpoint, and each chat type has its own view (`components/task_details/`): the
Map Task's route stats, both maps as one, and each map; a planning chat's
stats, both sides, and who suggested what; or a speech elicitation chat's
threads, reply kinds, answer lengths, and holds. A compact transcript sits
beside it. A session saved before its chat type saved task history shows its
variant's current materials under a notice, never as the session's own
outcome.

*/
import type { ReactElement           } from "react";
import      { useNavigate, useParams } from "react-router-dom";

// From this project
import type { SessionTaskHistory    } from "@/api";
import      { useChatSession        } from "@/hooks/queries/useChatSessions";
import      { useSessionTaskHistory } from "@/hooks/queries/useSessionTaskHistory";

// Components
import      { SessionHeader      } from "./components/admin_header/SessionHeader";
import      { ChatMessages       } from "./components/common/ChatMessages";
import        ElicitationDetails   from "./components/task_details/ElicitationDetails";
import        MapTaskDetails       from "./components/task_details/MapTaskDetails";
import        PlanningDetails      from "./components/task_details/PlanningDetails";
import      { AdminButton        } from "./components/ui/AdminButton";
import      { AdminPage          } from "./components/ui/AdminPage";

// What an unsaved older session's history can't show, by its chat type
const TASK_UNSAVED_RESULTS: Record<NonNullable<SessionTaskHistory["view"]>["kind"], string> = {
    map_task             : "The avatar's path and replies are unavailable.",
    cooperative_planning : "Its decisions are unavailable.",
    speech_elicitation   : "Its threads are unavailable.",
};

// Heading style shared by the page's titles
const TASK_HEADING = "m-0 font-semibold [font-family:inherit]";


// ================================================================================
// Admin Task Details
// ================================================================================
// One completed task chat's task, with its stats, beside a compact transcript
export function AdminTaskDetails(): ReactElement {
    const { id = "" } = useParams();
    const navigate    = useNavigate();

    // The session (for the header and the transcript), and its saved task history (null until loaded)
    const { data: session, isLoading: sessionLoading, isError: sessionError } = useChatSession(id);
    const { data, isLoading, isError, refetch } = useSessionTaskHistory(id);
    const view = data?.view;

    if (sessionError)                    return <div role="alert" className="p-6 text-admin-subtext">Unable to load this session. <AdminButton onClick={() => navigate("/admin")}>Back to Chat History</AdminButton></div>;
    if (sessionLoading || !session.id)   return <div className="p-6 text-admin-subtext">Loading session...</div>;

    return (
        <AdminPage contained={false}>
            {/* -------------------------------------------------------------------------------- */}
            {/* Page Header */}
            {/* -------------------------------------------------------------------------------- */}
            <SessionHeader
                title         = "Task Details"
                sessionId     = {id}
                username      = {session.profile.account.user.username}
                source        = {session.source}
                chatRun       = {session}
                chatSetup     = {session}
                mode          = {"history"}
                wsState       = {"offline"}
                messageCount  = {session.messages.length}
                inactive_chat = {true}
                duration      = {session.duration}
            />

            {/* -------------------------------------------------------------------------------- */}
            {/* Task, and the Transcript Beside It */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="px-4 md:px-6 pt-4 pb-6">
                <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <section className="min-w-0 rounded-xl border border-admin-border bg-admin-panel p-5! text-admin-text shadow-sm">
                        {/* Loading, error, and unsaved-history notices */}
                        {isLoading ? <p role="status" className="m-0 text-sm text-admin-subtext">Loading task details…</p> : null}
                        {isError ? (
                            <div role="alert" className="flex flex-wrap items-center gap-3">
                                <p className="m-0">Task details could not be loaded.</p>
                                <AdminButton onClick={async () => { await refetch(); }}>Try again</AdminButton>
                            </div>
                        ) : null}
                        {((data !== null) && !data.recorded) ? (
                            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                Task details were not saved during this session.{" "}
                                {view ? `These are the current materials for its variant; the original materials may have differed. ${TASK_UNSAVED_RESULTS[view.kind]}` : "No matching task materials are available."}
                            </p>
                        ) : null}

                        {/* The chat type's own view */}
                        {(view?.kind === "map_task")             ? <MapTaskDetails     view={view} />                             : null}
                        {(view?.kind === "cooperative_planning") ? <PlanningDetails    view={view} />                             : null}
                        {(view?.kind === "speech_elicitation")   ? <ElicitationDetails view={view} messages={session.messages} /> : null}
                    </section>

                    {/* The transcript, scrolling on its own */}
                    <aside className="flex h-[65vh] min-h-0 flex-col overflow-hidden rounded-xl border border-admin-border bg-admin-panel shadow-sm xl:sticky xl:top-20 xl:h-[78vh]">
                        <h2 className={`${TASK_HEADING} shrink-0 border-b border-admin-border px-4 py-3 text-base!`}>
                            Transcript <span className="text-sm font-normal text-admin-subtext">· {session.messages.length} messages</span>
                        </h2>
                        <ChatMessages heading={null} messages={session.messages} chatStartTsIso={session.start_ts} do_auto_scroll={false} />
                    </aside>
                </div>
            </div>
        </AdminPage>
    );
}

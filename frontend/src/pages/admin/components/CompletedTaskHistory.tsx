/* Review a completed task alongside a compact, independently scrolling transcript.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/CompletedTaskHistory`

The task panel reads the private task-history endpoint. A session saved before
task snapshots existed shows its variant's current materials under a notice,
never as the session's own outcome.

*/
import type { ReactElement } from "react";
import      { useMemo      } from "react";

// From this project
import type { ChatSession                } from "@/api";
import        MapTaskMap                   from "@/components/map_task/MapTaskMap";
import      { ChatBiomarkerToLocalSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";
import      { useSessionTaskHistory      } from "@/hooks/queries/useSessionTaskHistory";
import        PlanningHistoryPanel         from "./PlanningHistoryPanel";
import      { BiomarkerPanel             } from "./common/BiomarkerPanel";
import      { ChatMessages               } from "./common/ChatMessages";
import      { AdminButton                } from "./ui/AdminButton";

// Heading style shared by the panel's titles
const TASK_HEADING = "m-0 font-semibold [font-family:inherit]";


// ================================================================================
// Completed Task History
// ================================================================================
// Give task materials most of the page while retaining the full transcript and any scores
export default function CompletedTaskHistory({session}: {
    session : ChatSession;  // Authorized completed session
}): ReactElement {
    // Saved task view (null until loaded)
    const {data, isLoading, isError, refetch} = useSessionTaskHistory(String(session.id));
    const view = data?.view;

    // Biomarker series for the collapsible scores section
    const series = useMemo(() => ChatBiomarkerToLocalSeries(session.biomarkers), [session.biomarkers]);

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <>
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <section className="min-w-0 rounded-xl border border-admin-border bg-admin-panel p-5! text-admin-text shadow-sm">
                    {/* -------------------------------------------------------------------------------- */}
                    {/* Loading, Error, and Unsaved-History Notices */}
                    {/* -------------------------------------------------------------------------------- */}
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
                            {view ? `These are the current materials for its variant; the original materials may have differed. ${(view.kind === "map_task") ? "The avatar's path is" : "Its decisions are"} unavailable.` : "No matching task materials are available."}
                        </p>
                    ) : null}

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Map Task */}
                    {/* -------------------------------------------------------------------------------- */}
                    {(view?.kind === "map_task") ? (
                        <>
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                <h2 className={`${TASK_HEADING} text-xl!`}>Map Task</h2>
                                <span className="text-xs text-admin-subtext">{data?.recorded ? "Saved maps and follower path" : "Current map materials"}</span>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                                <section>
                                    <h3 className={`${TASK_HEADING} mb-2 text-sm!`}>Participant’s map</h3>
                                    <MapTaskMap {...view.giver} label="Participant map and target route" />
                                </section>
                                <section>
                                    <h3 className={`${TASK_HEADING} mb-2 text-sm!`}>Avatar’s map</h3>
                                    <MapTaskMap {...view.follower} path={view.path} ghostRoute={view.giver.route} label="Avatar map and saved path" />
                                </section>
                            </div>

                            <p className="mt-4 mb-0 text-sm text-admin-subtext">
                                Solid red: participant’s route. Dashed red: route for comparison on the avatar’s map.{" "}
                                {(view.path !== null) ? "Blue: saved avatar path." : "No avatar path was saved."}{" "}
                                Shaded areas show landmark sizes.
                            </p>
                        </>
                    ) : null}

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Cooperative Planning */}
                    {/* -------------------------------------------------------------------------------- */}
                    {(view?.kind === "cooperative_planning") ? <PlanningHistoryPanel view={view} /> : null}
                </section>

                {/* -------------------------------------------------------------------------------- */}
                {/* Transcript */}
                {/* -------------------------------------------------------------------------------- */}
                <aside className="flex h-[65vh] min-h-0 flex-col overflow-hidden rounded-xl border border-admin-border bg-admin-panel shadow-sm xl:sticky xl:top-4 xl:h-[78vh]">
                    <h2 className={`${TASK_HEADING} shrink-0 border-b border-admin-border px-4 py-3 text-base!`}>
                        Transcript <span className="text-sm font-normal text-admin-subtext">· {session.messages.length} messages</span>
                    </h2>
                    <ChatMessages heading={null} messages={session.messages} chatStartTsIso={session.start_ts} do_auto_scroll={false} />
                </aside>
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Recorded Biomarkers */}
            {/* -------------------------------------------------------------------------------- */}
            {(session.biomarkers.length > 0) ? (
                <details className="rounded-xl border border-admin-border bg-admin-panel p-4">
                    <summary className="cursor-pointer text-sm font-semibold">Recorded biomarkers ({session.biomarkers.length})</summary>
                    <BiomarkerPanel series={series} windowSeconds="all" />
                </details>
            ) : null}
        </>
    );
}

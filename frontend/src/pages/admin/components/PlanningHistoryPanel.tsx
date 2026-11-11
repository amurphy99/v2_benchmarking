/* Show a planning session's scenario, private constraints, and decisions.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/PlanningHistoryPanel`

*/
import type { ReactElement } from "react";

// From this project
import type { PlanningItemHistory, PlanningTaskHistory } from "@/api";

// Readable stages distinguish unfinished plans from approved ones
const PLAN_STAGE_LABELS = {planning: "Still planning", final_check: "Awaiting final approval", approved: "Plan approved"};

// Heading style shared by the panel's titles
const PLAN_HEADING = "m-0 font-semibold [font-family:inherit]";


// ================================================================================
// Planning History Panel
// ================================================================================
// Keep agreements, pending choices, and rejected ideas distinct
export default function PlanningHistoryPanel({view}: {
    view : PlanningTaskHistory;  // Saved scenario and decisions, or current materials only
}): ReactElement {
    // Both sides' private constraints, shown side by side
    const constraintGroups = [
        {label: "Participant constraints", items: view.participant_constraints},
        {label: "Avatar constraints",      items: view.avatar_constraints     },
    ];

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <div className="flex flex-col gap-5">
            {/* -------------------------------------------------------------------------------- */}
            {/* Scenario and Stage */}
            {/* -------------------------------------------------------------------------------- */}
            <header>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-admin-subtext">Scenario</p>
                <h2 className={`${PLAN_HEADING} text-xl!`}>{view.title}</h2>
                <p className="mt-2 mb-0 text-sm text-admin-subtext">{(view.stage === null) ? "Decisions were not saved for this session." : PLAN_STAGE_LABELS[view.stage]}</p>
            </header>

            {/* -------------------------------------------------------------------------------- */}
            {/* Constraints */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="grid gap-4 md:grid-cols-2">
                {constraintGroups.map(({label, items}) => (
                    <section key={label} className="rounded-xl border border-admin-border bg-admin-muted p-4!">
                        <h3 className={`${PLAN_HEADING} mb-2 text-sm!`}>{label}</h3>
                        <ul className="mb-0 list-disc space-y-2 pl-5 text-sm">
                            {items.map((text: string, index: number) => <li key={index}>{text}</li>)}
                        </ul>
                    </section>
                ))}
            </div>

            {/* -------------------------------------------------------------------------------- */}
            {/* Decisions */}
            {/* -------------------------------------------------------------------------------- */}
            <section>
                <h3 className={`${PLAN_HEADING} mb-2 text-base!`}>Decisions</h3>
                <div className="flex flex-col gap-3">
                    {view.items.map((item: PlanningItemHistory) => (
                        <article key={item.id} className="rounded-xl border border-admin-border p-4!">
                            <div className="flex items-start justify-between gap-3">
                                <h4 className={`${PLAN_HEADING} text-base!`}>{item.label}</h4>
                                <span className="text-xs font-medium text-admin-subtext">{itemStatus(item)}</span>
                            </div>

                            {/* The agreed choice, then anything pending, considered, or declined */}
                            {(item.state !== null) ? (
                                <>
                                    <p className="mt-2 mb-0 font-medium">{item.state.agreed ?? "No agreed choice"}</p>
                                    {(item.state.settling !== null) ? (
                                        <p className="mt-2 mb-0 text-sm text-admin-subtext">Pending: {item.state.settling.choice} · proposed by {speakerName(item.state.settling.by)}</p>
                                    ) : null}
                                    {(item.state.suggestions.length > 0) ? (
                                        <p className="mt-2 mb-0 text-sm text-admin-subtext">Considered: {item.state.suggestions.map((idea) => idea.choice).join(" · ")}</p>
                                    ) : null}
                                    {(item.state.refused.length > 0) ? (
                                        <ul className="mt-2 mb-0 list-none space-y-1 pl-0! text-sm text-admin-subtext">
                                            {item.state.refused.map((idea, index: number) => (
                                                <li key={index}>Declined by {speakerName(idea.by)}: {idea.choice}{idea.reason ? ` — ${idea.reason}` : ""}</li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </>
                            ) : null}
                        </article>
                    ))}
                </div>
            </section>

            {/* -------------------------------------------------------------------------------- */}
            {/* Participant Preferences */}
            {/* -------------------------------------------------------------------------------- */}
            {((view.user_wants.length + view.user_avoids.length) > 0) ? (
                <section>
                    <h3 className={`${PLAN_HEADING} mb-2 text-base!`}>Participant preferences learned during the chat</h3>
                    {(view.user_wants.length  > 0) ? <p className="mb-1 text-sm text-admin-subtext">Wants: {view.user_wants.join(" · ")}</p>   : null}
                    {(view.user_avoids.length > 0) ? <p className="mb-0 text-sm text-admin-subtext">Avoids: {view.user_avoids.join(" · ")}</p> : null}
                </section>
            ) : null}
        </div>
    );
}


// --------------------------------------------------------------------------------
// Item Labels
// --------------------------------------------------------------------------------
// One decision's status: agreed, waiting for a yes, open, or never saved
function itemStatus(item: PlanningItemHistory): string {
    if (item.state === null)           return "Not recorded";
    if (item.state.agreed !== null)    return "Agreed";
    if (item.state.settling !== null)  return "Awaiting agreement";
    return "Open";
}

// Who proposed or declined a choice
function speakerName(by: "user" | "avatar"): string {
    return (by === "user") ? "participant" : "avatar";
}

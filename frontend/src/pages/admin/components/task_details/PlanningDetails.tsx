/* A planning chat's details: plan stats, both sides, and who suggested what.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/task_details/PlanningDetails`

From the session's saved task history. The stats come first: the items agreed,
the choices each side put forward and turned down, the avatar's constraints it
mentioned, what it learned about the participant, and how the intro went. Both
sides' briefs and constraints follow, the avatar's marked where it mentioned
one. Then each item: the agreed choice and the side that first suggested it,
anything still pending or under discussion, and every idea turned down, by whom,
why, and who suggested it. A snapshot saved before who-suggested-what was kept
shows the decisions without it.

*/
import type { ReactElement         } from "react";
import      { LuMessageSquareQuote } from "react-icons/lu";

// From this project
import type { PlanningItemHistory, PlanningSide, PlanningTaskHistory } from "@/api";
import      { StatTile, StatTileRow                                  } from "../ui/StatTile";
import        IntroTile                                                from "./IntroTile";

// One item's saved state (null for a session that saved no decisions)
type PlanningItemState = NonNullable<PlanningItemHistory["state"]>;

// One choice a side put forward
type PlanningIdea = {choice: string; by: PlanningSide};

// Readable stages distinguish unfinished plans from approved ones
const PLAN_STAGE_LABELS = {planning: "Still planning", final_check: "Awaiting final approval", approved: "Plan approved"};

// Heading style shared by the panel's titles
const PLAN_HEADING = "m-0 font-semibold [font-family:inherit]";


// ================================================================================
// Planning Details
// ================================================================================
// The plan's numbers, both sides' materials, and each decision with who suggested what
export default function PlanningDetails({view}: {
    view : PlanningTaskHistory;  // Saved scenario and decisions, or current materials only
}): ReactElement {
    // --------------------------------------------------------------------------------
    // Plan Stats
    // --------------------------------------------------------------------------------
    // The saved items (none for a session that saved no decisions), and the choices each side put forward (null when not kept)
    const states  = view.items.map((item: PlanningItemHistory) => item.state).filter((state: PlanningItemState | null): state is PlanningItemState => state !== null);
    const lists   = states.map((state: PlanningItemState) => state.put_forward);
    const ideas   = lists.every((list: PlanningIdea[] | undefined): list is PlanningIdea[] => list !== undefined) ? lists.flat() : null;
    const refused = states.flatMap((state: PlanningItemState) => state.refused);
    const saved   = (view.stage !== null);

    // Counts by side ("—" where nothing was saved)
    const ideasBy   = (side: PlanningSide): string => (saved && (ideas !== null)) ? String(ideas.filter((idea: PlanningIdea) => idea.by === side).length) : "—";
    const refusedBy = (side: PlanningSide): number => refused.filter((idea: PlanningItemState["refused"][number]) => idea.by === side).length;
    const agreed    = states.filter((state: PlanningItemState) => state.agreed !== null).length;
    const mentioned = view.avatar_mentioned;

    // Both sides' private brief and constraints, shown side by side (the avatar's marked where it mentioned one)
    const constraintGroups = [
        {label: "Participant", brief: view.participant_brief, items: view.participant_constraints, mentioned: null             },
        {label: "Avatar",      brief: view.avatar_brief,      items: view.avatar_constraints,      mentioned: mentioned ?? null},
    ];

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <div className="flex flex-col gap-5">
            {/* -------------------------------------------------------------------------------- */}
            {/* Scenario, Stage, and Stats */}
            {/* -------------------------------------------------------------------------------- */}
            <header className="flex flex-col gap-3">
                <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-admin-subtext">Scenario</p>
                    <h2 className={`${PLAN_HEADING} text-xl!`}>{view.title}</h2>
                    <p className="mt-2 mb-0 text-sm text-admin-subtext">{(view.stage !== null) ? PLAN_STAGE_LABELS[view.stage] : "Decisions were not saved for this session."}</p>
                </div>
                <StatTileRow>
                    <StatTile label="Items agreed"        value={saved ? `${agreed} of ${view.items.length}` : "—"}                                  sub="choices on the card"                  />
                    <StatTile label="Participant's ideas" value={ideasBy("user")}                                                                    sub="choices they put forward"             help="Every choice the participant suggested first, counted once" />
                    <StatTile label="Avatar's ideas"      value={ideasBy("avatar")}                                                                  sub="choices it put forward"               help="Every choice the avatar suggested first, counted once" />
                    <StatTile label="Turned down"         value={saved ? String(refused.length) : "—"}                                               sub={saved ? `participant ${refusedBy("user")} · avatar ${refusedBy("avatar")}` : undefined} help="Ideas turned down by either side and still turned down at the end (one suggested again comes off the list)" />
                    <StatTile label="Avatar mentioned"    value={(saved && (mentioned !== undefined)) ? `${mentioned.length} of ${view.avatar_constraints.length}` : "—"} sub="of its constraints" help="The avatar's own constraints it brought up during the chat" />
                    <StatTile label="Learned about them"  value={saved ? String(view.user_wants.length + view.user_avoids.length) : "—"}            sub="needs, wants, and things to avoid"    help="What the avatar noted about the participant from what they said" />
                    <IntroTile intro={view.intro} />
                </StatTileRow>
            </header>

            {/* -------------------------------------------------------------------------------- */}
            {/* Constraints */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="grid gap-4 md:grid-cols-2">
                {constraintGroups.map(({label, brief, items, mentioned: told}) => (
                    <section key={label} className="rounded-xl border border-admin-border bg-admin-muted p-4!">
                        <h3 className={`${PLAN_HEADING} mb-2 text-sm!`}>{label}</h3>
                        {(brief !== undefined) ? <p className="mb-3 text-sm">{brief}</p> : null}
                        <ul className="mb-0 list-disc space-y-2 pl-5 text-sm">
                            {items.map((text: string, index: number) => (
                                <li key={index}>
                                    {text}
                                    {((told !== null) && told.includes(text)) ? (
                                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-admin-accent2"><LuMessageSquareQuote aria-hidden="true" /> mentioned</span>
                                    ) : null}
                                </li>
                            ))}
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

                            {/* The agreed choice and who suggested it, then anything pending, considered, or turned down */}
                            {(item.state !== null) ? (
                                <>
                                    <p className="mt-2 mb-0 font-medium">
                                        {item.state.agreed ?? "No agreed choice"}
                                        {((item.state.agreed !== null) && item.state.suggested_by) ? <span className="ml-2 text-sm font-normal text-admin-subtext">suggested by the {speakerName(item.state.suggested_by)}</span> : null}
                                    </p>
                                    {(item.state.settling !== null) ? (
                                        <p className="mt-2 mb-0 text-sm text-admin-subtext">Pending: {item.state.settling.choice} · proposed by the {speakerName(item.state.settling.by)}</p>
                                    ) : null}
                                    {(item.state.suggestions.length > 0) ? (
                                        <p className="mt-2 mb-0 text-sm text-admin-subtext">Considered: {item.state.suggestions.map((idea: PlanningIdea) => `${idea.choice} (from the ${speakerName(idea.by)})`).join(" · ")}</p>
                                    ) : null}
                                    {(item.state.refused.length > 0) ? (
                                        <ul className="mt-2 mb-0 list-none space-y-1 pl-0! text-sm text-admin-subtext">
                                            {item.state.refused.map((idea: PlanningItemState["refused"][number], index: number) => (
                                                <li key={index}>
                                                    Turned down by the {speakerName(idea.by)}: {idea.choice}{idea.reason ? ` — ${idea.reason}` : ""}
                                                    {idea.suggested_by ? ` · suggested by the ${speakerName(idea.suggested_by)}` : ""}
                                                </li>
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

// Who proposed, suggested, or turned down a choice
function speakerName(by: PlanningSide): string {
    return (by === "user") ? "participant" : "avatar";
}

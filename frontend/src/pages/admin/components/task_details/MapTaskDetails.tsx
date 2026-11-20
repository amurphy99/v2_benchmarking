/* A completed Map Task's details: route stats, both maps as one, and each map.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/task_details/MapTaskDetails`

From the session's saved task history. The stats come first: how far from the
finish the avatar stopped, and how long its path was against the route, both
measured in the paper's real proportions (its longer side is 1), as the backend
measures. The turns by kind and the avatar's replies by what they did come from
the saved replies (`replies`), and how the intro went from its record. The
combined map draws both maps as one (`CombinedMap`); under it, each map on its
own, with the landmarks that differ ringed on both and named. A session saved
before its path or replies were recorded shows only what it has.

*/
import type { ReactElement } from "react";
import      { useMemo      } from "react";

// From this project
import type { MapPoint, MapShape, MapTaskEnd, MapTaskHistory, MapTaskReplyRecord } from "@/api";
import        CombinedMap                                                          from "@/components/map_task/CombinedMap";
import        MapDifferencesList                                                   from "@/components/map_task/MapDifferencesList";
import        MapTaskMap                                                           from "@/components/map_task/MapTaskMap";
import      { MAP_TASK_PAPER, differingIds, mapDifferences                       } from "@/components/map_task/mapTaskViews";
import      { Pill                                                               } from "../ui/Pill";
import      { StatTile, StatTileRow                                              } from "../ui/StatTile";
import        IntroTile                                                            from "./IntroTile";

// How each kind of turn reads (copied from `Route` in `backend/chat_app/websocket/harnesses/map_task/understanding.py`)
const MAP_TURN_LABELS: Record<MapTaskReplyRecord["route"], string> = {
    instruction     : "Directions",
    simple_question : "Questions about one landmark",
    mismatch        : "Named a landmark the avatar lacks",
    other           : "Other",
};

// How each kind of reply reads (copied from `FollowerAct` in `backend/chat_app/websocket/harnesses/map_task/response_models.py`)
const MAP_REPLY_LABELS: Record<MapTaskReplyRecord["act"], string> = {
    acknowledge    : "Went along",
    answer         : "Answered",
    clarify        : "Asked again",
    report_missing : "Said it lacked a landmark",
    finish         : "Checked the finish",
    other          : "Other",
};

// How the task ended itself (copied from `MapTaskEnd` in `harnesses/map_task/finish.py`)
const MAP_END_LABELS: Record<MapTaskEnd, {value: string; sub: string}> = {
    reached_finish  : {value: "At the finish", sub: "the avatar got there"},
    giver_confirmed : {value: "On their word", sub: "they confirmed its spot"},
};

// Each section's card, and the headings over them
const MAP_DETAILS_CARD    = "rounded-xl border border-admin-border bg-admin-panel p-4! shadow-sm";
const MAP_DETAILS_HEADING = "m-0 font-semibold [font-family:inherit]";


// ================================================================================
// Map Task Details
// ================================================================================
// The route's numbers, then both maps as one, then each map and what differs
export default function MapTaskDetails({view}: {
    view : MapTaskHistory;  // The saved maps, path, and replies (or an older session's current maps)
}): ReactElement {
    // What differs between the maps (ringed on both, and named under them)
    const differences = useMemo(() => mapDifferences(view.giver, view.follower), [view.giver, view.follower]);
    const ringed      = useMemo(() => differingIds(differences), [differences]);

    // --------------------------------------------------------------------------------
    // Route Stats
    // --------------------------------------------------------------------------------
    // Where the avatar stopped against the finish, and its path against the route (null where nothing was saved)
    const scale      = paperScale(view.giver.shape);
    const finish     = view.giver.route[view.giver.route.length - 1];
    const fromFinish = (view.position !== null) ? mapDistance(view.position, finish, scale)                           : null;
    const pathRatio  = (view.path     !== null) ? (lineLength(view.path, scale) / lineLength(view.giver.route, scale)) : null;

    // How the task ended: by itself, otherwise (End chat, a dropped connection), or not recorded
    const ending = (view.ended === undefined) ? {value: "—", sub: "not recorded"} : (view.ended === null) ? {value: "Not by the task", sub: "ended by hand, or dropped"} : MAP_END_LABELS[view.ended];

    // The saved replies (absent from older snapshots), and how many of them match ("—" when they weren't recorded)
    const replies      = view.replies ?? null;
    const countReplies = (matches: (reply: MapTaskReplyRecord) => boolean): string => (replies === null) ? "—" : String(replies.filter(matches).length);
    const moves        = (replies === null) ? "—" : `${replies.filter((reply: MapTaskReplyRecord) => reply.waypoints > 0).length} of ${replies.length}`;

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <div className="flex flex-col gap-5">
            {/* -------------------------------------------------------------------------------- */}
            {/* Route Stats */}
            {/* -------------------------------------------------------------------------------- */}
            <section className="flex flex-col gap-3">
                <h2 className={`${MAP_DETAILS_HEADING} text-xl!`}>The route</h2>
                <StatTileRow>
                    <StatTile label="From the finish" value={(fromFinish === null) ? "—" : `${Math.round(fromFinish * 100)}%`} sub="of the map's longer side"       help="How far from the finish the avatar stopped, measured on the paper" />
                    <StatTile label="Path length"     value={(pathRatio  === null) ? "—" : `${pathRatio.toFixed(1)}×`}          sub="the route's length"            help="The avatar's whole path against the route, both measured on the paper" />
                    <StatTile label="Directions"      value={countReplies((reply: MapTaskReplyRecord) => reply.route === "instruction")} sub="turns telling it where to go" help="Turns read as a direction: a move, or a landmark to head for" />
                    <StatTile label="Clarifications"  value={countReplies((reply: MapTaskReplyRecord) => reply.act === "clarify")}       sub="times the avatar asked again" help="Replies asking the participant to say it again or explain, including a likely misheard name" />
                    <StatTile label="Moves"           value={moves}                                                                      sub="replies that moved it"         help="Replies whose move added at least one point to the avatar's path" />
                    <StatTile label="Ended"           value={ending.value}                                                               sub={ending.sub}                   help="How the chat ended: the avatar reached the finish, the participant said it was there (after it checked), or neither" />
                    <IntroTile intro={view.intro} />
                </StatTileRow>

                {/* Every reply, by the kind of turn it answered and by what it did */}
                {(replies !== null) ? (
                    <div className="flex flex-col gap-2 text-xs text-admin-subtext">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="w-14 font-semibold">Turns</span>
                            {Object.entries(MAP_TURN_LABELS).map(([route, label]: [string, string]) => <Pill key={route} label={label} value={countReplies((reply: MapTaskReplyRecord) => reply.route === route)} />)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="w-14 font-semibold">Replies</span>
                            {Object.entries(MAP_REPLY_LABELS).map(([act, label]: [string, string]) => <Pill key={act} label={label} value={countReplies((reply: MapTaskReplyRecord) => reply.act === act)} />)}
                        </div>
                    </div>
                ) : <p className="m-0 text-sm text-admin-subtext">The avatar's replies weren't recorded for this session, so its turns and replies can't be counted.</p>}
            </section>

            {/* -------------------------------------------------------------------------------- */}
            {/* Both Maps as One */}
            {/* -------------------------------------------------------------------------------- */}
            <section className={MAP_DETAILS_CARD}>
                <h3 className={`${MAP_DETAILS_HEADING} mb-3! text-base!`}>Both maps as one</h3>
                <CombinedMap giver={view.giver} follower={view.follower} path={view.path} viewer="staff" />
            </section>

            {/* -------------------------------------------------------------------------------- */}
            {/* Each Map, and What Differs */}
            {/* -------------------------------------------------------------------------------- */}
            <div className="grid gap-5 md:grid-cols-2">
                <section className={MAP_DETAILS_CARD}>
                    <h3 className={`${MAP_DETAILS_HEADING} mb-2! text-sm!`}>The participant's map</h3>
                    <MapTaskMap shape={view.giver.shape} landmarks={view.giver.landmarks} route={view.giver.route} marked={ringed} label="The participant's map, with the route" />
                </section>
                <section className={MAP_DETAILS_CARD}>
                    <h3 className={`${MAP_DETAILS_HEADING} mb-2! text-sm!`}>The avatar's map</h3>
                    <MapTaskMap
                        ghostRoute = {view.giver.route}
                        label      = "The avatar's map, with its path and the participant's route"
                        landmarks  = {view.follower.landmarks}
                        marked     = {ringed}
                        path       = {view.path}
                        shape      = {view.follower.shape}
                        start      = {view.follower.start}
                    />
                </section>
            </div>
            <section className={MAP_DETAILS_CARD}>
                <h3 className={`${MAP_DETAILS_HEADING} mb-2! text-sm!`}>What differs (ringed on both maps)</h3>
                <MapDifferencesList differences={differences} />
                <p className="mt-3 mb-0 text-xs text-admin-subtext">
                    Solid red: the participant's route. Dashed red: the same route on the avatar's map, for comparison.{" "}
                    {(view.path !== null) ? "Blue: the avatar's saved path." : "No avatar path was saved."} Shaded areas show landmark sizes.
                </p>
            </section>
        </div>
    );
}


// --------------------------------------------------------------------------------
// Measuring on the Paper
// --------------------------------------------------------------------------------
// The paper's width and height in map units, its longer side 1 (`TaskMap.scale` in the backend's `maps.py`)
function paperScale(shape: MapShape): [number, number] {
    const [width, height] = MAP_TASK_PAPER[shape];
    const longer          = Math.max(width, height);
    return [width / longer, height / longer];
}

// How far apart two points are, in map units
function mapDistance(a: MapPoint, b: MapPoint, scale: [number, number]): number {
    return Math.hypot((b[0] - a[0]) * scale[0], (b[1] - a[1]) * scale[1]);
}

// A line's length through every point, in map units
function lineLength(points: MapPoint[], scale: [number, number]): number {
    return points.slice(1).reduce((total: number, point: MapPoint, index: number) => total + mapDistance(points[index], point, scale), 0);
}


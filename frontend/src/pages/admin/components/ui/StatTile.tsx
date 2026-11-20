/* One number on an admin page: what it counts, its value, and a line under it.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/ui/StatTile`

The task details page's stats are rows of these. Hovering a tile shows what
its number measures, when it has an explanation.

*/
import type { ReactElement } from "react";


// --------------------------------------------------------------------------------
// Stat Tile
// --------------------------------------------------------------------------------
// One stat in a small card
export function StatTile({label, value, sub, help}: {
    label : string;                // What it counts
    value : string;                // The number, written out ("12%", "3 of 4", "—")
    sub?  : string | undefined;    // A line of detail under it
    help? : string | undefined;    // What it measures, shown on hover
}): ReactElement {
    return (
        <div className="rounded-xl border border-admin-border bg-admin-panel px-3 py-2 shadow-sm" title={help}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-admin-subtext">{label}</div>
            <div className="text-lg font-semibold text-admin-text">{value}</div>
            {(sub !== undefined) ? <div className="text-xs text-admin-subtext">{sub}</div> : null}
        </div>
    );
}

// A row of stat tiles that wraps on narrow screens
export function StatTileRow({children}: {children: ReactElement | (ReactElement | null)[]}): ReactElement {
    return <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">{children}</div>;
}

/* Side column of the robot page: robot state, telemetry, avatar actions, biomarkers.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/components/SideTabs`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Same look as the monitor page's `LiveSidePanel`, but it takes its tabs from the
page, so that panel stays untouched. Every tab stays mounted while hidden, so
the biomarker chart keeps its selected score when you switch back.

*/
import type { ReactElement, ReactNode } from "react";
import      { useState                } from "react";

// One tab: its label and what it shows
export type SideTab = {
    id      : string;
    label   : string;
    content : ReactNode;
};


// ================================================================================
// Side Tabs
// ================================================================================
// Tab switcher over a column that scrolls on its own
export default function SideTabs({tabs}: {
    tabs : SideTab[];   // In display order; the first one starts selected
}): ReactElement {
    const [selected, setSelected] = useState<string>(tabs[0].id);

    return (
        <aside className="min-h-0 flex flex-col gap-2">
            {/* Tab switcher (the highlight is a span: the Bootstrap reset squares off button corners) */}
            <div role="tablist" aria-label="Side panel" className="shrink-0 flex rounded-full border border-admin-border bg-admin-muted p-0.5">
                {tabs.map(({id, label}: SideTab): ReactElement => (
                    <button key={id} type="button" role="tab" aria-selected={selected === id} onClick={(): void => setSelected(id)} className="flex-1 bg-transparent p-0">
                        <span className={`block rounded-full px-3 py-1 text-sm font-medium transition-colors ${(selected === id) ? "bg-admin-panel text-admin-text shadow-sm" : "text-admin-subtext hover:text-admin-text"}`}>
                            {label}
                        </span>
                    </button>
                ))}
            </div>

            {/* Selected tab, scrolling on its own */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {tabs.map(({id, content}: SideTab): ReactElement => (
                    <div key={id} role="tabpanel" hidden={selected !== id}>{content}</div>
                ))}
            </div>
        </aside>
    );
}

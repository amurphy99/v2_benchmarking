/* Newest reading from each of the robot's sensor sources.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/components/TelemetryPanel`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Buddy sends every public field of each SDK sensor class with the SDK's names and
units, so every field is shown as a plain table and no field name is hardcoded
here. Buddy resends a source's last reading until the sensor reports again, so
the age shown is the time since that source's `seq` last changed. A missing
value shows as a dash, never as zero.

*/
import type { ReactElement } from "react";

// From this project
import      { Pill            } from "@/pages/admin/components/ui/Pill";
import      { formatValue     } from "../mediaFrames";
import type { SourceTelemetry } from "../useMediaViewer";
import      { useNow          } from "../useNow";

// How often the reading-age labels refresh
const SAMPLE_AGE_TICK_MS = 1_000;

// Time without a new reading after which a source is marked stale
const SAMPLE_STALE_MS = 2_000;


// ================================================================================
// Telemetry Panel
// ================================================================================
// One card per sensor source, with every field of its newest reading
export default function TelemetryPanel({telemetry}: {
    telemetry : Record<string, SourceTelemetry>;   // Newest reading per source
}): ReactElement {
    const now     = useNow(SAMPLE_AGE_TICK_MS);
    const sources = Object.keys(telemetry).sort();
    if (sources.length === 0) {
        return <div className="rounded-xl border border-admin-border bg-admin-panel p-4 text-sm text-admin-subtext">No telemetry yet. It starts with the robot's camera.</div>;
    }

    return (
        <div className="flex flex-col gap-3">
            {sources.map((source: string): ReactElement => {
                // Time since this source last sent a new reading
                const {sample, changedAt} = telemetry[source];
                const ageMs = Math.max(0, now - changedAt);

                return (
                    <section key={source} className="rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden">
                        {/* Source Summary */}
                        <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-admin-border flex-wrap">
                            <div className="text-sm font-semibold text-admin-text">{source}</div>
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                <Pill variant={(ageMs > SAMPLE_STALE_MS) ? "paused" : "live"} dot value={`${(ageMs / 1_000).toFixed(1)} s ago`} />
                                <Pill label="seq" value={sample.seq} />
                            </div>
                        </header>

                        {/* Values, as the SDK reports them */}
                        <table className="w-full text-xs">
                            <tbody>
                                {Object.entries(sample.values).map(([field, value]: [string, unknown]): ReactElement => (
                                    <tr key={field} className="border-b border-admin-border/60 last:border-b-0">
                                        <td className="px-3 py-1 text-admin-subtext font-mono">{field}</td>
                                        <td className="px-3 py-1 text-admin-text font-mono text-right break-all">{formatValue(value)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                );
            })}
        </div>
    );
}

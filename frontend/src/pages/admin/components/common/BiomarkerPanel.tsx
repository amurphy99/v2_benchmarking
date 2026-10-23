/* Show the biomarkers for the chat as line graphs.
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/common/BiomarkerPanel.tsx`

    - Expects the `series` object from `useLocalBiomarkers()`
    - Assumes timestamps are ISO strings

    TODO: a LOT of this should really probably be in component / helper files...
*/
import { useMemo, useState } from "react";
import { BiomarkerScoreSet, LocalBiomarkerSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

type BiomarkerKey = keyof BiomarkerScoreSet;
type XAxisMode    = "time" | "index";

// --------------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------------
// NOTE: I think we already have this somewhere, but whatever
// NOTE: Also could add colors? Maybe...
const BIOMARKERS: Array<{ key: BiomarkerKey; label: string }> = [
    { key: "prosody",        label: "Prosody"             },
    { key: "pronunciation",  label: "Pronunciation"       },
    { key: "turntaking",     label: "Turn-taking"         },
    { key: "alteredgrammar", label: "Altered Grammar"     },
    { key: "anomia",         label: "Anomia"              },
    { key: "pragmatic",      label: "Pragmatic Impairment"},
];

const BIG_CHART_W = 800;
const BIG_CHART_H = 120;

// --------------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------------
function parseTs(ts: string): number {
    const t = Date.parse(ts);                   // Convert ISO string into epoch ms
    return Number.isFinite(t) ? t : Date.now(); // Fallback to "now" if invalid
}

// UI-safe formatter for optional floats
function formatVal(v: number | undefined | null) {
    if (v == null || !Number.isFinite(v)) return "—";
    return v.toFixed(3);
}

 // UI-safe formatter for optional deltas
function formatDelta(d: number | null) {
    if (d == null || !Number.isFinite(d)) return "—";
    const sign = d > 0 ? "+" : "";
    return `${sign}${d.toFixed(3)}`;
}

// Return (latest-prev) if both are valid numbers
function calculateDelta(latest?: number, prev?: number): number | null {
    if (latest == null || prev == null) return null;
    if (!Number.isFinite(latest) || !Number.isFinite(prev)) return null;
    return latest - prev;
}

// Build a time/value series for a given biomarker key.
// Output format is [{t, v}] where:
//   t = epoch ms (sorted ascending)
//   v = biomarker value (float)
function buildSeriesForKey(points: LocalBiomarkerSeries["points"], key: BiomarkerKey) {    
    const out: Array<{ t: number; v: number }> = [];

    for (const p of points) {
        const v = p.scores[key];
        if (typeof v === "number" && Number.isFinite(v)) {
            out.push({ t: parseTs(p.ts), v });
        }
    }

    out.sort((a, b) => a.t - b.t);
    return out;
}

// ================================================================================
// Convert a series into an SVG polyline "points" string
// ================================================================================
// Maps X either by time ("time") or evenly-spaced index ("index").
// Maps value to Y with simple min/max scaling.
function polylinePoints(
    data  : Array<{ t: number; v: number }>,
    w     : number,
    h     : number,
    pad   : number    = 2,
    xMode : XAxisMode = "time"
) {
    if (data.length < 2) return "";

    // Y scaling
    let minV =  Infinity;
    let maxV = -Infinity;
    for (const d of data) {
        minV = Math.min(minV, d.v);
        maxV = Math.max(maxV, d.v);
    }
    const vSpan = Math.max(1e-9, maxV - minV);

    // X scaling
    const minT  = data[0              ].t;
    const maxT  = data[data.length - 1].t;
    const tSpan = Math.max(1, maxT - minT);
    const n     = data.length;
    const denom = Math.max(1, n - 1); // avoid divide by 0

    return data
        .map((d, i) => {
            const x =
                xMode === "index"
                    ? pad + (i / denom) * (w - pad * 2)
                    : pad + ((d.t - minT) / tSpan) * (w - pad * 2);

            const y = pad + (1 - (d.v - minV) / vSpan) * (h - pad * 2);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
}

// Only show recent points (for snappier charts).
function filterWindow(points: LocalBiomarkerSeries["points"], windowSeconds: number | "all") {
    // If windowSeconds === "all", show everything.
    if (windowSeconds === "all") return points;
    const cutoff = Date.now() - windowSeconds * 1000;
    return points.filter((p) => parseTs(p.ts) >= cutoff);
}

// --------------------------------------------------------------------------------
// Average Score Helpers
// --------------------------------------------------------------------------------
function calculateAverage(data: Array<{ t: number; v: number }>): number | null {
    if (!data.length) return null;
    let sum = 0;
    for (const d of data) sum += d.v;
    return sum / data.length;
}

function formatAvg(a: number | null) {
    if (a == null || !Number.isFinite(a)) return "—";
    return a.toFixed(3);
}

// ================================================================================
// BiomarkerPanel Component
// ================================================================================
export function BiomarkerPanel({
    series,
    defaultSelected = "prosody",
    windowSeconds   = 300, // 5 minutes
}: {
    series            : LocalBiomarkerSeries;
    defaultSelected ? : BiomarkerKey;
    windowSeconds   ? : number | "all";
}) {
    // Sparkline X-axis mode (can be "time" or "index"; using index by default)
    const [xAxisMode, setXAxisMode] = useState<XAxisMode>("index");

    // Current selected biomarker for the large chart
    const [selected, setSelected] = useState<BiomarkerKey>(defaultSelected);

    // Filter points to a recent time window (for performance + readability)
    const windowedPoints = useMemo(
        () => filterWindow(series.points, windowSeconds),
        [series.points, windowSeconds]
    );

    // Grab "latest" and "previous" points for delta computations
    const latestPoint = series.points.length     ? series.points[series.points.length - 1] : null;
    const prevPoint   = series.points.length > 1 ? series.points[series.points.length - 2] : null;

    // Build card content (latest + delta + sparkline) for each biomarker
    const cards = useMemo(() => {
        // For the average calculation, the first line with 'small' makes it the 5 minute average
        // I have it set to be the average of the whole series now
        return BIOMARKERS.map(({ key, label }) => {
            const latest = latestPoint?.scores[key];
            const prev   = prevPoint  ?.scores[key];

            const delta = calculateDelta(
                typeof latest === "number" ? latest : undefined,
                typeof prev   === "number" ? prev   : undefined
            );

            const small = buildSeriesForKey(windowedPoints,                  key );
            const avg   = calculateAverage (buildSeriesForKey(series.points, key));

            return { key, label, latest, delta, avg, small };
        });
    }, [latestPoint, prevPoint, windowedPoints]);


    // Build the big chart series for the currently selected biomarker
    const bigSeries   = useMemo(() => buildSeriesForKey(windowedPoints, selected), [windowedPoints, selected]);
    const bigPolyline = useMemo(() => polylinePoints(bigSeries, BIG_CHART_W, BIG_CHART_H, 10, xAxisMode), [bigSeries, xAxisMode]);

    const selectedLabel = BIOMARKERS.find((b) => b.key === selected)?.label ?? String(selected);


    // --------------------------------------------------------------------------------
    // Return Component
    // --------------------------------------------------------------------------------
    return (
        <>
        {/* Header */}
        <div className="flex justify-center py-2 border-b border-admin-border">
            <p className="text-sm font-semibold text-admin-text m-0">Biomarker Scores</p>
        </div>

        {/* ================================================================================ */}
        {/* "Now" Cards -- two-row layout for breathing room in the narrow column */}
        {/* ================================================================================ */}
        <div className="flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-2">
                {cards.map((c) => {
                    const isActive = c.key === selected;

                    return (
                        <button
                            key={c.key}
                            onClick={() => setSelected(c.key)}
                            className={[
                                "w-full text-left rounded-lg border px-3 py-2.5 transition cursor-pointer",
                                isActive
                                    ? "border-admin-accent bg-admin-accentSoft/50 shadow-sm"
                                    : "border-admin-border bg-admin-panel hover:bg-admin-muted",
                            ].join(" ")}
                        >
                            {/* Top row: label + sparkline */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium text-admin-text truncate">{c.label}</div>
                                <svg width={86} height={32} className="block shrink-0">
                                    <polyline
                                        fill        = "none"
                                        stroke      = "currentColor"
                                        strokeWidth = "1.5"
                                        className   = {isActive ? "text-admin-accent" : "text-admin-subtext"}
                                        points      = {
                                            c.small.length >= 2 ? polylinePoints(c.small, 86, 32, 3, xAxisMode) : ""
                                        }
                                    />
                                </svg>
                            </div>

                            {/* Bottom row: big score + now + delta */}
                            <div className="flex items-baseline gap-3 mt-1.5">
                                <span className="text-2xl font-semibold text-admin-text tabular-nums leading-none">
                                    {formatAvg(c.avg)}
                                </span>
                                <span className="text-xs text-admin-subtext tabular-nums">
                                    now <span className="text-admin-text/85 font-medium">{formatVal(typeof c.latest === "number" ? c.latest : null)}</span>
                                </span>
                                <span className="text-xs text-admin-subtext tabular-nums">
                                    Δ <span className="text-admin-text/85 font-medium">{formatDelta(c.delta)}</span>
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ================================================================================ */}
            {/* Big Chart */}
            {/* ================================================================================ */}
            <div className="rounded-lg border border-admin-border bg-admin-panel p-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-admin-text truncate">{selectedLabel}</div>
                        <div className="text-[11px] text-admin-subtext">
                            Window: {windowSeconds === "all" ? "All" : `${windowSeconds}s`} · {bigSeries.length} pts
                        </div>
                    </div>

                    <div className="text-[11px] text-admin-subtext tabular-nums shrink-0">
                        Latest:{" "}
                        {formatVal(
                            typeof latestPoint?.scores[selected] === "number"
                                  ? latestPoint.scores[selected] : null
                        )}
                    </div>
                </div>

                <div className="mt-2 overflow-x-hidden">
                    <svg viewBox={`0 0 ${BIG_CHART_W} ${BIG_CHART_H}`} className="block w-full h-auto" preserveAspectRatio="none">
                        <line x1="10" y1={BIG_CHART_H - 10} x2={BIG_CHART_W - 10} y2={BIG_CHART_H - 10} className="stroke-admin-border" />
                        <line x1="10" y1={BIG_CHART_H / 2}  x2={BIG_CHART_W - 10} y2={BIG_CHART_H / 2}  className="stroke-admin-border" />
                        <line x1="10" y1="10"               x2={BIG_CHART_W - 10} y2="10"               className="stroke-admin-border" />

                        {bigSeries.length >= 2 ? (
                            <polyline
                                fill        = "none"
                                stroke      = "currentColor"
                                strokeWidth = "2"
                                className   = "text-admin-accent"
                                points      = {bigPolyline}
                            />
                        ) : (
                            <text x="12" y="30" className="fill-admin-subtext text-xs">
                                Waiting for data...
                            </text>
                        )}
                    </svg>
                </div>
            </div>

            {/* Footer: stats + X-axis toggle */}
            <div className="flex items-center justify-between gap-2 text-[11px] text-admin-subtext flex-wrap">
                <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-admin-muted px-2.5 py-0.5 border border-admin-border">
                        {series.points.length} points
                    </span>
                    <span className="rounded-full bg-admin-muted px-2.5 py-0.5 border border-admin-border">
                        {latestPoint ? new Date(parseTs(latestPoint.ts)).toLocaleTimeString() : "—"}
                    </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <span>X</span>
                    <div className="flex rounded-full border border-admin-border bg-admin-muted p-0.5">
                        <button
                            type      = "button"
                            onClick   = {() => setXAxisMode("time")}
                            className = {[
                                "px-2 py-0.5 rounded-full transition cursor-pointer",
                                xAxisMode === "time" ? "bg-admin-panel border border-admin-border text-admin-text" : "text-admin-subtext hover:text-admin-text",
                            ].join(" ")}
                        >Time</button>
                        <button
                            type      = "button"
                            onClick   = {() => setXAxisMode("index")}
                            className = {[
                                "px-2 py-0.5 rounded-full transition cursor-pointer",
                                xAxisMode === "index" ? "bg-admin-panel border border-admin-border text-admin-text" : "text-admin-subtext hover:text-admin-text",
                            ].join(" ")}
                        >Idx</button>
                    </div>
                </div>
            </div>

        </div>
        </>
    );
}

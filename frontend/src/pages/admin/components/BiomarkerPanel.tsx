// ================================================================================
// BiomarkerPanel
// ================================================================================
//   - Expects the `series` object from `useLocalBiomarkers()`
//   - Assumes timestamps are ISO strings
// ================================================================================

import { useMemo, useState } from "react";
import { BiomarkerScoreSet, LocalBiomarkerSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";

type BiomarkerKey = keyof BiomarkerScoreSet;
type XAxisMode    = "time" | "index";

// ================================================================================
// Constants
// ================================================================================
// NOTE: I think we already have this somewhere, but whatever
// NOTE: Also could add colors? Maybe...
const BIOMARKERS: Array<{ key: BiomarkerKey; label: string }> = [
    { key: "prosody",        label: "Prosody"             },
    { key: "pronunciation",  label: "Pronunciation"       },
    { key: "turntaking",     label: "Turn-taking"         },
    { key: "grammar",        label: "Altered Grammar"     },
    { key: "anomia",         label: "Anomia"              },
    { key: "pragmatic",      label: "Pragmatic Impairment"},
];

const BIG_CHART_W = 760;
const BIG_CHART_H = 220;

// ================================================================================
// Helpers
// ================================================================================
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
function computeDelta(latest?: number, prev?: number): number | null {
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
    // Sparkline X-axis mode
    const [xAxisMode, setXAxisMode] = useState<XAxisMode>("time");

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

            const delta = computeDelta(
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

    // ================================================================================
    // Return Component
    // ================================================================================
    return (
        <> 
        <p className="flex justify-center py-1 border-b border-black/10 text-base font-semibold">Biomarkers</p>
        <div className="flex flex-col gap-3 p-3">
            
            {/* ================================================================================ */}
            {/* "Now" Cards */}
            {/* ================================================================================ */}
            <div className="grid grid-cols-2 gap-2">
                {cards.map((c) => {
                    const isActive = c.key === selected;

                    return (
                        <button
                            key={c.key}
                            onClick={() => setSelected(c.key)}
                            className={[
                                "text-left rounded-xl border p-3 transition",
                                isActive
                                    ? "border-black/20 bg-black/5"
                                    : "border-black/10 bg-white hover:bg-black/5",
                            ].join(" ")}
                        >
                            <div className="flex items-start justify-between gap-2">

                                {/* -------------------------------------------------------------------------------- */}
                                {/* Card Text (with deltas) */}
                                {/* -------------------------------------------------------------------------------- */}
                                <div className="min-w-0">
                                    {/* Biomarker Title */}
                                    <div className="text-xs text-black/60">{c.label}</div>

                                    {/* Score Average */}
                                    <div className="mt-1 text-lg font-semibold tabular-nums">
                                        {formatAvg(c.avg)}
                                    </div>

                                    {/* Bottom Row => Latest + Delta */}
                                    <div className="mt-1 flex items-center gap-3 text-xs text-black/60 tabular-nums">
                                        <div className="flex items-center gap-1">
                                            <span>Now</span>
                                            <span className="font-medium text-black/80">
                                                {formatVal(typeof c.latest === "number" ? c.latest : null)}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <span>Δ</span>
                                            <span className="font-medium text-black/80">
                                                {formatDelta(c.delta)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* -------------------------------------------------------------------------------- */}
                                {/* Sparkline */}
                                {/* -------------------------------------------------------------------------------- */}
                                <div className="shrink-0">
                                    <svg width={120} height={40} className="block">
                                        <polyline
                                            fill        = "none"
                                            stroke      = "currentColor"
                                            strokeWidth = "1.5"
                                            className   = "text-black/50"
                                            points      = {
                                                c.small.length >= 2 ? polylinePoints(c.small, 120, 40, 3, xAxisMode) : ""
                                            }
                                        />
                                    </svg>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ================================================================================ */}
            {/* Big Chart */}
            {/* ================================================================================ */}
            <div className="rounded-xl border border-black/10 bg-white p-3">

                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="text-sm font-semibold">{selectedLabel}</div>
                        <div className="text-xs text-black/60">
                            Window: {windowSeconds === "all" ? "All" : `${windowSeconds}s`} · Points: {bigSeries.length}
                        </div>
                    </div>

                    <div className="text-xs text-black/60 tabular-nums">
                        Latest:{" "}
                        {formatVal(
                            typeof latestPoint?.scores[selected] === "number"
                                  ? latestPoint.scores[selected] : null
                        )}
                    </div>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Chart */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="mt-3 overflow-x-hidden">
                    <svg width={BIG_CHART_W} height={BIG_CHART_H} className="block w-full h-auto pb-1">

                        {/* Baseline Grid */}
                        <line x1="10" y1={BIG_CHART_H - 10} x2={BIG_CHART_W - 10} y2={BIG_CHART_H - 10} className="stroke-black/10" />
                        <line x1="10" y1={BIG_CHART_H / 2}  x2={BIG_CHART_W - 10} y2={BIG_CHART_H / 2}  className="stroke-black/10" />
                        <line x1="10" y1="10"               x2={BIG_CHART_W - 10} y2="10"               className="stroke-black/10" />

                        {/* Biomarker Series */}
                        {bigSeries.length >= 2 ? (
                            <polyline
                                fill        = "none"
                                stroke      = "currentColor"
                                strokeWidth = "2"
                                className   = "text-black"
                                points      = {bigPolyline}
                            />
                        ) : (
                            <text x="12" y="30" className="fill-black/50 text-xs">
                                Waiting for data...
                            </text>
                        )}
                    </svg>
                </div>
            </div>

            {/* ================================================================================ */}
            {/* Footer Stats & X-Axis Toggle */}
            {/* ================================================================================ */}
            <div className="flex items-center justify-between gap-2 text-xs text-black/60">

                {/* -------------------------------------------------------------------------------- */}
                {/* Left: Stats Pills */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex flex-wrap gap-2">
                    <div className="rounded-full bg-black/5 px-3 py-1 border border-black/10">
                        Total points: <span className="font-medium text-black">{series.points.length}</span>
                    </div>

                    <div className="rounded-full bg-black/5 px-3 py-1 border border-black/10">
                        Last ts:{" "}
                        <span className="font-medium text-black">
                            {latestPoint ? new Date(parseTs(latestPoint.ts)).toLocaleTimeString() : "—"}
                        </span>
                    </div>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Right: X-axis mode toggle */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-black/60">X-axis</span>
                    <div className="flex rounded-full border border-black/10 bg-black/5 p-0.5">

                        {/* Set to Time */}
                        <button
                            type      = "button"
                            onClick   = {() => setXAxisMode("time")}
                            className = {[
                                "px-2 py-1 rounded-full transition",
                                xAxisMode === "time" ? "bg-white border border-black/10 text-black" : "text-black/60 hover:text-black",
                            ].join(" ")}
                        > Time </button>

                        {/* Set to Index */}
                        <button
                            type      = "button"
                            onClick   = {() => setXAxisMode("index")}
                            className = {[
                                "px-2 py-1 rounded-full transition",
                                xAxisMode === "index" ? "bg-white border border-black/10 text-black" : "text-black/60 hover:text-black",
                            ].join(" ")}
                        > Index </button>
                    </div>
                </div>

            </div>

        </div>
        </>
    );
}

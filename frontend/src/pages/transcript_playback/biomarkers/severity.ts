/*
Biomarker severity scale.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/biomarkers/severity`

Score is on a 0..1 scale where 0 = worst and 1 = best.

WORD HIGHLIGHTS use a continuous multi-stop color ramp (red -> yellow -> green
-> white). The white end means good scores blend into the white transcript page
and "fade out" via COLOR rather than opacity. Everything you'd want to tweak for
the highlight look lives in the CONFIG block below.

The discrete BANDS (severe/moderate/mild) are separate and unchanged -- they
drive the stat pills, the score-rail bar, and the legend swatches. Editing the
highlight ramp does NOT touch any of those.

>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> COLOR RANGES <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

Color ranges are defined by informal MoCA diagnostic ranges (severe is under 10).

Healthy Cognition:                26-30 (0.8667-1.0000)
Mild Cognitive Impairment (MCI):  18-25 (0.6000-0.8333)
Moderate Cognitive Impairment:    10-17 (0.3333-0.5667)
Severe Cognitive Impairment:       0-10 (0.0000-0.3333)

>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>><<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

*/

// Severity thresholds -- low end of the range (see "Color Ranges" above for more info)
const HEALTHY  = 0.8667;
const MIDPOINT = 0.7166; // My own arbitrary point in the middle of MCI
const MCI      = 0.6000;
const SCI      = 0.3333;


// ================================================================================
// Bands -- stat pills / score-rail bar / legend swatches  (NOT the word highlights)
// ================================================================================
export type Band = "severe" | "moderate" | "mild" | "none";
type RGB = [number, number, number];

export const SEVERITY_HEX: Record<Exclude<Band, "none">, string> = {
    severe   : "#dc2626",  // red-600
    moderate : "#d97706",  // amber-600
    mild     : "#65a30d",  // lime-600
};

export function bandForScore(score: number): Band {
    if (score <  SCI    ) return "severe";
    if (score <  MCI    ) return "moderate";
    if (score <  HEALTHY) return "mild";
    return "none";
}

// ================================================================================
// CONFIG -- tweak the WORD-HIGHLIGHT look here (only affects transcript text)
// ================================================================================

// 1) COLOR RAMP. Ordered stops by score (`at`: 0 = worst ... 1 = best).
//    Add / remove / move / recolor stops freely; just keep `at` increasing 0..1.
//    The last stop is white so the best scores blend into the page.
const HIGHLIGHT_RAMP: { at: number; rgb: RGB }[] = [
    { at: SCI,      rgb: [220,  38,  38] },  // red    -- Severe
    { at: MCI,      rgb: [234, 179,   8] },  // yellow -- Moderate
    { at: MIDPOINT, rgb: [ 22, 163,  74] },  // green  -- Mild 
    { at: HEALTHY,  rgb: [255, 255, 255] },  // white  -- Healthy
];

// 2) OPACITY of the fill. Flat by default (the white ramp end does the fading).
//    Return a score-based value if you ALSO want opacity to vary.
function highlightAlpha(_score: number): number {
    //return 0.85;
    return 0.85 * (1 - clamp01(_score));
    // e.g. fade by opacity too:  return 0.85 * (1 - clamp01(_score));
}

// 3) Skip drawing a highlight entirely at/above this score (keeps perfect words
//    truly clean). Set to >1 to always draw; lower it to hide more "good" words.
const HIDE_AT_OR_ABOVE = 1.0;

// 4) Flip the word's TEXT to white when its fill is darker than this luminance
//    (0..255) -- keeps text readable on the deep-red worst fills.
const WHITE_TEXT_BELOW_LUM = 75;  // (lower is darker)

// ================================================================================
// Internals -- usually no need to edit below this line
// ================================================================================
const clamp01 = (x: number)                       => Math.max(0, Math.min(1, x));
const lerp    = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRGB = (a: RGB, b: RGB, t: number): RGB  => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Sample the ramp at score `t` (handles any number of stops).
function sampleRamp(t: number): RGB {
    const s = clamp01(t);
    for (let i = 0; i < HIGHLIGHT_RAMP.length - 1; i++) {
        const a = HIGHLIGHT_RAMP[i], b = HIGHLIGHT_RAMP[i + 1];
        if (s <= b.at) {
            const span = b.at - a.at;
            return lerpRGB(a.rgb, b.rgb, span <= 0 ? 0 : (s - a.at) / span);
        }
    }
    return HIGHLIGHT_RAMP[HIGHLIGHT_RAMP.length - 1].rgb;
}

// Perceived luminance (0..255) of `rgb` blended over a white background at `alpha`.
function blendedLuminanceOverWhite([r, g, b]: RGB, alpha: number): number {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return (1 - alpha) * 255 + alpha * lum;
}

function pillVariantFor(band: Band): SeverityStyle["pillVariant"] {
    return band === "none" ? "info" : (`severity-${band}` as SeverityStyle["pillVariant"]);
}



// ================================================================================
// Returns CSS-ready styling for a given score
// ================================================================================
export interface SeverityStyle {
    band       : Band;
    bgColor    : string | undefined;   // inline rgba background, undefined when no highlight is drawn
    textColor  : string | undefined;   // white for very dark (worst) fills, else undefined
    pillVariant: "severity-severe" | "severity-moderate" | "severity-mild" | "info";
}

// Style components for highlighting biomarker severity
export function severityStyle(score: number | null | undefined): SeverityStyle {
    // Guard for bad input
    if (score == null) return { band: "none", bgColor: undefined, textColor: undefined, pillVariant: "info" };
    const band = bandForScore(score);

    // Best scores draw no highlight at all
    if (score >= HIDE_AT_OR_ABOVE) {
        return { band, bgColor: undefined, textColor: undefined, pillVariant: pillVariantFor(band) };
    }

    // Get RGB & alpha values to format the span with
    const rgb   = sampleRamp    (score);
    const alpha = highlightAlpha(score);
    return {
        band,
        bgColor    : `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${alpha.toFixed(2)})`,
        textColor  : blendedLuminanceOverWhite(rgb, alpha) < WHITE_TEXT_BELOW_LUM ? "#ffffff" : undefined,
        pillVariant: pillVariantFor(band),
    };
}

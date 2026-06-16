/*
Biomarker severity scale -- traffic light (red -> yellow -> green).
--------------------------------------------------------------------------------
Score is on a 0..1 scale where 0 = worst and 1 = best.

The models predict the scores with 1 originally being the worst, but we flip it
in the backend BEFORE sending it to the frontend.

Bands:
  < 0.4         severe    (red)
  0.4 - 0.7     moderate  (amber)
  0.7 - 0.9     mild      (lime)
  >= 0.9        none      (no highlight -- absence-of-issue stays invisible)

Within a band the alpha decays linearly from the band's "worst edge" to its
"best edge" so the dark->light gradient inside a band still looks good.
*/

export type Band = "severe" | "moderate" | "mild" | "none";

export const SEVERITY_HEX: Record<Exclude<Band, "none">, string> = {
    severe   : "#dc2626",  // red-600
    moderate : "#d97706",  // amber-600
    mild     : "#65a30d",  // lime-600
};

export function bandForScore(score: number): Band {
    if (score <  0.4) return "severe";
    if (score <  0.7) return "moderate";
    if (score <  0.9) return "mild";
    return "none";
}

// Linear interpolation of alpha within a band.
// "worst edge" of the band -> alpha = max; "best edge" -> alpha = min.
function alphaForScore(score: number, band: Band): number {
    switch (band) {
        case "severe"  : return lerp(score, 0.0,  0.4, 0.85, 0.55);
        case "moderate": return lerp(score, 0.4,  0.7, 0.55, 0.30);
        case "mild"    : return lerp(score, 0.7,  0.9, 0.10, 0.05);
        case "none":
        default        : return 0;
    }
}
function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
    if (x1 === x0) return y0;
    const t = (x - x0) / (x1 - x0);
    return y0 + (y1 - y0) * Math.max(0, Math.min(1, t));
}

// Hex -> "rgba(r,g,b,a)" helper.
function hexToRgba(hex: string, alpha: number): string {
    const m = hex.replace("#", "");
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

// Returns Tailwind/CSS-ready styling for a given score.
export interface SeverityStyle {
    band       : Band;
    bgColor    : string | undefined;   // inline rgba background, undefined when band === "none"
    textColor  : string | undefined;   // for high-severity, darken text
    pillVariant: "severity-severe" | "severity-moderate" | "severity-mild" | "info";
}
export function severityStyle(score: number | null | undefined): SeverityStyle {
    if (score == null) return { band: "none", bgColor: undefined, textColor: undefined, pillVariant: "info" };
    const band  = bandForScore(score);
    if (band === "none") return { band, bgColor: undefined, textColor: undefined, pillVariant: "info" };
    const alpha = alphaForScore(score, band);
    return {
        band,
        bgColor    : hexToRgba(SEVERITY_HEX[band], alpha),
        textColor  : band === "severe" && alpha > 0.65 ? "#ffffff" : undefined,
        pillVariant: `severity-${band}` as SeverityStyle["pillVariant"],
    };
}

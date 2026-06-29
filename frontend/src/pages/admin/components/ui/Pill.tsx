/* Generalized status/info pill class.
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/ui/Pill.tsx`

There were some older versions that got combined into here and now exist only as
wrappers around this class.
*/
import { ReactNode } from "react";

export type PillVariant =
    | "info"
    | "live"
    | "paused"
    | "offline"
    | "accent"
    | "severity-severe"
    | "severity-moderate"
    | "severity-mild";

interface Props {
    variant ?: PillVariant;
    label   ?: ReactNode;
    value   ?: ReactNode;
    children?: ReactNode;
    dot     ?: boolean;
    onClick ?: () => void;
    className?: string;
}

// Tailwind class lookup (kept as full string literals so the JIT compiler picks them up)
function variantClasses(v: PillVariant): { pill: string; dot: string } {
    switch (v) {
        case "live"             : return { pill: "bg-status-live/10       text-status-live       border-status-live/30",       dot: "bg-status-live"     };
        case "paused"           : return { pill: "bg-status-paused/10     text-status-paused     border-status-paused/30",     dot: "bg-status-paused"   };
        case "offline"          : return { pill: "bg-admin-muted          text-admin-subtext     border-admin-border",         dot: "bg-status-offline"  };
        case "accent"           : return { pill: "bg-admin-accentSoft     text-admin-accent2     border-admin-accent/30",      dot: "bg-admin-accent"    };
        case "severity-severe"  : return { pill: "bg-severity-severe/10   text-severity-severe   border-severity-severe/30",   dot: "bg-severity-severe"   };
        case "severity-moderate": return { pill: "bg-severity-moderate/10 text-severity-moderate border-severity-moderate/30", dot: "bg-severity-moderate" };
        case "severity-mild"    : return { pill: "bg-severity-mild/10     text-severity-mild     border-severity-mild/30",     dot: "bg-severity-mild"    };
        case "info":
        default                 : return { pill: "bg-admin-muted text-admin-subtext border-admin-border", dot: "bg-admin-subtext"};
    }
}

// Generalized status/info pill
export function Pill({ variant = "info", label, value, children, dot = false, onClick, className = "" }: Props) {
    const cls = variantClasses(variant);
    const interactive = onClick ? "cursor-pointer hover:opacity-90" : "";
    return (
        <div
            onClick   = {onClick}
            className = {`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs whitespace-nowrap ${cls.pill} ${interactive} ${className}`}
        >
            {label && <span className="opacity-70 font-normal">{label}</span>}
            {dot   && <span className={`h-2 w-2 rounded-full ${cls.dot}`} />}
            <span className="font-medium">{value ?? children ?? "—"}</span>
        </div>
    );
}

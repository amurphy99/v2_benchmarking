/* On/off switch styled for the admin pages.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/ui/AdminSwitch`

A `button` with `role="switch"`, so screen readers announce it as a switch and
Space or Enter flips it like a click. The track and knob are spans inside it,
because the app's Bootstrap reset (which sits outside Tailwind's CSS layers)
squares off the corners of every `button`.

*/
import type { ReactElement } from "react";


// ================================================================================
// Admin Switch
// ================================================================================
// Pill-shaped switch whose knob slides right and track turns the accent color when on
export function AdminSwitch({checked, onChange, label, disabled = false}: {
    checked   : boolean;                      // Whether the switch is on
    onChange  : (checked: boolean) => void;   // Called with the new value
    label     : string;                       // Name screen readers announce
    disabled? : boolean;                      // Grey it out and ignore clicks
}): ReactElement {
    // Track and knob colors for each state
    const track  = checked  ? "bg-admin-accent border-admin-accent" : "bg-admin-muted border-admin-border";
    const knob   = checked  ? "translate-x-5"                       : "translate-x-0.5";
    const usable = disabled ? "opacity-50 cursor-not-allowed"       : "cursor-pointer";

    return (
        <button
            type         = "button"
            role         = "switch"
            aria-checked = {checked}
            aria-label   = {label}
            disabled     = {disabled}
            onClick      = {() => onChange(!checked)}
            className    = {`inline-flex shrink-0 bg-transparent p-0 ${usable}`}
        >
            <span className={`flex h-6 w-11 items-center rounded-full border transition-colors ${track}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${knob}`} />
            </span>
        </button>
    );
}

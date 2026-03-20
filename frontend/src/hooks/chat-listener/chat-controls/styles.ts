
// --------------------------------------------------------------------------------
// Style Helpers
// --------------------------------------------------------------------------------
export function pillClass(active: boolean) {
    return [
        "rounded-full px-2 py-0.5 text-[13px] border",
        active ? "bg-black/5 border-black/20 text-black" : "bg-white border-black/10 text-black/60",
    ].join(" ");
}

// Control panel button styles
export function btnClass(
    disabled : boolean, 
    variant  : "primary" | "secondary" | "neutral" | "ghost" = "neutral"
) {
    const base = "btn btn-sm";
    const v = 
        variant === "primary"   ? "btn-primary"   : 
        variant === "secondary" ? "btn-secondary" : 
        variant === "ghost"     ? "btn-ghost"     : "btn-neutral";

    return [base, v, disabled ? "opacity-50 cursor-not-allowed" : ""].join(" ");
}


// --------------------------------------------------------------------------------
// General Style Helpers
// --------------------------------------------------------------------------------
export const groupDivStyle       = "rounded-xl border border-black/10 p-3";
export const buttonSectionHeader = "text-base font-semibold text-black/70";



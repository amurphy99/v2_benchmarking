// These are
export const ACCENT_COLOR = "violet-600";

export const CAREGIVER_HEX  = "#8b5cf6"; // #8b5cf6
export const PATIENT_HEX    = "#0ac945"; // #0ac945
//export const PATIENT_HEX    = "#5cf68b"; // #5cf68b



// Helper to style navigation links
export const navLinkCls = ({ isActive }: { isActive: boolean }) =>
    isActive
        ? "underline decoration-2 text-violet-600"
        : "no-underline text-gray-500 hover:text-violet-500 visited:text-gray-500";


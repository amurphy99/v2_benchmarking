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

export const footerLinkPatientCls = ({ isActive }: { isActive: boolean }) =>
    isActive
        ? "flex flex-col items-center no-underline underline decoration-2 text-green-600 hover:text-green-700"
        : "flex flex-col items-center no-underline text-gray-500 hover:text-green-600 visited:text-gray-500";

export const footerLinkCaregiverCls = ({ isActive }: { isActive: boolean }) =>
    isActive
        ? "flex flex-col items-center no-underline underline decoration-2 text-violet-600 hover:text-violet-700"
        : "flex flex-col items-center no-underline text-gray-500 hover:text-violet-600 visited:text-gray-500";

export const footerLinkChat = ({isActive} : { isActive: boolean }) =>
    isActive
        ? "flex flex-col items-center p-2 text-white no-underline rounded-full bg-green-600 hover:bg-green-700 aspect-square translate-y-[-1.5rem]"
        : "flex flex-col items-center p-2 text-white no-underline rounded-full bg-gray-400 hover:bg-green-600 aspect-square translate-y-[-1.5rem]"
/* Modal that holds the avatar demo page's setup controls.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/DemoSetupModal`

The controls inside apply the moment they change, so there is no Save or Cancel;
the modal only hides them while you watch the avatar. Escape, the close button,
and a click on the backdrop all close it.

*/
import type { ReactElement, ReactNode } from "react";
import      { useEffect               } from "react";
import      { LuX                     } from "react-icons/lu";


// ================================================================================
// Demo Setup Modal
// ================================================================================
// Centered panel over a dimmed page, titled "Demo Setup"
export default function DemoSetupModal({onClose, children}: {
    onClose  : () => void;   // Hide the modal
    children : ReactNode;    // The setup controls
}): ReactElement {
    // Escape closes the modal
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                role       = "dialog"
                aria-modal = "true"
                aria-label = "Demo Setup"
                className  = "w-full max-w-xl rounded-xl bg-admin-panel border border-admin-border shadow-xl overflow-hidden"
                onClick    = {(event) => event.stopPropagation()}
            >
                {/* Title and close button */}
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-admin-border">
                    <div className="text-lg font-semibold text-admin-text">Demo Setup</div>
                    <button onClick={onClose} aria-label="Close" className="p-1.5 rounded text-admin-subtext hover:text-admin-text hover:bg-admin-muted cursor-pointer">
                        <LuX size={18} />
                    </button>
                </div>

                {/* Controls */}
                <div className="px-5 py-4">{children}</div>
            </div>
        </div>
    );
}

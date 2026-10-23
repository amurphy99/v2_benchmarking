/* Sticky full-width header for the admin account pages.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/ui/AdminPageHeader`

Same look as the chat pages' `SessionHeader`: a back arrow, the title, and
optional actions on one row that stays at the top while the page scrolls. The
back arrow always opens `backTo`, so it works the same when the page was opened
directly.

*/
import type { ReactElement, ReactNode } from "react";
import      { LuArrowLeft             } from "react-icons/lu";
import      { useNavigate             } from "react-router-dom";


// --------------------------------------------------------------------------------
// Admin Page Header
// --------------------------------------------------------------------------------
// Back arrow, title and subtitle, and right-side actions in one sticky row
export function AdminPageHeader({title, subtitle, backTo, actions}: {
    title     : string;                  // Page title
    subtitle? : string | undefined;      // One line under the title
    backTo    : string;                  // Page the back arrow opens
    actions?  : ReactNode | undefined;   // Buttons on the right
}): ReactElement {
    const navigate = useNavigate();

    return (
        <header className="sticky top-0 z-10 bg-admin-panel/95 backdrop-blur border-b border-admin-border">
            <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3 flex-wrap">
                {/* Back arrow and title */}
                <div className="min-w-0 flex gap-3 items-center">
                    <button
                        onClick    = {() => navigate(backTo)}
                        className  = "flex items-center justify-center h-8 w-8 rounded-md text-admin-text hover:bg-admin-muted cursor-pointer"
                        aria-label = "Back"
                    >
                        <LuArrowLeft size={20} />
                    </button>
                    <div className="flex flex-col min-w-0">
                        <div className="text-base md:text-lg font-semibold text-admin-text truncate">{title}</div>
                        {subtitle ? <div className="text-xs text-admin-subtext">{subtitle}</div> : null}
                    </div>
                </div>

                {/* Page actions */}
                {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
            </div>
        </header>
    );
}

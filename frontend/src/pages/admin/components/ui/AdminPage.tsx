/* Style wrapper for every admin pages. 
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/ui/AdminPage.tsx`

Sets the warm-stone styling, admin text color, and a max-width container so all
four pages have the same theme.
*/
import type { ReactElement, ReactNode } from "react";

// Admin style wrapper (`bottomSpace` off for a page that fills the screen and scrolls inside itself)
export function AdminPage({children, contained = true, bottomSpace = true}: {
    children     : ReactNode;
    contained?   : boolean;   // Center the page in a max-width container
    bottomSpace? : boolean;   // Leave empty space below the page's content
}): ReactElement {
    const bottom = bottomSpace ? "pb-[15vh]" : "";
    return (
        <div className="min-h-screen bg-admin-surface text-admin-text">
            <div className={contained ? `mx-auto max-w-[1400px] px-4 md:px-6 ${bottom}` : bottom}>
                {children}
            </div>
        </div>
    );
}

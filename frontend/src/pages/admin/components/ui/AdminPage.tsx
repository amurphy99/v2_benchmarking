/* Style wrapper for every admin pages. 
--------------------------------------------------------------------------------
`frontend/src/pages/admin/components/ui/AdminPage.tsx`

Sets the warm-stone styling, admin text color, and a max-width container so all
four pages have the same theme.
*/
import { ReactNode } from "react";

// Admin style wrapper
export function AdminPage({ children, contained = true }: { children: ReactNode; contained?: boolean }) {
    return (
        <div className="min-h-screen bg-admin-surface text-admin-text">
            <div className={contained ? "mx-auto max-w-[1400px] px-4 md:px-6 pb-[15vh]" : "pb-[15vh]"}>
                {children}
            </div>
        </div>
    );
}

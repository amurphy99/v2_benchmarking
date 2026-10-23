/* Page frame: header, the routed page, and the bottom navigation bar.
--------------------------------------------------------------------------------
`@frontend/src/routes/AppLayout`

Staff work on the Monitor pages, so they don't get the caregiver navigation bar
there; it appears once they open the caregiver pages from the profile menu.

*/
import { Outlet, useLocation } from "react-router-dom";
import { Spinner             } from "react-bootstrap";

// From this project
import { useAuth } from "@/context/AuthProvider";
import   Header    from "@/components/Header";
import   FooterNav from "@/components/FooterNav";

// App Layout
export function AppLayout() {
    const { account, loading } = useAuth();
    const { pathname         } = useLocation();

    // Add routes with no footer
    const hideFooter =
        pathname.startsWith("/admin/chat"         ) ||
        pathname.startsWith("/admin/chat/inactive") || // Redundant but leaving as example
        pathname.startsWith("/transcript-playback") || // TranscriptPlayback page
        (account.user?.is_staff && pathname.startsWith("/admin"));  // Staff on the Monitor pages

    // Return UI component
    if (loading) { return <Spinner />; }
    return (
    <>
        {/* Headers */}
        {account.user ? <Header /> : null}
    
        {/* Routed page component */}
        <main> <Outlet /> </main>

        {/* Footer */}
        {account.user && !hideFooter ? <FooterNav /> : null}
    </>
    );
}
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
        pathname.startsWith("/admin/chat/inactive");   // (redundant but leaving as example)

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
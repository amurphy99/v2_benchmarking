import { Outlet, useLocation  } from "react-router-dom";
import { useAuth } from "@/context/AuthProvider";
import { RUN_ENV } from "@/utils/constants";
import   Header    from "@/components/Header";
import FooterNav from "@/components/FooterNav";

export function AppLayout() {
    const { user, account } = useAuth();
    const { pathname } = useLocation();
    // Header & small info bar for development
    const pageHeader = (user            ) ? (<Header />) : null;

    // Return UI component
    return (
    <>
        {/* Headers */}
        {pathname != "/animation-test" ? pageHeader : null}
    
        {/* Routed page component */}
        <main> <Outlet /> </main>
        {<FooterNav />}

    </>
    );
}

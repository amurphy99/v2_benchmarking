import { Outlet, useLocation  } from "react-router-dom";
import { useAuth } from "@/context/AuthProvider";
import { RUN_ENV } from "@/utils/constants";
import   Header    from "@/components/Header";
import FooterNav from "@/components/FooterNav";

export function AppLayout() {
    const { account, loading } = useAuth();
    const { pathname } = useLocation();
    // Header & small info bar for development
    const pageHeader = (account) ? (<Header />) : null;

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

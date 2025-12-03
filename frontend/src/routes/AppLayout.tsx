import { Outlet, useLocation  } from "react-router-dom";
import { useAuth } from "@/context/AuthProvider";
import { RUN_ENV } from "@/utils/constants";
import   Header    from "@/components/Header";
import FooterNav from "@/components/FooterNav";

export function AppLayout( {isMobile} : {isMobile: boolean}) {
    const { user, profile } = useAuth();
    const { pathname } = useLocation();
    // Header & small info bar for development
    const pageHeader = (user            ) ? (<Header isMobile={isMobile} />) : null;
    const DevBar     = (RUN_ENV == "DEV") ? (
        <div className="bg-yellow-100 px-4 py-1 text-xs flex gap-4">
            
            <span>profile loaded: {profile ? "yes" : "no"}</span>
            <span>user loaded: {user ? "yes" : "no"}</span>
            <div className="vr"></div>

            <span>user: {user?.username ?? "—"}</span>
            <span>role: {profile?.role  ?? "—"}</span>     
            <span>is_staff: {user?.is_staff ? "yes" : "no"}</span>

        </div>
    ) : null;

    // Return UI component
    return (
    <>
        {/* Headers */}
        {/* {DevBar} */}
        {pathname != "/animation-test" ? pageHeader : null}
    
        {/* Routed page component */}
        <main> <Outlet /> </main>
        {isMobile && (pathname != "/login" && pathname != "/signup" && pathname != "/animation-test") ? <FooterNav /> : null}

    </>
    );
}

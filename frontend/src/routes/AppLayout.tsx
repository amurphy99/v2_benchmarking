import { Outlet  } from "react-router-dom";
import { useAuth } from "@/context/AuthProvider";
import { RUN_ENV } from "@/utils/constants";
import   Header    from "@/components/Header";

export function AppLayout() {
    const { user, profile } = useAuth();
    
    // Header & small info bar for development
    const pageHeader = (user            ) ? (<Header/>) : null;
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
        {DevBar}
        {pageHeader}
    
        {/* Routed page component */}
        <main className="px-[1rem]"> <Outlet /> </main>
    </>
    );
}

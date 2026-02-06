import { Outlet  } from "react-router-dom";
import { useAuth } from "@/context/AuthProvider";
import   Header    from "@/components/Header";
import FooterNav from "@/components/FooterNav";
import { Spinner } from "react-bootstrap";
import { useProfile } from "@/hooks/queries/useProfile";

export function AppLayout() {
    const { account, loading } = useAuth();
    const { data: profile, isLoading } = useProfile();

    if (loading || isLoading) {
        return <Spinner />
    }

    // Return UI component
    return (
    <>
        {/* Headers */}
        {account.user ? <Header profile={profile} /> : null}
    
        {/* Routed page component */}
        <main> <Outlet /> </main>
        {account ? <FooterNav profile={profile} /> : null}

    </>
    );
}
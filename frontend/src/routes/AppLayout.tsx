import { Outlet  } from "react-router-dom";
import { useAuth } from "@/context/AuthProvider";
import   Header    from "@/components/Header";
import FooterNav from "@/components/FooterNav";
import { Spinner } from "react-bootstrap";
import { useProfile } from "@/hooks/queries/useProfile";

export function AppLayout() {
    const { account, loading } = useAuth();

    if (loading) {
        return <Spinner />
    }

    // Return UI component
    return (
    <>
        {/* Headers */}
        {account.user ? <Header /> : null}
    
        {/* Routed page component */}
        <main> <Outlet /> </main>
        {account.user ? <FooterNav /> : null}

    </>
    );
}
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
import { Spinner } from "react-bootstrap";

// Users who are not logged in can only get to the signup or login pages
export function Protected() {
    const { account, loading, authComplete } = useAuth();

    if (loading || !authComplete) return <Spinner />
    if (!account.user) return <Navigate to="/" replace />

    return <Outlet />
}

// Users who are logged in already can't get to the signup or login pages
export function Unprotected() {
    const { account, loading, authComplete } = useAuth();

    if (loading || !authComplete) return <Spinner />
    return account.user ? <Navigate to="/profile" replace /> : <Outlet />;
}

// =======================================================================
// Patient / Caregiver
// =======================================================================
// Only caregivers can view
export function IsCaregiver() {
    const { account, loading } = useAuth();

    if (loading) return <Spinner />

    const role = account.role == "patient" ? "patient" : "caregiver";
    const isCare = role != "patient";
    return isCare ? <Outlet /> : <Navigate to="/profile" replace />;
}
// Only patients can view
export function IsPatient() {
    const { account, loading } = useAuth();
    
    if (loading) return <Spinner />
    const role = account.role == "patient" ? "patient" : "caregiver";
    const isPatient = role == "patient";
    return isPatient ? <Outlet /> : <Navigate to="/profile" replace />;
}

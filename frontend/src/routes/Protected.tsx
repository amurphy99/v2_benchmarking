import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
import { Spinner } from "react-bootstrap";

// Users who are not logged in can only get to the signup or login pages
export function Protected() {
    const { account, loading } = useAuth();

    if (loading) return <Spinner />
    if (!account) <Navigate to="/" replace />

    return <Outlet />
}

// Users who are logged in already can't get to the signup or login pages
export function Unprotected() {
    const { account, loading } = useAuth();

    if (loading) return <Spinner />
    return account ? <Navigate to="/goal" replace /> : <Outlet />;
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
    return isCare ? <Outlet /> : <Navigate to="/goal" replace />;
}
// Only patients can view
export function IsPatient() {
    const { account, loading } = useAuth();
    
    if (loading) return <Spinner />
    const role = account.role == "patient" ? "patient" : "caregiver";
    const isPatient = role == "patient";
    return isPatient ? <Outlet /> : <Navigate to="/chat" replace />;
}

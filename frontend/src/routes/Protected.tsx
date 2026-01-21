import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";

// Users who are not logged in can only get to the signup or login pages
export function Protected() {
    const { user } = useAuth();
    return user ? <Outlet /> : <Navigate to="/login" replace />;
}

// Users who are logged in already can't get to the signup or login pages
export function Unprotected() {
    const { user } = useAuth();
    return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

// =======================================================================
// Patient / Caregiver
// =======================================================================
// Only caregivers can view
export function IsCaregiver() {
    const { user, profile } = useAuth();
    return (user.id === profile.caregiver.id) ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
// Only caregivers can view
export function IsPatient() {
    const { user, profile } = useAuth();
    return (user.id === profile.plwd.id) ? <Outlet /> : <Navigate to="/dashboard" replace />;
}

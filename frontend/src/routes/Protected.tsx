import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthProvider";
import { getAccess } from "@/api";
import { Spinner } from "react-bootstrap";

// Users who are not logged in can only get to the signup or login pages
export function Protected() {
    const { user } = useAuth();
    if (user) {
        return (
            <Outlet />
        )
    } else if (!user && localStorage.getItem('authTokens')) {
        while (!user) {
            return (
                <Spinner />
            )
        }
        return (
            <Outlet />
        );
    } else {
        return (
            <Navigate to="/login" replace />
        );
    }
}

// Users who are logged in already can't get to the signup or login pages
export function Unprotected() {
    const { user } = useAuth();
    return user ? <Navigate to="/goal" replace /> : <Outlet />;
}

// =======================================================================
// Patient / Caregiver
// =======================================================================
// Only caregivers can view
export function IsCaregiver() {
    const { user, profile } = useAuth();
    return (user.id === profile.caregiver.id) ? <Outlet /> : <Navigate to="/goal" replace />;
}
// Only patients can view
export function IsPatient() {
    const { user, profile } = useAuth();
    return (user.id === profile.plwd.id) ? <Outlet /> : <Navigate to="/chat" replace />;
}

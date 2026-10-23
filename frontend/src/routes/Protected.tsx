/* Route guards that decide who may open each group of pages.
--------------------------------------------------------------------------------
`@frontend/src/routes/Protected`

There is no public signup, so a logged-out user only ever sees the login page.
A logged-in user lands on Monitor (`/admin`) when they are staff, and on the
goal page otherwise. Staff can still open the caregiver pages from the profile
menu.

*/
import type { ReactElement     } from "react";
import      { Navigate, Outlet } from "react-router-dom";
import      { Spinner          } from "react-bootstrap";

// From this project
import type { Account } from "@/api";
import      { useAuth } from "../context/AuthProvider";

// Where each kind of logged-in user starts
const STAFF_LANDING_PATH   = "/admin";
const DEFAULT_LANDING_PATH = "/goal";


// Page a logged-in user starts on
function landingPath(account: Account): string {
    return account.user.is_staff ? STAFF_LANDING_PATH : DEFAULT_LANDING_PATH;
}

// Send `/` to the user's landing page, or to the login page when logged out
export function HomeRedirect(): ReactElement {
    const { account, loading, authComplete } = useAuth();

    if (loading || !authComplete) return <Spinner />;
    return account.user ? <Navigate to={landingPath(account)} replace /> : <Navigate to="/login" replace />;
}

// Users who are not logged in can only get to the login page
export function Protected(): ReactElement {
    const { account, loading, authComplete } = useAuth();

    if (loading || !authComplete) return <Spinner />;
    if (!account.user) return <Navigate to="/login" replace />;

    return <Outlet />;
}

// Users who are logged in already can't get to the login page
export function Unprotected(): ReactElement {
    const { account, loading, authComplete } = useAuth();

    if (loading || !authComplete) return <Spinner />;
    return account.user ? <Navigate to={landingPath(account)} replace /> : <Outlet />;
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

export function IsStaff() {
    const { account, loading } = useAuth();

    if (loading) return <Spinner />
    return account.user.is_staff ? <Outlet /> : <Navigate to="/profile" replace />;
}

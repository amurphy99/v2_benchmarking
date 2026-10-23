/* Route table for the web app, grouped by who may open each page.
--------------------------------------------------------------------------------
`@frontend/src/App`

Every page except the avatar demo sits inside `AuthProvider`, so the demo can
run without a backend account. Access is layered: `/` and the login page send a
logged-in user to their landing page (Monitor for staff), `Protected` pages need
a login, and the `IsPatient`, `IsCaregiver`, and `IsStaff` routes narrow that by
role. There is no signup page: staff create accounts. Unknown paths go to the
login page.

This component also keeps `window.isMobile` current as the window resizes,
because pages read that flag directly instead of taking it as a prop.

*/
import { useEffect, useState             } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

// From this project
import { AuthProvider                                                                     } from "@/context/AuthProvider";
import { AppLayout, HomeRedirect, IsCaregiver, IsPatient, IsStaff, Protected, Unprotected } from "@/routes";
import { Admin, AdminChat, AdminChatActivities, AdminChatInactive, AdminCreateAccount     } from "@/pages";
import { AdminParticipants                                                                } from "@/pages";
import { Alert, Analysis, AnalysisFlagged, AvatarDemo, Chat, ChatAlbum, ChatDetails       } from "@/pages";
import { ChatEnd, Dashboard, DaySummary, Goal, History, Practice, PracticePage, Profile   } from "@/pages";
import { ProgressSummary, Settings, Transcript, TranscriptPlayback, WeekSummary           } from "@/pages";

import Login    from "@/pages/Login";
import Schedule from "@/pages/Schedule";


import "./App.css";

// Widest window, in CSS pixels, that pages lay out for mobile
const MOBILE_MAX_WIDTH_PX = 768;


// ================================================================================
// App
// ================================================================================
// Route every page, with all but the public avatar demo inside the login check
export default function App() {
    // --------------------------------------------------------------------------------
    // Window Width
    // --------------------------------------------------------------------------------
    // Track the window width so a resize re-renders the routed page
    const [width, setWidth] = useState(window.innerWidth);
    useEffect(() => {
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Pages read the mobile flag from `window` rather than from a prop
    window.isMobile = (width <= MOBILE_MAX_WIDTH_PX);

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <Routes>
            {/* -------------------------------------------------------------------------------- */}
            {/* Public Avatar Demo */}
            {/* -------------------------------------------------------------------------------- */}
            {/* Outside the login check, so it never asks the backend for an account */}
            <Route path="/avatar-demo" element={<AvatarDemo />} />

            {/* -------------------------------------------------------------------------------- */}
            {/* Pages Inside the Login Check */}
            {/* -------------------------------------------------------------------------------- */}
            <Route element={<AuthProvider><Outlet /></AuthProvider>}>
                <Route element={<AppLayout />}>
                    {/* The site root sends everyone to their landing page or the login page */}
                    <Route path="/" element={<HomeRedirect />} />

                    {/* Login (logged-in users are sent to their landing page) */}
                    <Route element={<Unprotected />}>
                        <Route path="/login" element={<Login />} />
                    </Route>

                    {/* Pages that need a logged-in user */}
                    <Route element={<Protected />}>
                        {/* Patients only */}
                        <Route element={<IsPatient />}>
                            <Route path="/chat"     element={<Chat    />} />
                            <Route path="/chat/end" element={<ChatEnd />} />
                        </Route>

                        {/* Caregivers only (staff are caregivers too) */}
                        <Route element={<IsCaregiver />}>
                            <Route path="/alert"         element={<Alert        />} />
                            <Route path="/practice"      element={<Practice     />} />
                            <Route path="/settings"      element={<Settings     />} />
                            <Route path="/practice-page" element={<PracticePage />} />

                            {/* Monitor pages (the backend shows a caregiver only their linked participants) */}
                            <Route path="/admin"                   element={<Admin             />} />
                            <Route path="/admin/chat/:id"          element={<AdminChat         />} />
                            <Route path="/admin/chat/inactive/:id" element={<AdminChatInactive />} />
                            <Route path="/admin/participants"      element={<AdminParticipants />} />
                        </Route>

                        {/* Patients and caregivers */}
                        <Route path="/profile"             element={<Profile            />} />
                        <Route path="/schedule"            element={<Schedule           />} />
                        <Route path="/goal"                element={<Goal               />} />
                        <Route path="/album"               element={<ChatAlbum          />} />
                        <Route path="/week"                element={<WeekSummary        />} />
                        <Route path="/day"                 element={<DaySummary         />} />
                        <Route path="/analysis"            element={<Analysis           />} />
                        <Route path="/analysis/flagged"    element={<AnalysisFlagged    />} />
                        <Route path="/transcript"          element={<Transcript         />} />
                        <Route path="/transcript-playback" element={<TranscriptPlayback />} />

                        {/* v2 testing and older pages */}
                        <Route path="/v2"          element={<ProgressSummary />} />
                        <Route path="/history"     element={<History         />} />
                        <Route path="/dashboard"   element={<Dashboard       />} />
                        <Route path="/chatdetails" element={<ChatDetails     />} />

                        {/* Staff only */}
                        <Route element={<IsStaff />}>
                            <Route path="/admin/chat/activities" element={<AdminChatActivities />} />
                            <Route path="/admin/accounts/new"    element={<AdminCreateAccount  />} />
                        </Route>
                    </Route>

                    {/* Any other path goes to the login page */}
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Route>
            </Route>
        </Routes>
    );
}

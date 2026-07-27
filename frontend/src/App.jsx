import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider            } from "@/context/AuthProvider";

import { Unprotected, Protected, AppLayout, IsCaregiver, IsPatient, IsStaff } from "@/routes";

import { Dashboard, History, ChatDetails, Chat, ChatEnd, ProgressSummary, Goal, ChatAlbum, DaySummary,
    WeekSummary, Analysis, AnalysisFlagged, Alert, Transcript, Practice, Settings, AnimationTest,
    PracticePage, Profile, Admin, AdminChat, AdminChatInactive, TranscriptPlayback } from "@/pages";
import Home            from "@/pages/Home";
import Login           from "@/pages/Login";
import SignUpPatient   from "@/pages/SignUpPatient";
import SignUpAccount   from "@/pages/SignUpAccount";
import Schedule        from "@/pages/Schedule";

import "./App.css";
import { useEffect, useState } from "react";

// --------------------------------------------------------------------
// Routes and Pages
// --------------------------------------------------------------------
// ToDo: Almost all of them are shared, we just don't show everything to patients... ?
export default function App() {
    const [width, setWidth] = useState(window.innerWidth);

    function handleWindowSizeChange() {
        setWidth(window.innerWidth);
    }

    useEffect(() => {
        window.addEventListener('resize', handleWindowSizeChange);
        return () => {
            window.removeEventListener('resize', handleWindowSizeChange);
        }
    }, []);

    const isMobile = width <= 768;
    window.isMobile = isMobile;

  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppLayout />}> 

            {/* Public Routes */}
            <Route element={ <Unprotected/> }> 
                <Route path="/"        element={<Home   />} />
                <Route path="/login"   element={<Login  />} />
                <Route path="/signup-patient"  element={<SignUpPatient />} />
                <Route path="/signup"  element={<SignUpAccount />} />
            </Route>

            {/* Protected Routes */}
            <Route element={ <Protected/> }>
                {/* Patient */}
                <Route element={ <IsPatient/> }>
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/chat/end" element={<ChatEnd />} />
                </Route>

                {/* Caregiver */}
                <Route element={ <IsCaregiver /> } >
                    <Route path="/alert"       element={<Alert       />} />
                    <Route path="/practice"    element={<Practice    />} />
                    <Route path="/settings"    element={<Settings    />} />
                    <Route path="/practice-page" element={<PracticePage />} />
                </Route>

                {/* Shared */}
                <Route path="/profile"  element={<Profile         />} />
                <Route path="/schedule" element={<Schedule        />} />
                <Route path="/goal"     element={<Goal            />} />
                <Route path="/album"    element={<ChatAlbum       />} />
                <Route path="/week"     element={<WeekSummary     />} />
                <Route path="/day/:id"      element={<DaySummary      />} />
                <Route path="/analysis" element={<Analysis        />} />
                <Route path="/analysis/flagged" element={<AnalysisFlagged />} />
                <Route path="/transcript/:id"          element={<Transcript         />} />
                <Route path="/transcript-playback" element={<TranscriptPlayback />} />

                {/* v2 Testing and old routes */}
                <Route path="/v2"           element={<ProgressSummary />} />
                <Route path="/history"      element={<History         />} />
                <Route path="/dashboard"    element={<Dashboard   />} />
                <Route path="/chatdetails"  element={<ChatDetails />} />

                {/* Admin */}
                <Route element={ <IsStaff /> } >
                    <Route path="/admin" element={<Admin />} />
                    <Route path="/admin/chat/:id" element={<AdminChat />} />
                    <Route path="/admin/chat/inactive/:id" element={<AdminChatInactive />} />
                </Route>
            </Route>

            <Route path="/animation-test" element={<AnimationTest />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
            
        </Route>

      </Routes>
    </AuthProvider>
  );
}

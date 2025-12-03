import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider            } from "@/context/AuthProvider";

import { Unprotected, Protected, AppLayout, IsCaregiver, IsPatient } from "@/routes";

import { Dashboard, History, ChatDetails, Chat, ProgressSummary, Goal, ChatAlbum, DaySummary, 
    WeekSummary, Analysis, Alert, Transcript, Practice, Settings, AnimationTest, PracticePage } from "@/pages";
import Login           from "@/pages/Login";
import SignUp          from "@/pages/SignUp";
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

  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppLayout isMobile={isMobile} />}> 

            {/* Public Routes */}
            <Route element={ <Unprotected/> }> 
                <Route path="/login"   element={<Login  />} />
                <Route path="/signup"  element={<SignUp />} />
            </Route>

            {/* Protected Routes */}
            <Route element={ <Protected/> }>
                {/* Patient */}
                <Route element={ <IsPatient/> }>
                    <Route path="/chat" element={<Chat isMobile={isMobile}/>} />
                </Route>

                {/* Caregiver */}
                <Route element={ <IsCaregiver /> } >
                    <Route path="/dashboard"   element={<Dashboard   />} />
                    <Route path="/chatdetails" element={<ChatDetails />} />
                    <Route path="/alert"       element={<Alert       />} />
                    <Route path="/practice"    element={<Practice    />} />
                    <Route path="/settings"    element={<Settings    />} />
                    <Route path="/practice-page" element={<PracticePage />} />
                </Route>

                {/* Shared */}
                <Route path="/history"  element={<History         />} />
                <Route path="/schedule" element={<Schedule        />} />
                <Route path="/progress" element={<ProgressSummary />} />
                <Route path="/goal"     element={<Goal            />} />
                <Route path="/album"    element={<ChatAlbum       />} />
                <Route path="/week"     element={<WeekSummary     />} />
                <Route path="/day"      element={<DaySummary      />} />
                <Route path="/analysis" element={<Analysis        />} />
                <Route path="/transcript" element={<Transcript    />} />
                
            </Route>

            <Route path="/animation-test" element={<AnimationTest />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/goal" replace />} />
            
        </Route>

      </Routes>
    </AuthProvider>
  );
}

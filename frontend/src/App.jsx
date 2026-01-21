import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider            } from "@/context/AuthProvider";

import { Unprotected, Protected, AppLayout, IsCaregiver, IsPatient } from "@/routes";

import { Dashboard, History, ChatDetails, Chat, ProgressSummary } from "@/pages";
import Login           from "@/pages/Login";
import SignUp          from "@/pages/SignUp";
import Schedule        from "@/pages/Schedule";


// --------------------------------------------------------------------
// Routes and Pages
// --------------------------------------------------------------------
// ToDo: Almost all of them are shared, we just don't show everything to patients... ?
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppLayout />}> 

            {/* Public Routes */}
            <Route element={ <Unprotected/> }> 
                <Route path="/login"   element={<Login  />} />
                <Route path="/signup"  element={<SignUp />} />
            </Route>

            {/* Protected Routes */}
            <Route element={ <Protected/> }>
                {/* Patient */}
                <Route element={ <IsPatient/> }>
                    <Route path="/chat" element={<Chat />} />
                </Route>

                {/* Caregiver */}
                <Route path="/dashboard"   element={<Dashboard   />} />
                <Route path="/chatdetails" element={<ChatDetails />} />

                {/* Shared */}
                <Route path="/history"  element={<History         />} />
                <Route path="/schedule" element={<Schedule        />} />
                <Route path="/progress" element={<ProgressSummary />} />
                
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
            
        </Route>

      </Routes>
    </AuthProvider>
  );
}

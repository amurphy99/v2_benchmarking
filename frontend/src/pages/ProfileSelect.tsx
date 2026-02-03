import { getProfileById } from "@/api";
import { useAuth } from "@/context/AuthProvider";
import { useProfiles } from "@/hooks/queries/useProfile";
import { Spinner } from "react-bootstrap";
import { Navigate, useNavigate } from "react-router-dom";

export default function ProfileSelect() {
    const {account, setProfile} = useAuth();
    const {data: profiles, isLoading} = useProfiles();
    const navigate = useNavigate();

    const chooseProfile = (id: number) => {
        getProfileById(id).then(setProfile).catch(console.error);
        navigate("/goal");
    }

    if (isLoading) {
        return <Spinner />;
    }  
    if (account.role == "patient") {
        setProfile(profiles[0]);
        return <Navigate to="/goal" replace />
    }
    if (!profiles) {
        return <div>You are not connected to any profiles yet.</div>
    }

    return (
        <div>
            <h1>Select Profile to View</h1>
            {profiles.map((profile, idx) => {
                return (
                    <div key={idx} onClick={() => chooseProfile(profile.id)}>
                        <h2>{profile.account.user.first_name} {profile.account.user.last_name}</h2>
                    </div>
                )
            })}
        </div>
    );
}
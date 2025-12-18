import { useAuth } from "@/context/AuthProvider";
import { NavLink } from "react-router-dom";

export function Profile() {
    const { user, profile } = useAuth();
    
    return (
        <div className="m-[2rem]">
            <h1 className="flex justify-center">{user.first_name} {user.last_name}</h1>
            <div className="grid grid-cols-2 gap-2">
                <h2>Date of Birth:</h2>
                <input type="date"></input>
                <h2>I currently live:</h2>
                <select>

                </select>
                <h2>Sharing with:</h2>
            </div>
            <button className="flex justify-center btn btn-primary patient-button">Continue</button>
        </div>
    );
}
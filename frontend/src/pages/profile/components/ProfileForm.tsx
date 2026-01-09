import { updateProfile } from "@/api";
import { useAuth } from "@/context/AuthProvider";
import { toastMessage } from "@/utils/functions/toast_helper";
import { useState } from "react";

export default function ProfileForm() {
    const { profile, role } = useAuth();
    
    const [birthday, setBirthday] = useState(profile.birthDate ?? "");
    const [location, setLocation] = useState(profile.locationStatus ?? "");
    const [zipcode, setZipcode] = useState(profile.zipcode ?? "");
    const labelStyle = "w-1/4 flex justify-end text-right text-xl";

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateProfile({
            birthDate: birthday,
            locationStatus: location,
            zipcode: zipcode,
        });
        toastMessage("Profile updated successfully!", true);
    }

    return (
        <form onSubmit={onSubmit} >
            <div className="flex flex-col gap-2 mb-[2rem]">

                <div className="flex flex-row gap-3">
                    <h2 className={labelStyle}>Date of Birth:</h2>
                    <input value={birthday} onChange={(e) => setBirthday(e.target.value)} 
                    className="w-2/3 border-1 border-black rounded-sm p-2" type="date" />
                </div>

                <div className="flex flex-row gap-3">
                    <h2 className={labelStyle}>Zip Code</h2>
                    <input value={zipcode} onChange={(e) => setZipcode(e.target.value)} 
                    className="w-2/3 border-1 border-black rounded-sm p-2" type="text" />
                </div>

                <div className="flex flex-row gap-3">
                    <h2 className={labelStyle}>I currently live:</h2>
                    <select className="w-2/3 border-1 border-black rounded-sm p-2" value={location} 
                    onChange={(e) => setLocation(e.target.value)}>
                        <option value="independent">Independently</option>
                        <option value="withCare">With Care Partner</option>
                        <option value="assisted">In Assisted Living</option>
                        <option value="other">Other</option>
                    </select>
                </div>

            </div>
            <button type="submit" className={`flex mx-auto justify-center btn btn-primary ${role}-button`}>Save</button>
        </form>
    );
}
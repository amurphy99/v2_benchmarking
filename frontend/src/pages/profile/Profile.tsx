import { useAuth } from "@/context/AuthProvider";
import ProfileForm from "./components/ProfileForm";
import DisplayProfileAccess from "./components/DisplayProfileAccess";
import { FaCircleUser } from "react-icons/fa6";
import { CAREGIVER_OKLCH, PATIENT_OKLCH } from "@/utils/styling/colors";
import { useProfile } from "@/hooks/queries/useProfile";

export function Profile() {
    const { account } = useAuth();
    const role = account.role == "patient" ? "patient" : "caregiver";
    const isCare = role != "patient";
    const { data: profile, isLoading } = useProfile();
    
    if (isLoading) {
        return null;
    }
    const labelStyle = "w-1/4 flex justify-end text-right text-xl";

    if (!isCare) {
        return (
            <div className="m-[2rem]">
                <h1 className="flex justify-center">{account.user.first_name} {account.user.last_name}</h1>
                <FaCircleUser size={"5rem"} className={`mx-auto mb-[1rem]`} color={PATIENT_OKLCH}/>

                <ProfileForm />
                    
                <div className="mt-[2rem] flex flex-row gap-3">
                    <h2 className={labelStyle}>Currently Sharing Information With:</h2>
                    <DisplayProfileAccess />
                </div>
            </div>
        );
    } else {
    if (!profile || !profile.account) {
            return (
                <div className="m-[2rem]">
                    <h1>Not connected to a user yet.</h1>
                </div>
            )
        }
        return (
            <div className="m-[1rem] sm:m-[2rem] md:m-[3rem] lg:m-[4rem]">
                <h1 className="flex justify-center">{account.user.first_name} {account.user.last_name}</h1>
                <FaCircleUser size={"5rem"} className={`mx-auto mb-[1rem]`} color={CAREGIVER_OKLCH}/>
                <p className="text-lg text-center">{profile.account.user.first_name} is currently sharing their information with you.
                    Is there anyone else with whom you'd like to share {profile.account.user.first_name}'s profile?
                </p>
                <DisplayProfileAccess />
            </div>
        );
    } 
}
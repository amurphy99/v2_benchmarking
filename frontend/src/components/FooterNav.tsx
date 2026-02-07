import { NavLink } from "react-router-dom";
import { GiAlliedStar } from "react-icons/gi";
import { LuImage } from "react-icons/lu";
import { FaChartBar, FaRegBell, FaRegCompass } from "react-icons/fa";
import { footerLinkPatientCls, footerLinkCaregiverCls } from "@/utils/styling/colors";
import { useAuth } from "@/context/AuthProvider";
import { Profile } from "@/api";

export default function FooterNav() {
    const { account } = useAuth();


    if (!account) {
        return null;
    }
    if (account.role == "caregiver") {
        return (
            <div className="fixed bottom-0 left-0 right-0 shadow-inner flex flex-row justify-around items-center p-4 bg-white z-10">
                <div className="flex flex-col items-center">
                    <NavLink to="/goal" className={footerLinkCaregiverCls}>
                        <GiAlliedStar size={"2rem"} />
                        Goal
                    </NavLink>
                </div>
                <div className="flex flex-col items-center">
                    <NavLink to="/analysis" className={footerLinkCaregiverCls}>
                        <FaChartBar size={"2rem"} />
                        Analysis
                    </NavLink>
                </div>
                <div className="flex flex-col items-center">
                    <NavLink to="/album" className={footerLinkCaregiverCls}>
                        <LuImage size={"2rem"} />
                        Album
                    </NavLink>
                </div>
                <div className="flex flex-col items-center">
                    <NavLink to="/practice" className={footerLinkCaregiverCls}>
                        <FaRegCompass size={"2rem"} />
                        Practice
                    </NavLink>
                </div>
                <div className="flex flex-col items-center">
                    <NavLink to="/alert" className={footerLinkCaregiverCls}>
                        <FaRegBell size={"2rem"} />
                        Alert
                    </NavLink>
                </div>
            </div>
        );
    } else {
        return (
            <div className="fixed bottom-0 left-0 right-0 shadow-inner flex flex-row justify-around items-center p-4 bg-white z-10">
                <div className="flex flex-col items-center">
                    <NavLink to="/chat" className={footerLinkPatientCls}>
                        <img className="aspect-square w-[2rem] chat-icon" src="/images/Robot_icon.svg" />
                        Chat
                    </NavLink>
                </div>
                <div className="flex flex-col items-center">
                    <NavLink to="/goal" className={footerLinkPatientCls}>
                        <GiAlliedStar size={"2rem"} />
                        Goal
                    </NavLink>
                </div>
                <div className="flex flex-col items-center">
                    <NavLink to="/album" className={footerLinkPatientCls}>
                        <LuImage size={"2rem"} />
                        Album
                    </NavLink>
                </div>
                <div className="flex flex-col items-center">
                    <NavLink to="/analysis" className={footerLinkPatientCls}>
                        <FaChartBar size={"2rem"} />
                        Analysis
                    </NavLink>
                </div>
            </div>
        );
    }
}
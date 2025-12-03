import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState             } from "react";
import { GoGear               } from "react-icons/go";
import { FaCircleUser } from "react-icons/fa6";
import { IoMailUnreadOutline } from "react-icons/io5";

import { useAuth    } from "@/context/AuthProvider";
import { navLinkCls } from "@/utils/styling/colors";
import GoalModal              from "@/components/modals/GoalModal";
import CaregiverSettingsModal from "@/components/modals/CaregiverSettingsModal";
import ProfileInfo            from "@/pages/common/user-info/ProfileInfo";
import { Icon } from "@iconify/react/dist/iconify.js";

// Page title
const TITLES: Record<string, string> = {
    "/"             : "Dashboard",
    "/dashboard"    : "Dashboard",
    "/progress"     : "Progress Summary",
    "/chatDetails"  : "Single Chat Analysis",
    "/chat"         : "Chat",
    "/history"      : "Chat History",
    "/schedule"     : "Schedule",
    "/goal"         : "Goal",
    "/album"        : "Chat Album",
    "/week"         : "Weekly Summary",
    "/day"          : "Daily Summary",
    "/settings"     : "Settings",
    "/analysis"     : "Analysis",
    "/transcript"   : "Transcript",
    "/practice"     : "Practice",
    "/alert"        : "Alerts",
    default         : "Cognibot",
};

const SHOW_HEADER: string[] = ["/chat", "/album", "/analysis", "/goal", "/practice", "/schedule", "/alert"]

// ====================================================================
// Header
// ====================================================================
export default function Header( {isMobile} : {isMobile: boolean} ) {
    const { user, profile, logout } = useAuth();
    const role = profile.role.toLowerCase();
    const { pathname } = useLocation();
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [pathname])

    const title  = TITLES[pathname] ?? TITLES.default;
    const isCare = user.id == profile.caregiver.id;

    // Return UI component
    if (SHOW_HEADER.includes(pathname)) {
        return (
        <header className={"flex items-center gap-6 px-[2rem] py-[1rem]"}>
            <div className={`${isMobile ? "block" : "hidden"} ${role}-text hover:cursor-pointer`} onClick={() => logout()}>
                <FaCircleUser size={"2.5rem"} />
            </div>
            <h1 className="text-4xl whitespace-nowrap"><b> {title} </b></h1>
            <div className={`ml-auto flex items-center gap-3`}>

                {/* Navigation Links */}
                <nav className={`${isMobile? "hidden" : "block"} flex gap-4 text-xl`}>
                    <NavLink to="/goal"      className={navLinkCls}> Goal      </NavLink>
                    <NavLink to="/album"     className={navLinkCls}> Album     </NavLink>
                    {isCare ? 
                        <NavLink to="/practice"   className={navLinkCls}> Practice  </NavLink> :
                        <NavLink to="/chat"      className={navLinkCls}> Chat      </NavLink>
                    }
                    <NavLink to="/schedule"  className={navLinkCls}> Schedule  </NavLink>
                    <NavLink to="/analysis" className={navLinkCls}> Analysis  </NavLink>
                </nav>

                {/* Right Side Icons */}
                {isMobile ? null : 
                    <>
                        <div className={`vr`}></div>
                        <ProfileInfo profile={profile} user={user}/>
                        <NavLink to="/settings" className={`text-gray-500`}> <GoGear size={22}/> </NavLink>
                    </>
                }
                {
                    isCare ? 
                    <NavLink to="/alert">
                        <Icon icon="fluent-color:mail-alert-32" width={"3rem"} height={"3rem"} />
                    </NavLink> : null
                }
                
            </div>

            {/* Modal */}
            {isCare ? 
                <CaregiverSettingsModal show={showModal} onHide={() => setShowModal(false)} /> : 
                <GoalModal              show={showModal} onHide={() => setShowModal(false)} />
            }

        </header>
    );} else {
        return (null);
    }
}

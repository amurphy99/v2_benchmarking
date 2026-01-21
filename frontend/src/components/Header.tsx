import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState             } from "react";

import { useAuth    } from "@/context/AuthProvider";
import { navLinkClsCaregiver, navLinkClsPatient } from "@/utils/styling/colors";
import GoalModal              from "@/components/modals/GoalModal";
import CaregiverSettingsModal from "@/components/modals/CaregiverSettingsModal";
import ProfileInfo            from "@/pages/common/user-info/ProfileInfo";
import { Icon } from "@iconify/react/dist/iconify.js";
import { useProfile } from "@/hooks/queries/useProfile";

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

const SHOW_HEADER: string[] = ["/chat", "/album", "/analysis", "/goal", "/practice", "/schedule", "/alert", "/settings", "/profile"]

// ====================================================================
// Header
// ====================================================================
export default function Header() {
    const { user, role } = useAuth();
    const { data: profile, isLoading } = useProfile();
    const isCare = role == "caregiver";
    const { pathname } = useLocation();
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [pathname])

    if (isLoading) {
        return null;
    }

    const title  = TITLES[pathname] ?? TITLES.default;

    const navLinkCls = isCare ? navLinkClsCaregiver : navLinkClsPatient;

    // Return UI component
    if (SHOW_HEADER.includes(pathname)) {
        return (
        <header className={"flex items-center gap-3 md:gap-6 px-[1rem] md:px-[2rem] py-[1rem]"}>
            <ProfileInfo isCare={isCare} user={user} />
            <h1 className="text-3xl md:text-4xl whitespace-nowrap"><b> {title} </b></h1>
            {profile ? 
            <div className={`ml-auto flex items-center gap-3`}>

                {/* Right Side Icons */}
                {
                    isCare ? 
                    <NavLink to="/settings">
                        <Icon icon="fluent-color:settings-28" width={"3rem"} height={"3rem"} />
                    </NavLink> : null
                }
                
                
            </div>
            : null}

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

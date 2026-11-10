/* Page header: profile menu, page title, and the caregiver settings link.
--------------------------------------------------------------------------------
`@frontend/src/components/Header`

Staff on the Monitor page and its staff tools (Activity Instructions, Map Task
Maps, Accounts) get the admin version: the same profile menu and "Monitor" title,
with a link to each of those four pages.

*/
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState             } from "react";

import { useAuth    } from "@/context/AuthProvider";
import GoalModal              from "@/components/modals/GoalModal";
import CaregiverSettingsModal from "@/components/modals/CaregiverSettingsModal";
import ProfileInfo            from "@/pages/common/user-info/ProfileInfo";
import { Icon } from "@iconify/react/dist/iconify.js";
import { Profile } from "@/api";
import { useProfile } from "@/hooks/queries/useProfile";
import { Spinner } from "react-bootstrap";
import type { IconType } from "react-icons";
import { LuClipboardList, LuMap, LuMessagesSquare, LuUsers } from "react-icons/lu";

// The admin header's pages, in order, each with its icon (staff see the admin header on each of them)
const ADMIN_NAV: {to: string; label: string; icon: IconType}[] = [
    {to: "/admin",                 label: "Monitor",               icon: LuMessagesSquare},
    {to: "/admin/chat/activities", label: "Activity Instructions", icon: LuClipboardList },
    {to: "/admin/map-task/maps",   label: "Map Task Maps",         icon: LuMap           },
    {to: "/admin/participants",    label: "Accounts",              icon: LuUsers         },
];

// One admin header tab's look (on a span inside the link: Bootstrap's link color and underline beat Tailwind's on the link itself)
function adminTabClass(isActive: boolean): string {
    const base = "flex items-center gap-2 rounded-full px-4 py-2 text-base font-medium transition-colors";
    return isActive ? `${base} bg-admin-panel text-admin-accent2 shadow-sm ring-1 ring-admin-border` : `${base} text-admin-subtext hover:bg-admin-panel/70 hover:text-admin-text`;
}

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
    "/analysis/flagged"     : "Flagged Biomarkers",
    "/transcript"   : "Transcript",
    "/practice"     : "Practice",
    "/alert"        : "Alerts",
    "/admin"        : "Monitor",
    "/profile"      : "Profile",
    default         : "Cognibot",
};

const SHOW_HEADER: string[] = ["/chat", "/chat/end", "/album", "/analysis", "/analysis/flagged", "/goal", 
    "/practice", "/schedule", "/alert", "/settings", "/profile", "/admin"]
const SIMPLE_HEADER: string[] = ["/history", "/dashboard", "/chatDetails", "/v2", "/progress"]

// ====================================================================
// Header
// ====================================================================
export default function Header() {
    const { account } = useAuth();
    const { data: profile, isLoading } = useProfile();
    const isCare = account.role == "caregiver";
    const { pathname } = useLocation();
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        window.scrollTo(0, 0)
    }, [pathname])

    if (isLoading) {
        return <Spinner />;
    }

    const title  = TITLES[pathname] ?? TITLES.default;

    // Staff on the Monitor pages: the admin header, with a link to each one
    if (account.user.is_staff && ADMIN_NAV.some(({to}) => to === pathname)) {
        return (
            <header className="border-b border-admin-border bg-admin-panel text-admin-text">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 md:px-6 py-2.5">
                    {/* Profile menu and the section's name */}
                    <div className="flex items-center gap-3">
                        <ProfileInfo isCare={isCare} user={account.user} />
                        <h1 className="m-0 text-2xl md:text-3xl font-semibold whitespace-nowrap">{TITLES["/admin"]}</h1>
                    </div>

                    {/* The four Monitor pages (Monitor matches only itself, not the pages under it) */}
                    <nav aria-label="Monitor pages" className="flex flex-wrap gap-1 rounded-full border border-admin-border bg-admin-muted p-1">
                        {ADMIN_NAV.map(({to, label, icon: TabIcon}) => (
                            <NavLink key={to} to={to} end style={{textDecoration: "none"}}>
                                {({isActive}) => <span className={adminTabClass(isActive)}><TabIcon aria-hidden="true" size={18} /> {label}</span>}
                            </NavLink>
                        ))}
                    </nav>

                    {/* Settings */}
                    {(isCare && profile.account) ? (
                        <NavLink to="/settings" aria-label="Settings" className="ml-auto flex h-10 w-10 items-center justify-center rounded-md hover:bg-admin-muted">
                            <Icon icon="fluent-color:settings-28" width={"2rem"} height={"2rem"} />
                        </NavLink>
                    ) : null}
                </div>
            </header>
        );
    }

    // Return UI component
    if (SIMPLE_HEADER.includes(pathname)) {
        return (
            <header className={"flex items-center gap-3 md:gap-6 px-[1rem] md:px-[2rem] py-[1rem]"}>
                <NavLink to="/v2" style={{ color: "black", textDecoration: "none" }}>
                    <h1>CogniBot</h1>
                </NavLink>
                <div className={`ml-auto flex items-center gap-3`}>
                    <NavLink to="/history" style={{ color: "black" }}>
                        <h4>History</h4>
                    </NavLink>
                    <NavLink to="/dashboard" style={{ color: "black" }}>
                        <h4>Dashboard</h4>
                    </NavLink>
                </div>
            </header>
        )
    }
    if (SHOW_HEADER.includes(pathname)) {
        return (
        <header className={"flex items-center gap-3 md:gap-6 px-[1rem] md:px-[2rem] py-[1rem]"}>
            <ProfileInfo isCare={isCare} user={account.user} />
            <h1 className="text-3xl md:text-4xl whitespace-nowrap"><b> {title} </b></h1>
            {account ? 
            <div className={`ml-auto flex items-center gap-3`}>

                {/* Right Side Icons */}
                {
                    isCare && profile.account ? 
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
        );
    } else {
        return (null);
    }
}

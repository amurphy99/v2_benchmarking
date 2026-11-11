/* Compact participant navigation, opened from the chat page's corner button.
--------------------------------------------------------------------------------
`@frontend/src/components/ChatNavigation`

Replaces the global header and footer during a chat. Bootstrap's dropdown keeps
click, keyboard, Escape, and outside-click behavior consistent with other menus.
*/
import type { ReactElement } from "react";
import      { Dropdown     } from "react-bootstrap";
import      { LuChartNoAxesCombined, LuImage, LuLogOut, LuMenu, LuTarget, LuUserRound } from "react-icons/lu";
import      { Link         } from "react-router-dom";

// From this project
import { useAuth } from "@/context/AuthProvider";

const CHAT_NAV_LINKS = [
    {to: "/profile",  label: "Profile",  icon: LuUserRound          },
    {to: "/goal",     label: "Goals",    icon: LuTarget             },
    {to: "/album",    label: "Album",    icon: LuImage              },
    {to: "/analysis", label: "Analysis", icon: LuChartNoAxesCombined},
];


// ================================================================================
// Chat Navigation
// ================================================================================
// A single circular control leaves the conversation and task in the foreground
export default function ChatNavigation(): ReactElement {
    const { logout } = useAuth();

    return (
        <Dropdown className="fixed! left-3 top-3 z-30 md:left-4 md:top-4">
            <Dropdown.Toggle
                id         = "chat-navigation"
                bsPrefix   = "chat-navigation-toggle"
                aria-label = "Open navigation"
                title      = "Navigation"
                className  = "m-0! flex! h-11 w-11 items-center justify-center rounded-full! border! border-chat-border! bg-chat-panel! p-0! text-chat-text! shadow-sm hover:bg-chat-stage! focus-visible:ring-2 focus-visible:ring-chat-accent"
            >
                <LuMenu size={22} aria-hidden="true" />
            </Dropdown.Toggle>
            <Dropdown.Menu className="mt-2! min-w-52 rounded-xl! border-chat-border! p-2! shadow-lg">
                <Dropdown.Header>Navigation</Dropdown.Header>
                {CHAT_NAV_LINKS.map(({to, label, icon: NavIcon}) => (
                    <Dropdown.Item key={to} as={Link} to={to} className="flex! items-center gap-3 rounded-lg px-3! py-2!">
                        <NavIcon size={18} aria-hidden="true" />{label}
                    </Dropdown.Item>
                ))}
                <Dropdown.Divider />
                <Dropdown.Item as="button" onClick={logout} className="m-0! flex! items-center gap-3 rounded-lg px-3! py-2!">
                    <LuLogOut size={18} aria-hidden="true" />Log out
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    );
}

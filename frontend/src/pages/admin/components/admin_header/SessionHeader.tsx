/* The admin chat pages' header: the chat's title, what it ran, and its status.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/admin_header/SessionHeader`

Shared by the live chat page (`AdminChat`), the robot view (`AdminRobotView`),
the completed chat page (`AdminChatInactive`), and the task details page
(`AdminTaskDetails`). The left side has the back button, the title, and a line
naming the account, the source, the mode, and what the chat ran. A completed
task chat's two pages add pills under it for the setup it started with: its
avatar, whether subtitles were on, and its language (each one only once
recorded). The right side holds the page's buttons and the status pills.

*/
import { useNavigate    } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LuArrowLeft } from "react-icons/lu";

// From this project
import type { ChatSession                    } from "@/api";
import      { getAvatarEntry, hasAvatarEntry } from "@/pages/common/avatar/avatarRegistry";
import      { chatRunText                    } from "../chat_lists/chatRunFilter";
import      { languageLabel                  } from "../participants/ParticipantSettingsFields";
import      { AdminButton                    } from "../ui/AdminButton";
import      { Pill                           } from "../ui/Pill";
import      { HeaderPills                    } from "./HeaderPills";
import type { SessionHeaderProps             } from "./StatusComponents";

// The setup a completed chat started with, from a task chat's run ("" or null: not recorded)
type ChatSetup = Pick<ChatSession, "avatar" | "subtitles" | "language">;

// Optional props: buttons to secondary analysis pages, and a completed chat's setup
interface ExtendedProps extends SessionHeaderProps {
    rightActions? : React.ReactNode;
    chatSetup?    : ChatSetup;         // Shown as pills under the meta line (the completed chat pages pass it)
}

// An avatar's name as the pickers show it (its recorded ID when this page no longer has it)
function avatarName(id: string): string {
    return hasAvatarEntry(id) ? getAvatarEntry(id).label : id;
}

// ================================================================================
// SessionHeader (for the chat listener)
// ================================================================================
export const SessionHeader: React.FC<ExtendedProps> = (props) => {
    const navigate = useNavigate   ();
    const qc       = useQueryClient();

    // Force a refresh of the chat-list queries when navigating back so newly-completed sessions show up in the right list
    const handleBackClick = () => {
        qc.invalidateQueries({ queryKey: ["activeChatSessions"  ] });
        qc.invalidateQueries({ queryKey: ["inactiveChatSessions"] });
        navigate(-1);
    };

    // ChatSession information
    const { title, sessionId, username, source, mode, chatRun, rightActions, chatSetup } = props;
    const show_session_id = sessionId ? `#${sessionId}` : "#--";

    // What the chat ran, in one line (null until known, or when nothing was recorded), and whether it was a debug session
    const task  = ((chatRun === undefined) || (chatRun === null)) ? null : chatRunText(chatRun);
    const debug = (chatRun !== undefined) && (chatRun !== null) && chatRun.debug_mode;

    // The setup it started with (null hides its pills: not given, or nothing recorded)
    const setup = ((chatSetup === undefined) || ((chatSetup.avatar === "") && (chatSetup.subtitles === null) && (chatSetup.language === ""))) ? null : chatSetup;

    // UI Component
    return (
        <header className="sticky top-0 z-10 bg-admin-panel/95 backdrop-blur border-b border-admin-border">
            <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-3 flex-wrap">

                {/* -------------------------------------------------------------------------------- */}
                {/* Left Side => Back Button | Title | Meta Data */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="min-w-0 flex gap-3 items-center flex-wrap">
                    {/* Back Button for Navigation */}
                    <button
                        onClick   = {handleBackClick}
                        className = "flex items-center justify-center h-8 w-8 rounded-md text-admin-text hover:bg-admin-muted cursor-pointer"
                        aria-label = "Back"
                    >
                        <LuArrowLeft size={20} />
                    </button>

                    <div className="flex flex-col min-w-0">
                        {/* Session "Title" */}
                        <div className="text-base md:text-lg font-semibold text-admin-text truncate">
                            {title} <span className="text-admin-subtext font-normal">{show_session_id}</span>
                        </div>

                         {/* Some Session Info */}
                        <div className="text-xs text-admin-subtext truncate">
                            {username  && <>Username: <span className="text-admin-text/80">{username}</span></>}
                            {source    && <> · Source: <span className="text-admin-text/80">{source}</span></>}
                            {mode      && <> · Mode: <span className="text-admin-text/80">{mode}</span></>}
                            {task      && <> · Task: <span className="text-admin-text/80">{task}</span></>}
                            {debug     && <> · <span className="font-medium text-admin-accent2" title="Started in debug mode: its features may have been switched partway through">Debug session</span></>}
                        </div>

                        {/* The setup it started with */}
                        {(setup !== null) ? (
                            <div className="mt-1.5 flex flex-wrap gap-2">
                                {(setup.avatar    !== ""  ) ? <Pill label="Avatar"    value={avatarName(setup.avatar)} />                                                       : null}
                                {(setup.subtitles !== null) ? <Pill label="Subtitles" value={setup.subtitles ? "On" : "Off"} variant={setup.subtitles ? "accent" : "offline"} dot /> : null}
                                {(setup.language  !== ""  ) ? <Pill label="Language"  value={languageLabel(setup.language)} />                                                  : null}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* -------------------------------------------------------------------------------- */}
                {/* Right Side => Action Button | Status Pills */}
                {/* -------------------------------------------------------------------------------- */}
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    {rightActions}
                    <HeaderPills {...props} />
                </div>

            </div>
        </header>
    );
};


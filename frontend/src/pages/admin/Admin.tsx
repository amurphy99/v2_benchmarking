import { useAuth } from "@/context/AuthProvider";
import { useActiveChatSessions, useAllChatSessions } from "@/hooks/queries/useChatSessions";
import { dateFormatOptionsLong } from "@/utils/styling/numFormatting";
import { Spinner } from "react-bootstrap";
import { NavLink } from "react-router-dom";

export function Admin() {
    const { account } = useAuth();
    const { data: chatSessionsActive, isLoading, refetch } = useActiveChatSessions();
    const { data: chatSessions, isLoading: loadingAll, refetch: refetchAll } = useAllChatSessions();

    if (!account.user.is_staff) {
        return <h1 className="m-[2rem]">You don't have access to the admin page.</h1>
    }

    if (isLoading || loadingAll) {
        return <Spinner />
    }

    return (
        <div className="mx-[2rem] pb-[15vh]">
            <div className="flex flex-row gap-[2rem] mb-[2rem] ">
                <h2>Currently Active Chat Sessions</h2>
                <button onClick={() => refetch()} className="text-sm px-2 py-1 rounded-lg bg-gray-200 hover:bg-gray-300">Refresh</button>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2 min-h-[10vh]">
                {chatSessionsActive.map((chat, idx) => {
                    return (
                        <NavLink to={`/admin/chat/${chat.id}`} key={idx} 
                        className="flex flex-col p-4 rounded-lg border-1 border-black no-underline text-black hover:bg-gray-100">
                            <p>Chat Session ID: {chat.id}</p>
                            <p>User: {chat.profile.account.user.first_name} {chat.profile.account.user.last_name} </p>
                            <p>Source: {chat.source} </p>
                            <p>Start: {new Date(chat.start_ts).toLocaleDateString("en-US", dateFormatOptionsLong)} </p>
                        </NavLink>
                    )
                })}
            </div>
            <div className="flex flex-row gap-[2rem] mb-[2rem] ">
                <h2>All Chat Sessions</h2>
                <button onClick={() => refetchAll()} className="text-sm px-2 py-1 rounded-lg bg-gray-200 hover:bg-gray-300">Refresh</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {chatSessions.map((chat, idx) => {
                    return (
                        <NavLink to={`/admin/chat/inactive/${chat.id}`} key={idx} 
                        className="flex flex-col p-4 rounded-lg border-1 border-black no-underline text-black hover:bg-gray-100">
                            <p>Chat Session ID: {chat.id}</p>
                            <p>User: {chat.profile.account.user.first_name} {chat.profile.account.user.last_name} </p>
                            <p>Source: {chat.source} </p>
                            <p>Start: {new Date(chat.start_ts).toLocaleDateString("en-US", dateFormatOptionsLong)} </p>
                            <p>End: {chat.end_ts ? new Date(chat.end_ts).toLocaleDateString("en-US", dateFormatOptionsLong) : null}</p>
                        </NavLink>
                    )
                })}
            </div>
        </div>
    );
}
import React, { useState } from "react";
import { IoGridOutline, IoList } from "react-icons/io5";

import AlbumWeekGrid from "./components/AlbumWeekGrid";
import AlbumWeekList from "./components/AlbumWeekList";
import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { groupSessionsByWeek } from "@/utils/functions/getChatWeeks";
import { useLocation } from "react-router-dom";
import AlbumWeekDesktop from "./components/AlbumWeekDesktop";
import Avatar from "../common/avatar/Avatar";
import { useUserSettings } from "@/hooks/queries/useUserSettings";


export function ChatAlbum() {
    const { state } = useLocation() as { state?: { albumDisplay: string } };
    const [display, setDisplay] = useState(state ?? "grid");
    const { data: settings, isLoading: settingsLoading } = useUserSettings();
    const { data: sessions, isLoading } = useChatSessions();
    if (isLoading || settingsLoading) { 
        return <p>Loading...</p>; 
    }
    if (sessions.length == 0) {
        return (
            <div className="flex justify-center items-center m-[2rem]">
                <h1>No chat sessions available to display. Try talking to Buddy!</h1>
            </div>
        )
    }
    const weeks = groupSessionsByWeek(sessions).reverse();

    const changeDisplay = () => {
        if (display == "grid") {
            setDisplay("list");
        } else {
            setDisplay("grid");
        }
    }
    
    // Return UI Component
    if (window.isMobile) {
        return (
            <div className="bg-gray-100 p-[1rem] pb-[15vh]">
                <div className="ml-[1rem]">
                    <button onClick={() => {changeDisplay()}} >
                        { display == "list" ?
                            <IoGridOutline size={50} /> :
                            <IoList size={50} /> }
                    </button>
                </div>
                <div className="flex flex-col items-center">
                    {weeks.map( (week, idx ) => {
                        return (
                            <React.Fragment key={idx}>
                                {display == "grid" ? 
                                    <AlbumWeekGrid week={week} /> :
                                    <AlbumWeekList week={week} />
                                }
                            </React.Fragment>
                        )
                    })}
                </div>
            </div>
        );
    } else {
        return (
            <div className="px-[2rem] pb-[15vh]">
                <div className="flex flex-row gap-2 pb-[2rem] justify-evenly">
                    <h1 className="w-1/3 text-6xl text-center my-auto">Welcome to our chat history!</h1>
                    <div className="w-1/2 min-h-[35vh] max-h-[60vh]">
                        <Avatar model={settings.modelChoice} />
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    {weeks.map( (week, idx ) => {
                        return (
                            <AlbumWeekDesktop key={idx} week={week} />
                        )
                    })}
                </div>
            </div>
        )
    }
}

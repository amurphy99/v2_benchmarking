import React, { useState } from "react";
import { IoGridOutline, IoList } from "react-icons/io5";

import AlbumWeekGrid from "./components/AlbumWeekGrid";
import AlbumWeekList from "./components/AlbumWeekList";
import { useChatSessionSummaries } from "@/hooks/queries/useChatSessions";
import { groupSessionsByWeek } from "@/utils/functions/getChatWeeks";
import { useLocation } from "react-router-dom";
import AlbumWeekDesktop from "./components/AlbumWeekDesktop";


export function ChatAlbum() {
    const { state } = useLocation() as { state?: { albumDisplay: string } };
    const [display, setDisplay] = useState(state ?? "grid");
    const { data: sessions, isLoading } = useChatSessionSummaries(0, 2);
    if (isLoading) { 
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
            <div className="bg-gray-100 p-[1rem] pb-[15vh] overflow-y-scroll">
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

import React, { useState } from "react";
import { IoGridOutline, IoList } from "react-icons/io5";

import AlbumWeekGrid from "./components/AlbumWeekGrid";
import AlbumWeekList from "./components/AlbumWeekList";
import { useChatSessions } from "@/hooks/queries/useChatSessions";
import { groupSessionsByWeek } from "@/utils/functions/getChatWeeks";
import { useLocation } from "react-router-dom";


export function ChatAlbum() {
    const { state } = useLocation() as { state?: { albumDisplay: string } };
    const [display, setDisplay] = useState(state ?? "grid");
    const { data: sessions, isLoading } = useChatSessions();
    if (isLoading) { 
        return <p>Loading...</p>; 
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
}

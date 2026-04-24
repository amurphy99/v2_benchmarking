import { useEffect, useRef, useState } from "react";
import { Avatar } from "../common/avatar/Avatar";
import { buddyAnimations, qtAnimations } from "../common/avatar/AvatarUtils";

export function AnimationTest() {
    const [botMessage, setBotMessage] = useState<string>("Chat with me!");
    const [animation, setAnimation] = useState<string>("Neutral");
    const [model, setModel] = useState<string>("qt");
    const [mapAnim, setMapAnim] = useState<any>(qtAnimations);
    const ref = useRef<any>(null);

    useEffect(() => {
        if (ref.current) {
            console.log("Playing animation:", animation)
            ref.current.playAnimation(animation);
        }
    }, [animation]);

    useEffect(() => {
        if (model == "qt") {
            setMapAnim(qtAnimations);
        } else {
            setMapAnim(buddyAnimations);
        }
    }, [model])

    const mapMsg: Record<string, string> = {
        Happy: "This is a happy message!",
        Sad: "This is a sad message.",
        Surprised: "This is a surprised message!",
        Scared: "This is a scared message.",
        Angry: "This is an angry message.",
        Neutral: "This is a neutral message.",
    }

    return (
    <>
        <select 
            onChange={(e) => setAnimation(e.target.value)} 
            className={`p-2 border-1 border-solid border-gray-400 rounded-lg m-[1rem] bg-red-50 text-center text-xl hover:cursor-pointer`}
            defaultValue="select"
        >
            {Object.keys(mapAnim).map((emotion, idx) => {
                return <option key={idx} value={emotion}>{emotion}</option>
            })}
        </select>
        <select 
            onChange={(e) => setModel(e.target.value)} 
            className={`p-2 border-1 border-solid border-gray-400 rounded-lg m-[1rem] bg-red-50 text-center text-xl hover:cursor-pointer`}
            defaultValue="select"
        >
            <option value={"qt"}>QT Robot</option>
            <option value={"buddy"}>Buddy Robot</option>
        </select>
        <p className="m-[1rem] text-lg">Current animation playing: {animation}</p>
        <div className="flex flex-col justify-between h-[85vh]">
            {!window.isMobile ? 
                <div className="flex flex-row justify-center h-[70vh] m-[1rem]">
                    <div className="sm:w-1/5" />
                    <div className="mt-[1rem] w-full sm:w-1/2"> 
                        <Avatar zoom="body" model={model} ref={ref} /> 
                    </div> 
                    <div className="hidden sm:inline-block bubble"> 
                        {botMessage} 
                    </div>
                </div>
                :
                    
                <div className="flex flex-col mx-[1rem] mt-[2rem] h-[65vh]">
                    <Avatar zoom="body" model={model} ref={ref} /> 
                    <div className="text-3xl font-extrabold mt-[4rem] mx-[2rem] overflow-y-auto hidden-scrollbar h-full">
                        {botMessage}
                    </div>
                </div>
            }
        </div>
    </>
    )
}

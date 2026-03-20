import { useEffect, useState } from "react";
import Avatar from "../common/avatar/Avatar";

export function AnimationTest() {
    const [botMessage, setBotMessage] = useState<string>("Chat with me!");
    const [animation, setAnimation] = useState<string>("Idle");
    const [animCount, setAnimCount] = useState<number>(0);
    const [emotion, setEmotion] = useState<string>("Neutral");

    const mapAnim: Record<string, string> = {
        Happy: "Nod",
        Sad: "ShakeHead",
        Surprised: "CoverMouth",
        Scared: "Embarrassed",
        Angry: "DuckHead",
        Neutral: "Idle",
        Listening: "Listening",
        Thinking: "Thinking",
        HeadTilt: "HeadTilt",
        Shrug: "Shrug",
        FoldArms: "FoldArms",
        Thoughtful: "Thoughtful",
    };

    const mapMsg: Record<string, string> = {
        Happy: "This is a happy message!",
        Sad: "This is a sad message.",
        Surprised: "This is a surprised message!",
        Scared: "This is a scared message.",
        Angry: "This is an angry message.",
        Neutral: "This is a neutral message.",
    }

    useEffect(() =>{ 
        const animVal: string = mapAnim[emotion] || "Idle";
        const msgVal: string = mapMsg[emotion] || "This is a neutral message.";
        setAnimation(animVal);
        setBotMessage(msgVal);
        setAnimCount((t) => t + 1);
    }, [emotion])

    return (
    <>
        <select 
            onChange={(e) => setEmotion(e.target.value)} 
            className={`p-2 border-1 border-solid border-gray-400 rounded-lg m-[1rem] bg-red-50 text-center text-xl hover:cursor-pointer`}
            defaultValue="select"
        >
            {Object.keys(mapAnim).map((emotion, idx) => {
                return <option key={idx} value={emotion}>{emotion}</option>
            })}
        </select>
        <p className="m-[1rem] text-lg">Current animation playing: {animation}</p>
        <div className="flex flex-col justify-between h-[85vh]">
            {!window.isMobile ? 
                <div className="flex flex-row justify-center h-[70vh] m-[1rem]">
                    <div className="sm:w-1/5" />
                    <div className="mt-[1rem] w-full sm:w-1/2"> 
                        <Avatar emotion={emotion} emoCount={animCount} zoom="body" model="qt" /> 
                    </div> 
                    <div className="hidden sm:inline-block bubble"> 
                        {botMessage} 
                    </div>
                </div>
                :
                    
                <div className="flex flex-col mx-[1rem] mt-[2rem] h-[65vh]">
                    <Avatar emotion={emotion} emoCount={animCount} zoom="body" model="qt" /> 
                    <div className="text-3xl font-extrabold mt-[4rem] mx-[2rem] overflow-y-auto hidden-scrollbar h-full">
                        {botMessage}
                    </div>
                </div>
            }
        </div>
    </>
    )
}

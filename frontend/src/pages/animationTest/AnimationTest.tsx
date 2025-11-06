import { useEffect, useState } from "react";
import Avatar from "../common/avatar/Avatar";

export function AnimationTest() {
    const [botMessage, setBotMessage] = useState("Chat with me!");
    const [animation, setAnimation] = useState();
    const [animCount, setAnimCount] = useState(0);
    const [emotion, setEmotion] = useState("Neutral");

    const [width, setWidth] = useState(window.innerWidth);
    
    function handleWindowSizeChange() {
        setWidth(window.innerWidth);
    }

    useEffect(() => {
        window.addEventListener('resize', handleWindowSizeChange);
        return () => {
            window.removeEventListener('resize', handleWindowSizeChange);
        }
    }, []);

    const isMobile = width <= 768;

    useEffect(() =>{
        const mapAnim = {
            Happy: "DANCE",
            Sad: "SHAKE NO",
            Surprised: "EMBARRASSED",
            Scared: "SHAKE NO",
            Angry: "EMBARRASSED",
            Neutral: "HEAD TILT",
        };
        const mapMsg = {
            Happy: "This is a happy message!",
            Sad: "This is a sad message.",
            Surprised: "This is a surprised message!",
            Scared: "This is a scared message.",
            Angry: "This is an angry message.",
            Neutral: "This is a neutral message.",
        }
        const animVal = mapAnim[emotion] || "NOD YES";
        const msgVal = mapMsg[emotion] || "This is a neutral message.";
        setAnimation(animVal);
        setBotMessage(msgVal);
        setAnimCount((t) => t + 1);
    }, [emotion])

    return (
    <>
        <select 
            onChange={(e) => setEmotion(e.target.value)} 
            className={`p-2 border-1 border-solid border-gray-400 rounded-lg mt-[1rem] bg-red-50 text-center text-xl hover:cursor-pointer`}
            defaultValue="select"
        >
            <option value="select" disabled>Choose An Emotion</option>
            <option value="Happy">Happy</option>
            <option value="Sad">Sad</option>
            <option value="Suprrised">Surprised</option>
            <option value="Scared">Scared</option>
            <option value="Angry">Angry</option>
            <option value="Neutral">Neutral</option>
        </select>
        <div className="flex flex-col justify-between h-[85vh]">
            {!isMobile ? 
                <div className="flex flex-row justify-center h-[70vh] m-[1rem]">
                    <div className="sm:w-1/5" />
                    <div className="mt-[1rem] w-full sm:w-1/2"> 
                        <Avatar animation={animation} animCount={animCount} /> 
                    </div> 
                    <div className="hidden sm:inline-block bubble"> 
                        {botMessage} 
                    </div>
                </div>
                :
                    
                <div className="flex flex-col mx-[1rem] mt-[2rem] h-[65vh]">
                    <Avatar animation={animation} animCount={animCount} />
                    <div className="text-3xl font-extrabold mt-[4rem] mx-[2rem] overflow-y-auto hidden-scrollbar h-full">
                        {botMessage}
                    </div>
                </div>
            }
        </div>
    </>
    )
}

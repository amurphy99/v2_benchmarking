import { useState    } from "react";
import { useNavigate } from "react-router-dom";
import { BsPlayCircle, BsPauseCircle, BsStopCircle } from "react-icons/bs";

import useLiveChat   from "@/hooks/useLiveChat";
import LiveChatView  from "./components/LiveChatView";
import SaveChatModal from "@/components/modals/SaveChatModal";

import { LocalChatMessage, useLocalChatSession } from "@/hooks/live-chat";
import Avatar from "../common/avatar/Avatar";
import { Spinner } from "react-bootstrap";


// ====================================================================
// Chat
// ====================================================================
// ToDo: Move speech providers folder to utils, fix the index
// ToDo: Might need to add the user/token stuff to the websocket
export function Chat( {isMobile} : {isMobile: boolean}) {
    const navigate = useNavigate();
    const [botMessage, setBotMessage] = useState(<>Chat with me!</>);
    const [animation, setAnimation] = useState();
    const [animCount, setAnimCount] = useState(0);

    // Local (frontend, view-related only) chat tracking
    const { pushMessage, session } = useLocalChatSession();
    const onUserUtterance   = (text: string) => { 
        pushMessage("user",      text); 
        setBotMessage( 
            <div className="flex flex-row gap-2 justify-center">
                <Spinner animation="grow" />
                <Spinner animation="grow" />
                <Spinner animation="grow" />
            </div>
        );
    };
    const onSystemUtterance = (text: string) => { 
        pushMessage("assistant", text); 
        setBotMessage(<>{text}</>)
    };
    // Happy, Sad, Surprised, Scared, Angry, Neutral
    const onEmotion = (emotion: string) => {
        const map = {
            Happy: "DANCE",
            Sad: "SHAKE NO",
            Surprised: "EMBARRASSED",
            Scared: "SHAKE NO",
            Angry: "EMBARRASSED",
            Neutral: "HEAD TILT",
        };
        const value = map[emotion] || "NOD YES";
        setAnimation(value);
        setAnimCount((t) => t + 1);
    }

    // Live-chat hook
    const { start, stop, save } = useLiveChat({ onUserUtterance, onSystemUtterance, onScores: () => {}, onEmotion});
    
    // Separate recording flag that we control ourselves
    const [recording, setRecording ] = useState(false);
    const startChat = () => {
		start();
		setRecording(true);
	};
	const pauseChat = () => {
		stop();
		setRecording(false);
	};

    // Modal control
    const [showModal, setShowModal] = useState(false);
    const endChatModal = () => {
		setShowModal(true);
		if (!recording) {
			pauseChat();
		}
	};
	const saveChat = () => {
		save();
		setShowModal(false);
		navigate("/goal");
	}; // use the stop speaking callback

    // --------------------------------------------------------------------
    // Return UI elements
    // --------------------------------------------------------------------
    const stopStyle = "flex flex-col gap-2 items-center";
    return (
    <>
        <div className="flex flex-col justify-between h-[85vh]">
            {/* View of the chatHistory and/or Avatar */}
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

            {/* Buttons for starting/pausing the chat & saving the chat history/ending the chat */}
            <div className={`flex flex-row mb-[5rem] mx-[20vw] gap-[4em] justify-${isMobile ? "between" : "center"}`}>
                <RecordButton recording={recording} stopRecording={pauseChat} startRecording={startChat}/>
                <button className={stopStyle} onClick={endChatModal}> <BsStopCircle size={"8vh"} color={"black"} /> End Chat </button>
            </div>
        </div>
        

        {/* SaveChatModal, controlled with props */}
        <SaveChatModal show={showModal} onClose={() => setShowModal(false)} saveChat={saveChat}/>

    </>
    );
}


// Returns the Play or Pause buttons
function RecordButton({ recording, stopRecording, startRecording } : { recording: boolean, stopRecording: () => void, startRecording: () => void }) {
    const style = "flex flex-col gap-2 items-center";

    const icon    = recording ? <BsPauseCircle size={"8vh"} style={{color: "black"}}/> : <BsPlayCircle size={"8vh"} style={{color: "black"}}/>;
    const text    = recording ? "Pause Chat" : "Start Chat";
    const onClick = recording ? stopRecording : startRecording;

    return <button className={style} onClick={onClick}> {icon} {text} </button>;
}

const default_message = `Chat with me!`;
export function getRecentMessage(messages: LocalChatMessage[], fallback = default_message): string {
    const latest = messages.reduce<LocalChatMessage | null>((acc, m) => {
        if (m.role !== "assistant") return acc; // skip
        return !acc || m.ts > acc.ts ? m : acc; // keep newer
    }, null);
    return latest ? latest.content : fallback;
}
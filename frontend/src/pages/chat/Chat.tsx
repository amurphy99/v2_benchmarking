import { useState    } from "react";
import { useNavigate } from "react-router-dom";
import { BsPlayCircle, BsPauseCircle, BsStopCircle } from "react-icons/bs";

import useLiveChat   from "@/hooks/useLiveChat";
import LiveChatView  from "./components/LiveChatView";
import SaveChatModal from "@/components/modals/SaveChatModal";

import { useLocalChatSession } from "@/hooks/live-chat";


// ====================================================================
// Chat
// ====================================================================
// ToDo: Move speech providers folder to utils, fix the index
// ToDo: Might need to add the user/token stuff to the websocket
export function Chat() {
    const navigate = useNavigate();

    // Local (frontend, view-related only) chat tracking
    const { pushMessage, session } = useLocalChatSession();
    const onUserUtterance   = (text: string) => { pushMessage("user",      text); };
    const onSystemUtterance = (text: string) => { pushMessage("assistant", text); };

    // Live-chat hook
    const { start, stop, save } = useLiveChat({ onUserUtterance, onSystemUtterance, onScores: () => {} });
    
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
		navigate("/progress");
	}; // use the stop speaking callback


    // --------------------------------------------------------------------
    // Return UI elements
    // --------------------------------------------------------------------
    const stopStyle = "flex flex-col gap-2 items-center";
    return (
    <>
        {/* View of the chatHistory and/or Avatar */}
        <LiveChatView messages={session.messages}/> 

        {/* SaveChatModal, controlled with props */}
        <SaveChatModal show={showModal} onClose={() => setShowModal(false)} saveChat={saveChat}/>

        {/* Buttons for starting/pausing the chat & saving the chat history/ending the chat */}
        <div className="flex flex-row justify-center mb-[1em] pt-[5vh] gap-[4em] items-center">
            <RecordButton recording={recording} stopRecording={pauseChat} startRecording={startChat}/>
            <button className={stopStyle} onClick={endChatModal}> <BsStopCircle size={50} color={"black"} /> End Chat </button>
        </div>

    </>
    );
}


// Returns the Play or Pause buttons
function RecordButton({ recording, stopRecording, startRecording } : { recording: boolean, stopRecording: () => void, startRecording: () => void }) {
    const style = "flex flex-col gap-2 items-center";

    const icon    = recording ? <BsPauseCircle size={50} style={{color: "black"}}/> : <BsPlayCircle size={50} style={{color: "black"}}/>;
    const text    = recording ? "Pause Chat" : "Start Chat";
    const onClick = recording ? stopRecording : startRecording;

    return <button className={style} onClick={onClick}> {icon} {text} </button>;
}

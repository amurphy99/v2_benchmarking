import { ChatSession } from "@/api";
import { blockStyle } from "@/utils/styling/sharedStyles";

export default function ChatLengthCard({role, sessions, type} : {role: string, sessions: ChatSession[], type: "Average" | ""}) {
    const duration = ((sessions.reduce((acc, session) => acc + session.duration, 0) / sessions.length) / 60);
        if (window.isMobile) {
            return (
            <div className={blockStyle}>
                <h2 className={`${role}-text`}>{type} Chat Length</h2>
                <div className="flex flex-row text-lg">
                    <b>{type} Total Length</b>
                    <p className="text-right ml-auto">{duration.toFixed(2)} mins </p>
                </div>
                <div className="flex flex-row text-lg">
                    <b>{type} Time Spent Speaking</b>
                    <p className="text-right ml-auto">{(duration / 2).toFixed(2)} mins</p>
                </div>
            </div>
        )
        } else {
            return (
                <div className={blockStyle}>
                    <h2 className={`${role}-text`}>{type} Chat Length</h2>
                    <div className="mt-[5rem]">
                        <div className="flex flex-col text-lg text-center">
                            <b>{type} Total Length</b>
                            <p>{duration.toFixed(2)} mins </p>
                        </div>
                        <div className="flex flex-col text-lg text-center">
                            <b>{type} Time Spent Speaking</b>
                            <p>{(duration / 2).toFixed(2)} mins</p>
                        </div>
                    </div>
                </div>
            )
        }
    }
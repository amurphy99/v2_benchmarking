import { ChatMessage, ChatSession } from "@/api";
import MyWordCloud from "./WordCloud";
import { ChatWeek } from "@/utils/functions/getChatWeeks";
import { blockStyle } from "@/utils/styling/sharedStyles";

export function TopicsCard( { messages, type, role } : { messages: ChatMessage[], type: string, role: string } ) {
    return (
        <div className={blockStyle}>
            <h2 className={`${role}-text`}>{type} Topics</h2>
            <p className="text-lg">The larger the font size, the more frequently you talked about it during chats.</p>
            <div className="h-fit w-full place-self-center rounded-lg">
                <MyWordCloud messages={messages} />
            </div>
        </div>
    )
}
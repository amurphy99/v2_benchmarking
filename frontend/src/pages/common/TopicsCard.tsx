import MyWordCloud from "./WordCloud";
import { blockStyle } from "@/utils/styling/sharedStyles";

export function TopicsCard( { topics, type, role } : { topics: string[], type: string, role: string } ) {
    return (
        <div className={blockStyle}>
            <h2 className={`${role}-text`}>{type} Topics</h2>
            <p className="text-lg">The larger the font size, the more frequently you talked about it during chats.</p>
            <div className="h-fit w-full md:w-3/4 place-self-center rounded-lg">
                <MyWordCloud topics={topics} />
            </div>
        </div>
    )
}
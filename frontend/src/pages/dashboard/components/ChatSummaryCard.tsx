import { useNavigate } from "react-router-dom";
import { ChatSession } from "@/api";
import { dateFormat  } from "@/utils/styling/numFormatting";

// --------------------------------------------------------------------
// Overall Condition
// --------------------------------------------------------------------
function overallCondition() {
    // ToDo: Finish this function for this section of the card
    const compared = {
        "improved": ["Anomia",        "Turntaking"    ],
        "declined": ["Pragmatic",     "Prosody"       ],
        "steady"  : ["Pronunciation", "AlteredGrammar"],
    };
    const suggested = ["Mad Libs", "Word Matching"];

    return (
    <>    
        <br/>
        <div><b>Overall Condition:</b></div>
        <div><b className="text-green-500"> Improved:   </b> {compared.improved.join(", ")}</div>
        <div><b className="text-red-500"  > Declined:   </b> {compared.declined.join(", ")}</div>
        <div><b className="text-gray-500" > Maintained: </b> {compared  .steady.join(", ")}</div>
        <br/>
        <div><b>Suggested activities: </b>{suggested.join(", ")}</div>
    </>
    );
}


// ====================================================================
// ChatSummaryCard
// ====================================================================
// "toChatDetails" navigates to the details page but includes the chatSession object
export default function ChatSummaryCard({ chatSession }: { chatSession: ChatSession }) {
    const navigate = useNavigate();
    const toChatDetails = () => { navigate("/chatDetails", { state: { chatSession } }) };

    // Setup
    const duration = Math.ceil(chatSession.duration / 60);
    const date  = new Date(chatSession.date);

    // Style
    const chatCardStyle = "border-1 p-[2rem] border-gray-300 rounded w-full hover:shadow-xl";
    const durationStyle = "flex md:flex-row float-right ml-auto";

    // Return UI component
    return (
    <div className="flex" key={chatSession.id}>
        <button className={chatCardStyle} onClick={toChatDetails}>
            <div className="flex flex-row gap-4">
                <div className="flex flex-col gap-1 items-start text-left">
                    <h4>{dateFormat.format(date)}</h4>
                    <div><b>Topics covered:</b> {chatSession.topics?.join(", ")}</div>
                    {overallCondition()}
                </div>
                <div className={durationStyle}> <p><b>{duration}</b> minutes</p> </div>
            </div>
        </button>
    </div>
    );
}

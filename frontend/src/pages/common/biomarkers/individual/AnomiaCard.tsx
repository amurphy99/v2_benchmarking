import { Popover } from "react-bootstrap";

export default function AnomiaCard() {

    return (
    <div className="d-flex flex-col m-[1rem] w-[33vw]">
        <span className="fs-5 fw-semibold"> Anomia Score </span>
        <span> Anomia, also known as anomic aphasia, is a language disorder characterized by difficulty finding the right words, particularly nouns and verbs, during speech [Google AI overview]. </span>
        
        <div className="d-flex flex-col pt-[1rem] gap-[1rem]">
            <span> <b> Status: </b> Your score decreased slightly from where it was last week. </span>

            <span> <b> Suggestions: </b> To improve, try doing xyz, or playing xyz game. During conversations, make sure to xyz. </span>
        </div>
    
    </div>
    );
}


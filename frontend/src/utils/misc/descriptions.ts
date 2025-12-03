import { BiomarkerType } from "@/api";

export interface Message {
    sender  : string,
    text    : string
}

const biomarkerDetails = {
    "anomia": {
        "name": "Anomia",
        "description": "Ability to Find Words",
        "definition": `Forgetting words or phrases. For example, when people go "uh" "mmm" while trying to think of what they want to say.`,
        "exemplarExample": [
            {"sender": "A", "text": "I was at the store yesterday, and I bought a jacket."},
            {"sender": "B", "text": "Oh, nice! Did you find anything else?"},
            {"sender": "A", "text": "Yeah, I also picked up some groceries while I was there."}
        ],
        "flaggedExample": [
            {"sender": "A", "text": "I was at the uh... you know, the place where they sell clothes... and I got a, um, a thing to wear."},
            {"sender": "B", "text": "Do you mean the store?"},
            {"sender": "A", "text": "Yes! That's it! The store. I was at the store, and, uh... I bought, um, the thing I needed." }
        ],
    },
    "alteredgrammar": {
        "name": "Altered Grammar",
        "description": "Sentence Complexity",
        "definition": "Reduced syntactic complexity, such as using simpler language structures instead of more complex ones.",
        "exemplarExample": [
            {"sender": "A", "text": "I went to the store this morning to pick up a few things, including some bread, milk, and vegetables. I also grabbed a few snacks because I was craving something."},
            {"sender": "B", "text": "Sounds like a good shopping trip! Did you also buy milk?"},
            {"sender": "A", "text": "Yes, I did! The store had my favorite kind of milk, and I also found some new items I hadn't seen before."}
        ],
        "flaggedExample": [
            {"sender": "A", "text": "I went to the store. It was this morning. I bought bread."},
            {"sender": "B", "text": "Oh, okay! Did you also get milk?"},
            {"sender": "A", "text": "Yes. I bought milk."}
        ],
    },
    "pronunciation": {
        "name": "Pronunciation",
        "description": "Ability to Pronounce Clearly",
        "definition": "Slurring words, or mispronouncing things.",
        "exemplarExample": [
            {"sender": "A", "text": "I just finished reading that book you recommended. It was really interesting!"},
            {"sender": "B", "text": "Oh, I'm glad you liked it! What was your favorite part?"},
            {"sender": "A", "text": "I think the character development was really well done. I felt like I could relate to them."}
        ],
        "flaggedExample": [
            {"sender": "A", "text": "I ju... jush finis... f-finishe... r-r-reading th-tha... th-thaht... b-b-book you... recc... r-r... r-recommended..."},
            {"sender": "B", "text": "It sounds like you're having a bit of trouble. Are you okay?"},
            {"sender": "A", "text": "Y-y-yeah... jusht... jusht tired, is all."}
        ],
    },
    "pragmatic": {
        "name": "Pragmatic",
        "description": "Staying on Topic",
        "definition": "A lack of using the proper contextual language, such as metaphors, saracasm, politeness, or context-dependent words or phrases.",
        "exemplarExample": [
            {"sender": "A", "text": "Could you pass me the pen, please? I need it to fill out these forms."},
            {"sender": "B", "text": "Here it is. What forms do you need to fill out?"},
            {"sender": "A", "text": "<em>Taxes.</em> Super fun, right?"}
        ],
        "flaggedExample": [
            {"sender": "A", "text": "Give me the pen. I need to fill this out."},
            {"sender": "B", "text": "Here's your pen. What forms do you need to fill out?"},
            {"sender": "A", "text": "What forms? Which forms?"}
        ],
    },
    "prosody": {
        "name": "Prosody",
        "description": "Changing Tones",
        "definition": "Using incorrect patterns of stress and intonation in spoken language, such as pitch variation, loudness, tempo, and pauses.",
        "exemplarExample": [
            {"sender": "A", "text": "I saw my daughter's <em>adorable</em> dog yesterday! He's grown up <em>so</em> much."},
            {"sender": "B", "text": "That's cute! Did you have a good time?"},
            {"sender": "A", "text": "I had a <em>great</em> time!"}
        ],
        "flaggedExample": [
            {"sender": "A", "text": "I visited my dog yesterday. It was really fun and exciting."},
            {"sender": "B", "text": "Oh, wonderful! Did you have a good time?"},
            {"sender": "A", "text": "Of course. I really love my dog."}
        ],
    },
    "turntaking": {
        "name": "Turn Taking",
        "description": "Interrupting Others",
        "definition": "Speaking at the incorrect time; either interrupting or leaving long silences in a conversation.",
        "exemplarExample": [
            {"sender": "A", "text": "How many birds did you see yesterday?"},
            {"sender": "B", "text": "I think I counted twelve. I particularly liked seeing the blue jay."},
            {"sender": "A", "text": "I liked the blue jay too!"}
        ],
        "flaggedExample": [
            {"sender": "A", "text": "How many birds did you see yesterday?"},
            {"sender": "B", "text": "Well, I counted--"},
            {"sender": "A", "text": "I loved watching the...birds. They were pretty."}
        ],
    },
}

export function getBiomarkerName(biomarker: BiomarkerType) : string {
    return biomarkerDetails[biomarker].name;
}

export function getBiomarkerDescription(biomarker: BiomarkerType) : string {
    return biomarkerDetails[biomarker].description;
}

export function getBiomarkerDefinition(biomarker: BiomarkerType) : string {
    return biomarkerDetails[biomarker].definition;
}

export function getBiomarkerExemplar(biomarker: BiomarkerType) : Message[] {
    return biomarkerDetails[biomarker].exemplarExample;
}

export function getBiomarkerFlagged(biomarker: BiomarkerType) : Message[] {
    return biomarkerDetails[biomarker].flaggedExample;
}
export function getAllBiomarkers() : string[] {
    return Object.keys(biomarkerDetails);
}

export function getAllBiomarkerNames() : string[] {
    return Object.values(biomarkerDetails).map( biomarker => biomarker.name );
}

export function getAllBiomarkerDescriptions() : string[] {
    return Object.values(biomarkerDetails).map( biomarker => biomarker.description );
}
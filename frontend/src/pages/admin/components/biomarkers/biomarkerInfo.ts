/* Content of the biomarker info we show on the BiomarkerInfoModal.
--------------------------------------------------------------------------------
Pulls existing copy from `utils/misc/descriptions` (name/short/definition).

TODO: Fill in the "How it's calculated" field for each biomarker as I add each one to the project.
TODO: Maybe add an image to the page with like graphs showing the training?

*/
import {
    getBiomarkerName,
    getBiomarkerDescription,
    getBiomarkerDefinition,
    getAllBiomarkers,
} from "@/utils/misc/descriptions";

export interface BiomarkerInfo {
    type           : string;   // raw key (e.g. "anomia")
    name           : string;   // display name
    shortDesc      : string;   // one-liner
    definition     : string;   // longer explanation
    howCalculated  : string;   // TODO: fill in per-type
}

const HOW_CALCULATED_STUBS: Record<string, string> = {
    // TODO: replace these placeholders with real explanations
    anomia         : "[PLACEHOLDER] Calculated by looking at filler-word density and pause patterns...",
    alteredgrammar : "[PLACEHOLDER] Calculated by comparing lexical and syntactic complexity of utterances against a reference distribution.",
    pronunciation  : "[PLACEHOLDER] Calculated by ...",
    pragmatic      : "[PLACEHOLDER] Calculated by analyzing contextual coherence across utterances.",
    prosody        : "[PLACEHOLDER] Calculated from acoustic features (F0 variance, intensity, tempo) compared against expected ranges.",
    turntaking     : "[PLACEHOLDER] Calculated by ...",
    perplexity     : "[PLACEHOLDER] Compares how similar a participant's speech patterns are with a reference corpus of speech from PLwD.",
};

export function getBiomarkerInfo(type: string): BiomarkerInfo | null {
    try {
        return {
            type,
            name          : getBiomarkerName       (type as any),
            shortDesc     : getBiomarkerDescription(type as any),
            definition    : getBiomarkerDefinition (type as any),
            howCalculated : HOW_CALCULATED_STUBS[type] ?? "Calculation details not yet available.",
        };
    } catch { return null; }
}

export function getAllBiomarkerInfo(): BiomarkerInfo[] {
    return getAllBiomarkers().map(t => getBiomarkerInfo(t)).filter((x): x is BiomarkerInfo => x !== null);
}

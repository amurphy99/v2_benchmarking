
import numpy  as np
import pandas as pd

import logging, os, re
import stanza, pickle, shutil

from nltk.tree  import Tree
from nltk.parse import stanford

from datetime import datetime
from time     import time

from ..biomarker_config import LOG_GRAMMAR


# Configure logging (logging config should only be in config.py ... pretty sure)
#logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


#stanza.download('en', verbose=False)
#nlp = stanza.Pipeline('en')


#STANZA_DIR = "/app/stanza_resources"
#os.makedirs(STANZA_DIR, exist_ok=True)

try:
    # Download English models into this directory
    #stanza.download("en", model_dir=STANZA_DIR, verbose=False)

    # Build pipeline from that directory
    #nlp = stanza.Pipeline("en", dir=STANZA_DIR)
    #logger.info("Stanza English pipeline initialized using %s", STANZA_DIR)

    stanza.download('en', verbose=False)
    nlp = stanza.Pipeline('en')
    logger.info("[STANZA] Stanza English pipeline initialized")

except Exception as e:
    # Do NOT crash the whole backend if stanza fails
    logger.error("[STANZA] Failed to initialize Stanza pipeline: %s", e)
    nlp = None




java_path = shutil.which("java")

if (not java_path):
    java_path = r"C:\Program Files\Java\jdk-22"
os.environ['JAVAHOME'] = java_path
os.environ['JAVA_HOME'] = java_path
# nltk.internals.config_java(bin=java_path)

# Update this path to where you extracted the Stanford Parser
root_path = os.path.dirname(os.path.abspath(__file__))
stanford_parser_path = root_path + "/stanford-parser-full-2020-11-17"

# Set the CLASSPATH environment variable
os.environ['CLASSPATH'] = f"{stanford_parser_path}/stanford-parser.jar;{stanford_parser_path}/stanford-parser-4.2.0-models.jar"

# Set other required environment variables
os.environ['STANFORD_PARSER'] = stanford_parser_path
os.environ['STANFORD_MODELS'] = stanford_parser_path

# Initialize the Stanford Parser
parser = stanford.StanfordParser(model_path=f"{stanford_parser_path}/englishPCFG.ser.gz")



# =======================================================================
# Main function
# =======================================================================
"""
get_altered_grammer_features function will take a list of sentences and the total speech duration
of the sentences and returns the altered grammer score/probility. In the below function it calls calculate_probability
where  the weights of the trained ML model and these features are used to calculate the score.
"""
def generate_grammar_score(list_sentences, speech_duration_seconds):
    start_time = time()
    if LOG_GRAMMAR: logger.info(f"\nGenerating grammar score for {list_sentences} sentences over {speech_duration_seconds:.2f} seconds")

    # Stanza is not available
    if nlp is None: return 1


    if not list_sentences: logger.warning("No sentences provided. Returning default score of 1."); return 1
   
    try:
        # -----------------------------------------------------------------------
        # Extract the syntactic and lexical features needed
        # -----------------------------------------------------------------------
        # Position & tag Features
        coordinated_sentences, subordinated_sentences, reduced_sentences, production_rules, function_words = pos_tags_features(list_sentences)

        POS_end_time = time()
        if LOG_GRAMMAR: logger.info(f"Alt Gram Features 1: {POS_end_time-start_time:.4f} seconds")

        # Predicates calling
        num_predicates              = 0
        immediate_word_repetitions  = 0
        text_character_length       = 0
        num_unique_words            = 0
        num_words                   = 0
        
        for data in list_sentences:
            doc = nlp(data)
            unique_words, words = count_unique_words(data)

            immediate_word_repetitions  += count_immediate_repetitions(data)
            text_character_length       += len(data) # Simply return the length of the text
            num_unique_words            += unique_words
            num_words                   += words
            num_predicates              += count_predicates(doc)

        predicates_end_time = time()
        if LOG_GRAMMAR: logger.info(f"Alt Gram Features 2: {predicates_end_time-POS_end_time:.4f} seconds")

        # -----------------------------------------------------------------------
        # Finish formatting features & run the model
        # -----------------------------------------------------------------------
        extracted_features = np.array([
            # Syntactic Features
            coordinated_sentences, subordinated_sentences, reduced_sentences, num_predicates, production_rules, 
            # Lexical Features
            function_words, num_unique_words, num_words, text_character_length, immediate_word_repetitions
        ])

        # Features should be per-minute
        extracted_features_per_minute = extracted_features / (speech_duration_seconds / 60)

        # Calculate the altered grammer score
        altered_grammar_score = calculate_probability(extracted_features_per_minute)
        if LOG_GRAMMAR: logger.info(f"Alt Gram Model Ran:  {time()-predicates_end_time:.4f} seconds, Score: {altered_grammar_score:.4f}")

        return altered_grammar_score
    
    except Exception as e:
        logger.error(f"Error in generate_grammar_score: {str(e)}")
        return 1  # Return a default score in case of error



# =======================================================================
# Load in the saved model and scaler
# =======================================================================
def load_model():
    # Get the directory of the current script & construct the path to the pickle files
    current_dir = os.path.dirname(os.path.abspath(__file__))
    pickle_path = os.path.join(current_dir, "grammar_model", "pickle_files")
    logger.debug(f"Looking for pickle files in: {pickle_path}")

    # Check if the directory exists before getting all .pkl files within
    if not os.path.exists(pickle_path): raise FileNotFoundError(f"Directory not found: {pickle_path}")
    model_files = [f for f in os.listdir(pickle_path) if f.endswith('.pkl') and f != 'scaler.pkl']
    
    # Make sure there is at least one model file
    if not model_files: raise FileNotFoundError("No model .pkl files found in the pickle_files directory.")
    
    # Use the first model file found instead of trying to find the most recent
    most_recent_file = model_files[0]
    model_path = os.path.join(pickle_path, most_recent_file)

    # Load in the model
    try:
        if not os.path.exists(model_path): raise FileNotFoundError(f"Model file not found: {model_path}")
        with open(model_path, 'rb') as file: logistic_model = pickle.load(file)
    except Exception as e: logger.error(f"Error loading model from {model_path}: {str(e)}"); raise

    # Load the scaler
    scaler_path = os.path.join(pickle_path, 'scaler.pkl')
    try:
        if not os.path.exists(scaler_path): raise FileNotFoundError(f"Scaler file not found: {scaler_path}")
        with open(scaler_path, 'rb') as file:  scaler = pickle.load(file)
    except Exception as e: logger.error(f"Error loading scaler from {scaler_path}: {str(e)}"); raise

    # Return both the model and the scaler
    return logistic_model, scaler

# -----------------------------------------------------------------------
# Calculate Probability
# -----------------------------------------------------------------------
def calculate_probability(features):
    # Load in the saved model weights & the scaler it used
    logistic_model, scaler = load_model()
    
    # Prepare and scale the features
    features = np.array(features).reshape(1, -1)
    features_scaled = scaler.transform(features)
    
    # Calculate the probability
    try: return logistic_model.predict_proba(features_scaled)[0][1]
    except Exception as e: logger.error(f"Error calculating probability: {str(e)}"); raise
    

# =======================================================================
# 
# =======================================================================
def count_characters(text):
    # Simply return the length of the text
    return len(text)
    

def extract_function_words(tree):
    # Function words POS tags according to Penn Treebank
    function_word_tags = {'CC', 'DT', 'EX', 'IN', 'LS', 'MD', 'PDT', 'POS', 'PRP', 'PRP$', 'RP', 'TO', 'UH', 'WDT', 'WP', 'WP$', 'WRB'}
    return sum(1 for subtree in tree.subtrees() if subtree.label() in function_word_tags)


def extract_tags(tree):
    tag_data = {}

    def traverse(subtree):
        tag = subtree.label()
        if tag not in tag_data:
            tag_data[tag] = {'count': 0, 'words': []}
        tag_data[tag]['count'] += 1
        tag_data[tag]['words'].extend(subtree.leaves())
        
        for child in subtree:
            if isinstance(child, Tree):
                traverse(child)

    traverse(tree)
    return tag_data

# -----------------------------------------------------------------------
# 
# -----------------------------------------------------------------------
# Takes pretty long to run right now
def pos_tags_features(sentences_list):
    coordinated_sentences  = 0
    subordinated_sentences = 0
    reduced_sentences      = 0
    production_rules       = 0
    function_words         = 0
    
    for data in sentences_list:
        sentences = parser.raw_parse_sents([data])
        for line in sentences:
            for sentence in line:
                tree = Tree.fromstring(str(sentence))

                # Extract tag data
                tag_data = extract_tags(tree)

                coordinated_sentences  +=  tag_data.get("CC",  {}).get("count", 0)
                subordinated_sentences +=  tag_data.get("S",   {}).get("count", 0)
                reduced_sentences      += (tag_data.get("VBG", {}).get("count", 0) + tag_data.get("VBN", {}).get("count", 0))

                production_rules += extract_production_rules(tree)
                function_words   += extract_function_words  (tree)
    
    print()
    return coordinated_sentences, subordinated_sentences, reduced_sentences, production_rules, function_words
#------------------------------------------------------------------#------------------------------------------------------------------

# Counts Predicates

# Function to count predicates
def count_predicates(doc):
    predicate_count = 0
    
    for sentence in doc.sentences:
        for word in sentence.words:
            if word.upos == 'VERB':
                for dep in sentence.dependencies:
                    if (dep[0].id == word.id or dep[2].id == word.id) and dep[1] in {'nsubj', 'obj', 'iobj', 'ccomp', 'xcomp'}:
                        # print('Matching dependency:', dep)
                        predicate_count += 1
                        break  # Count each predicate only once
    return predicate_count


#------------------------------------------------------------------#------------------------------------------------------------------


def extract_production_rules(tree):
    # Extract the production rules from the tree
    productions = tree.productions()
    
    # Convert to a set to ensure uniqueness
    unique_productions = set(productions)
    
    # Define symbols to remove
    symbols_to_remove = { ',', '.'}
    
    # Filter out productions containing the specified symbols
    filtered_productions = {rule for rule in unique_productions if not any(symbol in str(rule) for symbol in symbols_to_remove)}
    
    return len(filtered_productions)

#------------------------------------------------------------------#------------------------------------------------------------------


def tokenize(text):
    """Tokenize the text into words."""
    return re.findall(r'\b\w+\b', text.lower())

def count_unique_words(text):
    """Count the total number of unique words in the text,
       excluding immediately repeated words."""
    words = tokenize(text)
    unique_words = set()

    
    # Iterate through the words and count unique words
    for i, word in enumerate(words):
        unique_words.add(word)

    return len(unique_words), len(words)


#------------------------------------------------------------------#------------------------------------------------------------------


def remove_commas_and_periods(text):
    # Remove commas and periods using regular expressions
    text = re.sub(r'[,.]', '', text)
    return text


def count_immediate_repetitions(text):
    text = remove_commas_and_periods(text)
    # Split the text into words
    words = text.split()


    # Initialize counter for immediate repetitions
    repetitions = 0

    # Iterate through the words, comparing each word with the next word
    for i in range(len(words)-1):

        if words[i] == words[i + 1]:
            
            repetitions += 1

    return repetitions


# run the generate grammar score function using main function

# if __name__ == "__main__":
#     sample_sentences = ["hi, what's up what you are doing?", "yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't","yeah. and realistically, like, yeah, like it hurts but doesn't"]
#     duration = 10
#     grammer_scores = generate_grammar_score(sample_sentences, duration)

#     print(grammer_scores)

"""
Get a set of "topics" for a conversation
--------------------------------------------------------------------------------
`backend.chat_app.services.chat_info.topicHelpers`

Finds the most common non-stopwords from the user during the chat.

Currently used in offline/local mode when we don't have access to LLM-based
topic extraction. 

"""
# NLTK setup
import nltk
nltk.download('vader_lexicon')
nltk.download('stopwords')
nltk.download('punkt_tab')

from nltk.tokenize import word_tokenize
from nltk.corpus   import stopwords
from collections   import Counter

# Constants
ENGLISH_STOPWORDS = set(stopwords.words("english"))
NUM_TOPICS        = 4  # number of topics to get by default

# --------------------------------------------------------------------------------
# Find N topics from a conversation
# --------------------------------------------------------------------------------
def get_topics(message_text: str, n_topics: int = NUM_TOPICS) -> list[str]:
    """
    'message_text' => string of concatenated user messages 
    """
    # Tokenize the given text
    tokens = word_tokenize(message_text)

    # Cast all tokens to lowercase and remove  stopwords
    alpha_lower_tokens = [word.lower() for word in tokens             if (word.isalpha()) and (len(word) > 3)]
    alpha_no_stopwords = [word         for word in alpha_lower_tokens if (word not in ENGLISH_STOPWORDS     )]

    # Count the number of times each word appears and take the top N
    counts = Counter(alpha_no_stopwords)
    topics = [word[0] for word, _ in counts.most_common(n_topics)]
    return topics

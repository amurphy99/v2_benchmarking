# ================================================================================
# Logging Utilities
# ================================================================================
RESET = '\033[0m'

# Standard (Dark) Colors
BLACK    = '\033[30m'
RED      = '\033[31m'
GREEN    = '\033[32m'
YELLOW   = '\033[33m'
BLUE     = '\033[34m'
MAGENTA  = '\033[35m'
CYAN     = '\033[36m' # we were using bright cyan here before
WHITE    = '\033[37m'

# Bright Colors
BRIGHT_GREY     = '\033[90m'
BRIGHT_RED      = '\033[91m'
BRIGHT_GREEN    = '\033[92m'
BRIGHT_YELLOW   = '\033[93m'
BRIGHT_BLUE     = '\033[94m'
BRIGHT_MAGENTA  = '\033[95m'
BRIGHT_CYAN     = '\033[96m'
BRIGHT_WHITE    = '\033[97m'

# Extended Colors
ORANGE       = '\033[38;5;208m'
PINK         = '\033[38;5;205m'
TEAL         = '\033[38;5;51m'
GOLD         = '\033[38;5;220m'
PURPLE       = '\033[38;5;93m'
LIME         = '\033[38;5;154m'
SKY_BLUE     = '\033[38;5;39m'

# Formatting
BOLD         = '\033[1m'
DIM          = '\033[2m'
ITALIC       = '\033[3m'
UNDERLINE    = '\033[4m'
BLINK        = '\033[5m'
REVERSE      = '\033[7m'

# Background Colors
BG_BLACK    = "\033[40m"
BG_RED      = "\033[41m"
BG_GREEN    = "\033[42m"
BG_YELLOW   = "\033[43m"
BG_BLUE     = "\033[44m"
BG_MAGENTA  = "\033[45m"
BG_CYAN     = "\033[46m"
BG_WHITE    = "\033[47m"

# Bright Background Colors
BG_BRIGHT_MAGENTA = "\033[0;105m"
BG_BRIGHT_GREEN   = "\033[0;102m"

# --------------------------------------------------------------------------------
# Horizontal line break
# --------------------------------------------------------------------------------
HLINE   = "-----------------------------------------------------------------------"

# Colored line breaks
RLINE_1 = f"\n{RED}{HLINE}{RESET}\n"
RLINE_2 = f"\n{RED}{HLINE}{RESET}"

Y_LINE_1 = f"\n{YELLOW}{HLINE}{RESET}\n"
Y_LINE_2 = f"\n{YELLOW}{HLINE}{RESET}"


# --------------------------------------------------------------------------------
# Specific presets TODO: These are hideous...
# --------------------------------------------------------------------------------
USER_MSG = f"{RESET}{BG_BRIGHT_GREEN  }"
ROBO_MSG = f"{RESET}{BG_BRIGHT_MAGENTA}"

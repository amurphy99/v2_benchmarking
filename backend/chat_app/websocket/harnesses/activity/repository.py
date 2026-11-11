"""Read authoritative activity instructions from the main database."""
from channels.db import database_sync_to_async

from chat_app.models import Activity, RAGInstructions

from .state_specs import START_SCENARIO, STATE_SPECS


@database_sync_to_async
def load_definition(activity_name: str) -> list[dict]:
    """Load and validate ordered activity instructions from the main database.

    Args:
        activity_name (str): Activity.name identifying the instruction set.

    Returns:
        list[dict]: Rows containing name, description, and instructions, sorted
        by instruction_order and name. Callers await the decorated function.

    Raises:
        Activity.DoesNotExist: No activity matches the supplied name.
        ValueError: Rows are empty, start in the wrong state, or include a state
            without a corresponding STATE_SPECS entry.
    """
    activity = Activity.objects.get(name=activity_name)

    rows = list(
        RAGInstructions.objects
        .filter(activity=activity)
        .order_by("instruction_order", "name")
        .values("name", "description", "instructions")
    )

    unknown = {row["name"] for row in rows} - STATE_SPECS.keys()

    if not rows or rows[0]["name"] != START_SCENARIO or unknown:
        raise ValueError(
            "Invalid activity states; configure STATE_SPECS for: "
            f"{sorted(unknown)}"
        )

    return rows

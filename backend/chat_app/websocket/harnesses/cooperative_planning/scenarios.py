"""
Planning scenario files: the event, the items to agree on, and each side's constraints.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.scenarios`

Each variant is one file, `scenarios/<variant>.json`:

    description   Where the scenario comes from
    title         The heading on the participant's card ("Plan a dinner party")
    event         What the two of them are planning, worded to follow "planning" ("a dinner party")
    opening_line  The avatar's first words
    closing_line  Its last words, once the participant approves the whole plan
    items         The things to agree on, in order: {id, label, also_called?}
    participant   {constraints: [{id, text}, ...]}: printed on the participant's card
    avatar        {constraints: [{id, text}, ...]}: the avatar's own, in its prompts

The participant's constraints are never put in a prompt: the avatar learns them
only when the participant says them. `also_called` lists other names the
participant might use for an item ("entree" for "Main course"), for the cues.
Every id is lowercase letters, digits, and underscores, and differs from the
others of its kind.

"""
from __future__ import annotations
from pathlib    import Path
from typing     import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError, model_validator

# Where each variant's scenario file lives
PLANNING_SCENARIOS_DIR = Path(__file__).parent / "scenarios"

# An id the plan, the prompts, and the cues use
ScenarioId = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]*$")]

# Text from the file, trimmed and never empty
ScenarioText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


# --------------------------------------------------------------------------------
# Scenario Types
# --------------------------------------------------------------------------------
# Every part of a scenario is fixed once loaded, and refuses keys it doesn't know
class _ScenarioPart(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

# One thing the two sides have to agree on
class PlanItem(_ScenarioPart):
    id          : ScenarioId
    label       : ScenarioText                  # How the card and the avatar name it ("Main course")
    also_called : tuple[ScenarioText, ...] = ()  # Other names the participant might use ("entree")

    # Every name to listen for, lowercase, the label first
    @property
    def names(self) -> tuple[str, ...]:
        return (self.label.lower(), *(name.lower() for name in self.also_called))

# One private constraint, worded to the side that has it ("Your oven is broken.")
class Constraint(_ScenarioPart):
    id   : ScenarioId
    text : ScenarioText

# One side's private constraints
class PlanSide(_ScenarioPart):
    constraints : tuple[Constraint, ...] = Field(min_length=1)

# One whole scenario file
class Scenario(_ScenarioPart):
    description  : ScenarioText
    title        : ScenarioText
    event        : ScenarioText
    opening_line : ScenarioText
    closing_line : ScenarioText
    items        : tuple[PlanItem, ...] = Field(min_length=1)
    participant  : PlanSide
    avatar       : PlanSide

    # Item ids differ from each other, and constraint ids differ across both sides
    @model_validator(mode="after")
    def ids_are_unique(self) -> Self:
        item_ids       = [item.id for item in self.items]
        constraint_ids = [constraint.id for constraint in (*self.participant.constraints, *self.avatar.constraints)]
        if len(set(item_ids)) != len(item_ids):             raise ValueError("every item id must be different")
        if len(set(constraint_ids)) != len(constraint_ids): raise ValueError("every constraint id must be different, on both sides")
        return self

    # The item ids, in order
    @property
    def item_ids(self) -> tuple[str, ...]:
        return tuple(item.id for item in self.items)

    # The avatar's own constraint ids, in order
    @property
    def avatar_constraint_ids(self) -> tuple[str, ...]:
        return tuple(constraint.id for constraint in self.avatar.constraints)


# ================================================================================
# Load a Scenario File
# ================================================================================
# Read one variant's scenario file, refusing anything a chat couldn't use
def load_scenario(variant: str) -> Scenario:
    """
    The harness loads every variant at import, so a broken scenario file stops the
    backend at startup, naming the file and the field at fault, instead of failing
    partway through a session.
    """
    path = PLANNING_SCENARIOS_DIR / f"{variant}.json"
    try:                             return Scenario.model_validate_json(path.read_text(encoding="utf-8"))
    except ValidationError as error: raise ValueError(f"{path.name}: {error}") from error

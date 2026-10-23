"""
Verify cached post-chat analysis resolution for seeded transcript sessions.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_transcript_seed_analysis`

Reference transcript configs may bypass repeated LLM calls, but older configs must
continue using the normal analysis workflow until a cached result is added.

"""
from pathlib  import Path
from unittest import mock

from django.test import SimpleTestCase

# From this project
from chat_app.management.seed_data.transcript import (
    _resolve_post_chat_analysis,
    _validate_post_chat_analysis,
)


# Return one complete cached-analysis object for validation and resolution tests
def _analysis() -> dict[str, object]:
    return {
        "summary"     : "A short summary.",
        "topics"      : ["Family"],
        "sentiment"   : "Positive",
        "emotion"     : "Joy",
        "risk_rating" : 1,
        "risk_quotes" : [],
        "risk_reason" : "No concerning statements were identified.",
    }


# ================================================================================
# Transcript Seed Analysis Tests
# ================================================================================
class TranscriptSeedAnalysisTests(SimpleTestCase):
    # Use a complete cached object without invoking post-chat analysis
    def test_cached_analysis_skips_llm_workflow(self) -> None:
        expected = _analysis()
        config   = {"post_chat_analysis": expected}

        with mock.patch("chat_app.management.seed_data.transcript.post_chat_analysis") as analysis_call:
            result = _resolve_post_chat_analysis(config, [], Path("test_01/transcript_config.json"))

        self.assertEqual(result, expected)
        analysis_call.assert_not_called()

    # Preserve the existing analysis behavior for configs not populated yet
    def test_missing_cached_analysis_uses_llm_workflow(self) -> None:
        expected      = _analysis()
        analysis_call = mock.AsyncMock(return_value=expected)

        with mock.patch("chat_app.management.seed_data.transcript.post_chat_analysis", analysis_call):
            result = _resolve_post_chat_analysis({}, [], Path("test_01/transcript_config.json"))

        self.assertEqual(result, expected)
        analysis_call.assert_awaited_once_with([])

    # Reject incomplete cached data instead of silently seeding partial results
    def test_cached_analysis_requires_every_field(self) -> None:
        incomplete = _analysis()
        incomplete.pop("risk_reason")

        with self.assertRaisesRegex(ValueError, "risk_reason"):
            _validate_post_chat_analysis(incomplete, Path("test_01/transcript_config.json"))


"""
Helper functions for processing seed data and loading it into the database.
--------------------------------------------------------------------------------
`backend.chat_app.management.seed_data.csv_processing`

Lenient CSV parsing (fill in missing fields; handle typing) & interpolation for
missing word timestamp values. Sometimes some words in an utterance will have
start/end timestamps, but not all. This interpolates the gaps for the ones that
are missing those timestamps.

TODO: Not perfect, but just getting something up for now...

"""

# Last-resort fallback for utterances with no surrounding timestamps to anchor on
WORDS_PER_SECOND_DEFAULT = 2.5   # ~0.4s per word


# --------------------------------------------------------------------------------
# Helper for converting CSV fields to floats
# --------------------------------------------------------------------------------
def to_float(val):
    """
    Empty / missing CSV cell -> None; otherwise float().
    """
    if val in (None, "", "NA", "nan", "NaN"): return None
    try:                                      return float(val)
    except (TypeError, ValueError):           return None

# --------------------------------------------------------------------------------
# Fill all utterance start/end timestamps (interpolate if values are missing)
# --------------------------------------------------------------------------------
def fill_utterance_bounds(utt_metas):
    """
    Given a list of dicts {uid, rows, start, end} in CSV order, fill any None
    start/end values via:
      1) forward pass : missing start <- previous utt's end
      2) backward pass: missing end   <- next utt's start
      3) sequential fallback (word-count-based estimation) for any still-None values

    Mutates `utt_metas` in place.
    """
    n = len(utt_metas)

    # 1) Forward pass: propagate prev-end into missing start
    for i in range(n):
        if (utt_metas[i]["start"] is None) and (i > 0) and (utt_metas[i - 1]["end"] is not None):
            utt_metas[i]["start"] = utt_metas[i - 1]["end"]

    # 2) Backward pass: propagate next-start into missing end
    for i in range(n - 1, -1, -1):
        if (utt_metas[i]["end"] is None) and (i < (n - 1)) and (utt_metas[i + 1]["start"] is not None):
            utt_metas[i]["end"] = utt_metas[i + 1]["start"]

    # 3) Sequential fallback: chain from prior utterance, estimating duration by word count
    for i, meta in enumerate(utt_metas):
        if meta["start"] is None:
            meta["start"] = utt_metas[i - 1]["end"] if i > 0 else 0.0
        if meta["end"] is None:
            est_duration = len(meta["rows"]) / WORDS_PER_SECOND_DEFAULT
            meta["end"]  = meta["start"] + max(est_duration, 0.5)


# --------------------------------------------------------------------------------
# Fill in missing word-level start/end times within an utterance
# --------------------------------------------------------------------------------
def interpolate_word_times(rows, utt_start, utt_end):
    """
    Uses `utt_start` and `utt_end` as virtual anchors plus any rows that already
    have valid timestamps. Each missing-timestamp word gets an equal slice of
    the gap between its surrounding anchors. Resolved floats are stored on each
    row under `_start_sec` / `_end_sec` so the caller doesn't have to re-parse.
    """
    n = len(rows)

    # Parse the existing values
    for r in rows:
        r["_start_sec"] = to_float(r.get("start_time"))
        r["_end_sec"]   = to_float(r.get(  "end_time"))

    # Anchor list. Virtual anchors at -1 (utt_start) and n (utt_end).
    # Each tuple is (row_index, time_in, time_out). For the virtual anchors we
    # treat both edges as the same value.
    anchors = [(-1, utt_start, utt_start)]
    for i, r in enumerate(rows):
        if r["_start_sec"] is not None and r["_end_sec"] is not None:
            anchors.append((i, r["_start_sec"], r["_end_sec"]))
    anchors.append((n, utt_end, utt_end))

    # Walk consecutive anchors and fill the words between them
    for a, b in zip(anchors, anchors[1:]):
        a_idx, _, a_time_out = a
        b_idx, b_time_in, _  = b
        gap_words = b_idx - a_idx - 1
        if gap_words <= 0: continue

        slot = max((b_time_in - a_time_out) / gap_words, 1e-3)
        for j, idx in enumerate(range(a_idx + 1, b_idx)):
            rows[idx]["_start_sec"] = a_time_out + (j    ) * slot
            rows[idx]["_end_sec"]   = a_time_out + (j + 1) * slot



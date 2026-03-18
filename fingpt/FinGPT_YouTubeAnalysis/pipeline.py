import logging

import numpy as np
import pandas as pd

from .scraper import fetch
from .transcript import fetch_transcript, summarize_transcript_for_embedding
from .classifiers import classify_batch
from .relevance import (
    compute_video_anchor,
    score_relevance,
    compute_echo_penalties,
    encode_texts,
)
from .rollup import aggregate_all
from .report import generate_report

logger = logging.getLogger(__name__)

_REQUIRED_COLUMNS = [
    "text", "likes", "reply_count", "author", "published",
    "sentiment_label", "sentiment_score",
    "emotion_label",
    "political_label", "political_score",
    "toxicity_score",
    "gender_proxy", "edu_proxy", "vocab_richness",
    "engagement_weight",
    "relevance", "echo_penalty",
]


def run_pipeline(
    url: str,
    max_comments: int = 500,
    dimensions: list[str] = ("political", "socioeconomic", "gender", "emotion"),
    output_format: str = "markdown",
    prefer_api: bool = True,
    include_bias_audit: bool = True,
    relevance_threshold: float = 0.1,
    embedding_model: str = "all-MiniLM-L6-v2",
) -> tuple[str, pd.DataFrame]:
    """
    Full end-to-end pipeline.

    Steps:
      1. Fetch video metadata and raw comments (API or yt-dlp)
      2. Fetch transcript (or None)
      3. Classify comments with NLP models
      4. Score relevance (cosine similarity to video anchor)
      5. Compute echo penalties
      6. Assemble full DataFrame
      7. Aggregate and roll up by dimensions
      8. Generate formatted report

    Returns:
        (report_string, full_annotated_dataframe)
    """
    # 1. Scrape
    logger.info("Step 1/7: Fetching video data from %s", url)
    video_metadata, raw_comments = fetch(url, max_comments=max_comments, prefer_api=prefer_api)
    logger.info(
        "Fetched metadata for '%s' and %d raw comments.",
        video_metadata.get("title", ""), len(raw_comments),
    )

    if not raw_comments:
        logger.warning("No comments found. Returning empty report.")
        empty_df = pd.DataFrame(columns=_REQUIRED_COLUMNS)
        report = generate_report(
            {"global_opinion_score": 0.0, "rollups": {}, "comment_count": 0, "filtered_count": 0},
            video_metadata,
            fmt=output_format,
            include_bias_audit=include_bias_audit,
        )
        return report, empty_df

    # 2. Transcript (independent of classify_batch — can run before it)
    logger.info("Step 2/7: Fetching video transcript.")
    video_id = video_metadata.get("video_id", "")
    transcript_text = fetch_transcript(video_id) if video_id else None
    if transcript_text:
        logger.info("Transcript fetched (%d chars).", len(transcript_text))
    else:
        logger.info("No transcript available; using title + description as anchor.")

    # 3. Classify comments
    logger.info("Step 3/7: Classifying %d comments.", len(raw_comments))
    annotated_comments = classify_batch(raw_comments, show_progress=True)

    # 4. Relevance scoring
    logger.info("Step 4/7: Computing relevance scores.")
    anchor_transcript = summarize_transcript_for_embedding(transcript_text) if transcript_text else None
    video_anchor = compute_video_anchor(
        anchor_transcript,
        video_metadata.get("title", ""),
        video_metadata.get("description", ""),
        model_name=embedding_model,
    )
    comment_texts = [c.get("text", "") for c in annotated_comments]
    relevance_scores = score_relevance(comment_texts, video_anchor, model_name=embedding_model)

    # 5. Echo penalties
    # Sort by engagement_weight descending before computing penalties
    logger.info("Step 5/7: Computing echo penalties.")
    comment_embeddings = encode_texts(comment_texts, model_name=embedding_model)
    engagement_weights = np.array(
        [c.get("engagement_weight", 0.0) for c in annotated_comments], dtype=float
    )
    sort_order = np.argsort(-engagement_weights)  # descending
    sorted_embeddings = comment_embeddings[sort_order]
    echo_penalties_sorted = compute_echo_penalties(sorted_embeddings)

    # Map echo penalties back to original order
    echo_penalties = np.empty(len(annotated_comments))
    for sorted_idx, orig_idx in enumerate(sort_order):
        echo_penalties[orig_idx] = echo_penalties_sorted[sorted_idx]

    # 6. Assemble DataFrame
    logger.info("Step 6/7: Assembling DataFrame.")
    full_df = _assemble_dataframe(annotated_comments, relevance_scores, echo_penalties)

    # 7. Aggregate
    logger.info("Step 7/7: Aggregating results.")
    aggregation_result = aggregate_all(full_df, relevance_threshold=relevance_threshold)

    # Filter rollups to only requested dimensions
    all_rollups = aggregation_result["rollups"]
    filtered_rollups = {
        dim: all_rollups[dim] for dim in dimensions if dim in all_rollups
    }
    aggregation_result["rollups"] = filtered_rollups

    report = generate_report(
        aggregation_result,
        video_metadata,
        fmt=output_format,
        include_bias_audit=include_bias_audit,
    )

    logger.info(
        "Pipeline complete. Global opinion score: %.4f over %d comments.",
        aggregation_result["global_opinion_score"],
        aggregation_result["comment_count"],
    )

    return report, full_df


def _assemble_dataframe(
    annotated_comments: list[dict],
    relevance_scores: np.ndarray,
    echo_penalties: np.ndarray,
) -> pd.DataFrame:
    """
    Merge the annotated comment list and numpy arrays into a single DataFrame.
    Validates that required columns are present; fills missing ones with defaults.
    """
    df = pd.DataFrame(annotated_comments)

    df["relevance"] = relevance_scores
    df["echo_penalty"] = echo_penalties

    # Ensure all required columns exist
    defaults = {
        "text": "",
        "likes": 0,
        "reply_count": 0,
        "author": "",
        "published": "",
        "sentiment_label": "neutral",
        "sentiment_score": 0.0,
        "emotion_label": "neutral",
        "political_label": "unknown",
        "political_score": 0.0,
        "toxicity_score": 0.0,
        "gender_proxy": "unknown",
        "edu_proxy": 0.0,
        "vocab_richness": 0.0,
        "engagement_weight": 0.0,
        "relevance": 0.5,
        "echo_penalty": 0.0,
    }
    for col, default in defaults.items():
        if col not in df.columns:
            logger.warning("Column '%s' missing from DataFrame — filling with default.", col)
            df[col] = default

    return df

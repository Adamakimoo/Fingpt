import logging
from typing import Literal

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

DimensionType = Literal["political", "socioeconomic", "gender", "emotion", "all"]

RELEVANCE_THRESHOLD = 0.1

_DIMENSION_COLUMN_MAP = {
    "political": "political_label",
    "gender": "gender_proxy",
    "emotion": "emotion_label",
}


def compute_opinion_score(df: pd.DataFrame) -> float:
    """
    Compute the global O_D score over all comments in df.

    Formula:
        numerator   = sum(w_i * s_i * r_i / max(echo_penalty_i, 1e-6))
        denominator = sum(w_i * r_i)
        O_D         = numerator / denominator

    Returns 0.0 if denominator is zero (all comments have relevance = 0).
    """
    if df.empty:
        return 0.0

    w = df["engagement_weight"].to_numpy(dtype=float)
    s = df["sentiment_score"].to_numpy(dtype=float)
    r = df["relevance"].to_numpy(dtype=float)
    echo = np.maximum(df["echo_penalty"].to_numpy(dtype=float), 1e-6)

    numerator = np.sum(w * s * r / echo)
    denominator = np.sum(w * r)

    if denominator == 0.0:
        logger.warning("Denominator is zero in compute_opinion_score (all relevance = 0).")
        return 0.0

    return float(numerator / denominator)


def _assign_edu_quartile(df: pd.DataFrame) -> pd.Series:
    """
    Bin df["edu_proxy"] into Q1/Q2/Q3/Q4 quartile labels.
    Returns a Series of group label strings ("Q1", "Q2", "Q3", "Q4").
    Falls back to "Q1" for all rows if all values are identical.
    """
    try:
        return pd.qcut(df["edu_proxy"], q=4, labels=["Q1", "Q2", "Q3", "Q4"]).astype(str)
    except ValueError:
        # All values identical — cannot form 4 quantile bins
        return pd.Series(["Q1"] * len(df), index=df.index)


def rollup_by_dimension(
    df: pd.DataFrame,
    dimension: DimensionType,
) -> pd.DataFrame:
    """
    Group df by the label column for the given dimension and compute
    O_D for each group.

    Returns a DataFrame with columns:
        dimension, group_label, opinion_score, comment_count,
        avg_engagement, avg_relevance, avg_toxicity
    """
    if dimension == "all":
        frames = [
            rollup_by_dimension(df, d)
            for d in ("political", "socioeconomic", "gender", "emotion")
        ]
        return pd.concat(frames, ignore_index=True)

    df = df.copy()

    if dimension == "socioeconomic":
        df["_group"] = _assign_edu_quartile(df)
    else:
        col = _DIMENSION_COLUMN_MAP[dimension]
        df["_group"] = df[col].fillna("unknown").astype(str)

    rows = []
    for group_label, group_df in df.groupby("_group"):
        rows.append({
            "dimension": dimension,
            "group_label": str(group_label),
            "opinion_score": compute_opinion_score(group_df),
            "comment_count": len(group_df),
            "avg_engagement": float(group_df["engagement_weight"].mean()),
            "avg_relevance": float(group_df["relevance"].mean()),
            "avg_toxicity": float(group_df["toxicity_score"].mean()),
        })

    return pd.DataFrame(rows, columns=[
        "dimension", "group_label", "opinion_score",
        "comment_count", "avg_engagement", "avg_relevance", "avg_toxicity",
    ])


def aggregate_all(
    df: pd.DataFrame,
    relevance_threshold: float = RELEVANCE_THRESHOLD,
) -> dict:
    """
    Compute:
      1. Global O_D score
      2. Rollup tables for all four dimensions
      3. Counts of total vs. filtered comments

    Returns a dict with keys:
        "global_opinion_score": float,
        "rollups": dict[str, pd.DataFrame],  # keyed by dimension name
        "comment_count": int,
        "filtered_count": int  # comments with relevance < threshold
    """
    total_count = len(df)
    relevant_df = df[df["relevance"] >= relevance_threshold].copy()
    filtered_count = total_count - len(relevant_df)

    if filtered_count > 0:
        logger.info(
            "Filtered %d / %d comments with relevance < %.2f",
            filtered_count, total_count, relevance_threshold,
        )

    global_score = compute_opinion_score(relevant_df)

    rollups = {}
    for dimension in ("political", "socioeconomic", "gender", "emotion"):
        rollups[dimension] = rollup_by_dimension(relevant_df, dimension)

    return {
        "global_opinion_score": global_score,
        "rollups": rollups,
        "comment_count": len(relevant_df),
        "filtered_count": filtered_count,
    }

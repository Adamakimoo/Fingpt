import io
import json
import logging
from typing import Literal

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

OutputFormat = Literal["json", "csv", "markdown"]

HHI_DOMINANCE_THRESHOLD = 0.6

PROXY_DISCLAIMER = (
    "IMPORTANT: Gender, socioeconomic, and political inferences in this report "
    "are probabilistic proxies derived from username patterns and text readability "
    "metrics. They are NOT identity labels and carry significant uncertainty. "
    "These dimensions are provided for analytical balance auditing only."
)


def compute_hhi(group_scores: pd.Series) -> float:
    """
    Compute the Herfindahl-Hirschman Index over opinion scores.

    HHI = sum((|s_i| / sum(|s_i|))^2) for each group i
    Normalized by dividing by the maximum possible HHI (= 1/N for N equal groups).

    Interpretation:
        HHI near 0: opinion is evenly distributed across groups
        HHI near 1: opinion is dominated by a single group
    Returns 0.0 if all scores are zero.
    """
    scores = group_scores.dropna().to_numpy(dtype=float)
    abs_scores = np.abs(scores)
    total = abs_scores.sum()

    if total == 0.0 or len(scores) == 0:
        return 0.0

    shares = abs_scores / total
    raw_hhi = float(np.sum(shares ** 2))

    n = len(scores)
    # Normalize: max HHI when one group has everything = 1.0
    # Min HHI when all groups equal = 1/N
    # Normalize to [0, 1] by: (raw - 1/N) / (1 - 1/N)
    min_hhi = 1.0 / n
    if n == 1:
        return 1.0

    normalized = (raw_hhi - min_hhi) / (1.0 - min_hhi)
    return float(np.clip(normalized, 0.0, 1.0))


def bias_audit(rollups: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    Compute HHI for each dimension's rollup table.
    Returns a DataFrame with columns:
        dimension, hhi, n_groups, dominant_group, dominant_score
    """
    rows = []
    for dimension, rollup_df in rollups.items():
        if rollup_df.empty:
            continue

        hhi = compute_hhi(rollup_df["opinion_score"])

        dominant_idx = rollup_df["opinion_score"].abs().idxmax()
        dominant_group = rollup_df.loc[dominant_idx, "group_label"]
        dominant_score = float(rollup_df.loc[dominant_idx, "opinion_score"])

        rows.append({
            "dimension": dimension,
            "hhi": round(hhi, 4),
            "n_groups": len(rollup_df),
            "dominant_group": dominant_group,
            "dominant_score": round(dominant_score, 4),
        })

    return pd.DataFrame(rows, columns=[
        "dimension", "hhi", "n_groups", "dominant_group", "dominant_score"
    ])


def format_rollup_table(
    rollup_df: pd.DataFrame,
    fmt: OutputFormat = "markdown",
) -> str:
    """
    Format a single dimension's rollup DataFrame as the requested format.
    """
    if rollup_df.empty:
        return "(no data)"

    display_df = rollup_df.copy()
    for col in ("opinion_score", "avg_engagement", "avg_relevance", "avg_toxicity"):
        if col in display_df.columns:
            display_df[col] = display_df[col].round(4)

    if fmt == "json":
        return display_df.to_json(orient="records", indent=2)

    if fmt == "csv":
        buf = io.StringIO()
        display_df.to_csv(buf, index=False)
        return buf.getvalue()

    # markdown (default)
    return display_df.to_markdown(index=False)


def _interpret_score(score: float) -> str:
    """Convert a numeric O_D score to a plain-language interpretation."""
    if score > 0.5:
        return "strongly positive"
    if score > 0.15:
        return "moderately positive"
    if score > -0.15:
        return "neutral / mixed"
    if score > -0.5:
        return "moderately negative"
    return "strongly negative"


def generate_report(
    aggregation_result: dict,
    video_metadata: dict,
    fmt: OutputFormat = "markdown",
    include_bias_audit: bool = True,
) -> str:
    """
    Top-level report generator.

    Assembles:
      - Video metadata header
      - Global opinion score with plain-language interpretation
      - Per-dimension rollup tables
      - Bias audit section (if include_bias_audit=True)
      - Disclaimer footer

    Returns a single formatted string.
    """
    global_score = aggregation_result.get("global_opinion_score", 0.0)
    rollups = aggregation_result.get("rollups", {})
    comment_count = aggregation_result.get("comment_count", 0)
    filtered_count = aggregation_result.get("filtered_count", 0)

    title = video_metadata.get("title", "Unknown Title")
    channel = video_metadata.get("channel_title", "Unknown Channel")
    view_count = video_metadata.get("view_count", 0)
    published = video_metadata.get("published_at", "")

    lines = []

    if fmt == "markdown":
        lines.append(f"# FinGPT YouTube Comment Analysis Report\n")
        lines.append(f"## Video Information\n")
        lines.append(f"- **Title:** {title}")
        lines.append(f"- **Channel:** {channel}")
        if published:
            lines.append(f"- **Published:** {published[:10]}")
        lines.append(f"- **Views:** {view_count:,}")
        lines.append(f"- **Comments analyzed:** {comment_count}")
        if filtered_count > 0:
            lines.append(f"- **Comments filtered (low relevance):** {filtered_count}")
        lines.append("")

        lines.append(f"## Global Opinion Score\n")
        lines.append(f"**Score:** `{global_score:.4f}` — *{_interpret_score(global_score)}*")
        lines.append("")
        lines.append(
            "> Score range: −1 (strongly negative) to +1 (strongly positive). "
            "Weighted by engagement, relevance to video content, and echo-chamber penalty."
        )
        lines.append("")

        if rollups:
            lines.append("## Opinion by Dimension\n")
            for dimension, rollup_df in rollups.items():
                lines.append(f"### {dimension.capitalize()}\n")
                lines.append(format_rollup_table(rollup_df, fmt=fmt))
                lines.append("")

        if include_bias_audit and rollups:
            audit_df = bias_audit(rollups)
            lines.append("## Bias Audit (Herfindahl-Hirschman Index)\n")
            lines.append(
                "HHI measures concentration of opinion. "
                f"Values above {HHI_DOMINANCE_THRESHOLD} indicate opinion dominated by a single group — interpret with caution.\n"
            )
            lines.append(format_rollup_table(audit_df, fmt=fmt))

            dominated = audit_df[audit_df["hhi"] > HHI_DOMINANCE_THRESHOLD]
            if not dominated.empty:
                lines.append("")
                lines.append("**Concentration warnings:**")
                for _, row in dominated.iterrows():
                    lines.append(
                        f"- ⚠ `{row['dimension']}`: HHI={row['hhi']:.3f} — "
                        f"opinion dominated by group **{row['dominant_group']}** "
                        f"(score={row['dominant_score']:.4f})"
                    )
            lines.append("")

        lines.append("---")
        lines.append(f"*{PROXY_DISCLAIMER}*")
        lines.append("")
        lines.append(
            "*Nothing herein is financial advice. Results reflect comment-section "
            "sentiment only and may not represent the broader population.*"
        )

    elif fmt == "json":
        report_dict = {
            "video": {
                "title": title,
                "channel": channel,
                "published_at": published,
                "view_count": view_count,
            },
            "analysis": {
                "comment_count": comment_count,
                "filtered_count": filtered_count,
                "global_opinion_score": round(global_score, 4),
                "interpretation": _interpret_score(global_score),
            },
            "rollups": {
                dim: json.loads(format_rollup_table(df, fmt="json"))
                for dim, df in rollups.items()
            },
            "disclaimer": PROXY_DISCLAIMER,
        }
        if include_bias_audit and rollups:
            audit_df = bias_audit(rollups)
            report_dict["bias_audit"] = json.loads(
                format_rollup_table(audit_df, fmt="json")
            )
        return json.dumps(report_dict, indent=2)

    elif fmt == "csv":
        # For CSV, produce a simple multi-section text
        sections = [
            "# FinGPT YouTube Comment Analysis Report",
            f"title,{title}",
            f"channel,{channel}",
            f"view_count,{view_count}",
            f"comment_count,{comment_count}",
            f"global_opinion_score,{global_score:.4f}",
            f"interpretation,{_interpret_score(global_score)}",
            "",
        ]
        for dim, rollup_df in rollups.items():
            sections.append(f"# {dim}")
            sections.append(format_rollup_table(rollup_df, fmt="csv"))

        if include_bias_audit and rollups:
            sections.append("# bias_audit")
            sections.append(format_rollup_table(bias_audit(rollups), fmt="csv"))

        sections.append(f"# disclaimer\n{PROXY_DISCLAIMER}")
        return "\n".join(sections)

    return "\n".join(lines)

import os
import logging

import gradio as gr
import pandas as pd
from dotenv import load_dotenv

from .pipeline import run_pipeline

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def predict(
    video_url: str,
    max_comments: int,
    analyze_political: bool,
    analyze_socioeconomic: bool,
    analyze_gender: bool,
    analyze_emotion: bool,
    output_format: str,
    include_bias_audit: bool,
) -> tuple[str, pd.DataFrame]:
    """
    Gradio-facing wrapper around run_pipeline.
    Collects enabled dimensions from the checkbox inputs.
    Returns (report_string, annotated_dataframe).
    """
    if not video_url or not video_url.strip():
        raise gr.Error("Please enter a YouTube video URL.")

    dimensions = []
    if analyze_political:
        dimensions.append("political")
    if analyze_socioeconomic:
        dimensions.append("socioeconomic")
    if analyze_gender:
        dimensions.append("gender")
    if analyze_emotion:
        dimensions.append("emotion")

    if not dimensions:
        raise gr.Error("Please select at least one analysis dimension.")

    try:
        report, df = run_pipeline(
            url=video_url.strip(),
            max_comments=int(max_comments),
            dimensions=dimensions,
            output_format=output_format,
            prefer_api=bool(os.getenv("YOUTUBE_API_KEY")),
            include_bias_audit=include_bias_audit,
        )
    except ValueError as e:
        raise gr.Error(str(e))
    except Exception as e:
        logger.exception("Pipeline error for URL %s", video_url)
        raise gr.Error(f"Analysis failed: {e}")

    return report, df


demo = gr.Interface(
    predict,
    inputs=[
        gr.Textbox(
            label="YouTube Video URL",
            placeholder="https://www.youtube.com/watch?v=...",
            info="Paste any YouTube video URL. API key optional — yt-dlp is used as fallback.",
        ),
        gr.Slider(
            minimum=50,
            maximum=2000,
            value=500,
            step=50,
            label="Max Comments to Analyze",
            info="More comments = more accurate results but slower processing.",
        ),
        gr.Checkbox(label="Analyze Political Lean", value=True),
        gr.Checkbox(label="Analyze Socioeconomic Proxy", value=True),
        gr.Checkbox(label="Analyze Gender Proxy", value=True),
        gr.Checkbox(label="Analyze Emotion", value=True),
        gr.Dropdown(
            choices=["markdown", "json", "csv"],
            value="markdown",
            label="Output Format",
        ),
        gr.Checkbox(
            label="Include Bias Audit (HHI)",
            value=True,
            info="Herfindahl-Hirschman Index measures opinion concentration per dimension.",
        ),
    ],
    outputs=[
        gr.Textbox(label="Analysis Report", lines=40),
        gr.Dataframe(label="Annotated Comments", wrap=True),
    ],
    title="FinGPT YouTube Comment Analyzer",
    description="""
Analyze YouTube video comments across multiple opinion dimensions.
Provides sentiment rollup weighted by engagement and relevance to video content.
Includes a bias audit (HHI) to detect opinion concentration per demographic proxy group.

**How it works:**
1. Comments are fetched via YouTube Data API v3 (or yt-dlp if no API key is set)
2. Each comment is classified for sentiment, emotion, political lean, and toxicity
3. Relevance to the video's content is scored using sentence-transformers
4. A weighted opinion score (O_D) is aggregated per dimension group
5. An HHI bias audit flags dimensions where opinion is dominated by a single group

**Disclaimer:** Gender, socioeconomic, and political inferences are probabilistic proxies
derived from username patterns and text readability metrics — NOT identity labels.
Nothing herein is financial advice.
""",
    allow_flagging="never",
)

if __name__ == "__main__":
    demo.launch()

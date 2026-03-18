"""
FinGPT YouTube Comment Analysis and Opinion Rollup.

Provides tools for scraping, classifying, and aggregating
YouTube comment sentiment across demographic dimensions.
"""
from .pipeline import run_pipeline
from .report import generate_report

__all__ = ["run_pipeline", "generate_report"]

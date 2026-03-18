import math
import logging
from functools import lru_cache
from typing import Optional

import torch
import textstat
import numpy as np

logger = logging.getLogger(__name__)

# Minimum token count for reliable NLP inference
MIN_TOKENS_FOR_NLP = 5
# Max characters to pass to BERT-based models (approx 512 tokens)
MAX_CHARS_FOR_BERT = 1800


# ---------------------------------------------------------------------------
# Model loader singletons (lazy, loaded on first call)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _load_sentiment_model():
    from transformers import pipeline as hf_pipeline
    return hf_pipeline(
        "text-classification",
        model="cardiffnlp/twitter-roberta-base-sentiment",
        return_all_scores=True,
        truncation=True,
        max_length=512,
    )


@lru_cache(maxsize=1)
def _load_emotion_model():
    from transformers import pipeline as hf_pipeline
    return hf_pipeline(
        "text-classification",
        model="j-hartmann/emotion-english-distilroberta-base",
        return_all_scores=False,
        truncation=True,
        max_length=512,
    )


@lru_cache(maxsize=1)
def _load_political_model():
    from transformers import pipeline as hf_pipeline
    return hf_pipeline(
        "text-classification",
        model="bucketresearch/politicalBiasBERT",
        return_all_scores=False,
        truncation=True,
        max_length=512,
    )


@lru_cache(maxsize=1)
def _load_toxicity_model():
    from transformers import pipeline as hf_pipeline
    return hf_pipeline(
        "text-classification",
        model="unitary/toxic-bert",
        return_all_scores=False,
        truncation=True,
        max_length=512,
    )


@lru_cache(maxsize=1)
def _load_gender_detector():
    import gender_guesser.detector as gd
    return gd.Detector()


# ---------------------------------------------------------------------------
# Individual classifiers
# ---------------------------------------------------------------------------

def classify_sentiment(text: str) -> tuple[str, float]:
    """
    Returns (label, score) where label is in {positive, neutral, negative}
    and score is linearly mapped to [-1, +1]:
      score = P(positive) - P(negative)
    """
    model = _load_sentiment_model()
    with torch.no_grad():
        results = model(text[:MAX_CHARS_FOR_BERT])[0]

    # results is a list of {label, score} dicts for all three classes
    scores = {r["label"]: r["score"] for r in results}
    # cardiffnlp labels: LABEL_0=negative, LABEL_1=neutral, LABEL_2=positive
    p_pos = scores.get("LABEL_2", scores.get("positive", 0.0))
    p_neg = scores.get("LABEL_0", scores.get("negative", 0.0))
    scalar = p_pos - p_neg

    if scalar > 0.1:
        label = "positive"
    elif scalar < -0.1:
        label = "negative"
    else:
        label = "neutral"

    return label, float(scalar)


def classify_emotion(text: str) -> tuple[str, float]:
    """
    Returns (dominant_emotion_label, confidence_score).
    Labels: joy, anger, fear, sadness, disgust, surprise, neutral.
    """
    model = _load_emotion_model()
    with torch.no_grad():
        result = model(text[:MAX_CHARS_FOR_BERT])[0]
    return result["label"].lower(), float(result["score"])


def classify_political_lean(text: str) -> tuple[str, float]:
    """
    Returns (label, score) where label is in {left, center, right}.
    Returns ("unknown", 0.0) for texts that are too short.
    """
    tokens = text.split()
    if len(tokens) < MIN_TOKENS_FOR_NLP:
        return "unknown", 0.0

    model = _load_political_model()
    with torch.no_grad():
        result = model(text[:MAX_CHARS_FOR_BERT])[0]
    return result["label"].lower(), float(result["score"])


def classify_toxicity(text: str) -> float:
    """
    Returns a float in [0, 1] representing toxicity probability.
    """
    model = _load_toxicity_model()
    with torch.no_grad():
        result = model(text[:MAX_CHARS_FOR_BERT])[0]
    # unitary/toxic-bert outputs label "toxic" or "non-toxic"
    if result["label"].lower() in ("toxic", "1"):
        return float(result["score"])
    return float(1.0 - result["score"])


def infer_gender_proxy(author_name: str) -> str:
    """
    Use gender_guesser to infer gender from the first token of author_name.
    Returns one of: "male", "female", "mostly_male", "mostly_female",
    "andy" (androgynous), or "unknown".
    Note: this is a probabilistic proxy, NOT an identity label.
    """
    if not author_name or not author_name.strip():
        return "unknown"
    detector = _load_gender_detector()
    first_name = author_name.strip().split()[0]
    result = detector.get_gender(first_name)
    # gender_guesser returns: male, female, mostly_male, mostly_female, andy, unknown
    return result if result != "unknown" else "unknown"


def compute_edu_proxy(text: str) -> float:
    """
    Compute textstat.flesch_kincaid_grade(text).
    Returns a float representing approximate grade level.
    Labeled as an educational proxy, not a direct measure of education.
    """
    try:
        grade = textstat.flesch_kincaid_grade(text)
        # Clamp to reasonable range; textstat can return negative for very simple text
        return float(max(0.0, min(grade, 20.0)))
    except Exception:
        return 0.0


def compute_vocab_richness(text: str) -> float:
    """
    Compute type-token ratio: len(set(tokens)) / len(tokens).
    Returns 0.0 for texts with fewer than 5 tokens.
    """
    tokens = text.lower().split()
    if len(tokens) < 5:
        return 0.0
    return float(len(set(tokens)) / len(tokens))


def compute_engagement_weight(likes: int, reply_count: int) -> float:
    """
    Return log(1 + likes + reply_count).
    Uses math.log1p for numerical stability at zero.
    """
    return float(math.log1p(likes + reply_count))


# ---------------------------------------------------------------------------
# Batch entry point
# ---------------------------------------------------------------------------

def classify_comment(comment: dict) -> dict:
    """
    Run all classifiers on a single raw comment dict.
    Merges derived fields into a copy of the input dict and returns it.
    On per-classifier failure, fills that field with None/0.0/"unknown".

    Input fields consumed: text, likes, reply_count, author
    Derived fields added:
      political_label, political_score,
      sentiment_label, sentiment_score,
      emotion_label, toxicity_score,
      gender_proxy, edu_proxy, vocab_richness,
      engagement_weight
    """
    result = dict(comment)
    text = comment.get("text", "")
    author = comment.get("author", "")
    likes = int(comment.get("likes", 0))
    reply_count = int(comment.get("reply_count", 0))

    tokens = text.split()
    is_short = len(tokens) < MIN_TOKENS_FOR_NLP

    # Sentiment
    try:
        if is_short:
            result["sentiment_label"] = "neutral"
            result["sentiment_score"] = 0.0
        else:
            label, score = classify_sentiment(text)
            result["sentiment_label"] = label
            result["sentiment_score"] = score
    except Exception as e:
        logger.warning("Sentiment classification failed: %s", e)
        result["sentiment_label"] = "neutral"
        result["sentiment_score"] = 0.0

    # Emotion
    try:
        if is_short:
            result["emotion_label"] = "neutral"
        else:
            label, _ = classify_emotion(text)
            result["emotion_label"] = label
    except Exception as e:
        logger.warning("Emotion classification failed: %s", e)
        result["emotion_label"] = "neutral"

    # Political lean
    try:
        label, score = classify_political_lean(text)
        result["political_label"] = label
        result["political_score"] = score
    except Exception as e:
        logger.warning("Political classification failed: %s", e)
        result["political_label"] = "unknown"
        result["political_score"] = 0.0

    # Toxicity
    try:
        result["toxicity_score"] = classify_toxicity(text)
    except Exception as e:
        logger.warning("Toxicity classification failed: %s", e)
        result["toxicity_score"] = 0.0

    # Gender proxy
    try:
        result["gender_proxy"] = infer_gender_proxy(author)
    except Exception as e:
        logger.warning("Gender proxy inference failed: %s", e)
        result["gender_proxy"] = "unknown"

    # Education proxy and vocab richness (pure text stats, never fail hard)
    result["edu_proxy"] = compute_edu_proxy(text)
    result["vocab_richness"] = compute_vocab_richness(text)

    # Engagement weight
    result["engagement_weight"] = compute_engagement_weight(likes, reply_count)

    return result


def classify_batch(comments: list[dict], show_progress: bool = True) -> list[dict]:
    """
    Apply classify_comment to each item in comments.
    Wraps iteration with tqdm when show_progress=True.
    Returns a new list; does not mutate inputs.
    """
    from tqdm import tqdm

    iterator = tqdm(comments, desc="Classifying comments") if show_progress else comments
    results = []

    for comment in iterator:
        try:
            results.append(classify_comment(comment))
        except torch.cuda.OutOfMemoryError:
            logger.warning("GPU OOM — clearing cache and retrying with single comment.")
            torch.cuda.empty_cache()
            try:
                results.append(classify_comment(comment))
            except Exception as e:
                logger.error("Failed to classify comment after OOM retry: %s", e)
                # Append comment with default/unknown fields
                fallback = dict(comment)
                fallback.update({
                    "sentiment_label": "neutral", "sentiment_score": 0.0,
                    "emotion_label": "neutral",
                    "political_label": "unknown", "political_score": 0.0,
                    "toxicity_score": 0.0,
                    "gender_proxy": "unknown", "edu_proxy": 0.0,
                    "vocab_richness": 0.0,
                    "engagement_weight": compute_engagement_weight(
                        int(comment.get("likes", 0)),
                        int(comment.get("reply_count", 0)),
                    ),
                })
                results.append(fallback)

    return results

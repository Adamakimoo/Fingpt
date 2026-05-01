import logging
from functools import lru_cache

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "all-MiniLM-L6-v2"  # 22M params, fast, good quality


@lru_cache(maxsize=4)
def _load_embedding_model(model_name: str = DEFAULT_MODEL):
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(model_name)


def encode_texts(texts: list[str], model_name: str = DEFAULT_MODEL) -> np.ndarray:
    """
    Encode a list of texts into unit-normalized embeddings.
    Returns array of shape (N, embedding_dim).
    Returns zero-row array for empty input.
    """
    if not texts:
        model = _load_embedding_model(model_name)
        return np.zeros((0, model.get_sentence_embedding_dimension()))

    model = _load_embedding_model(model_name)
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return np.array(embeddings)


def compute_video_anchor(
    transcript_text: str | None,
    title: str,
    description: str,
    model_name: str = DEFAULT_MODEL,
) -> np.ndarray:
    """
    Produce a single embedding for the video content.
    If transcript_text is provided, uses first 512 chars of transcript.
    Otherwise, encodes "{title}. {description[:300]}".
    Returns array of shape (embedding_dim,).
    """
    if transcript_text:
        anchor_text = transcript_text[:512]
    else:
        desc_snippet = (description or "")[:300]
        anchor_text = f"{title}. {desc_snippet}".strip(". ")

    if not anchor_text:
        # Absolute fallback: return zero vector
        model = _load_embedding_model(model_name)
        dim = model.get_sentence_embedding_dimension()
        logger.warning("No video content available for anchor; using zero vector.")
        return np.zeros(dim)

    embeddings = encode_texts([anchor_text], model_name=model_name)
    return embeddings[0]


def score_relevance(
    comment_texts: list[str],
    video_anchor: np.ndarray,
    model_name: str = DEFAULT_MODEL,
) -> np.ndarray:
    """
    Compute cosine similarity between each comment embedding and video_anchor.
    Returns array of shape (N,) with values clipped to [0, 1].
    Negative cosine similarity is treated as zero relevance.
    """
    if not comment_texts:
        return np.zeros(0)

    comment_embeddings = encode_texts(comment_texts, model_name=model_name)

    # Both are unit-normalized, so dot product = cosine similarity
    anchor_norm = video_anchor / (np.linalg.norm(video_anchor) + 1e-10)
    similarities = comment_embeddings @ anchor_norm
    return np.clip(similarities, 0.0, 1.0)


def compute_echo_penalties(
    comment_embeddings: np.ndarray,
    window: int = 50,
) -> np.ndarray:
    """
    For each comment i, compute the mean cosine similarity to the
    min(window, i) most recently processed comments.
    Comments should be pre-sorted by descending engagement_weight (caller's responsibility).

    Returns array of shape (N,) with values in [0, 1].
    First comment gets penalty 0.0 (no prior context yet).
    High penalty = comment is semantically similar to recent top comments
                   (likely bot spam or brigading).
    """
    n = len(comment_embeddings)
    if n == 0:
        return np.zeros(0)

    penalties = np.zeros(n)

    for i in range(1, n):
        start = max(0, i - window)
        prior = comment_embeddings[start:i]  # shape (k, dim)
        current = comment_embeddings[i]       # shape (dim,)

        # Both sets are already unit-normalized from encode_texts
        sims = prior @ current  # shape (k,)
        penalties[i] = float(np.mean(np.clip(sims, 0.0, 1.0)))

    return penalties

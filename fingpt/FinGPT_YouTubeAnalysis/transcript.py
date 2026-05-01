import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)


def fetch_transcript(
    video_id: str,
    preferred_languages: tuple[str, ...] = ("en",),
) -> Optional[str]:
    """
    Attempt to fetch the transcript in order of preferred_languages,
    then fall back to auto-generated English captions.
    Returns the full concatenated text as a single string,
    or None if no transcript is available.
    """
    from youtube_transcript_api import (
        YouTubeTranscriptApi,
        TranscriptsDisabled,
        NoTranscriptFound,
    )

    for attempt in range(2):
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

            # Try preferred languages first (manual captions)
            for lang in preferred_languages:
                try:
                    transcript = transcript_list.find_transcript([lang])
                    logger.info(
                        "Using manual transcript in '%s' for video %s", lang, video_id
                    )
                    segments = transcript.fetch()
                    return " ".join(seg["text"] for seg in segments)
                except NoTranscriptFound:
                    continue

            # Fall back to auto-generated English
            try:
                transcript = transcript_list.find_generated_transcript(list(preferred_languages) + ["en"])
                logger.info(
                    "Using auto-generated transcript for video %s (lower quality)", video_id
                )
                segments = transcript.fetch()
                return " ".join(seg["text"] for seg in segments)
            except NoTranscriptFound:
                pass

            logger.warning("No transcript found for video %s in any language.", video_id)
            return None

        except TranscriptsDisabled:
            logger.warning("Transcripts are disabled for video %s.", video_id)
            return None
        except Exception as e:
            if attempt == 0:
                logger.warning(
                    "Transcript fetch failed (%s) — retrying in 5s.", e
                )
                time.sleep(5)
            else:
                logger.warning("Transcript fetch failed after retry: %s", e)
                return None

    return None


def chunk_transcript(
    transcript_text: str,
    max_chars: int = 2000,
) -> list[str]:
    """
    Split the transcript into overlapping chunks.
    Overlap is 10% of max_chars to preserve sentence context across boundaries.
    Returns a list of chunk strings.
    """
    if not transcript_text:
        return []

    overlap = max_chars // 10
    chunks = []
    start = 0
    text_len = len(transcript_text)

    while start < text_len:
        end = min(start + max_chars, text_len)
        chunks.append(transcript_text[start:end])
        if end == text_len:
            break
        start = end - overlap

    return chunks


def summarize_transcript_for_embedding(
    transcript_text: str,
    max_chars: int = 512,
) -> str:
    """
    Truncate transcript_text to max_chars for use as a sentence-transformer input.
    Takes the first max_chars characters, which captures the intro context that
    comments most often reference.
    """
    if not transcript_text:
        return ""
    return transcript_text[:max_chars]

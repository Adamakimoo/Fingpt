import os
import re
import time
import logging
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")


class QuotaExceededError(Exception):
    """Raised when the YouTube Data API daily quota is exhausted."""


def build_youtube_client():
    """
    Build and return an authenticated googleapiclient.discovery Resource object.
    Raises EnvironmentError if YOUTUBE_API_KEY is not set.
    """
    if not YOUTUBE_API_KEY:
        raise EnvironmentError(
            "YOUTUBE_API_KEY is not set. Add it to your .env file or set it as an "
            "environment variable. Alternatively, set prefer_api=False to use yt-dlp."
        )
    from googleapiclient.discovery import build
    return build("youtube", "v3", developerKey=YOUTUBE_API_KEY)


def extract_video_id(url: str) -> str:
    """
    Parse a YouTube URL and return the 11-character video ID.
    Handles youtu.be short links, /watch?v=, /embed/, and /shorts/ formats.
    Raises ValueError if the ID cannot be parsed.
    """
    patterns = [
        r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})",
        r"youtube\.com/v/([A-Za-z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract YouTube video ID from URL: {url}")


def fetch_video_metadata_api(video_id: str, client) -> dict:
    """
    Retrieve video metadata via videos().list().
    Returns a dict with keys: video_id, title, description,
    channel_title, published_at, view_count, like_count, comment_count.
    """
    response = client.videos().list(
        part="snippet,statistics",
        id=video_id
    ).execute()

    if not response.get("items"):
        raise ValueError(f"Video not found or unavailable: {video_id}")

    item = response["items"][0]
    snippet = item["snippet"]
    stats = item.get("statistics", {})

    return {
        "video_id": video_id,
        "title": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "channel_title": snippet.get("channelTitle", ""),
        "published_at": snippet.get("publishedAt", ""),
        "view_count": int(stats.get("viewCount", 0)),
        "like_count": int(stats.get("likeCount", 0)),
        "comment_count": int(stats.get("commentCount", 0)),
    }


def fetch_comments_api(
    video_id: str,
    client,
    max_comments: int = 500,
    order: str = "relevance",
    rate_limit_pause: float = 0.5,
) -> list[dict]:
    """
    Paginate through commentThreads().list() results.
    Returns list of dicts with: text, likes, reply_count, author, published.
    Handles quota exhaustion and uses exponential backoff on 429/500 errors.
    """
    from googleapiclient.errors import HttpError

    comments = []
    page_token = None
    retries = 0
    max_retries = 4

    while len(comments) < max_comments:
        try:
            kwargs = dict(
                part="snippet",
                videoId=video_id,
                maxResults=min(100, max_comments - len(comments)),
                order=order,
                textFormat="plainText",
            )
            if page_token:
                kwargs["pageToken"] = page_token

            response = client.commentThreads().list(**kwargs).execute()
            retries = 0  # reset on success

        except HttpError as e:
            status = e.resp.status
            if status == 403:
                error_reason = ""
                try:
                    import json as _json
                    details = _json.loads(e.content)
                    reasons = [
                        err.get("reason", "")
                        for err in details.get("error", {}).get("errors", [])
                    ]
                    error_reason = ",".join(reasons)
                except Exception:
                    pass

                if "commentsDisabled" in error_reason or "disabled" in error_reason.lower():
                    logger.warning("Comments are disabled for video %s", video_id)
                    return comments
                if "quotaExceeded" in error_reason or "dailyLimitExceeded" in error_reason:
                    raise QuotaExceededError(
                        "YouTube Data API daily quota exhausted. "
                        "Try again tomorrow or use prefer_api=False for yt-dlp fallback."
                    )
                raise ValueError(
                    f"Video {video_id} is private, unlisted, or access was denied (HTTP 403)."
                )
            elif status in (429, 500, 503):
                retries += 1
                if retries > max_retries:
                    raise
                wait = 2 ** retries
                logger.warning("HTTP %d — retrying in %ds (attempt %d/%d)", status, wait, retries, max_retries)
                time.sleep(wait)
                continue
            else:
                raise

        for item in response.get("items", []):
            top = item["snippet"]["topLevelComment"]["snippet"]
            comments.append({
                "text": top.get("textDisplay", ""),
                "likes": int(top.get("likeCount", 0)),
                "reply_count": int(item["snippet"].get("totalReplyCount", 0)),
                "author": top.get("authorDisplayName", ""),
                "published": top.get("publishedAt", ""),
            })
            if len(comments) >= max_comments:
                break

        page_token = response.get("nextPageToken")
        if not page_token:
            break

        time.sleep(rate_limit_pause)

    return comments


def fetch_video_metadata_ytdlp(url: str) -> dict:
    """
    Use yt_dlp.YoutubeDL to extract video info without an API key.
    Returns the same schema as fetch_video_metadata_api.
    """
    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except yt_dlp.utils.DownloadError as e:
            raise ValueError(f"Video is private, unavailable, or URL is invalid: {e}")

    return {
        "video_id": info.get("id", ""),
        "title": info.get("title", ""),
        "description": info.get("description", ""),
        "channel_title": info.get("uploader", ""),
        "published_at": info.get("upload_date", ""),
        "view_count": int(info.get("view_count") or 0),
        "like_count": int(info.get("like_count") or 0),
        "comment_count": int(info.get("comment_count") or 0),
    }


def fetch_comments_ytdlp(url: str, max_comments: int = 500) -> list[dict]:
    """
    Use yt_dlp.YoutubeDL with getcomments=True to pull comments.
    Maps yt-dlp comment fields to the canonical schema fields.
    """
    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "getcomments": True,
        "extractor_args": {"youtube": {"max_comments": [str(max_comments)]}},
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except yt_dlp.utils.DownloadError as e:
            raise ValueError(f"Video is private, unavailable, or URL is invalid: {e}")

    raw_comments = info.get("comments") or []
    comments = []
    for c in raw_comments[:max_comments]:
        # yt-dlp comments can be nested; only take top-level (parent == None or "root")
        if c.get("parent") not in (None, "root"):
            continue
        comments.append({
            "text": c.get("text", ""),
            "likes": int(c.get("like_count") or 0),
            "reply_count": int(c.get("reply_count") or 0),
            "author": c.get("author", ""),
            "published": c.get("timestamp", ""),
        })
        if len(comments) >= max_comments:
            break

    return comments


def fetch(
    url: str,
    max_comments: int = 500,
    prefer_api: bool = True,
) -> tuple[dict, list[dict]]:
    """
    Primary entry point called by pipeline.py.
    Returns (video_metadata_dict, list_of_raw_comment_dicts).
    Falls back to yt-dlp if prefer_api=False or no API key is available.
    """
    use_api = prefer_api and bool(YOUTUBE_API_KEY)

    if use_api:
        try:
            client = build_youtube_client()
            video_id = extract_video_id(url)
            metadata = fetch_video_metadata_api(video_id, client)
            comments = fetch_comments_api(video_id, client, max_comments=max_comments)
            return metadata, comments
        except QuotaExceededError:
            logger.warning(
                "YouTube API quota exceeded — falling back to yt-dlp (no API key used)."
            )
        except Exception as e:
            logger.warning("YouTube API fetch failed (%s) — falling back to yt-dlp.", e)

    logger.info("Using yt-dlp to fetch video data (no API key required).")
    metadata = fetch_video_metadata_ytdlp(url)
    comments = fetch_comments_ytdlp(url, max_comments=max_comments)
    return metadata, comments

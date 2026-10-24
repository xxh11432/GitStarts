import httpx

from app.core.config import Settings


async def qdrant_status(settings: Settings) -> str:
    """Return "up" / "down" without ever raising: health must stay 200."""
    url = f"{settings.qdrant_url.rstrip('/')}/readyz"
    try:
        async with httpx.AsyncClient(timeout=settings.health_timeout_seconds) as client:
            response = await client.get(url)
        return "up" if response.status_code == 200 else "down"
    except httpx.HTTPError:
        return "down"

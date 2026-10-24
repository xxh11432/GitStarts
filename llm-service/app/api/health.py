from fastapi import APIRouter, Request

from app.clients.qdrant import qdrant_status
from app.core.config import get_settings
from app.schemas.health import HealthChecks, HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    settings = get_settings()
    qdrant = await qdrant_status(settings)
    return HealthResponse(
        status="ok" if qdrant == "up" else "degraded",
        service=settings.app_name,
        version=settings.app_version,
        request_id=getattr(request.state, "request_id", ""),
        checks=HealthChecks(qdrant=qdrant),
    )

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HealthChecks(CamelModel):
    qdrant: str


class HealthResponse(CamelModel):
    status: str
    service: str
    version: str
    request_id: str
    checks: HealthChecks

from fastapi.testclient import TestClient


def test_health_returns_200_and_shape(client: TestClient) -> None:
    response = client.get("/ai/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] in {"ok", "degraded"}
    assert body["service"] == "llm-service"
    assert body["version"] == "0.1.0"
    assert body["checks"]["qdrant"] in {"up", "down"}
    assert body["requestId"]


def test_health_stays_200_when_qdrant_is_down(client: TestClient) -> None:
    response = client.get("/ai/health")

    assert response.status_code == 200
    assert response.json()["status"] == "degraded"
    assert response.json()["checks"]["qdrant"] == "down"

import re

from fastapi.testclient import TestClient


def test_request_id_is_echoed(client: TestClient) -> None:
    response = client.get("/ai/health", headers={"X-Request-Id": "abc123"})

    assert response.headers["x-request-id"] == "abc123"
    assert response.json()["requestId"] == "abc123"


def test_request_id_is_generated_when_absent(client: TestClient) -> None:
    response = client.get("/ai/health")

    request_id = response.headers["x-request-id"]
    assert re.fullmatch(r"[0-9a-f]{32}", request_id)
    assert response.json()["requestId"] == request_id


def test_error_response_also_carries_request_id(client: TestClient) -> None:
    response = client.get("/ai/does-not-exist")

    assert response.status_code == 404
    assert response.headers["x-request-id"]

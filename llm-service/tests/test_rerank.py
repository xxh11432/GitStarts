import json
from typing import Any

import httpx
import pytest
import respx

from app.clients.rerank import RerankClient, RerankError
from app.core.config import Settings

URL = "https://rerank.test/v1/rerank"


def _settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "environment": "test",
        "rerank_enabled": True,
        "rerank_base_url": "https://rerank.test/v1",
        "rerank_api_key": "test-key",
        "rerank_model": "BAAI/bge-reranker-v2-m3",
        "rerank_batch_size": 10,
    }
    base.update(overrides)
    return Settings(**base)


@respx.mock
async def test_score_aligns_with_document_order() -> None:
    respx.post(URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {"index": 2, "relevance_score": 0.9},
                    {"index": 0, "relevance_score": 0.1},
                    {"index": 1, "relevance_score": 0.5},
                ]
            },
        )
    )
    client = RerankClient(_settings())
    scores = await client.score("知识库", ["a", "b", "c"])
    assert scores == pytest.approx([0.1, 0.5, 0.9])


@respx.mock
async def test_score_splits_batches() -> None:
    def responder(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "results": [
                    {"index": index, "relevance_score": 0.2}
                    for index in range(len(body["documents"]))
                ]
            },
        )

    route = respx.post(URL).mock(side_effect=responder)
    client = RerankClient(_settings(rerank_batch_size=2))
    scores = await client.score("知识库", ["a", "b", "c"])
    assert scores == pytest.approx([0.2, 0.2, 0.2])
    assert route.call_count == 2


async def test_score_requires_api_key() -> None:
    client = RerankClient(_settings(rerank_api_key="", embedding_api_key="", llm_api_key=""))
    assert client.enabled is False
    with pytest.raises(RerankError):
        await client.score("知识库", ["a"])


@respx.mock
async def test_score_raises_on_http_error() -> None:
    respx.post(URL).mock(return_value=httpx.Response(500, json={}))
    client = RerankClient(_settings())
    with pytest.raises(RerankError):
        await client.score("知识库", ["a"])

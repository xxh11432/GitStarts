"""SSRF 防护：抓取只允许 HTTPS + 白名单主机，仓库名不允许路径穿越。"""

import pytest

from app.core.config import Settings
from worker.fetch_docs import GithubTargetError, ReadmeFetcher, validate_full_name


def _settings(**overrides: object) -> Settings:
    return Settings(
        environment="test",
        backend_url="http://127.0.0.1:9",
        qdrant_url="http://127.0.0.1:9",
        checkpoint_redis_url="redis://127.0.0.1:9/0",
        **overrides,
    )


@pytest.mark.parametrize(
    "base",
    [
        "http://api.github.com",
        "https://169.254.169.254",
        "https://user:pass@api.github.com",
        "https://api.github.com?x=1",
    ],
)
async def test_rejects_non_allowlisted_api_base(base: str) -> None:
    fetcher = ReadmeFetcher(_settings(github_api_base=base))
    with pytest.raises(GithubTargetError):
        await fetcher.fetch_readme("owner/repo")


async def test_accepts_allowlisted_https_base() -> None:
    fetcher = ReadmeFetcher(
        _settings(github_api_base="https://api.github.com", github_allowed_hosts="api.github.com")
    )
    client = fetcher._connect()
    assert str(client.base_url) == "https://api.github.com"
    assert client.follow_redirects is False
    await fetcher.close()


@pytest.mark.parametrize(
    "full_name",
    ["../etc/passwd", "owner/..", ".git/config", "owner", "owner/repo/x", "owner/repo?x=1"],
)
def test_rejects_unsafe_full_name(full_name: str) -> None:
    with pytest.raises(GithubTargetError):
        validate_full_name(full_name)


def test_accepts_normal_full_name() -> None:
    assert validate_full_name("octocat/Hello-World.js") == "octocat/Hello-World.js"

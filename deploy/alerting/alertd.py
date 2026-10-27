#!/usr/bin/env python3
"""GitStars 异常日志通知：巡检容器状态与错误日志，推送飞书卡片。

用法：
    python alertd.py --loop       # 常驻巡检（容器默认）
    python alertd.py --once       # 单次巡检
    python alertd.py --dry-run    # 只打印命中的告警，不发送
    python alertd.py --test       # 发送一条连通性测试卡片

凭证从环境变量 ALERT_WEBHOOK / ALERT_SECRET 读取；
Docker 通过 /var/run/docker.sock 的 Engine API 访问，容器内无需 docker CLI。
"""
from __future__ import annotations

import base64
import calendar
import hashlib
import hmac
import http.client
import json
import os
import re
import socket
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

DOCKER_SOCKET = os.environ.get("DOCKER_SOCKET", "/var/run/docker.sock")
STATE_FILE = Path(os.environ.get("ALERT_STATE_FILE", "/var/lib/gitstars-alert/state.json"))
SELF_CONTAINER = os.environ.get("ALERT_SELF_CONTAINER", "gs-alert-worker")

DEDUP_SECONDS = int(os.environ.get("ALERT_DEDUP_SECONDS", "1800"))
# 预算告警是「当日累计」性质：value 每小时都会变化，若按整行 detail 去重会反复触发。
# 预算项按 code+day 去重，当天每个预算项只推送一次。
BUDGET_DEDUP_SECONDS = int(os.environ.get("ALERT_BUDGET_DEDUP_SECONDS", "86400"))
HEALTH_REALERT_SECONDS = int(os.environ.get("ALERT_HEALTH_REALERT_SECONDS", "7200"))
HEARTBEAT_SECONDS = int(os.environ.get("ALERT_HEARTBEAT_SECONDS", "3600"))
MAX_PER_HOUR = int(os.environ.get("ALERT_MAX_PER_HOUR", "10"))
INITIAL_WINDOW = int(os.environ.get("ALERT_INITIAL_WINDOW_SECONDS", "600"))
INTERVAL_SECONDS = max(15, int(os.environ.get("ALERT_INTERVAL_SECONDS", "60")))

# (容器, 规则名, 正则, 级别, 附带后续行数)
RULES = [
    ("gs-backend", "log-error", r" (ERROR|FATAL) ", "P1", 4),
    ("gs-llm-service", "log-error", r'"level":\s*"(error|critical)"', "P1", 2),
    ("gs-ingest-worker", "log-error", r'"level":\s*"(error|critical)"', "P1", 2),
    ("gs-nginx", "http-5xx", r'" 5\d\d ', "P1", 0),
    ("gs-backend", "ops-budget", r"ops_budget_alert code=(\S+)", "P1", 0),
]

RULES_BY_CONTAINER: dict[str, list[tuple[str, str, str, int]]] = {}
for _svc, _rule, _pattern, _level, _context in RULES:
    RULES_BY_CONTAINER.setdefault(_svc, []).append((_rule, _pattern, _level, _context))

# 已知无害噪声，避免把正常业务日志当故障
NOISE = re.compile(r"读取 README 失败|Not found @TableId annotation|DefaultSqlInjector")

DOCKER_TS = re.compile(r"^\d{4}-\d{2}-\d{2}T[0-9:.]+Z\s")
BUDGET_ALERT_RE = re.compile(r"code=(\S+)\s+day=(\S+)")


class _UnixHTTPConnection(http.client.HTTPConnection):
    """通过 Unix socket 访问 Docker Engine API。"""

    def __init__(self, socket_path: str, timeout: float = 30) -> None:
        super().__init__("docker", timeout=timeout)
        self._socket_path = socket_path

    def connect(self) -> None:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(self.timeout)
        sock.connect(self._socket_path)
        self.sock = sock


def docker_get(path: str, timeout: float = 30) -> bytes:
    conn = _UnixHTTPConnection(DOCKER_SOCKET, timeout)
    try:
        conn.request("GET", path, headers={"Host": "docker"})
        resp = conn.getresponse()
        body = resp.read()
        if resp.status != 200:
            print(f"Docker API {path} 返回 {resp.status}", file=sys.stderr)
            return b""
        return body
    except (OSError, http.client.HTTPException) as exc:
        print(f"Docker API 请求失败：{exc}", file=sys.stderr)
        return b""
    finally:
        conn.close()


def docker_json(path: str) -> object:
    body = docker_get(path)
    if not body:
        return None
    try:
        return json.loads(body.decode("utf-8"))
    except ValueError:
        return None


def containers() -> list[str]:
    data = docker_json("/containers/json?all=1")
    if not isinstance(data, list):
        return []
    names: list[str] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        names.extend(str(n).strip("/") for n in item.get("Names", []))
    return [n for n in names if n and n != SELF_CONTAINER]


def inspect(name: str) -> dict | None:
    data = docker_json(f"/containers/{urllib.parse.quote(name, safe='')}/json")
    if not isinstance(data, dict):
        return None
    state = data.get("State") or {}
    health = (state.get("Health") or {}).get("Status") or "none"
    config = data.get("Config") or {}
    return {
        "status": state.get("Status") or "unknown",
        "health": health,
        "restarts": int(data.get("RestartCount") or 0),
        "oom": bool(state.get("OOMKilled")),
        "exit_code": state.get("ExitCode") or 0,
        "finished_at": state.get("FinishedAt") or "",
        "tty": bool(config.get("Tty")),
    }


def stopped_recently(info: dict, now: float, window: int = 900) -> bool:
    """只对 15 分钟内停止的容器告警，避免长期停机的历史容器反复刷屏。"""
    raw = str(info.get("finished_at") or "")
    if not raw or raw.startswith("0001-"):
        return True
    try:
        stamp = raw.split(".")[0].replace("Z", "")
        return now - calendar.timegm(time.strptime(stamp, "%Y-%m-%dT%H:%M:%S")) < window
    except ValueError:
        return True


def demux_logs(raw: bytes, tty: bool) -> str:
    """解析 Docker logs 的多路复用流；Tty 容器直接按纯文本解码。"""
    if tty:
        return raw.decode("utf-8", "replace")
    parts: list[str] = []
    offset = 0
    while offset + 8 <= len(raw):
        size = int.from_bytes(raw[offset + 4:offset + 8], "big")
        payload = raw[offset + 8:offset + 8 + size]
        parts.append(payload.decode("utf-8", "replace"))
        offset += 8 + size
    return "".join(parts) if parts else raw.decode("utf-8", "replace")


def container_logs(name: str, since: float, tty: bool) -> list[str]:
    query = (
        f"/containers/{urllib.parse.quote(name, safe='')}/logs"
        f"?stdout=1&stderr=1&timestamps=1&since={int(since)}"
    )
    raw = docker_get(query)
    if not raw:
        return []
    return demux_logs(raw, tty).splitlines()


def strip_docker_ts(line: str) -> str:
    """去掉 docker logs --timestamps 前缀，卡片里只留业务日志。"""
    return DOCKER_TS.sub("", line)


def match_lines(lines: list[str], pattern: str, context: int) -> list[str]:
    hits: list[str] = []
    for idx, line in enumerate(lines):
        if re.search(pattern, line) and not NOISE.search(line):
            chunk = [strip_docker_ts(line)]
            if context:
                chunk += [strip_docker_ts(x) for x in lines[idx + 1: idx + 1 + context]]
            hits.append("\n".join(chunk))
    return hits


def budget_hits(hits: list[str]) -> list[tuple[str, str, str]]:
    """按 code+day 归组预算告警，每个预算项当天只保留最后一条日志。"""
    latest: dict[tuple[str, str], str] = {}
    for line in hits:
        m = BUDGET_ALERT_RE.search(line)
        if m:
            latest[(m.group(1), m.group(2))] = line
    return [(code, day, line) for (code, day), line in latest.items()]


def sign_payload(payload: dict) -> dict:
    secret = os.environ.get("ALERT_SECRET", "")
    if not secret:
        return payload
    key = f"{payload['timestamp']}\n{secret}".encode("utf-8")
    digest = hmac.new(key, b"", hashlib.sha256).digest()
    payload["sign"] = base64.b64encode(digest).decode("utf-8")
    return payload


def send_card(title: str, detail: str, level: str = "P1", template: str | None = None) -> bool:
    webhook = os.environ.get("ALERT_WEBHOOK", "")
    if not webhook:
        print("ALERT_WEBHOOK 未配置", file=sys.stderr)
        return False

    env_name = os.environ.get("ALERT_ENV", "prod")
    card = {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "template": template or ("red" if level == "P0" else "orange"),
                "title": {"tag": "plain_text", "content": title},
            },
            "elements": [
                {"tag": "div", "text": {"tag": "lark_md", "content": detail[:3500]}},
                {"tag": "note", "elements": [
                    {"tag": "plain_text",
                     "content": f"环境 {env_name} · {time.strftime('%Y-%m-%d %H:%M:%S')}"}
                ]},
            ],
        },
    }
    body = sign_payload({"timestamp": str(int(time.time())), **card})
    data = json.dumps(body).encode("utf-8")

    for attempt in range(3):
        req = urllib.request.Request(
            webhook, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode("utf-8"))
            if result.get("code") == 0:
                return True
            print(f"飞书返回 {result}", file=sys.stderr)
        except Exception as exc:  # 网络抖动 / 限流
            print(f"推送失败（第 {attempt + 1} 次）：{exc}", file=sys.stderr)
        time.sleep(2 * (attempt + 1))
    return False


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state), encoding="utf-8")
    tmp.replace(STATE_FILE)


def collect(state: dict, now: float) -> list[dict]:
    """返回待推送列表，并推进 state 中的巡检水位。"""
    alerts: list[dict] = []
    health_state = state.setdefault("health", {})
    last_seen = state.setdefault("last_ts", {})
    restart_state = state.setdefault("restarts", {})
    snapshot = {"total": 0, "running": 0, "health_checked": 0, "healthy": 0}

    default_since = now - INITIAL_WINDOW

    for name in containers():
        info = inspect(name)
        if not info:
            continue
        snapshot["total"] += 1
        if info["status"] == "running":
            snapshot["running"] += 1
        if info["health"] != "none":
            snapshot["health_checked"] += 1
            if info["health"] == "healthy":
                snapshot["healthy"] += 1

        if info["status"] != "running" and stopped_recently(info, now):
            alerts.append({
                "name": name, "rule": "container-down", "level": "P0",
                "detail": f"状态 `{info['status']}`，退出码 {info['exit_code']}，"
                          f"累计重启 {info['restarts']} 次",
                "cooldown": DEDUP_SECONDS,
            })
        if info["oom"]:
            alerts.append({
                "name": name, "rule": "oom-killed", "level": "P0",
                "detail": "容器被 OOM 杀掉（内存上限打满）", "cooldown": DEDUP_SECONDS,
            })

        prev_restarts = restart_state.get(name)
        if prev_restarts is not None and info["restarts"] > prev_restarts:
            alerts.append({
                "name": name, "rule": "restart", "level": "P1",
                "detail": f"重启次数 {prev_restarts} → {info['restarts']}",
                "cooldown": DEDUP_SECONDS,
            })
        restart_state[name] = info["restarts"]

        # 健康检查只在状态翻转时告警，持续失败按 2 小时节奏提醒
        if info["health"] != "none":
            prev_health = health_state.get(name)
            if info["health"] == "unhealthy" and prev_health != "unhealthy":
                alerts.append({
                    "name": name, "rule": "health-failing", "level": "P1",
                    "detail": "healthcheck 连续失败（unhealthy）", "cooldown": DEDUP_SECONDS,
                })
            elif info["health"] == "unhealthy":
                alerts.append({
                    "name": name, "rule": "health-failing", "level": "P1",
                    "detail": "healthcheck 仍未恢复（unhealthy）",
                    "cooldown": HEALTH_REALERT_SECONDS,
                })
            health_state[name] = info["health"]

        if info["status"] != "running" or name not in RULES_BY_CONTAINER:
            continue

        since = last_seen.get(name, default_since)
        try:
            since = float(since)
        except (TypeError, ValueError):
            since = default_since
        lines = container_logs(name, since, info["tty"])
        last_seen[name] = now

        for rule, pattern, level, context in RULES_BY_CONTAINER[name]:
            hits = match_lines(lines, pattern, context)
            if not hits:
                continue
            if rule == "ops-budget":
                # 预算告警 value 每小时变化，按 code+day 拆成独立告警，保证每个预算项每天只推一次。
                for code, day, line in budget_hits(hits):
                    alerts.append({
                        "name": name, "rule": rule, "level": level,
                        "detail": f"命中 1 条：\n```\n{line[:2500]}\n```",
                        "cooldown": BUDGET_DEDUP_SECONDS,
                        "key": f"{name}|{rule}|{code}|{day}",
                    })
                continue
            detail = "\n---\n".join(hits[-4:])
            alerts.append({
                "name": name, "rule": rule, "level": level,
                "detail": f"命中 {len(hits)} 条：\n```\n{detail[:2500]}\n```",
                "cooldown": DEDUP_SECONDS,
            })
    state["snapshot"] = snapshot
    return alerts


def format_quiet(seconds: float) -> str:
    minutes = max(1, int(seconds // 60))
    if minutes < 60:
        return f"{minutes} 分钟"
    hours, rest = divmod(minutes, 60)
    return f"{hours} 小时 {rest} 分钟" if rest else f"{hours} 小时"


def heartbeat_detail(state: dict, now: float, manual: bool = False) -> str:
    snap = state.get("snapshot", {})
    last_event = state.get("last_event_at")
    lines = [
        f"**容器**：{snap.get('running', 0)}/{snap.get('total', 0)} 运行中，"
        f"{snap.get('healthy', 0)}/{snap.get('health_checked', 0)} 健康检查通过",
        f"**静默**：已连续 {format_quiet(now - (last_event or now))} 无异常",
    ]
    if last_event:
        lines.append(f"**上次异常**：{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(last_event))}")
    else:
        lines.append("**上次异常**：无记录")
    lines.append(f"**巡检**：每 {INTERVAL_SECONDS} 秒一次，"
                 "覆盖退出、OOM、重启、健康检查、ERROR 日志")
    if manual:
        lines.insert(0, "**说明**：手动触发的心跳测试")
    return "\n".join(lines)


def run_once(dry_run: bool = False) -> int:
    now = time.time()
    state = load_state()
    seen = state.setdefault("seen", {})
    hourly = state.setdefault("hour", [])
    seen = {k: v for k, v in seen.items() if now - v < 86400 * 7}
    hourly = [t for t in hourly if now - t < 3600]
    state["seen"], state["hour"] = seen, hourly

    alerts = collect(state, now)
    if alerts:
        state["last_event_at"] = now

    if not dry_run and not os.environ.get("ALERT_WEBHOOK"):
        save_state(state)
        print("ALERT_WEBHOOK 未配置，本轮只巡检不推送", file=sys.stderr)
        return 0

    sent = 0
    for alert in alerts:
        title = f"【{os.environ.get('ALERT_ENV', 'prod')}】{alert['level']} · " \
                f"{alert['name']} · {alert['rule']}"
        if dry_run:
            print(f"[dry-run] {title}")
            print(alert["detail"][:500])
            continue

        sig = alert.get("key") or hashlib.sha1(
            f"{alert['name']}|{alert['rule']}|{alert['detail'][:160]}".encode("utf-8")
        ).hexdigest()
        if now - seen.get(sig, 0) < alert["cooldown"]:
            continue
        if len(hourly) >= MAX_PER_HOUR:
            print("达到每小时上限，剩余告警跳过", file=sys.stderr)
            break

        body = alert["detail"] + (
            f"\n**排查**：`docker compose logs --tail=200 {alert['name']}`")
        if send_card(title, body, alert["level"]):
            seen[sig] = now
            hourly.append(now)
            sent += 1

    # 静默心跳：连续 1 小时无任何异常时推送一条，证明监控仍在工作
    if "last_event_at" not in state:
        state["last_event_at"] = now
    quiet_anchor = max(state["last_event_at"], state.get("last_heartbeat_at", 0))
    save_state(state)
    print(f"巡检完成：命中 {len(alerts)} 条，推送 {sent} 条")

    if now - quiet_anchor >= HEARTBEAT_SECONDS:
        if dry_run:
            print("[dry-run] 将发送心跳卡片")
        elif send_card("【心跳】GitStars 容器巡检正常",
                       heartbeat_detail(state, now), "P1", "green"):
            state["last_heartbeat_at"] = now
            save_state(state)
            print("心跳已推送")
    return 0


def run_loop() -> int:
    print(f"异常日志巡检已启动：间隔 {INTERVAL_SECONDS}s，容器 {SELF_CONTAINER} 自身不参与告警")
    while True:
        started = time.time()
        try:
            run_once()
        except Exception as exc:  # 单轮失败不退出常驻进程
            print(f"巡检失败：{exc}", file=sys.stderr)
        elapsed = time.time() - started
        time.sleep(max(1.0, INTERVAL_SECONDS - elapsed))


def main() -> int:
    enabled = os.environ.get("ALERT_ENABLED", "true").lower() not in ("0", "false", "no", "off")
    if "--test" in sys.argv:
        ok = send_card(
            "【测试】GitStars 异常日志通知链路",
            "**结论**：webhook 与卡片渲染均正常\n**下一步**：等待真实告警触发",
            "P1",
        )
        print("send ok" if ok else "send failed")
        return 0 if ok else 1

    dry_run = "--dry-run" in sys.argv
    if not enabled and not dry_run:
        print("ALERT_ENABLED=false，异常日志通知已禁用", file=sys.stderr)
        if "--loop" in sys.argv:
            while True:
                time.sleep(3600)
        return 0
    if "--loop" in sys.argv:
        return run_loop()
    return run_once(dry_run=dry_run)


if __name__ == "__main__":
    sys.exit(main())

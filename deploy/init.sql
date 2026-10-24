-- GitHub Stars 聚合站数据库初始化脚本
-- 由 MySQL 容器首次启动时自动执行

CREATE DATABASE IF NOT EXISTS githubstars DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE githubstars;

-- 仓库主表
CREATE TABLE IF NOT EXISTS repositories (
    id            BIGINT PRIMARY KEY AUTO_INCREMENT,
    full_name     VARCHAR(255) NOT NULL UNIQUE COMMENT 'owner/repo',
    name          VARCHAR(255) NOT NULL,
    owner         VARCHAR(255) NOT NULL,
    description   TEXT,
    homepage      VARCHAR(512),
    language      VARCHAR(64),
    license       VARCHAR(64),
    stars         INT DEFAULT 0,
    forks         INT DEFAULT 0,
    watchers      INT DEFAULT 0,
    open_issues   INT DEFAULT 0,
    topics        JSON COMMENT '标签数组',
    category      VARCHAR(64) COMMENT '分类（由规则推导）',
    platform      VARCHAR(32) COMMENT '平台（windows/mac/linux/android/ios/harmony/extension/other）',
    default_branch VARCHAR(64),
    pushed_at     DATETIME,
    created_at    DATETIME,
    archived      TINYINT DEFAULT 0,
    disabled      TINYINT DEFAULT 0,
    synced_at     DATETIME,
    readme_sha    VARCHAR(64) COMMENT 'README blob sha（M4 增量索引）',
    docs_indexed_at DATETIME COMMENT '最近一次完成索引的时间（M4）',
    INDEX idx_stars(stars),
    INDEX idx_language(language),
    INDEX idx_category(category),
    INDEX idx_platform(platform),
    INDEX idx_pushed_at(pushed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 标签表
CREATE TABLE IF NOT EXISTS tags (
    id   BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL UNIQUE,
    type VARCHAR(16) NOT NULL COMMENT 'category|language|topic',
    INDEX idx_type(type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 仓库-标签关联表
CREATE TABLE IF NOT EXISTS repo_tags (
    repo_id BIGINT NOT NULL,
    tag_id  BIGINT NOT NULL,
    PRIMARY KEY (repo_id, tag_id),
    INDEX idx_tag_id(tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 采集日志表
CREATE TABLE IF NOT EXISTS sync_logs (
    id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    job_type     VARCHAR(32) COMMENT 'full_sync|incremental|language',
    started_at   DATETIME,
    finished_at  DATETIME,
    status       VARCHAR(16) COMMENT 'running|success|failed',
    total        INT DEFAULT 0,
    succeeded    INT DEFAULT 0,
    failed       INT DEFAULT 0,
    error_detail TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 账号（M1）：一期仅 GitHub OAuth
CREATE TABLE IF NOT EXISTS users (
    id             BIGINT PRIMARY KEY AUTO_INCREMENT,
    provider       VARCHAR(16) NOT NULL COMMENT 'github',
    provider_uid   VARCHAR(64) NOT NULL COMMENT 'GitHub user id',
    email          VARCHAR(255),
    nickname       VARCHAR(128),
    avatar_url     VARCHAR(512),
    created_at     DATETIME,
    last_login_at  DATETIME,
    UNIQUE KEY uk_provider (provider, provider_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户画像（M6 使用，M1 建表）
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id     BIGINT PRIMARY KEY,
    skills      JSON,
    interests   JSON,
    preferences JSON,
    updated_at  DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 会话（M3）：AI 对话落库
CREATE TABLE IF NOT EXISTS conversations (
    id         BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id    BIGINT NOT NULL,
    idea_id    BIGINT NULL,
    title      VARCHAR(200),
    mode       VARCHAR(16) NOT NULL COMMENT 'chat|match|compare',
    created_at DATETIME,
    updated_at DATETIME,
    INDEX idx_user (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 会话消息（M3）：role=user|assistant|tool
CREATE TABLE IF NOT EXISTS messages (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    conversation_id BIGINT NOT NULL,
    role            VARCHAR(16) NOT NULL,
    content         MEDIUMTEXT,
    tool_trace      JSON,
    refs            JSON,
    tokens_in       INT,
    tokens_out      INT,
    created_at      DATETIME,
    INDEX idx_conv (conversation_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 用户想法（M4）：AI 只抽取用户明说的条件
CREATE TABLE IF NOT EXISTS ideas (
    id         BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id    BIGINT NOT NULL,
    title      VARCHAR(200),
    raw_text   TEXT NOT NULL,
    structured JSON NOT NULL,
    revision   INT DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME,
    KEY idx_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 仓库文档（M4）：一期只存 README
CREATE TABLE IF NOT EXISTS repo_documents (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    repo_id     BIGINT NOT NULL,
    kind        VARCHAR(24) NOT NULL COMMENT 'readme / manifest / tree / docs',
    source_url  VARCHAR(512),
    sha         VARCHAR(64),
    etag        VARCHAR(128) COMMENT '条件请求用',
    content     MEDIUMTEXT,
    token_count INT,
    fetched_at  DATETIME,
    UNIQUE KEY uk_repo_kind (repo_id, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 深度对比（M5）：结果由 llm-service 生成，backend 只负责落库与分享
CREATE TABLE IF NOT EXISTS comparisons (
    id             BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id        BIGINT NOT NULL,
    idea_id        BIGINT NULL,
    repo_keys      VARCHAR(512) NOT NULL COMMENT '排序后的 fullName 列表',
    schema_version VARCHAR(16) NOT NULL,
    result         MEDIUMTEXT NOT NULL COMMENT 'CompareResult JSON',
    cache_key      CHAR(64) NOT NULL,
    share_token    CHAR(32) NULL COMMENT '只读分享 token',
    created_at     DATETIME,
    KEY idx_user (user_id, created_at),
    KEY idx_cache (cache_key),
    UNIQUE KEY uk_share (share_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每日用量（配额以 Redis 原子扣减为准，这张表用于成本统计）
CREATE TABLE IF NOT EXISTS usage_daily (
    user_id       BIGINT NOT NULL,
    day           DATE NOT NULL,
    chat_count    INT DEFAULT 0,
    compare_count INT DEFAULT 0,
    tokens_in     BIGINT DEFAULT 0,
    tokens_out    BIGINT DEFAULT 0,
    PRIMARY KEY (user_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


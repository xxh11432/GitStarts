-- GitHub Stars 聚合站数据库初始化脚本
-- 由 MySQL 容器首次启动时自动执行；库名由 MYSQL_DATABASE 决定，脚本内不再硬编码
-- 手工执行时请带上库名，例如：mysql -u... "$MYSQL_DATABASE" < deploy/init.sql

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
    heat_score    INT DEFAULT 0 COMMENT '活跃度评分（Star 体量 × 近期推送衰减）',
    topics        JSON COMMENT '标签数组',
    category      VARCHAR(64) COMMENT '分类（由规则推导）',
    platform      VARCHAR(32) COMMENT '主平台（windows/mac/linux/android/ios/harmony/extension/other）',
    platforms     VARCHAR(255) COMMENT '多平台，逗号分隔',
    latest_release_tag VARCHAR(64) COMMENT '最新 Release tag',
    latest_release_at DATETIME,
    release_checked_at DATETIME COMMENT '最近一次检查 Release 的时间',
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
    INDEX idx_pushed_at(pushed_at),
    INDEX idx_heat_score(heat_score)
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

-- 收藏（M6）：用户收藏仓库与备注，按 user_id 隔离
CREATE TABLE IF NOT EXISTS favorites (
    id         BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id    BIGINT NOT NULL,
    repo_id    BIGINT NOT NULL,
    full_name  VARCHAR(255) NOT NULL,
    note       VARCHAR(500),
    created_at DATETIME,
    updated_at DATETIME,
    UNIQUE KEY uk_user_repo (user_id, repo_id),
    KEY idx_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每日用量（配额权威计数：count < limit 才允许 +1，同时累计 token 成本）
CREATE TABLE IF NOT EXISTS usage_daily (
    user_id       BIGINT NOT NULL,
    day           DATE NOT NULL,
    chat_count    INT DEFAULT 0,
    compare_count INT DEFAULT 0,
    tokens_in     BIGINT DEFAULT 0,
    tokens_out    BIGINT DEFAULT 0,
    PRIMARY KEY (user_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 配额账本（M1+）：唯一幂等键 + 两阶段状态，保证每笔扣费可回溯、可补退
CREATE TABLE IF NOT EXISTS quota_ledger (
    idem_key     CHAR(64) NOT NULL COMMENT 'SHA256(userId|kind|clientKey|fingerprint)',
    user_id      BIGINT NOT NULL,
    kind         VARCHAR(16) NOT NULL COMMENT 'chat / compare',
    client_key   VARCHAR(128) NOT NULL DEFAULT '' COMMENT 'chat=turnId；match/compare=请求指纹',
    fingerprint  VARCHAR(128) NOT NULL DEFAULT '' COMMENT '请求内容指纹',
    day          DATE NOT NULL,
    state        VARCHAR(16) NOT NULL COMMENT 'reserved / committed / released / refunded',
    reason       VARCHAR(64) NULL COMMENT 'released/refunded 原因',
    charged      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已计入 usage_daily',
    used_after   INT NULL COMMENT '该笔操作后的当日用量',
    tokens_in    BIGINT DEFAULT 0,
    tokens_out   BIGINT DEFAULT 0,
    request_id   VARCHAR(64) NULL COMMENT '用于按 requestId 查询与告警关联',
    created_at   DATETIME NOT NULL,
    updated_at   DATETIME NOT NULL,
    PRIMARY KEY (idem_key),
    KEY idx_user_day (user_id, day, kind),
    KEY idx_state_updated (state, updated_at),
    KEY idx_request (request_id),
    KEY idx_day (day),
    KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AI 请求指标（M7）：按请求记录 token、延迟与结果，用于成本看板与 P95
CREATE TABLE IF NOT EXISTS ai_metrics (
    id         BIGINT PRIMARY KEY AUTO_INCREMENT,
    kind       VARCHAR(16) NOT NULL COMMENT 'chat / match / compare',
    status     VARCHAR(16) NOT NULL COMMENT 'ok / error / timeout / cancelled',
    tokens_in  BIGINT DEFAULT 0,
    tokens_out BIGINT DEFAULT 0,
    latency_ms INT NOT NULL,
    cached     TINYINT(1) DEFAULT 0,
    created_at DATETIME NOT NULL,
    KEY idx_created (created_at),
    KEY idx_kind_created (kind, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===== 升级兼容：给已存在的 repositories 表补列（可重复执行） =====
DROP PROCEDURE IF EXISTS gs_add_column;
DELIMITER $$
CREATE PROCEDURE gs_add_column(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
    ) THEN
        SET @ddl = ddl;
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL gs_add_column('repositories', 'platforms',
    'ALTER TABLE repositories ADD COLUMN platforms VARCHAR(255) NULL COMMENT ''多平台，逗号分隔''');
CALL gs_add_column('repositories', 'latest_release_tag',
    'ALTER TABLE repositories ADD COLUMN latest_release_tag VARCHAR(64) NULL COMMENT ''最新 Release tag''');
CALL gs_add_column('repositories', 'latest_release_at',
    'ALTER TABLE repositories ADD COLUMN latest_release_at DATETIME NULL COMMENT ''最新 Release 时间''');
CALL gs_add_column('repositories', 'release_checked_at',
    'ALTER TABLE repositories ADD COLUMN release_checked_at DATETIME NULL COMMENT ''最近一次检查 Release 的时间''');
CALL gs_add_column('repositories', 'heat_score',
    'ALTER TABLE repositories ADD COLUMN heat_score INT DEFAULT 0 COMMENT ''活跃度评分（Star 体量 × 近期推送衰减）''');

DROP PROCEDURE IF EXISTS gs_add_index;
DELIMITER $$
CREATE PROCEDURE gs_add_index(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx
    ) THEN
        SET @ddl = ddl;
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;
CALL gs_add_index('repositories', 'idx_heat_score',
    'ALTER TABLE repositories ADD INDEX idx_heat_score(heat_score)');

DROP PROCEDURE IF EXISTS gs_add_column;
DROP PROCEDURE IF EXISTS gs_add_index;


package com.githubstars.collector;

import com.githubstars.service.SyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "github.sync-enabled", havingValue = "true", matchIfMissing = true)
public class SyncScheduler {

    private static final Logger log = LoggerFactory.getLogger(SyncScheduler.class);

    private final SyncService syncService;

    public SyncScheduler(SyncService syncService) {
        this.syncService = syncService;
    }

    /** 每小时增量更新已收录仓库的最新数据。 */
    @Scheduled(initialDelay = 60_000, fixedDelay = 3_600_000)
    public void incrementalJob() {
        log.info("开始增量同步");
        syncService.incrementalSync();
    }

    /** 每天按主要语言补齐覆盖度。 */
    @Scheduled(initialDelay = 120_000, fixedDelay = 24 * 3_600_000)
    public void languageJob() {
        log.info("开始按语言同步");
        syncService.languageSync();
    }

    /** 每天刷新一批仓库的最新 Release 版本号（GraphQL 批量）。 */
    @Scheduled(initialDelay = 180_000, fixedDelay = 24 * 3_600_000)
    public void releaseJob() {
        log.info("开始刷新 Release 版本");
        syncService.refreshReleases(1000);
    }
}

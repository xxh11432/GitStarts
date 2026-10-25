package com.githubstars.collector;

import com.githubstars.service.SyncService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.stereotype.Component;

/**
 * 首次启动时，若仓库表为空则异步触发一次全量同步。
 */
@Component
public class StartupSyncRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupSyncRunner.class);

    private final SyncService syncService;
    private final ThreadPoolTaskExecutor syncExecutor;

    @Value("${github.sync-enabled:true}")
    private boolean syncEnabled;

    public StartupSyncRunner(SyncService syncService, ThreadPoolTaskExecutor syncExecutor) {
        this.syncService = syncService;
        this.syncExecutor = syncExecutor;
    }

    @Override
    public void run(ApplicationArguments args) {
        long count = syncService.countRepos();
        if (count > 0) {
            syncExecutor.submit(() -> syncService.backfillPlatforms());
            syncExecutor.submit(() -> syncService.backfillHeatScores());
            syncExecutor.submit(() -> syncService.refreshReleases(300));
            int target = syncService.targetRepoCount();
            if (count < target) {
                log.info("仓库总量 {} 低于目标 {}，触发分层发现补齐", count, target);
                syncExecutor.submit(() -> syncService.discoverySync());
            }
            return;
        }
        if (!syncEnabled) {
            return;
        }
        log.info("仓库表为空，触发分层发现初始化");
        syncExecutor.submit(() -> syncService.discoverySync());
    }
}

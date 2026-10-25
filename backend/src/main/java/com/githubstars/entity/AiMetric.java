package com.githubstars.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDateTime;

/**
 * AI 请求指标：一次对话 / 匹配 / 对比请求的 token、延迟与结果，用于成本看板。
 */
@TableName("ai_metrics")
public class AiMetric {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String kind;
    private String status;
    private Long tokensIn;
    private Long tokensOut;
    private Integer latencyMs;
    private Boolean cached;
    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public Long getTokensIn() {
        return tokensIn;
    }

    public void setTokensIn(Long tokensIn) {
        this.tokensIn = tokensIn;
    }

    public Long getTokensOut() {
        return tokensOut;
    }

    public void setTokensOut(Long tokensOut) {
        this.tokensOut = tokensOut;
    }

    public Integer getLatencyMs() {
        return latencyMs;
    }

    public void setLatencyMs(Integer latencyMs) {
        this.latencyMs = latencyMs;
    }

    public Boolean getCached() {
        return cached;
    }

    public void setCached(Boolean cached) {
        this.cached = cached;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}

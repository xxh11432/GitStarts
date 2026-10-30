package com.githubstars.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 配额账本：每个幂等键一行，used_after 记录该笔操作后的当日用量。
 */
@TableName("quota_ledger")
public class QuotaLedger {

    @TableId(value = "idem_key", type = IdType.INPUT)
    private String idemKey;
    private Long userId;
    private String kind;
    private String clientKey;
    private String fingerprint;
    private LocalDate day;
    private String state;
    private String reason;
    private Boolean charged;
    private Integer usedAfter;
    private Long tokensIn;
    private Long tokensOut;
    private String requestId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public String getIdemKey() {
        return idemKey;
    }

    public void setIdemKey(String idemKey) {
        this.idemKey = idemKey;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public String getClientKey() {
        return clientKey;
    }

    public void setClientKey(String clientKey) {
        this.clientKey = clientKey;
    }

    public String getFingerprint() {
        return fingerprint;
    }

    public void setFingerprint(String fingerprint) {
        this.fingerprint = fingerprint;
    }

    public LocalDate getDay() {
        return day;
    }

    public void setDay(LocalDate day) {
        this.day = day;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public Boolean getCharged() {
        return charged;
    }

    public void setCharged(Boolean charged) {
        this.charged = charged;
    }

    public Integer getUsedAfter() {
        return usedAfter;
    }

    public void setUsedAfter(Integer usedAfter) {
        this.usedAfter = usedAfter;
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

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}

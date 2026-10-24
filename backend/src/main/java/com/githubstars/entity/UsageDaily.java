package com.githubstars.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

import java.time.LocalDate;

@TableName("usage_daily")
public class UsageDaily {

    @TableId(value = "user_id", type = IdType.INPUT)
    private Long userId;
    private LocalDate day;
    private Integer chatCount;
    private Integer compareCount;
    private Long tokensIn;
    private Long tokensOut;

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public LocalDate getDay() {
        return day;
    }

    public void setDay(LocalDate day) {
        this.day = day;
    }

    public Integer getChatCount() {
        return chatCount;
    }

    public void setChatCount(Integer chatCount) {
        this.chatCount = chatCount;
    }

    public Integer getCompareCount() {
        return compareCount;
    }

    public void setCompareCount(Integer compareCount) {
        this.compareCount = compareCount;
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
}

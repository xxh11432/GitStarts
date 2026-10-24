package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.UsageDaily;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;

@Mapper
public interface UsageDailyMapper extends BaseMapper<UsageDaily> {

    /**
     * 累加当日用量。配额本身在 Redis 中原子扣减，这里只做成本统计的最终一致落库。
     */
    @Insert("INSERT INTO usage_daily (user_id, day, chat_count, compare_count, tokens_in, tokens_out) " +
            "VALUES (#{userId}, #{day}, #{chatDelta}, #{compareDelta}, 0, 0) " +
            "ON DUPLICATE KEY UPDATE " +
            "chat_count = chat_count + #{chatDelta}, " +
            "compare_count = compare_count + #{compareDelta}")
    int incrementCounts(@Param("userId") Long userId,
                        @Param("day") LocalDate day,
                        @Param("chatDelta") int chatDelta,
                        @Param("compareDelta") int compareDelta);
}

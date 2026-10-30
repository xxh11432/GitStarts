package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.UsageDaily;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;
import java.util.List;

@Mapper
public interface UsageDailyMapper extends BaseMapper<UsageDaily> {

    /**
     * 配额权威计数：MySQL 行级原子更新，count < limit 才允许 +1，从根上避免超发。
     */
    @Insert("INSERT INTO usage_daily (user_id, day, chat_count, compare_count, tokens_in, tokens_out) " +
            "VALUES (#{userId}, #{day}, 0, 0, 0, 0) " +
            "ON DUPLICATE KEY UPDATE user_id = user_id")
    int ensureRow(@Param("userId") Long userId, @Param("day") LocalDate day);

    @Update("UPDATE usage_daily SET chat_count = chat_count + 1 " +
            "WHERE user_id = #{userId} AND day = #{day} AND chat_count < #{limit}")
    int incrementChatIfBelow(@Param("userId") Long userId,
                             @Param("day") LocalDate day,
                             @Param("limit") int limit);

    @Update("UPDATE usage_daily SET compare_count = compare_count + 1 " +
            "WHERE user_id = #{userId} AND day = #{day} AND compare_count < #{limit}")
    int incrementCompareIfBelow(@Param("userId") Long userId,
                                @Param("day") LocalDate day,
                                @Param("limit") int limit);

    @Update("UPDATE usage_daily SET chat_count = GREATEST(chat_count - 1, 0) " +
            "WHERE user_id = #{userId} AND day = #{day}")
    int decrementChat(@Param("userId") Long userId, @Param("day") LocalDate day);

    @Update("UPDATE usage_daily SET compare_count = GREATEST(compare_count - 1, 0) " +
            "WHERE user_id = #{userId} AND day = #{day}")
    int decrementCompare(@Param("userId") Long userId, @Param("day") LocalDate day);

    @Update("UPDATE usage_daily SET tokens_in = tokens_in + #{tokensIn}, " +
            "tokens_out = tokens_out + #{tokensOut} " +
            "WHERE user_id = #{userId} AND day = #{day}")
    int addTokens(@Param("userId") Long userId,
                  @Param("day") LocalDate day,
                  @Param("tokensIn") long tokensIn,
                  @Param("tokensOut") long tokensOut);

    /**
     * 对账任务按账本重算后的绝对用量校准。
     */
    @Update("UPDATE usage_daily SET chat_count = #{chatCount}, compare_count = #{compareCount} " +
            "WHERE user_id = #{userId} AND day = #{day}")
    int overrideCounts(@Param("userId") Long userId,
                       @Param("day") LocalDate day,
                       @Param("chatCount") int chatCount,
                       @Param("compareCount") int compareCount);

    @Select("SELECT user_id, day, chat_count, compare_count, tokens_in, tokens_out " +
            "FROM usage_daily WHERE user_id = #{userId} AND day = #{day}")
    UsageDaily selectByUserDay(@Param("userId") Long userId, @Param("day") LocalDate day);

    @Select("SELECT user_id, day, chat_count, compare_count, tokens_in, tokens_out " +
            "FROM usage_daily WHERE day = #{day}")
    List<UsageDaily> selectByDay(@Param("day") LocalDate day);
}

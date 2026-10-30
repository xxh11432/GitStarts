package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.QuotaLedger;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 配额账本操作：插入由唯一主键兜底，状态流转只允许 reserved → committed / released / refunded。
 */
@Mapper
public interface QuotaLedgerMapper extends BaseMapper<QuotaLedger> {

    /**
     * INSERT IGNORE 让同一幂等键的并发请求只有一个能创建账本行，其余落到已有的行上。
     */
    @Insert("""
            INSERT IGNORE INTO quota_ledger
                (idem_key, user_id, kind, client_key, fingerprint, day, state, charged,
                 tokens_in, tokens_out, request_id, created_at, updated_at)
            VALUES
                (#{idemKey}, #{userId}, #{kind}, #{clientKey}, #{fingerprint}, #{day}, 'reserved', 0,
                 0, 0, #{requestId}, #{now}, #{now})
            """)
    int insertIgnore(@Param("idemKey") String idemKey,
                     @Param("userId") Long userId,
                     @Param("kind") String kind,
                     @Param("clientKey") String clientKey,
                     @Param("fingerprint") String fingerprint,
                     @Param("day") LocalDate day,
                     @Param("requestId") String requestId,
                     @Param("now") LocalDateTime now);

    @Select("SELECT * FROM quota_ledger WHERE idem_key = #{idemKey} FOR UPDATE")
    QuotaLedger selectForUpdate(@Param("idemKey") String idemKey);

    @Select("SELECT * FROM quota_ledger WHERE idem_key = #{idemKey}")
    QuotaLedger selectByKey(@Param("idemKey") String idemKey);

    @Select("""
            SELECT * FROM quota_ledger
            WHERE request_id = #{requestId}
            ORDER BY created_at DESC
            LIMIT 5
            """)
    List<QuotaLedger> selectByRequestId(@Param("requestId") String requestId);

    @Select("""
            SELECT * FROM quota_ledger
            WHERE state = 'reserved' AND kind = #{kind} AND updated_at < #{cutoff}
            ORDER BY updated_at
            LIMIT #{limit}
            """)
    List<QuotaLedger> selectStaleReserved(@Param("kind") String kind,
                                          @Param("cutoff") LocalDateTime cutoff,
                                          @Param("limit") int limit);

    /**
     * 重试复用同一预留时刷新心跳，避免重新开始执行的任务被 reaper 回收。
     */
    @Update("""
            UPDATE quota_ledger
            SET updated_at = #{now}
            WHERE idem_key = #{idemKey} AND state = 'reserved'
            """)
    int touchReserved(@Param("idemKey") String idemKey, @Param("now") LocalDateTime now);

    @Update("""
            UPDATE quota_ledger
            SET state = 'reserved', charged = 1, used_after = #{usedAfter}, reason = NULL,
                day = #{day}, updated_at = #{now}
            WHERE idem_key = #{idemKey}
            """)
    int markReserved(@Param("idemKey") String idemKey,
                     @Param("day") LocalDate day,
                     @Param("usedAfter") int usedAfter,
                     @Param("now") LocalDateTime now);

    @Update("""
            UPDATE quota_ledger
            SET state = 'committed', tokens_in = #{tokensIn}, tokens_out = #{tokensOut},
                used_after = COALESCE(#{usedAfter}, used_after), updated_at = #{now}
            WHERE idem_key = #{idemKey} AND state = 'reserved'
            """)
    int markCommitted(@Param("idemKey") String idemKey,
                      @Param("tokensIn") long tokensIn,
                      @Param("tokensOut") long tokensOut,
                      @Param("usedAfter") Integer usedAfter,
                      @Param("now") LocalDateTime now);

    @Update("""
            UPDATE quota_ledger
            SET state = 'released', reason = #{reason}, used_after = #{usedAfter},
                updated_at = #{now}
            WHERE idem_key = #{idemKey} AND state = 'reserved'
            """)
    int markReleased(@Param("idemKey") String idemKey,
                     @Param("reason") String reason,
                     @Param("usedAfter") int usedAfter,
                     @Param("now") LocalDateTime now);

    @Update("""
            UPDATE quota_ledger
            SET state = 'refunded', reason = #{reason}, used_after = #{usedAfter},
                updated_at = #{now}
            WHERE idem_key = #{idemKey} AND state IN ('reserved', 'committed')
            """)
    int markRefunded(@Param("idemKey") String idemKey,
                     @Param("reason") String reason,
                     @Param("usedAfter") int usedAfter,
                     @Param("now") LocalDateTime now);

    /**
     * 对账口径：只有 charged=1 且仍处于 reserved / committed 的账本行计入当日用量，
     * 并把每笔 token 折算成加权单位，与 commit 时的扣减保持一致。
     */
    @Select("""
            SELECT user_id AS userId, kind AS kind,
                   COUNT(*) + CAST(FLOOR(
                       (COALESCE(SUM(tokens_in), 0) + COALESCE(SUM(tokens_out), 0)) / #{tokensPerUnit}
                   ) AS SIGNED) AS cnt
            FROM quota_ledger
            WHERE day = #{day} AND charged = 1 AND state IN ('reserved', 'committed')
            GROUP BY user_id, kind
            """)
    List<Map<String, Object>> countChargedByDay(@Param("day") LocalDate day,
                                                @Param("tokensPerUnit") long tokensPerUnit);

    @Delete("DELETE FROM quota_ledger WHERE user_id = #{userId}")
    int deleteByUser(@Param("userId") Long userId);

    @Delete("DELETE FROM quota_ledger WHERE created_at < #{cutoff}")
    int deleteOlderThan(@Param("cutoff") LocalDateTime cutoff);
}

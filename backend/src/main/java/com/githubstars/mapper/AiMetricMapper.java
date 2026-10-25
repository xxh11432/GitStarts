package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.AiMetric;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Mapper
public interface AiMetricMapper extends BaseMapper<AiMetric> {

    /**
     * 按天 + 类型聚合请求数、token 与错误数；P95 在服务层按延迟样本计算。
     */
    @Select("""
            SELECT DATE(created_at) AS day, kind,
                   COUNT(*) AS cnt,
                   SUM(tokens_in) AS tokens_in,
                   SUM(tokens_out) AS tokens_out,
                   SUM(CASE WHEN status = 'ok' THEN 0 ELSE 1 END) AS errors
            FROM ai_metrics
            WHERE created_at >= #{from}
            GROUP BY DATE(created_at), kind
            ORDER BY day, kind
            """)
    List<Map<String, Object>> aggregateDaily(@Param("from") LocalDateTime from);

    /**
     * 延迟样本：量级控制在成本看板的窗口内，服务层用最近秩法计算 P95。
     */
    @Select("""
            SELECT DATE(created_at) AS day, kind, latency_ms
            FROM ai_metrics
            WHERE created_at >= #{from}
            """)
    List<Map<String, Object>> latencySamples(@Param("from") LocalDateTime from);
}

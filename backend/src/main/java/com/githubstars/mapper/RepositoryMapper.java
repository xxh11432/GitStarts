package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.Repository;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;
import java.util.Map;

@Mapper
public interface RepositoryMapper extends BaseMapper<Repository> {

    @Select("SELECT category AS name, COUNT(*) AS cnt FROM repositories " +
            "WHERE category IS NOT NULL AND category != '' " +
            "GROUP BY category ORDER BY cnt DESC")
    List<Map<String, Object>> countByCategory();

    @Select("SELECT language AS name, COUNT(*) AS cnt FROM repositories " +
            "WHERE language IS NOT NULL AND language != '' " +
            "GROUP BY language ORDER BY cnt DESC")
    List<Map<String, Object>> countByLanguage();

    @Select("SELECT platform AS name, COUNT(*) AS cnt FROM repositories " +
            "WHERE platform IS NOT NULL AND platform != '' " +
            "GROUP BY platform ORDER BY cnt DESC")
    List<Map<String, Object>> countByPlatform();

    /**
     * 回填活跃度评分：公式与 ActivityScore 一致，按 30 / 90 / 180 天分档衰减。
     */
    @Update("UPDATE repositories SET heat_score = ROUND(LOG10(COALESCE(stars, 0) + 1) * 100 * " +
            "CASE " +
            "WHEN pushed_at IS NULL THEN 0.3 " +
            "WHEN pushed_at >= NOW() - INTERVAL 30 DAY THEN 1.0 " +
            "WHEN pushed_at >= NOW() - INTERVAL 90 DAY THEN 0.8 " +
            "WHEN pushed_at >= NOW() - INTERVAL 180 DAY THEN 0.6 " +
            "ELSE 0.4 END)")
    int backfillHeatScores();
}

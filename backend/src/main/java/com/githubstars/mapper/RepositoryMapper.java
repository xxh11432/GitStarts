package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.Repository;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

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
}

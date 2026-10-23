package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.Tag;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface TagMapper extends BaseMapper<Tag> {

    @Select("SELECT t.name AS name, t.slug AS slug, COUNT(rt.repo_id) AS cnt " +
            "FROM tags t LEFT JOIN repo_tags rt ON t.id = rt.tag_id " +
            "WHERE t.type = 'topic' " +
            "GROUP BY t.id, t.name, t.slug " +
            "ORDER BY cnt DESC LIMIT #{limit}")
    List<Map<String, Object>> selectTopTopics(@Param("limit") int limit);
}

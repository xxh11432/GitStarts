package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.Idea;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface IdeaMapper extends BaseMapper<Idea> {
}

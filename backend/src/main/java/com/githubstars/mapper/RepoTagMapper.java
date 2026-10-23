package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.RepoTag;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RepoTagMapper extends BaseMapper<RepoTag> {
}

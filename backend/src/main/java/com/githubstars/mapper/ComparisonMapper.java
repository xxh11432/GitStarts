package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.Comparison;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ComparisonMapper extends BaseMapper<Comparison> {
}

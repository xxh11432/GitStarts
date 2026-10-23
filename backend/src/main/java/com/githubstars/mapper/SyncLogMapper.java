package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.SyncLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SyncLogMapper extends BaseMapper<SyncLog> {
}

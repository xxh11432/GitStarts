package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.RepoDocument;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface RepoDocumentMapper extends BaseMapper<RepoDocument> {
}

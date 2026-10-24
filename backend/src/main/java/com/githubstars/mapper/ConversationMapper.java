package com.githubstars.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.githubstars.entity.Conversation;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

@Mapper
public interface ConversationMapper extends BaseMapper<Conversation> {

    /**
     * 追加消息时只更新时间戳，避免多余的查询与整行更新。
     */
    @Update("UPDATE conversations SET updated_at = #{updatedAt} WHERE id = #{id}")
    int touch(@Param("id") Long id, @Param("updatedAt") LocalDateTime updatedAt);
}

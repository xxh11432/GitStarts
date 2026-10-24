package com.githubstars.controller;

import com.githubstars.dto.ComparisonSaveRequest;
import com.githubstars.dto.ConversationCreateRequest;
import com.githubstars.dto.IdeaCreateRequest;
import com.githubstars.dto.IdeaResponse;
import com.githubstars.dto.IdeaUpdateRequest;
import com.githubstars.dto.IndexMarkRequest;
import com.githubstars.dto.IndexRepoPage;
import com.githubstars.dto.MessageCreateRequest;
import com.githubstars.dto.QuotaReserveRequest;
import com.githubstars.dto.QuotaReserveResponse;
import com.githubstars.dto.RepoBatchRequest;
import com.githubstars.dto.RepoDocumentUpsertRequest;
import com.githubstars.dto.RepoResponse;
import com.githubstars.security.OAuth2UserPrincipal;
import com.githubstars.service.ComparisonService;
import com.githubstars.service.ConversationService;
import com.githubstars.service.DocumentService;
import com.githubstars.service.IdeaService;
import com.githubstars.service.QuotaKind;
import com.githubstars.service.QuotaService;
import com.githubstars.service.RankService;
import com.githubstars.service.RepoService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 服务间接口：仅 llm-service 调用（X-Internal-Token + Nginx 外网 404）。
 */
@RestController
@RequestMapping("/internal")
public class InternalController {

    private final QuotaService quotaService;
    private final RepoService repoService;
    private final RankService rankService;
    private final ConversationService conversationService;
    private final DocumentService documentService;
    private final IdeaService ideaService;
    private final ComparisonService comparisonService;

    public InternalController(QuotaService quotaService, RepoService repoService,
                              RankService rankService, ConversationService conversationService,
                              DocumentService documentService, IdeaService ideaService,
                              ComparisonService comparisonService) {
        this.quotaService = quotaService;
        this.repoService = repoService;
        this.rankService = rankService;
        this.conversationService = conversationService;
        this.documentService = documentService;
        this.ideaService = ideaService;
        this.comparisonService = comparisonService;
    }

    @PostMapping("/quota/reserve")
    public ResponseEntity<Object> reserveQuota(@RequestBody QuotaReserveRequest request) {
        if (request.userId() == null) {
            throw new IllegalArgumentException("userId 必填");
        }
        QuotaKind kind = QuotaKind.from(request.kind());
        QuotaService.Reservation reservation = quotaService.reserve(request.userId(), kind);
        String resetAt = quotaService.resetAt();

        if (!reservation.allowed()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("code", "quota_exceeded");
            body.put("message", quotaService.limitMessage(kind));
            body.put("kind", kind.value());
            body.put("used", reservation.used());
            body.put("limit", reservation.limit());
            body.put("resetAt", resetAt);
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(body);
        }

        return ResponseEntity.ok(new QuotaReserveResponse(true, reservation.used(), reservation.limit(),
                reservation.remaining(), resetAt));
    }

    /**
     * AI 工具 search_repos：关键字与硬条件检索。
     */
    @GetMapping("/repos/search")
    public List<RepoResponse> searchRepos(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String language,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String license,
            @RequestParam(required = false) String platform,
            @RequestParam(required = false) Integer minStars,
            @RequestParam(defaultValue = "stars") String sort,
            @RequestParam(defaultValue = "10") int limit) {
        return repoService.searchForAi(q, language, category, license, platform, minStars, sort, limit);
    }

    /**
     * 语义匹配：按 fullName 批量取仓库元信息（Qdrant 召回结果补全）。
     */
    @PostMapping("/repos/batch")
    public List<RepoResponse> batchRepos(@RequestBody RepoBatchRequest request) {
        return documentService.batch(request.fullNames());
    }

    /**
     * 索引 worker：按 id 游标分页取待索引仓库。
     */
    @GetMapping("/index/repos")
    public IndexRepoPage indexRepos(@RequestParam(required = false) Long cursor,
                                    @RequestParam(defaultValue = "100") int limit) {
        return documentService.listIndexRepos(cursor, limit);
    }

    /**
     * 索引 worker：上报 README 文档与 sha。
     */
    @PostMapping("/repo-documents")
    public Map<String, Object> upsertDocument(@RequestBody RepoDocumentUpsertRequest request) {
        return Map.of("id", documentService.upsert(request));
    }

    /**
     * 索引 worker：标记一批仓库完成索引（断点续跑时用于跳过已完成仓库）。
     */
    @PostMapping("/index/mark")
    public Map<String, Object> markIndexed(@RequestBody IndexMarkRequest request) {
        documentService.markIndexed(request.repoIds());
        return Map.of("ok", true);
    }

    /**
     * 语义匹配：读取想法（llm-service 侧确认归属）。
     */
    @GetMapping("/ideas/{id}")
    public IdeaResponse idea(@PathVariable Long id,
                             @RequestParam(required = false) Long userId) {
        return ideaService.get(id, userId);
    }

    /**
     * 语义匹配：落库结构化后的想法。
     */
    @PostMapping("/ideas")
    public Map<String, Object> createIdea(@RequestBody IdeaCreateRequest request) {
        return Map.of("id", ideaService.create(request).id());
    }

    /**
     * 语义匹配：模型重新结构化后回写条件。
     */
    @PatchMapping("/ideas/{id}")
    public IdeaResponse updateIdea(@PathVariable Long id, @RequestBody IdeaUpdateRequest request) {
        return ideaService.update(id, null, request);
    }

    /**
     * AI 工具 get_rank：榜单。
     */
    @GetMapping("/repos/rank")
    public List<RepoResponse> rankRepos(
            @RequestParam(defaultValue = "total") String type,
            @RequestParam(required = false) String language,
            @RequestParam(defaultValue = "10") int limit) {
        return rankService.rank(type, language, limit);
    }

    /**
     * AI 工具 get_repo：按 fullName 取详情。
     */
    @GetMapping("/repos/{*fullName}")
    public RepoResponse repo(@PathVariable String fullName) {
        return repoService.getRepo(fullName);
    }

    @PostMapping("/conversations")
    public Map<String, Object> createConversation(@RequestBody ConversationCreateRequest request) {
        Long id = conversationService.create(request);
        return Map.of("id", id);
    }

    @PostMapping("/messages")
    public Map<String, Object> createMessage(@RequestBody MessageCreateRequest request) {
        Long id = conversationService.append(request);
        return Map.of("id", id);
    }

    /**
     * 深度对比：llm-service 生成结果后在此落库。
     */
    @PostMapping("/comparisons")
    public Map<String, Object> createComparison(@RequestBody ComparisonSaveRequest request) {
        return Map.of("id", comparisonService.create(request));
    }

    /**
     * Nginx auth_request 子请求：校验会话并回传 X-User-Id，供 llm-service 使用。
     */
    @GetMapping("/auth/session")
    public ResponseEntity<Map<String, Object>> session() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken
                || !(authentication.getPrincipal() instanceof OAuth2UserPrincipal principal)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("code", "unauthorized"));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("userId", principal.getUserId());
        body.put("nickname", principal.getNickname());
        return ResponseEntity.ok()
                .header("X-User-Id", String.valueOf(principal.getUserId()))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }
}

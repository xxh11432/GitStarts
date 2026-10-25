package com.githubstars.controller;

import com.githubstars.dto.PageResult;
import com.githubstars.dto.ReadmeSummary;
import com.githubstars.dto.RepoResponse;
import com.githubstars.service.RankService;
import com.githubstars.service.RepoService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/repos")
public class RepoController {

    private final RepoService repoService;
    private final RankService rankService;

    public RepoController(RepoService repoService, RankService rankService) {
        this.repoService = repoService;
        this.rankService = rankService;
    }

    @GetMapping
    public PageResult<RepoResponse> list(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String language,
            @RequestParam(required = false) String topic,
            @RequestParam(required = false) String platform,
            @RequestParam(required = false) String license,
            @RequestParam(defaultValue = "stars") String sort,
            @RequestParam(defaultValue = "desc") String order,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return repoService.listRepos(q, category, language, topic, platform, license, sort, order, page, size);
    }

    @GetMapping("/rank")
    public List<RepoResponse> rank(
            @RequestParam(defaultValue = "total") String type,
            @RequestParam(required = false) String language,
            @RequestParam(required = false) String topic,
            @RequestParam(defaultValue = "20") int limit) {
        return rankService.rank(type, language, topic, limit);
    }

    @GetMapping("/similar/{*fullName}")
    public List<RepoResponse> similar(@PathVariable String fullName,
                                      @RequestParam(defaultValue = "6") int limit) {
        return repoService.similarRepos(fullName, limit);
    }

    @GetMapping("/{owner}/{repo}/readme")
    public ReadmeSummary readme(@PathVariable String owner, @PathVariable String repo) {
        return repoService.readmeSummary(owner + "/" + repo);
    }

    @GetMapping("/{*fullName}")
    public RepoResponse detail(@PathVariable String fullName) {
        return repoService.getRepo(fullName);
    }
}

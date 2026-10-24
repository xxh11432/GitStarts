export default function HeroComposer() {
  return (
    <div id="composer" className="mx-auto mt-8 w-full max-w-3xl">
      <form
        method="get"
        action="/repos"
        className="rounded-card border border-line bg-background p-3 shadow-card focus-within:border-accent"
      >
        <label htmlFor="idea-input" className="sr-only">
          描述你的想法
        </label>
        <textarea
          id="idea-input"
          name="q"
          rows={3}
          placeholder="例如：搭建一个支持中文全文检索的自托管团队知识库"
          className="w-full resize-none border-0 bg-transparent px-2 py-1.5 text-body text-ink placeholder:text-ink-muted focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 px-1 pt-2">
          <p className="text-xs text-ink-muted">先用关键词检索；AI 语义匹配与深读即将上线</p>
          <button
            type="submit"
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            搜索开源方案
          </button>
        </div>
      </form>
      <p className="mt-2 text-center text-xs text-ink-muted">
        支持描述技术栈、部署方式、许可证等条件，例如「可 Docker 自托管、MIT 协议」
      </p>
    </div>
  );
}

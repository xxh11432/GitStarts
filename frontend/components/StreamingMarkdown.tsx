import type { ReactNode } from 'react';

/**
 * 轻量 Markdown 渲染：只支持对话里常用的语法，不渲染原始 HTML；
 * 链接仅允许 http(s)，并统一在新标签页打开。
 */
export default function StreamingMarkdown({ content }: { content: string }) {
  if (!content.trim()) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 break-words text-sm leading-relaxed text-foreground">
      {renderBlocks(content)}
    </div>
  );
}

const INLINE_PATTERN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\))/g;

function renderInline(text: string, prefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  INLINE_PATTERN.lastIndex = 0;

  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const key = `${prefix}-${index}`;
    if (match[1]) {
      nodes.push(
        <code key={key} className="bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
          {match[1].slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {match[2].slice(2, -2)}
        </strong>,
      );
    } else if (match[3] && match[4]) {
      const label = match[3].slice(1, match[3].indexOf(']'));
      nodes.push(
        <a
          key={key}
          href={match[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-2 hover:underline"
        >
          {label}
        </a>,
      );
    }
    cursor = match.index + match[0].length;
    index += 1;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function renderBlocks(content: string): ReactNode[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    const text = paragraph.join(' ');
    blocks.push(<p key={`p-${key++}`}>{renderInline(text, `p-${key}`)}</p>);
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      flushParagraph();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      blocks.push(
        <pre
          key={`code-${key++}`}
          className="overflow-x-auto border border-border bg-muted p-3 text-xs leading-relaxed"
        >
          <code className="font-mono">{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const className =
        level <= 2 ? 'mt-1 text-base font-semibold text-foreground' : 'mt-1 text-sm font-semibold text-foreground';
      blocks.push(
        <p key={`h-${key++}`} className={className}>
          {renderInline(heading[2], `h-${key}`)}
        </p>,
      );
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushParagraph();
      continue;
    }

    if (line.trimStart().startsWith('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flushParagraph();
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push(
        <div key={`table-${key++}`} className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th
                    key={`th-${cellIndex}`}
                    className="border border-border bg-muted px-2 py-1.5 text-left font-semibold text-foreground"
                  >
                    {renderInline(cell, `th-${cellIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`tr-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`td-${cellIndex}`}
                      className="border border-border px-2 py-1.5 align-top text-muted-foreground"
                    >
                      {renderInline(cell, `td-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*[-*+]\s+(.*)$/);
        if (!item) {
          break;
        }
        items.push(item[1]);
        i += 1;
      }
      i -= 1;
      blocks.push(
        <ul key={`ul-${key++}`} className="list-disc pl-5 [&>li+li]:mt-1">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`}>{renderInline(item, `li-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!item) {
          break;
        }
        items.push(item[1]);
        i += 1;
      }
      i -= 1;
      blocks.push(
        <ol key={`ol-${key++}`} className="list-decimal pl-5 [&>li+li]:mt-1">
          {items.map((item, itemIndex) => (
            <li key={`oli-${itemIndex}`}>{renderInline(item, `oli-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      const quoted: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*>\s?(.*)$/);
        if (!item) {
          break;
        }
        quoted.push(item[1]);
        i += 1;
      }
      i -= 1;
      blocks.push(
        <blockquote
          key={`quote-${key++}`}
          className="border-l-2 border-border pl-3 text-muted-foreground"
        >
          {renderInline(quoted.join(' '), `quote-${key}`)}
        </blockquote>,
      );
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
}

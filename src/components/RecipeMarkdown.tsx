import { useState } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";

const CodeBlock = ({ code }: { code: string }) => {
  const { toast } = useToast();
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => toast({ title: "Код скопирован" }));
  };
  return (
    <div className="relative my-4">
      <Button
        size="sm"
        variant="outline"
        className="absolute top-2 right-2 h-7 gap-1.5 z-10"
        onClick={copy}
      >
        <Icon name="Copy" size={14} />
        Копировать
      </Button>
      <pre className="bg-black/40 rounded-xl p-4 pt-10 overflow-x-auto text-xs font-mono text-green-300 whitespace-pre max-h-[60vh] overflow-y-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
};

const renderInline = (line: string) => {
  const parts: (string | JSX.Element)[] = [];
  let remaining = line;
  let partKey = 0;
  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);
    let first: { index: number; length: number; type: string; content: string } | null = null;
    if (boldMatch && boldMatch.index !== undefined) {
      first = { index: boldMatch.index, length: boldMatch[0].length, type: "bold", content: boldMatch[1] };
    }
    if (codeMatch && codeMatch.index !== undefined) {
      if (!first || codeMatch.index < first.index) {
        first = { index: codeMatch.index, length: codeMatch[0].length, type: "code", content: codeMatch[1] };
      }
    }
    if (!first) {
      parts.push(remaining);
      break;
    }
    if (first.index > 0) parts.push(remaining.substring(0, first.index));
    if (first.type === "bold") {
      parts.push(<strong key={partKey++} className="font-semibold text-foreground">{first.content}</strong>);
    } else {
      parts.push(<code key={partKey++} className="px-1.5 py-0.5 rounded bg-white/[0.08] text-sm font-mono text-orange-300">{first.content}</code>);
    }
    remaining = remaining.substring(first.index + first.length);
  }
  return parts;
};

const RecipeMarkdown = ({ text }: { text: string }) => {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(<CodeBlock key={key++} code={codeLines.join("\n")} />);
      continue;
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={key++} className="text-2xl font-bold mt-8 mb-4 text-foreground">{renderInline(line.slice(2))}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="text-xl font-bold mt-8 mb-3 text-foreground border-b border-white/[0.08] pb-2">{renderInline(line.slice(3))}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="text-lg font-semibold mt-6 mb-2 text-foreground">{renderInline(line.slice(4))}</h3>);
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="list-decimal list-inside space-y-1.5 my-2 ml-1 text-sm text-muted-foreground">
          {items.map((it, li) => <li key={li}>{renderInline(it)}</li>)}
        </ol>
      );
      continue;
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 ml-1 text-sm text-muted-foreground">
          {items.map((it, li) => <li key={li}>{renderInline(it)}</li>)}
        </ul>
      );
      continue;
    } else if (line.trim() === "") {
      // skip
    } else {
      elements.push(<p key={key++} className="text-sm text-muted-foreground my-1.5">{renderInline(line)}</p>);
    }
    i++;
  }

  return <>{elements}</>;
};

export default RecipeMarkdown;

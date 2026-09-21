import Icon from "@/components/ui/icon";

interface ResultBoxProps {
  ok: boolean;
  title: string;
  details?: string;
  sent?: Record<string, unknown>;
}

const ResultBox = ({ ok, title, details, sent }: ResultBoxProps) => (
  <div
    className={`mt-3 rounded-lg border p-3 text-sm ${
      ok
        ? "border-emerald-500/30 bg-emerald-500/[0.07]"
        : "border-red-500/30 bg-red-500/[0.07]"
    }`}
  >
    <div className="flex items-start gap-2">
      <Icon
        name={ok ? "CircleCheck" : "CircleAlert"}
        size={16}
        className={`mt-0.5 shrink-0 ${ok ? "text-emerald-400" : "text-red-400"}`}
      />
      <div className="min-w-0 flex-1">
        <div className={ok ? "text-emerald-200" : "text-red-200"}>{title}</div>
        {details && (
          <pre className="mt-2 whitespace-pre-wrap break-words text-xs font-mono text-muted-foreground max-h-60 overflow-y-auto">
            {details}
          </pre>
        )}
        {sent && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Что отправляли в 1С
            </summary>
            <pre className="mt-1 whitespace-pre-wrap break-words text-xs font-mono text-muted-foreground">
              {JSON.stringify(sent, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  </div>
);

export default ResultBox;

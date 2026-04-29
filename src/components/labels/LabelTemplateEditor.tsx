import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";

export type LabelRowType = "text" | "barcode" | "qr";

export interface LabelRow {
  id: string;
  type: LabelRowType;
  content: string;
  fontSize: number;
  bold: boolean;
  align: "left" | "center" | "right";
}

interface Props {
  rows: LabelRow[];
  onChange: (rows: LabelRow[]) => void;
}

const TOKENS = [
  { value: "{товар}", label: "Наименование товара" },
  { value: "{артикул}", label: "Артикул" },
  { value: "{бренд}", label: "Бренд" },
  { value: "{розничная_цена}", label: "Розничная цена" },
  { value: "{оптовая_цена}", label: "Оптовая цена" },
  { value: "{штрихкод}", label: "Штрихкод (текст)" },
];

const newId = () => `r${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const LabelTemplateEditor = ({ rows, onChange }: Props) => {
  const update = (idx: number, patch: Partial<LabelRow>) => {
    const next = [...rows];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx));
  };

  const addRow = (type: LabelRowType) => {
    const r: LabelRow = {
      id: newId(),
      type,
      content: type === "barcode" ? "{штрихкод}" : "",
      fontSize: 10,
      bold: false,
      align: "left",
    };
    onChange([...rows, r]);
  };

  const insertToken = (idx: number, token: string) => {
    update(idx, { content: (rows[idx].content || "") + token });
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Конструктор</div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => addRow("text")}
          >
            <Icon name="Type" size={14} />
            <span className="ml-1.5">Текст</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => addRow("barcode")}
          >
            <Icon name="Barcode" size={14} fallback="Hash" />
            <span className="ml-1.5">Штрихкод</span>
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={row.id} className="rounded-md border border-border p-2 space-y-2 bg-muted/10">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground w-12">
                {row.type === "barcode" ? "Штрихкод" : row.type === "qr" ? "QR" : "Текст"}
              </span>
              <Input
                value={row.content}
                onChange={(e) => update(idx, { content: e.target.value })}
                placeholder={row.type === "barcode" ? "{штрихкод}" : "Текст или {токен}"}
                className="h-8 flex-1 font-mono text-xs"
              />
              <Select onValueChange={(v) => insertToken(idx, v)}>
                <SelectTrigger className="h-8 w-9 px-0 justify-center" aria-label="Вставить токен">
                  <Icon name="Plus" size={14} />
                </SelectTrigger>
                <SelectContent>
                  {TOKENS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              <Input
                type="number"
                value={row.fontSize}
                onChange={(e) => update(idx, { fontSize: parseFloat(e.target.value) || 8 })}
                className="h-7 w-14 px-2 text-xs"
                title="Размер шрифта"
              />
              <Button
                variant={row.bold ? "default" : "outline"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => update(idx, { bold: !row.bold })}
                title="Жирный"
              >
                <Icon name="Bold" size={12} />
              </Button>
              <div className="flex">
                {(["left", "center", "right"] as const).map((a) => (
                  <Button
                    key={a}
                    variant={row.align === a ? "default" : "outline"}
                    size="sm"
                    className="h-7 w-7 p-0 rounded-none first:rounded-l-md last:rounded-r-md"
                    onClick={() => update(idx, { align: a })}
                  >
                    <Icon
                      name={
                        a === "left" ? "AlignLeft" : a === "center" ? "AlignCenter" : "AlignRight"
                      }
                      size={12}
                    />
                  </Button>
                ))}
              </div>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => move(idx, -1)}
                disabled={idx === 0}
              >
                <Icon name="ChevronUp" size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => move(idx, 1)}
                disabled={idx === rows.length - 1}
              >
                <Icon name="ChevronDown" size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive"
                onClick={() => remove(idx)}
              >
                <Icon name="X" size={14} />
              </Button>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-3">
            Добавь строки шаблона кнопками выше
          </div>
        )}
      </div>
    </div>
  );
};

export default LabelTemplateEditor;

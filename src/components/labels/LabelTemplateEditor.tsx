import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";

export type LabelRowType = "text" | "barcode" | "qr" | "spacer" | "line" | "group";

export interface LabelCell {
  id: string;
  content: string;
  fontSize: number;
  bold: boolean;
  align: "left" | "center" | "right";
  hideUsed?: boolean;
  widthPct?: number;
  wrap?: boolean;
}

export interface LabelRow {
  id: string;
  type: LabelRowType;
  content: string;
  fontSize: number;
  bold: boolean;
  align: "left" | "center" | "right";
  wrap?: boolean;
  heightMm?: number;
  thicknessMm?: number;
  marginLeftMm?: number;
  marginRightMm?: number;
  dashGapMm?: number;
  dashLenMm?: number;
  hideUsed?: boolean;
  cells?: LabelCell[];
  separator?: string;
}

interface Props {
  rows: LabelRow[];
  onChange: (rows: LabelRow[]) => void;
  labelDate?: string;
  onDateChange?: (v: string) => void;
}

const TOKENS = [
  { value: "{товар}", label: "Наименование товара" },
  { value: "{артикул}", label: "Артикул" },
  { value: "{бренд}", label: "Бренд" },
  { value: "{розничная_цена}", label: "Розничная цена" },
  { value: "{оптовая_цена}", label: "Оптовая цена" },
  { value: "{штрихкод}", label: "Штрихкод (текст)" },
  { value: "{дата}", label: "Дата" },
  { value: "__plain__", label: "Произвольный текст" },
];

const CAPTIONS = [
  { value: "₽", label: "₽ — российский рубль" },
  { value: "Br", label: "Br — белорусский рубль" },
];

const TOKEN_RE = /\{(?:товар|артикул|бренд|розничная_цена|оптовая_цена|штрихкод|дата)\}/;

const findToken = (s: string): string | null => {
  const m = (s || "").match(TOKEN_RE);
  return m ? m[0] : null;
};

const TYPE_LABELS: Record<LabelRowType, string> = {
  text: "Текст",
  barcode: "Штрихкод",
  qr: "QR",
  spacer: "Отступ",
  line: "Линия",
  group: "Составное",
};

const SEPARATORS = [
  { value: "none", label: "Без разделителя" },
  { value: "|", label: "Вертикальная черта" },
  { value: "•", label: "Точка" },
  { value: "—", label: "Тире" },
];

const newId = () => `r${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

interface NumFieldProps {
  value: number | undefined;
  onCommit: (v: number) => void;
  fallback: number;
  title: string;
  width?: string;
  step?: string;
}

const NumField = ({ value, onCommit, fallback, title, width = "w-14", step }: NumFieldProps) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null ? draft : value == null ? "" : String(value);
  return (
    <Input
      type="number"
      step={step}
      value={shown}
      title={title}
      placeholder={String(fallback)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (!isNaN(n)) onCommit(n);
      }}
      onBlur={() => {
        if (draft !== null && draft.trim() === "") onCommit(fallback);
        setDraft(null);
      }}
      className={`h-7 ${width} px-2 text-xs`}
    />
  );
};

const LabelTemplateEditor = ({ rows, onChange, labelDate, onDateChange }: Props) => {
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
      align: type === "line" ? "center" : "left",
      wrap: false,
      ...(type === "spacer" ? { heightMm: 2 } : {}),
      ...(type === "line"
        ? {
            thicknessMm: 0.3,
            marginLeftMm: 0,
            marginRightMm: 0,
            dashGapMm: 0,
            dashLenMm: 0,
          }
        : {}),
      ...(type === "group" ? { cells: [], separator: "none" } : {}),
    };
    onChange([...rows, r]);
  };

  const updateCell = (rowIdx: number, cellIdx: number, patch: Partial<LabelCell>) => {
    const cells = [...(rows[rowIdx].cells || [])];
    cells[cellIdx] = { ...cells[cellIdx], ...patch };
    update(rowIdx, { cells });
  };

  const addCell = (rowIdx: number) => {
    const cells = [...(rows[rowIdx].cells || [])];
    if (cells.length >= 3) return;
    cells.push({ id: newId(), content: "", fontSize: 8, bold: false, align: "left" });
    update(rowIdx, { cells });
  };

  const removeCell = (rowIdx: number, cellIdx: number) => {
    const cells = (rows[rowIdx].cells || []).filter((_, i) => i !== cellIdx);
    update(rowIdx, { cells });
  };

  const moveCell = (rowIdx: number, cellIdx: number, dir: -1 | 1) => {
    const cells = [...(rows[rowIdx].cells || [])];
    const j = cellIdx + dir;
    if (j < 0 || j >= cells.length) return;
    [cells[cellIdx], cells[j]] = [cells[j], cells[cellIdx]];
    update(rowIdx, { cells });
  };

  const insertCellToken = (rowIdx: number, cellIdx: number, token: string) => {
    const content = rows[rowIdx].cells?.[cellIdx]?.content || "";
    const current = findToken(content);
    if (token === "__plain__") {
      if (current) updateCell(rowIdx, cellIdx, { content: content.replace(current, "").trim() });
      return;
    }
    if (current) {
      updateCell(rowIdx, cellIdx, { content: content.replace(current, token) });
      return;
    }
    updateCell(rowIdx, cellIdx, { content: content + token });
  };

  const insertToken = (idx: number, token: string) => {
    const content = rows[idx].content || "";
    const current = findToken(content);
    if (token === "__plain__") {
      if (current) update(idx, { content: content.replace(current, "").trim() });
      return;
    }
    if (current) {
      update(idx, { content: content.replace(current, token) });
      return;
    }
    update(idx, { content: content + token });
  };

  const insertCaption = (idx: number, caption: string) => {
    update(idx, { content: (rows[idx].content || "") + caption });
  };

  const changeContent = (idx: number, value: string) => {
    const current = findToken(rows[idx].content || "");
    if (current && !value.includes(current)) return;
    update(idx, { content: value });
  };

  const setDashGap = (idx: number, v: number) => {
    const row = rows[idx];
    const patch: Partial<LabelRow> = { dashGapMm: v };
    if (!row.dashLenMm) patch.dashLenMm = v;
    update(idx, patch);
  };

  const addButtons: { type: LabelRowType; icon: string; fallback?: string; label: string }[] = [
    { type: "text", icon: "Type", label: "Текст" },
    { type: "barcode", icon: "Barcode", fallback: "Hash", label: "Штрихкод" },
    { type: "spacer", icon: "MoveVertical", fallback: "ArrowUpDown", label: "Отступ" },
    { type: "line", icon: "Minus", label: "Линия" },
  ];

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="text-sm font-medium">Конструктор</div>
      <div className="flex flex-wrap items-center gap-1">
        {addButtons.map((b) => (
          <Button
            key={b.type}
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => addRow(b.type)}
          >
            <Icon name={b.icon} size={12} fallback={b.fallback} />
            <span className="ml-1">{b.label}</span>
          </Button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs border-dashed"
          onClick={() => addRow("group")}
        >
          <Icon name="Columns3" size={12} fallback="Columns" />
          <span className="ml-1">Составное</span>
        </Button>
      </div>

      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={row.id} className="rounded-md border border-border p-2 space-y-2 bg-muted/10">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground w-14 shrink-0">
                {TYPE_LABELS[row.type]}
              </span>
              {row.type === "spacer" ? (
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-muted-foreground">Высота</span>
                  <NumField
                    value={row.heightMm}
                    fallback={2}
                    step="0.5"
                    title="Высота отступа, мм"
                    onCommit={(v) => update(idx, { heightMm: v })}
                  />
                  <span className="text-xs text-muted-foreground">мм</span>
                </div>
              ) : row.type === "line" ? (
                <div className="flex-1 text-xs text-muted-foreground">
                  Разделитель
                </div>
              ) : row.type === "group" ? (
                <div className="flex items-center gap-1 flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => addCell(idx)}
                    disabled={(row.cells || []).length >= 3}
                  >
                    <Icon name="Plus" size={12} />
                    <span className="ml-1">текст</span>
                  </Button>
                  <Select
                    value={row.separator || "none"}
                    onValueChange={(v) => update(idx, { separator: v })}
                  >
                    <SelectTrigger className="h-7 w-9 px-0 justify-center" aria-label="Разделитель">
                      <Icon name="Minus" size={12} />
                    </SelectTrigger>
                    <SelectContent>
                      {SEPARATORS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <Input
                    value={row.content}
                    onChange={(e) => changeContent(idx, e.target.value)}
                    placeholder={row.type === "barcode" ? "{штрихкод}" : "Текст или {поле}"}
                    className="h-8 flex-1 font-mono text-xs"
                  />
                  <Select onValueChange={(v) => insertToken(idx, v)}>
                    <SelectTrigger className="h-8 w-9 px-0 justify-center" aria-label="Вставить поле">
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
                </>
              )}
            </div>

            {row.type === "line" && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Толщ.</span>
                <NumField
                  value={row.thicknessMm}
                  fallback={0.3}
                  step="0.1"
                  title="Толщина линии, мм"
                  width="w-12"
                  onCommit={(v) => update(idx, { thicknessMm: v })}
                />
                <span className="text-[10px] text-muted-foreground ml-1">Слева</span>
                <NumField
                  value={row.marginLeftMm}
                  fallback={0}
                  step="0.5"
                  title="Отступ слева, мм"
                  width="w-12"
                  onCommit={(v) => update(idx, { marginLeftMm: v })}
                />
                <div className="flex ml-1">
                  {(["left", "center", "right"] as const).map((a) => (
                    <Button
                      key={a}
                      variant={row.align === a ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0 rounded-none first:rounded-l-md last:rounded-r-md"
                      onClick={() => update(idx, { align: a })}
                      title="Размещение"
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
                <span className="text-[10px] text-muted-foreground ml-1">Справа</span>
                <NumField
                  value={row.marginRightMm}
                  fallback={0}
                  step="0.5"
                  title="Отступ справа, мм"
                  width="w-12"
                  onCommit={(v) => update(idx, { marginRightMm: v })}
                />
                <span className="text-[10px] text-muted-foreground ml-1">Пунктир</span>
                <NumField
                  value={row.dashGapMm}
                  fallback={0}
                  step="0.5"
                  title="Ширина прерывания, мм"
                  width="w-12"
                  onCommit={(v) => setDashGap(idx, v)}
                />
                <NumField
                  value={row.dashLenMm}
                  fallback={0}
                  step="0.5"
                  title="Ширина начертания, мм"
                  width="w-12"
                  onCommit={(v) => update(idx, { dashLenMm: v })}
                />
              </div>
            )}

            {row.type === "group" && (
              <div className="pl-3 border-l-2 border-primary/40 ml-1 space-y-2">
                {(row.cells || []).length === 0 && (
                  <div className="text-[11px] text-muted-foreground py-1">
                    Добавьте текстовое поле
                  </div>
                )}
                {(row.cells || []).map((cell, ci) => (
                  <div key={cell.id} className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Input
                        value={cell.content}
                        onChange={(e) => updateCell(idx, ci, { content: e.target.value })}
                        placeholder="Текст или {поле}"
                        className="h-8 flex-1 font-mono text-xs"
                      />
                      <Select onValueChange={(v) => insertCellToken(idx, ci, v)}>
                        <SelectTrigger
                          className="h-8 w-9 px-0 justify-center"
                          aria-label="Вставить поле"
                        >
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
                      <NumField
                        value={cell.fontSize}
                        fallback={8}
                        title="Размер шрифта"
                        onCommit={(v) => updateCell(idx, ci, { fontSize: v })}
                      />
                      <Button
                        variant={cell.bold ? "default" : "outline"}
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => updateCell(idx, ci, { bold: !cell.bold })}
                        title="Жирный"
                      >
                        <Icon name="Bold" size={12} />
                      </Button>
                      {!cell.content.includes("{дата}") && (
                        <Button
                          variant={cell.wrap ? "default" : "outline"}
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => updateCell(idx, ci, { wrap: !cell.wrap })}
                          title="Перенос слов"
                        >
                          <Icon name="WrapText" size={12} fallback="CornerDownLeft" />
                        </Button>
                      )}
                      {cell.content.includes("{товар}") && (
                        <Button
                          variant={cell.hideUsed ? "default" : "outline"}
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => updateCell(idx, ci, { hideUsed: !cell.hideUsed })}
                          title="Без б/у"
                        >
                          <Icon name="TagOff" size={12} fallback="Tag" />
                        </Button>
                      )}
                      <div className="flex">
                        {(["left", "center", "right"] as const).map((a) => (
                          <Button
                            key={a}
                            variant={cell.align === a ? "default" : "outline"}
                            size="sm"
                            className="h-7 w-7 p-0 rounded-none first:rounded-l-md last:rounded-r-md"
                            onClick={() => updateCell(idx, ci, { align: a })}
                          >
                            <Icon
                              name={
                                a === "left"
                                  ? "AlignLeft"
                                  : a === "center"
                                    ? "AlignCenter"
                                    : "AlignRight"
                              }
                              size={12}
                            />
                          </Button>
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-1">Доля</span>
                      <NumField
                        value={cell.widthPct}
                        fallback={Math.round(100 / Math.max(1, (row.cells || []).length))}
                        title="Доля ширины, %"
                        width="w-12"
                        onCommit={(v) => updateCell(idx, ci, { widthPct: v })}
                      />
                      <div className="flex-1" />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => moveCell(idx, ci, -1)}
                        disabled={ci === 0}
                      >
                        <Icon name="ChevronUp" size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => moveCell(idx, ci, 1)}
                        disabled={ci === (row.cells || []).length - 1}
                      >
                        <Icon name="ChevronDown" size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => removeCell(idx, ci)}
                      >
                        <Icon name="X" size={14} />
                      </Button>
                    </div>
                    {cell.content.includes("{дата}") && onDateChange && (
                      <Input
                        type="date"
                        value={labelDate || ""}
                        onChange={(e) => onDateChange(e.target.value)}
                        className="h-7 w-36 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1 flex-wrap">
              {row.type !== "spacer" && row.type !== "line" && row.type !== "group" && (
                <>
                  <NumField
                    value={row.fontSize}
                    fallback={8}
                    title="Размер шрифта"
                    onCommit={(v) => update(idx, { fontSize: v })}
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
                  {row.type === "text" && row.content.includes("{дата}") && onDateChange && (
                    <Input
                      type="date"
                      value={labelDate || ""}
                      onChange={(e) => onDateChange(e.target.value)}
                      className="h-7 w-36 text-xs"
                    />
                  )}
                  {row.type === "text" && !row.content.includes("{дата}") && (
                    <>
                      <Button
                        variant={row.wrap ? "default" : "outline"}
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => update(idx, { wrap: !row.wrap })}
                        title="Перенос слов"
                      >
                        <Icon name="WrapText" size={12} fallback="CornerDownLeft" />
                      </Button>
                      {row.content.includes("{товар}") && (
                        <Button
                          variant={row.hideUsed ? "default" : "outline"}
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => update(idx, { hideUsed: !row.hideUsed })}
                          title="Без б/у"
                        >
                          <Icon name="TagOff" size={12} fallback="Tag" />
                        </Button>
                      )}
                      <Select onValueChange={(v) => insertCaption(idx, v)}>
                        <SelectTrigger
                          className="h-7 w-9 px-0 justify-center"
                          aria-label="Вставить надпись"
                        >
                          <Icon name="Coins" size={12} fallback="Tag" />
                        </SelectTrigger>
                        <SelectContent>
                          {CAPTIONS.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
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
                </>
              )}
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
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import TestCard from "@/components/odata/TestCard";
import ResultBox from "@/components/odata/ResultBox";
import { odataApi, RefItem, CreatedObject } from "./odata/odataApi";
import { findBase } from "./odata/bases";
import { parseOdataFile, ParsedFile, formatMoney } from "./odata/parseOdataFile";

interface MatchItem {
  article: string;
  found: boolean;
  key: string | null;
  name_1c: string | null;
}

const OdataSupplierInvoice = () => {
  const navigate = useNavigate();
  const { base = "trade-resurs" } = useParams();
  const baseInfo = findBase(base);
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");

  const [orgs, setOrgs] = useState<RefItem[]>([]);
  const [orgKey, setOrgKey] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState("");

  const [matches, setMatches] = useState<MatchItem[] | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchError, setMatchError] = useState("");

  const [created, setCreated] = useState<CreatedObject | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin/dashboard");
      return;
    }
    odataApi
      .refs(base)
      .then((r) => {
        const list = r.result?.organizations || [];
        setOrgs(list);
        const saved = localStorage.getItem(`odata_org_${base}`);
        if (saved && list.some((o: RefItem) => o.key === saved)) setOrgKey(saved);
        else if (list.length) setOrgKey(list[0].key);
      })
      .catch(() => undefined);
  }, []);

  const pickOrg = (key: string) => {
    setOrgKey(key);
    localStorage.setItem(`odata_org_${base}`, key);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileError("");
    setMatches(null);
    setCreated(null);
    try {
      const buf = await f.arrayBuffer();
      const p = parseOdataFile(buf);
      setParsed(p);
      setFileName(f.name);
      setDocNumber(p.docNumber);
      setDocDate(p.docDate);
    } catch (err) {
      setParsed(null);
      setFileError(err instanceof Error ? err.message : "Не удалось прочитать файл");
    }
  };

  const doMatch = async () => {
    if (!parsed) return;
    setMatchBusy(true);
    setMatchError("");
    setMatches(null);
    try {
      const r = await odataApi.matchProducts(
        base,
        parsed.rows.map((x) => ({ article: x.article })),
      );
      if (r.result.ok) setMatches(r.result.items);
      else setMatchError(r.result.error);
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setMatchBusy(false);
    }
  };

  const toIso = (d: string) => {
    const m = d.match(/(\d{2})\.(\d{2})\.(\d{2,4})/);
    if (!m) return undefined;
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2]}-${m[1]}T00:00:00`;
  };

  const doCreate = async () => {
    if (!parsed || !matches) return;
    setCreateBusy(true);
    setCreated(null);
    try {
      const rows = parsed.rows.map((r, i) => ({
        key: matches[i]?.key || "",
        article: r.article,
        quantity: r.quantity,
        price: r.price,
      }));
      const r = await odataApi.createSupplierInvoice(base, {
        organization_key: orgKey,
        date: toIso(docDate),
        comment: docNumber ? `Счёт поставщика № ${docNumber} от ${docDate}` : undefined,
        rows,
      });
      setCreated(r.result);
    } catch (e) {
      setCreated({ ok: false, error: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setCreateBusy(false);
    }
  };

  const foundCount = matches?.filter((m) => m.found).length ?? 0;
  const allFound = matches !== null && foundCount === matches.length;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate(`/admin/odata/${base}`)}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold leading-tight">
              Счёт на оплату поставщику
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {baseInfo?.title || base}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-4">
        <TestCard
          title="Файл"
          icon="FileSpreadsheet"
          description="Таблица, собранная по правилу «Создание файла для OData»"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFile}
            className="hidden"
          />
          <Button
            onClick={() => fileRef.current?.click()}
            size="sm"
            className="rounded-lg gap-2"
          >
            <Icon name="Upload" size={15} />
            Выбрать файл
          </Button>
          {fileError && <ResultBox ok={false} title="Файл не подошёл" details={fileError} />}
          {parsed && (
            <ResultBox
              ok
              title={fileName}
              details={[
                parsed.header,
                `Строк: ${parsed.rows.length}`,
                `Сумма: ${formatMoney(parsed.total)} ₽`,
              ]
                .filter(Boolean)
                .join("\n")}
            />
          )}
        </TestCard>

        {parsed && (
          <TestCard title="Шапка документа" icon="FileText">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Организация</Label>
                <Select value={orgKey} onValueChange={pickOrg}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="не найдено" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Номер поставщика</Label>
                <Input
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Дата</Label>
                <Input
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  placeholder="18.09.2026"
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Контрагент не заполняется, ставка НДС — «Без НДС». Документ создаётся
              непроведённым.
            </p>
          </TestCard>
        )}

        {parsed && (
          <TestCard
            title="Товары"
            icon="Package"
            description="Проверяем, что каждая позиция есть в номенклатуре 1С"
          >
            <Button
              onClick={doMatch}
              disabled={matchBusy}
              size="sm"
              className="rounded-lg gap-2"
            >
              {matchBusy ? (
                <Icon name="Loader2" size={15} className="animate-spin" />
              ) : (
                <Icon name="Search" size={15} />
              )}
              Проверить в 1С
            </Button>

            {matchError && <ResultBox ok={false} title="Ошибка проверки" details={matchError} />}

            {matches && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  allFound
                    ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200"
                    : "border-amber-500/30 bg-amber-500/[0.07] text-amber-200"
                }`}
              >
                Найдено {foundCount} из {matches.length}
                {!allFound && " — документ создать нельзя, пока есть ненайденные"}
              </div>
            )}

            <div className="mt-3 rounded-lg border border-white/[0.08] overflow-hidden">
              <div className="max-h-96 overflow-y-auto divide-y divide-white/[0.06]">
                {parsed.rows.map((r, i) => {
                  const m = matches?.[i];
                  return (
                    <div
                      key={`${r.article}-${i}`}
                      className={`px-3 py-2 text-sm flex items-start gap-2 ${
                        m && !m.found ? "bg-red-500/[0.06]" : ""
                      }`}
                    >
                      {m && (
                        <Icon
                          name={m.found ? "CircleCheck" : "CircleX"}
                          size={15}
                          className={`mt-0.5 shrink-0 ${
                            m.found ? "text-emerald-400" : "text-red-400"
                          }`}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          {r.article} · {r.quantity} шт × {formatMoney(r.price)}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {formatMoney(r.quantity * r.price)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TestCard>
        )}

        {parsed && (
          <TestCard title="Создание в 1С" icon="Send">
            <Button
              onClick={doCreate}
              disabled={!allFound || createBusy}
              className="rounded-lg gap-2"
            >
              {createBusy ? (
                <Icon name="Loader2" size={16} className="animate-spin" />
              ) : (
                <Icon name="Plus" size={16} />
              )}
              Создать счёт в 1С
            </Button>
            {!allFound && (
              <p className="text-xs text-muted-foreground mt-2">
                Сначала проверьте товары — кнопка включится, когда найдутся все
              </p>
            )}
            {created && !created.ok && (
              <ResultBox ok={false} title="1С отказала" details={created.error} />
            )}
            {created?.ok && (
              <ResultBox
                ok
                title="Счёт создан"
                details={[
                  `Номер: ${created.number}`,
                  `Дата: ${created.date?.replace("T", " ")}`,
                  `Строк: ${created.lines}`,
                  `Сумма: ${formatMoney(Number(created.amount))} ₽`,
                  `Идентификатор: ${created.key}`,
                ].join("\n")}
              />
            )}
          </TestCard>
        )}
      </main>
    </div>
  );
};

export default OdataSupplierInvoice;

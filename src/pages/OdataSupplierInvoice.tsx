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
import { odataApi, RefItem, CreatedObject, VAT_RATES } from "./odata/odataApi";
import { findBase } from "./odata/bases";
import { parseOdataFile, ParsedFile, formatMoney } from "./odata/parseOdataFile";

interface MatchItem {
  article: string;
  found: boolean;
  key: string | null;
  name_1c: string | null;
}

const OdataSupplierInvoice = ({ mode = "invoice" }: { mode?: "invoice" | "receipt" }) => {
  const isReceipt = mode === "receipt";
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
  const [warehouses, setWarehouses] = useState<RefItem[]>([]);
  const [whKey, setWhKey] = useState("");
  const [vatRate, setVatRate] = useState("22");
  const [docNumber, setDocNumber] = useState("");
  const [docDate, setDocDate] = useState("");

  const [matches, setMatches] = useState<MatchItem[] | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchError, setMatchError] = useState("");

  const [matchProgress, setMatchProgress] = useState("");
  const [gtdMissing, setGtdMissing] = useState<string[] | null>(null);
  const [gtdExisting, setGtdExisting] = useState(0);
  const [gtdBusy, setGtdBusy] = useState(false);
  const [gtdProgress, setGtdProgress] = useState("");
  const [gtdError, setGtdError] = useState("");
  const [gtdUnknown, setGtdUnknown] = useState<string[]>([]);

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
        const whList = r.result?.warehouses || [];
        setWarehouses(whList);
        const savedWh = localStorage.getItem(`odata_wh_${base}`);
        if (savedWh && whList.some((w: RefItem) => w.key === savedWh)) setWhKey(savedWh);
        else if (whList.length) setWhKey(whList[0].key);
        const savedVat = localStorage.getItem(`odata_vat_${base}`);
        if (savedVat) setVatRate(savedVat);
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

  const pickWh = (key: string) => {
    setWhKey(key);
    localStorage.setItem(`odata_wh_${base}`, key);
  };

  const pickVat = (v: string) => {
    setVatRate(v);
    localStorage.setItem(`odata_vat_${base}`, v);
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
    setGtdMissing(null);
    setGtdError("");
    setMatchProgress("");
    try {
      const all = parsed.rows.map((x) => ({ article: x.article }));
      const step = 300;
      const acc: MatchItem[] = [];
      for (let i = 0; i < all.length; i += step) {
        setMatchProgress(`Товары: ${Math.min(i + step, all.length)} из ${all.length}`);
        const r = await odataApi.matchProducts(base, all.slice(i, i + step));
        if (!r.result.ok) {
          setMatchError(r.result.error);
          setMatchBusy(false);
          setMatchProgress("");
          return;
        }
        acc.push(...r.result.items);
      }
      setMatches(acc);

      if (isReceipt) {
        const nums = [
          ...new Set(
            parsed.rows
              .flatMap((x) => [x.gtd, x.rnpt])
              .filter(Boolean) as string[],
          ),
        ];
        if (nums.length) {
          const miss: string[] = [];
          const bad: string[] = [];
          let exist = 0;
          const gStep = 300;
          for (let i = 0; i < nums.length; i += gStep) {
            setMatchProgress(
              `Номера ГТД: ${Math.min(i + gStep, nums.length)} из ${nums.length}`,
            );
            const g = await odataApi.checkGtd(base, nums.slice(i, i + gStep));
            exist += g.result.existing || 0;
            miss.push(...(g.result.missing || []));
            bad.push(...(g.result.unknown || []));
          }
          setGtdExisting(exist);
          setGtdMissing(miss);
          setGtdUnknown(bad);
        } else {
          setGtdExisting(0);
          setGtdMissing([]);
        }
      }
      setMatchProgress("");
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setMatchBusy(false);
    }
  };

  const doGtdSchema = async () => {
    setGtdBusy(true);
    setGtdError("");
    try {
      const r = await odataApi.gtdSchema(base);
      const f = r.result.number_field;
      setGtdProgress(
        (f
          ? `Номер пишется в реквизит «${f}»`
          : "Реквизит номера не определён") +
          `\nРеквизиты справочника: ${(r.result.fields || []).join(", ") || "не прочитаны"}`,
      );
    } catch (e) {
      setGtdError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGtdBusy(false);
    }
  };

  const doRepairGtd = async () => {
    setGtdBusy(true);
    setGtdError("");
    let fixed = 0;
    let marked = 0;
    try {
      for (let pass = 0; pass < 40; pass++) {
        setGtdProgress(`Исправлено ${fixed}, помечено пустых ${marked}`);
        const r = await odataApi.repairGtd(base);
        if (!r.result.ok) {
          setGtdError(r.result.error || "Не удалось исправить");
          break;
        }
        fixed += r.result.fixed || 0;
        marked += r.result.marked || 0;
        if (r.result.errors?.length) {
          setGtdError(r.result.errors.join("\n"));
          break;
        }
        if (!r.result.found) break;
      }
      setGtdProgress(
        `Готово. Заполнено номеров: ${fixed}` +
          (marked ? `, помечено на удаление пустых: ${marked}` : ""),
      );
    } catch (e) {
      setGtdError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGtdBusy(false);
    }
  };

  const doCreateGtd = async () => {
    if (!gtdMissing?.length) return;
    setGtdBusy(true);
    setGtdError("");
    let queue = [...gtdMissing];
    const total = queue.length;
    let done = 0;
    try {
      while (queue.length) {
        setGtdProgress(`Создано ${done} из ${total}`);
        const r = await odataApi.createGtd(base, queue);
        done += r.result.created || 0;
        const next: string[] = r.result.remaining || [];
        queue = next;
        setGtdMissing(next);
        if (!r.result.ok) {
          setGtdError(r.result.error || "1С отказала");
          break;
        }
        if (next.length && !r.result.created) {
          setGtdError("1С не создаёт номера — остановился, чтобы не плодить записи");
          break;
        }
      }
      setGtdProgress(`Создано ${done} из ${total}`);
    } catch (e) {
      setGtdError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGtdBusy(false);
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
        ...(isReceipt
          ? { country: r.country, gtd: r.gtd, rnpt: r.rnpt }
          : {}),
      }));
      const iso = toIso(docDate);
      const payload = {
        organization_key: orgKey,
        ...(isReceipt ? { warehouse_key: whKey } : {}),
        date: iso,
        incoming_number: docNumber || undefined,
        incoming_date: iso,
        vat_rate: vatRate,
        rows,
      };
      const r = isReceipt
        ? await odataApi.createGoodsReceipt(base, payload)
        : await odataApi.createSupplierInvoice(base, payload);
      setCreated(r.result);
    } catch (e) {
      setCreated({ ok: false, error: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setCreateBusy(false);
    }
  };

  const foundCount = matches?.filter((m) => m.found).length ?? 0;
  const productsOk = matches !== null && foundCount === matches.length;
  const gtdOk = !isReceipt || (gtdMissing !== null && gtdMissing.length === 0);
  const allFound = productsOk && gtdOk;

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
              {isReceipt ? "Поступление товаров и услуг" : "Счёт на оплату поставщику"}
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
              {isReceipt && (
                <div className="sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Склад</Label>
                  <Select value={whKey} onValueChange={pickWh}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="не найдено" />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.key} value={w.key}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Номер {isReceipt ? "документа" : "счёта"} поставщика
                </Label>
                <Input
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Дата {isReceipt ? "документа" : "счёта"} поставщика
                </Label>
                <Input
                  value={docDate}
                  onChange={(e) => setDocDate(e.target.value)}
                  placeholder="18.09.2026"
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Ставка НДС</Label>
                <Select value={vatRate} onValueChange={pickVat}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_RATES.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Этой же датой будет создан наш документ. Свой номер 1С присвоит сама, по
              порядку.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Налог считается в сумме: цены из файла остаются как есть, НДС выделяется
              изнутри. Контрагент не заполняется, документ создаётся непроведённым.
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

            {matchProgress && (
              <p className="text-xs text-muted-foreground mt-2">{matchProgress}</p>
            )}

            {matchError && <ResultBox ok={false} title="Ошибка проверки" details={matchError} />}

            {matches && (
              <div
                className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                  allFound
                    ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200"
                    : "border-amber-500/30 bg-amber-500/[0.07] text-amber-200"
                }`}
              >
                Товары: найдено {foundCount} из {matches.length}
                {!productsOk && " — документ создать нельзя, пока есть ненайденные"}
              </div>
            )}

            {isReceipt && gtdMissing !== null && (
              <div
                className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
                  gtdMissing.length === 0
                    ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-200"
                    : "border-amber-500/30 bg-amber-500/[0.07] text-amber-200"
                }`}
              >
                <div>
                  Номера ГТД: есть в базе {gtdExisting}
                  {gtdMissing.length > 0 && `, новых ${gtdMissing.length}`}
                </div>
                {gtdMissing.length > 0 && (
                  <>
                    <div className="text-xs mt-1 font-mono opacity-80 break-all">
                      {gtdMissing.slice(0, 3).join(", ")}
                      {gtdMissing.length > 3 && ` и ещё ${gtdMissing.length - 3}`}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button
                        onClick={doCreateGtd}
                        disabled={gtdBusy}
                        size="sm"
                        className="rounded-lg gap-2"
                      >
                        {gtdBusy ? (
                          <Icon name="Loader2" size={15} className="animate-spin" />
                        ) : (
                          <Icon name="Plus" size={15} />
                        )}
                        Создать номера ГТД
                      </Button>
                      <Button
                        onClick={doGtdSchema}
                        disabled={gtdBusy}
                        size="sm"
                        variant="outline"
                        className="rounded-lg gap-2"
                      >
                        <Icon name="Info" size={15} />
                        Показать поля справочника
                      </Button>
                      <Button
                        onClick={doRepairGtd}
                        disabled={gtdBusy}
                        size="sm"
                        variant="outline"
                        className="rounded-lg gap-2"
                      >
                        <Icon name="Wrench" size={15} />
                        Убрать пустые записи
                      </Button>
                    </div>
                  </>
                )}
                {gtdUnknown.length > 0 && (
                  <div className="text-xs mt-2 text-red-300 break-all">
                    Не похожи на ГТД или РНПТ ({gtdUnknown.length}):{" "}
                    {gtdUnknown.slice(0, 5).join(", ")}
                  </div>
                )}
                {gtdProgress && (
                  <div className="text-xs mt-2 opacity-80 whitespace-pre-wrap break-all">
                    {gtdProgress}
                  </div>
                )}
              </div>
            )}

            {gtdError && (
              <ResultBox ok={false} title="Номера ГТД" details={gtdError} />
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
                        {isReceipt && (r.country || r.gtd || r.rnpt) && (
                          <div className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
                            {[r.country, r.gtd, r.rnpt].filter(Boolean).join(" · ")}
                          </div>
                        )}
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
              {isReceipt ? "Создать поступление в 1С" : "Создать счёт в 1С"}
            </Button>
            {!allFound && (
              <p className="text-xs text-muted-foreground mt-2">
                {!productsOk
                  ? "Сначала проверьте товары — кнопка включится, когда найдутся все"
                  : "Создайте недостающие номера ГТД — после этого кнопка включится"}
              </p>
            )}
            {created && !created.ok && (
              <ResultBox
                ok={false}
                title="1С отказала"
                details={created.error}
                sent={created.sent_line}
              />
            )}
            {created?.ok && (
              <ResultBox
                ok
                title={isReceipt ? "Поступление создано" : "Счёт создан"}
                details={[
                  `Номер: ${created.number}`,
                  `Дата: ${created.date?.replace("T", " ")}`,
                  `Строк: ${created.lines}`,
                  `Сумма: ${formatMoney(Number(created.amount))} ₽`,
                  created.used?.vat_amount !== undefined
                    ? `В том числе НДС (${created.used.vat_rate}): ${formatMoney(
                        Number(created.used.vat_amount),
                      )} ₽`
                    : null,
                  created.used?.table
                    ? `Строки записаны в таблицу «${created.used.table}»`
                    : null,
                  created.used?.vat_in_sum_warning || null,
                  created.used?.amount_warning || null,
                  created.used?.number_field
                    ? `Номер поставщика записан в «${created.used.number_field}»`
                    : null,
                  created.used?.fallback || null,
                  ...(created.used?.notes || []),
                  `Идентификатор: ${created.key}`,
                ]
                  .filter(Boolean)
                  .join("\n")}
              />
            )}
          </TestCard>
        )}
      </main>
    </div>
  );
};

export default OdataSupplierInvoice;
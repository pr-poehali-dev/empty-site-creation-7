import { useState, useEffect, useRef, useMemo } from "react";
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
import { parseOdataFile, ParsedFile, formatMoney, applyTraceCols, TraceCols } from "./odata/parseOdataFile";
import NomenTraceColumns from "@/components/odata/NomenTraceColumns";
import ReceiptTraceCard from "@/components/odata/ReceiptTraceCard";
import { InvoiceItem } from "./odata/nomenApi";
import { buildPlan, CardTrace, Country1C, findCountry, normCountry, TracePlan, TraceReport } from "./odata/receiptTrace";
import GtdFixCard from "@/components/odata/GtdFixCard";
import {
  findProblemRows, applyFixes, GtdFix, isRussia, gtdKind,
} from "./odata/gtdFix";

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
  const [gtdAll, setGtdAll] = useState<string[]>([]);
  const [gtdRefs, setGtdRefs] = useState<Record<string, string>>({});
  const [gtdExisting, setGtdExisting] = useState(0);
  const [gtdScanned, setGtdScanned] = useState(0);
  const [gtdBusy, setGtdBusy] = useState(false);
  const [gtdProgress, setGtdProgress] = useState("");
  const [copied, setCopied] = useState(false);
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(gtdProgress);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = gtdProgress;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const [gtdError, setGtdError] = useState("");
  const [gtdUnknown, setGtdUnknown] = useState<string[]>([]);
  const [gtdFixes, setGtdFixes] = useState<Record<number, GtdFix>>({});

  const [traceCols, setTraceCols] = useState<TraceCols>({ country: null, gtd: null, rnpt: null });
  const fileRows = useMemo(() => (parsed ? applyTraceCols(parsed, traceCols) : []), [parsed, traceCols]);
  const [tracePlan, setTracePlan] = useState<TracePlan | null>(null);
  const [traceBusy, setTraceBusy] = useState(false);
  const [traceProgress, setTraceProgress] = useState("");
  const [traceError, setTraceError] = useState("");
  const [traceApply, setTraceApply] = useState(true);
  const [traceReport, setTraceReport] = useState<TraceReport | null>(null);
  const [countries1c, setCountries1c] = useState<Country1C[]>([]);
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
      setTraceCols(p.defaultCols);
      setTracePlan(null);
      setTraceReport(null);
      setGtdFixes({});
      setFileName(f.name);
      setDocNumber(p.docNumber);
      setDocDate(p.docDate);
    } catch (err) {
      setParsed(null);
      setFileError(err instanceof Error ? err.message : "Не удалось прочитать файл");
    }
  };

  const changeTraceCols = (field: keyof TraceCols, col: number | null) => {
    setTraceCols((p) => ({ ...p, [field]: col }));
    setMatches(null);
    setGtdMissing(null);
    setGtdFixes({});
    setTracePlan(null);
    setTraceReport(null);
    setCreated(null);
  };

  const doTraceCheck = async () => {
    if (!matches) return;
    setTraceBusy(true);
    setTraceError("");
    setTracePlan(null);
    setTraceReport(null);
    try {
      const rows = applyFixes(fileRows, gtdFixes);
      const keys = rows.map((r, i) => (r.country.trim() ? matches[i]?.key || "" : ""));
      const uniq = [...new Set(keys.filter(Boolean))];
      const cards: Record<string, CardTrace> = {};
      let cs = countries1c;
      const step = 200;
      for (let i = 0; i < Math.max(uniq.length, 1); i += step) {
        setTraceProgress(`Карточки: ${Math.min(i + step, uniq.length)} из ${uniq.length}`);
        const r = await odataApi.traceRead(base, uniq.slice(i, i + step), i === 0 && !cs.length);
        if (!r.result.ok) throw new Error(r.result.error || "Ошибка чтения");
        Object.assign(cards, r.result.cards || {});
        if (r.result.countries?.length) cs = r.result.countries;
      }
      setCountries1c(cs);
      setTracePlan(buildPlan(rows, keys, cards, cs));
    } catch (e) {
      setTraceError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setTraceProgress("");
      setTraceBusy(false);
    }
  };

  const runTraceApply = async (plan: TracePlan): Promise<{ report: TraceReport; names: Record<string, string> }> => {
    const report: TraceReport = { countryChanged: [], traceChanged: [], created: [], failed: [] };
    const keyByName = { ...plan.keyByName };
    const names: Record<string, string> = {};
    const cs = [...countries1c];
    for (let i = 0; i < plan.create.length; i += 10) {
      setTraceProgress(`Страны: ${Math.min(i + 10, plan.create.length)} из ${plan.create.length}`);
      const part = plan.create.slice(i, i + 10);
      const r = await odataApi.traceApply(base, part, []);
      (r.result.countries || []).forEach((c: { name: string; code: string; state: string; key?: string; error?: string }, j: number) => {
        const src = part[j];
        if (c.key) {
          keyByName[normCountry(src.name)] = c.key;
          cs.push({ key: c.key, code: c.code, name: c.name });
          if (c.state === "created") report.created.push({ name: c.name, code: c.code });
        } else report.failed.push({ name: `страна ${src.name}`, reason: c.error || "не создана" });
      });
    }
    setCountries1c(cs);
    const cname = (k: string) => cs.find((c) => c.key === k)?.name || "";
    const todo = plan.diffs.map((d) => {
      const ck = d.toCountryKey || keyByName[normCountry(d.toCountry)] || "";
      return { d, ck, countryChange: d.countryDiff && !!ck };
    });
    for (let i = 0; i < todo.length; i += 10) {
      setTraceProgress(`Карточки: ${Math.min(i + 10, todo.length)} из ${todo.length}`);
      const part = todo.slice(i, i + 10);
      const r = await odataApi.traceApply(
        base,
        [],
        part.map((t) => ({ key: t.d.key, country_key: t.countryChange ? t.ck : undefined, traceable: t.d.toTrace })),
      );
      (r.result.cards || []).forEach((c: { state: string; error?: string }, j: number) => {
        const t = part[j];
        const name = `${t.d.article} · ${t.d.name}`;
        if (c.state === "ok") {
          if (t.countryChange) report.countryChanged.push({ name, from: t.d.fromCountry, to: cname(t.ck) });
          if (t.d.toTrace !== undefined) report.traceChanged.push({ name, from: t.d.fromTrace, to: t.d.toTrace });
        } else if (c.state === "error") report.failed.push({ name, reason: c.error || "не записалось" });
        if (t.d.countryDiff && !t.ck) report.failed.push({ name, reason: `страны «${t.d.toCountry}» нет в 1С` });
      });
    }
    Object.entries(keyByName).forEach(([n, k]) => {
      const nm = cname(k);
      if (nm) names[n] = nm;
    });
    return { report, names };
  };

  const doMatch = async () => {
    if (!parsed) return;
    setTracePlan(null);
    setTraceReport(null);
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
        const fixedRows = applyFixes(fileRows, gtdFixes);
        const nums = [
          ...new Set(
            fixedRows
              .flatMap((x) => [x.gtd, x.rnpt])
              .filter(Boolean) as string[],
          ),
        ];
        setGtdAll(nums);
        if (nums.length) {
          const miss: string[] = [];
          const bad: string[] = [];
          let exist = 0;
          let readErr = "";
          let scanned = 0;
          const refs: Record<string, string> = {};
          const gStep = 40;
          for (let i = 0; i < nums.length; i += gStep) {
            setMatchProgress(
              `Номера ГТД: ${Math.min(i + gStep, nums.length)} из ${nums.length}`,
            );
            const g = await odataApi.checkGtd(base, nums.slice(i, i + gStep));
            exist += g.result.existing || 0;
            miss.push(...(g.result.missing || []));
            bad.push(...(g.result.unknown || []));
            if (g.result.error) readErr = g.result.error;
            scanned += g.result.scanned || 0;
            Object.assign(refs, g.result.refs || {});
          }
          setGtdRefs(refs);
          setGtdError(readErr);
          setGtdScanned(scanned);
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

  const doGtdProbe = async () => {
    const nums = gtdAll.length ? gtdAll : gtdMissing || [];
    if (!nums.length) return;
    setGtdBusy(true);
    setGtdError("");
    try {
      const r = await odataApi.gtdProbe(base, nums.slice(0, 3));
      const d = r.result;
      if (d.error) {
        setGtdError(d.error);
        return;
      }
      const text = (d.results || [])
        .map((x: Record<string, unknown>, i: number) => {
          if (x.error && !x.ref)
            return `--- номер ${i + 1}: ${x.number} ---\n${x.error}`;
          return (
            `--- номер ${i + 1}: ${x.number} ---\n` +
            `итог: ${x.ok ? "записан" : "НЕ записан"}` +
            (x.error ? `\nошибка: ${x.error}` : "") +
            `\nбыло:\n${JSON.stringify(x.before, null, 1)}` +
            `\nстало:\n${JSON.stringify(x.after, null, 1)}`
          );
        })
        .join("\n\n");
      setGtdProgress(text);
    } catch (e) {
      setGtdError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGtdBusy(false);
    }
  };

  const doGtdForeign = async () => {
    setGtdBusy(true);
    setGtdError("");
    try {
      const r = await odataApi.gtdForeign(base, gtdMissing || []);
      const d = r.result;
      if (d.error) {
        setGtdError(d.error);
        return;
      }
      const ours = (d.ours || [])
        .map(
          (o: Record<string, unknown>) =>
            `  ${o.raw_repr}  (длина ${o.len})`,
        )
        .join("\n");
      const foreign = (d.foreign || [])
        .map(
          (f: Record<string, unknown>, i: number) =>
            `--- запись ${i + 1} ---\n` +
            `значение: ${f.raw_repr}  (длина ${f.len})\n` +
            `реквизиты целиком:\n${JSON.stringify(f.record, null, 1)}`,
        )
        .join("\n\n");
      setGtdProgress(
        `Просмотрено записей: ${d.scanned}\n\n` +
          `НАШИ номера:\n${ours}\n\n` +
          `ЧУЖИЕ записи из 1С (не совпали):\n\n${foreign}`,
      );
    } catch (e) {
      setGtdError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGtdBusy(false);
    }
  };

  const doDocCompare = async () => {
    const input = window.prompt("Номера двух поступлений через запятую", "0000-000117, 0000-000119");
    if (!input) return;
    setGtdBusy(true);
    setGtdError("");
    try {
      const nums = input.split(",").map((x) => x.trim()).filter(Boolean);
      const r = await odataApi.docCompare(base, nums);
      setGtdProgress("СРАВНЕНИЕ ДОКУМЕНТОВ:\n" + JSON.stringify(r.result, null, 1));
    } catch (e) {
      setGtdError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGtdBusy(false);
    }
  };

  const doGtdDebug = async () => {
    setGtdBusy(true);
    setGtdError("");
    try {
      const r = await odataApi.gtdDebug(base, gtdMissing || []);
      const d = r.result;
      const pages = (d.pages || [])
        .map(
          (p: Record<string, unknown>) =>
            `  skip ${p.skip}: вернулось ${p.got}, совпало ${p.hits}, ${p.sec}с${p.error ? " — " + p.error : ""}`,
        )
        .join("\n");
      const probes = (d.probes || [])
        .map(
          (p: Record<string, unknown>) =>
            `  ${p.number} → ${p.error ? "ошибка: " + p.error : "найдено " + p.found}`,
        )
        .join("\n");
      type RecView = {
        number: string;
        number_len: number;
        code: string;
        code_len: number;
        rnpt?: boolean;
        td?: boolean;
        deleted?: boolean;
      };
      type Try = { how: string; found?: number; error?: string; rows?: RecView[] };
      type RnptProbe = { number: string; len: number; tries: Try[] };
      const rnpt = ((d.rnpt_probes || []) as RnptProbe[])
        .map(
          (p) =>
            `● ${p.number}${p.len ? ` (${p.len} симв.)` : ""}\n` +
            p.tries
              .map(
                (t) =>
                  `  ${t.how}: ${t.error ? "ошибка: " + t.error : "найдено " + t.found}` +
                  (t.rows || [])
                    .map(
                      (r) =>
                        `\n    номер "${r.number}" (${r.number_len})\n    код "${r.code}" (${r.code_len})` +
                        ` · РНПТ=${r.rnpt} · ТД=${r.td}${r.deleted ? " · удалена" : ""}`,
                    )
                    .join(""),
              )
              .join("\n"),
        )
        .join("\n\n");
      setGtdProgress(
        (rnpt ? `ПОИСК РНПТ:\n${rnpt}\n\n` : "") +
        `Всего записей в справочнике: ${d.count}\n` +
          `Прочитано: ${d.scanned}, остановка: ${d.stop}\n` +
          `Поле сверки: ${d.field}\n` +
          `Совпало: ${d.existing} из ${d.checked}\n\n` +
          `Страницы:\n${pages}\n\n` +
          `Точечный поиск:\n${probes}\n\n` +
          `Образцы записей:\n${JSON.stringify(d.samples, null, 1)}`,
      );
    } catch (e) {
      setGtdError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setGtdBusy(false);
    }
  };

  const doTryOneGtd = async () => {
    if (!gtdMissing?.length) return;
    setGtdBusy(true);
    setGtdError("");
    setGtdProgress("");
    try {
      const r = await odataApi.tryCreateOneGtd(base, gtdMissing);
      const res = r.result;
      const sent = Object.entries(res.sent || {})
        .map(([k, v]) => `  ${k} = ${JSON.stringify(v)}`)
        .join("\n");
      if (res.ok && !res.skipped) {
        setGtdProgress(
          `Запись создана: ${res.number}\n` +
            `Код в 1С: ${res.code || "пусто"}\n\nОтправлено:\n${sent}`,
        );
      } else {
        setGtdError(
          `Не вышло: ${res.error}\n\nОтправляли:\n${sent}`,
        );
      }
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
    let idle = 0;
    try {
      while (queue.length) {
        setGtdProgress(`Создано ${done} из ${total}`);
        const portion = queue.slice(0, 20);
        const rest = queue.slice(20);
        const r = await odataApi.createGtd(base, portion);
        done += r.result.created || 0;
        const next: string[] = [...(r.result.remaining || []), ...rest];
        queue = next;
        setGtdMissing(next);
        if (!r.result.ok) {
          setGtdError(r.result.error || "1С отказала");
          break;
        }
        const progressed = (r.result.created || 0) + (r.result.already || 0);
        idle = progressed ? 0 : idle + 1;
        if (idle >= 3) {
          setGtdError("1С долго не отвечает — остановился. Нажмите кнопку ещё раз, созданные номера повторно не создадутся");
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
    setTraceReport(null);
    try {
      let names: Record<string, string> = {};
      if (isReceipt && tracePlan) {
        names = Object.fromEntries(
          Object.entries(tracePlan.keyByName).map(([n, k]) => [n, countries1c.find((c) => c.key === k)?.name || ""]),
        );
        if (traceApply && (tracePlan.diffs.length || tracePlan.create.length)) {
          try {
            const res = await runTraceApply(tracePlan);
            names = res.names;
            setTraceReport(res.report);
          } catch (e) {
            setTraceReport({
              countryChanged: [],
              traceChanged: [],
              created: [],
              failed: [{ name: "Исправление карточек", reason: e instanceof Error ? e.message : "ошибка" }],
            });
          }
          setTraceProgress("");
        }
      }
      const toName = (c: string) =>
        names[normCountry(c)] || findCountry(c, countries1c)?.name || c;
      const rows = applyFixes(fileRows, gtdFixes).map((r, i) => ({
        key: matches[i]?.key || "",
        article: r.article,
        name: r.name,
        quantity: r.quantity,
        price: r.price,
        ...(isReceipt
          ? { country: r.country ? toName(r.country) : "", gtd: r.gtd, rnpt: r.rnpt }
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
        ...(isReceipt ? { gtd_refs: gtdRefs } : {}),
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
  const problems = isReceipt && parsed ? findProblemRows(fileRows) : [];
  const problemsResolved = problems.every((p) => {
    const f = gtdFixes[p.index];
    return f && f.country && (isRussia(f.country) || gtdKind(f.number));
  });
  const gtdOk =
    !isReceipt ||
    (gtdMissing !== null && gtdMissing.length === 0 && problemsResolved);
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

        {parsed && isReceipt && (
          <NomenTraceColumns
            columns={parsed.columns}
            items={parsed.cells.map((cells) => ({ cells }) as InvoiceItem)}
            value={traceCols}
            disabled={matchBusy || createBusy}
            onChange={changeTraceCols}
          />
        )}

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
                {gtdScanned > 0 && (
                  <div className="text-xs mt-1 opacity-70">
                    Просмотрено записей справочника: {gtdScanned}
                  </div>
                )}
                {(gtdMissing.length > 0 || gtdAll.length > 0) && (
                  <>
                    <div className="text-xs mt-1 font-mono opacity-80 break-all">
                      {(gtdMissing.length ? gtdMissing : gtdAll)
                        .slice(0, 3)
                        .join(", ")}
                      {(gtdMissing.length || gtdAll.length) > 3 &&
                        ` и ещё ${(gtdMissing.length || gtdAll.length) - 3}`}
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
                        Создать номера ГТД и РНПТ
                      </Button>
                      <Button
                        onClick={doTryOneGtd}
                        disabled={gtdBusy}
                        size="sm"
                        variant="outline"
                        className="rounded-lg gap-2 border-amber-500/50 text-amber-200"
                      >
                        <Icon name="FlaskConical" size={15} />
                        Создать одну запись (проба)
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
                      <Button
                        onClick={doGtdDebug}
                        disabled={gtdBusy}
                        size="sm"
                        variant="outline"
                        className="rounded-lg gap-2 border-sky-500/50 text-sky-200"
                      >
                        <Icon name="Bug" size={15} />
                        Диагностика поиска
                      </Button>
                      <Button
                        onClick={doDocCompare}
                        disabled={gtdBusy}
                        size="sm"
                        variant="outline"
                        className="rounded-lg gap-2 border-emerald-500/50 text-emerald-200"
                      >
                        <Icon name="GitCompare" size={15} />
                        Сравнить документы
                      </Button>
                      <Button
                        onClick={doGtdForeign}
                        disabled={gtdBusy}
                        size="sm"
                        variant="outline"
                        className="rounded-lg gap-2 border-violet-500/50 text-violet-200"
                      >
                        <Icon name="Search" size={15} />
                        Показать чужие записи
                      </Button>
                      <Button
                        onClick={doGtdProbe}
                        disabled={gtdBusy}
                        size="sm"
                        variant="outline"
                        className="rounded-lg gap-2 border-amber-500/50 text-amber-200"
                      >
                        <Icon name="FlaskConical" size={15} />
                        Проба: 3 номера
                      </Button>

                    </div>
                  </>
                )}
                {problems.length > 0 && (
                  <div className="mt-3">
                    <GtdFixCard
                      problems={problems}
                      fixes={gtdFixes}
                      onChange={setGtdFixes}
                      onApply={doMatch}
                      busy={matchBusy}
                    />
                  </div>
                )}
                {gtdUnknown.length > 0 && (
                  <div className="text-xs mt-2 text-red-300 break-all">
                    Не похожи на ГТД или РНПТ ({gtdUnknown.length}):{" "}
                    {gtdUnknown.slice(0, 5).join(", ")}
                  </div>
                )}
                {gtdProgress && (
                  <div className="mt-2">
                    <Button
                      onClick={copyReport}
                      size="sm"
                      variant="outline"
                      className="rounded-lg gap-2 mb-2"
                    >
                      <Icon name={copied ? "Check" : "Copy"} size={15} />
                      {copied ? "Скопировано" : "Скопировать отчёт"}
                    </Button>
                    <div className="text-xs opacity-80 whitespace-pre-wrap break-all">
                      {gtdProgress}
                    </div>
                  </div>
                )}
              </div>
            )}

            {gtdError && (
              <ResultBox ok={false} title="Номера ГТД" details={gtdError} />
            )}

            <div className="mt-3 rounded-lg border border-white/[0.08] overflow-hidden">
              <div className="max-h-96 overflow-y-auto divide-y divide-white/[0.06]">
                {fileRows.map((r, i) => {
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

        {parsed && isReceipt && (
          <ReceiptTraceCard
            plan={tracePlan}
            busy={traceBusy || createBusy}
            progress={traceProgress}
            error={traceError}
            apply={traceApply}
            onApply={setTraceApply}
            onCheck={doTraceCheck}
            disabled={!productsOk}
            report={traceReport}
          />
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
            {isReceipt && allFound && !tracePlan && (
              <p className="text-xs text-amber-400 mt-2">
                Карточки не проверены — страна и признак в них не исправятся. Нажмите «Проверить карточки» выше.
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
            {created?.ok && !!created.used?.lost_numbers?.length && (
              <div className="mt-3 rounded-xl border border-red-500/50 bg-red-500/10 p-4 text-sm">
                <div className="flex items-center gap-2 font-semibold text-red-400 mb-1">
                  <Icon name="TriangleAlert" size={18} />
                  Номера ГТД / РНПТ не записались: {created.used.lost_numbers.length} стр.
                </div>
                <p className="text-muted-foreground mb-2">
                  Документ создан, но в этих строках колонка «Таможенная декларация или РНПТ»
                  пустая. Заполните их в 1С вручную или создайте номера и загрузите документ заново.
                </p>
                <div className="max-h-72 overflow-auto space-y-1">
                  {created.used.lost_numbers.map((x) => (
                    <div key={`${x.line}-${x.kind}`} className="rounded-lg bg-black/20 px-3 py-2">
                      <div>
                        <span className="text-muted-foreground">Строка {x.line} · </span>
                        <span className="font-medium">{x.article}</span>
                        {x.name && <span className="text-muted-foreground"> · {x.name}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {x.kind}: {x.number} — {x.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TestCard>
        )}
      </main>
    </div>
  );
};

export default OdataSupplierInvoice;
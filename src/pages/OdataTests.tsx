import { useState, useEffect } from "react";
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
import DocTest from "@/components/odata/DocTest";
import { odataApi, DOC_KINDS, RefItem, FoundProduct } from "./odata/odataApi";
import { findBase } from "./odata/bases";

const OdataTests = () => {
  const navigate = useNavigate();
  const { base = "trade-resurs" } = useParams();
  const baseInfo = findBase(base);
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pingBusy, setPingBusy] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [orgs, setOrgs] = useState<RefItem[]>([]);
  const [warehouses, setWarehouses] = useState<RefItem[]>([]);
  const [orgKey, setOrgKey] = useState("");
  const [whKey, setWhKey] = useState("");
  const [refsBusy, setRefsBusy] = useState(false);
  const [refsError, setRefsError] = useState("");

  const [article, setArticle] = useState("");
  const [findBusy, setFindBusy] = useState(false);
  const [found, setFound] = useState<FoundProduct[] | null>(null);
  const [findError, setFindError] = useState("");

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin/dashboard");
      return;
    }
    loadRefs();
  }, []);

  const loadRefs = async () => {
    setRefsBusy(true);
    setRefsError("");
    try {
      const r = await odataApi.refs(base);
      if (r.configured === false) {
        setConfigured(false);
        return;
      }
      setConfigured(true);
      const res = r.result || {};
      setOrgs(res.organizations || []);
      setWarehouses(res.warehouses || []);
      if (res.organizations?.length) setOrgKey(res.organizations[0].key);
      if (res.warehouses?.length) setWhKey(res.warehouses[0].key);
      if (res.organizations_error || res.warehouses_error) {
        setRefsError(res.organizations_error || res.warehouses_error);
      }
    } catch (e) {
      setRefsError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setRefsBusy(false);
    }
  };

  const doPing = async () => {
    setPingBusy(true);
    setPingResult(null);
    try {
      const r = await odataApi.ping(base);
      if (r.configured === false) {
        setConfigured(false);
        return;
      }
      const res = r.result;
      if (res.ok) {
        setPingResult({
          ok: true,
          text: `Опубликовано объектов: ${res.entity_count}\n\n${(res.entities || []).join("\n")}`,
        });
      } else {
        setPingResult({ ok: false, text: res.error });
      }
    } catch (e) {
      setPingResult({ ok: false, text: e instanceof Error ? e.message : "Ошибка" });
    } finally {
      setPingBusy(false);
    }
  };

  const doFind = async () => {
    if (!article.trim()) return;
    setFindBusy(true);
    setFound(null);
    setFindError("");
    try {
      const r = await odataApi.findProduct(base, article.trim());
      if (r.result.ok) setFound(r.result.items);
      else setFindError(r.result.error);
    } catch (e) {
      setFindError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setFindBusy(false);
    }
  };

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
              Тесты подключения
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {baseInfo?.title || base}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        {configured === false && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4 sm:p-5 mb-5">
            <div className="flex items-start gap-3">
              <Icon name="KeyRound" size={20} className="text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold">Доступ к 1С не настроен</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Нужно заполнить адрес базы, имя пользователя и пароль в секретах проекта:
                  Ядро → Секреты. После этого обновите страницу.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
            <TestCard
              title="Связь с базой"
              icon="Plug"
              description="Проверяет, что сервис отвечает и логин подходит"
            >
              <Button onClick={doPing} disabled={pingBusy} size="sm" className="rounded-lg gap-2">
                {pingBusy ? (
                  <Icon name="Loader2" size={15} className="animate-spin" />
                ) : (
                  <Icon name="Play" size={15} />
                )}
                Проверить
              </Button>
              {pingResult && (
                <ResultBox
                  ok={pingResult.ok}
                  title={pingResult.ok ? "Связь есть" : "Связи нет"}
                  details={pingResult.text}
                />
              )}
            </TestCard>

            <TestCard
              title="Организация и склад"
              icon="Building2"
              description="Эти значения подставляются в создаваемые документы"
            >
              {refsBusy && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Icon name="Loader2" size={15} className="animate-spin" />
                  Загружаю из 1С
                </div>
              )}
              {refsError && <ResultBox ok={false} title="Не удалось получить списки" details={refsError} />}
              {!refsBusy && !refsError && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Организация</Label>
                    <Select value={orgKey} onValueChange={setOrgKey}>
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
                    <Label className="text-xs text-muted-foreground">Склад</Label>
                    <Select value={whKey} onValueChange={setWhKey}>
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
                </div>
              )}
            </TestCard>

            <TestCard
              title="Поиск номенклатуры по артикулу"
              icon="Search"
              description="Точное совпадение артикула, папки не показываются"
            >
              <div className="flex gap-2">
                <Input
                  value={article}
                  onChange={(e) => setArticle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doFind()}
                  placeholder="Артикул"
                  className="max-w-xs"
                />
                <Button onClick={doFind} disabled={findBusy} size="sm" className="rounded-lg gap-2">
                  {findBusy ? (
                    <Icon name="Loader2" size={15} className="animate-spin" />
                  ) : (
                    <Icon name="Search" size={15} />
                  )}
                  Найти
                </Button>
              </div>
              {findError && <ResultBox ok={false} title="Ошибка поиска" details={findError} />}
              {found && found.length === 0 && (
                <ResultBox ok={false} title="Ничего не найдено" details="Товара с таким артикулом в 1С нет" />
              )}
              {found && found.length > 0 && (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] overflow-hidden">
                  <div className="px-3 py-2 text-sm text-emerald-200 border-b border-emerald-500/20">
                    Найдено: {found.length}
                  </div>
                  <div className="divide-y divide-white/[0.06]">
                    {found.map((p) => (
                      <div key={p.key} className="px-3 py-2 text-sm">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono break-all">
                          артикул {p.article || "—"} · код {p.code} · {p.key}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TestCard>

            {DOC_KINDS.map((d) => (
              <DocTest
                key={d.kind}
                base={base}
                kind={d.kind}
                title={d.title}
                icon={d.icon}
                organizationKey={orgKey}
                warehouseKey={whKey}
              />
            ))}

            <DocTest
              base={base}
              kind="product"
              title="Тестовая номенклатура"
              icon="Package"
              isProduct
            />
        </div>
      </main>
    </div>
  );
};

export default OdataTests;
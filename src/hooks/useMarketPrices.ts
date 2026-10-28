import { useCallback, useEffect, useState } from "react";
import {
  confirmPrice,
  excludeCard,
  fetchSitePrice,
  lookupPrices,
  modelKey,
  saveTotal,
  type PriceRow,
  type SiteKey,
  type TotalKey,
} from "@/lib/marketPrices";

type Item = Record<string, unknown>;

export const useMarketPrices = (items: Item[], enabled: boolean) => {
  const [rows, setRows] = useState<Record<string, PriceRow>>({});
  const [allowed, setAllowed] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [sites, setSites] = useState<SiteKey[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  const put = (row: PriceRow) =>
    setRows((prev) => ({ ...prev, [`${row.brand_key}|${row.model_key}`]: row }));

  useEffect(() => {
    if (!enabled || items.length === 0) return;
    const models = items.map((it) => ({ brand: it.brand, model: it.model }));
    lookupPrices(models)
      .then((d) => {
        setAllowed(true);
        setCanEdit(d.can_edit);
        setIsOwner(d.is_owner);
        setSites(d.sites || []);
        setRows((prev) => {
          const next = { ...prev };
          d.rows.forEach((r) => (next[`${r.brand_key}|${r.model_key}`] = r));
          return next;
        });
      })
      .catch(() => setAllowed(false));
  }, [items, enabled, reload]);

  const rowOf = useCallback((it: Item) => rows[modelKey(it.brand, it.model)], [rows]);

  const fetchPrice = async (it: Item, site: SiteKey) => {
    const k = `${modelKey(it.brand, it.model)}#${site}`;
    setBusy((b) => ({ ...b, [k]: true }));
    setError("");
    try {
      const d = await fetchSitePrice(site, String(it.brand ?? ""), String(it.model ?? ""));
      put(d.row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  };

  const excludePrice = async (it: Item, site: SiteKey) => {
    const k = `${modelKey(it.brand, it.model)}#${site}`;
    setBusy((b) => ({ ...b, [k]: true }));
    setError("");
    try {
      const d = await excludeCard(site, String(it.brand ?? ""), String(it.model ?? ""));
      put(d.row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  };

  const confirm = async (it: Item, site: SiteKey) => {
    setError("");
    try {
      const d = await confirmPrice(site, String(it.brand ?? ""), String(it.model ?? ""));
      put(d.row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const setTotal = async (it: Item, field: TotalKey, value: string) => {
    setError("");
    try {
      const d = await saveTotal(field, String(it.brand ?? ""), String(it.model ?? ""), value);
      put(d.row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const fetchAll = (it: Item) => {
    sites.forEach((s) => fetchPrice(it, s));
  };

  const isBusy = (it: Item, site: SiteKey) => Boolean(busy[`${modelKey(it.brand, it.model)}#${site}`]);

  return {
    sites,
    isOwner,
    fetchAll,
    refresh: () => setReload((n) => n + 1),
    allowed,
    canEdit, rowOf, fetchPrice, excludePrice, confirm, setTotal, isBusy, error, clearError: () => setError("") };
};

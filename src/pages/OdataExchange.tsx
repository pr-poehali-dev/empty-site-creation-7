import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { odataApi } from "./odata/odataApi";
import { ODATA_BASES } from "./odata/bases";

const OdataExchange = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const [status, setStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user.role !== "owner") {
      navigate("/admin/dashboard");
      return;
    }
    odataApi
      .bases()
      .then((r) => setStatus(r.bases || {}))
      .catch(() => setStatus({}));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-3 sm:py-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-white/[0.06]"
            onClick={() => navigate("/admin/dashboard")}
          >
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg sm:text-xl font-semibold">Обмен с 1С OData</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <p className="text-sm text-muted-foreground mb-4">
          Выберите базу, с которой будете работать
        </p>

        <div className="space-y-3">
          {ODATA_BASES.map((b) => {
            const connected = status[b.slug];
            return (
              <button
                key={b.slug}
                onClick={() => b.ready && navigate(`/admin/odata/${b.slug}`)}
                disabled={!b.ready}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  b.ready
                    ? "border-white/[0.08] bg-card hover:bg-white/[0.04]"
                    : "border-white/[0.05] bg-card/50 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      b.ready ? "bg-primary/15" : "bg-white/[0.04]"
                    }`}
                  >
                    <Icon
                      name="Database"
                      size={20}
                      className={b.ready ? "text-primary" : "text-muted-foreground"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{b.title}</div>
                    <div className="text-sm text-muted-foreground">{b.hint}</div>
                  </div>
                  {b.ready && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          connected ? "bg-emerald-400" : "bg-amber-400"
                        }`}
                      />
                      <Icon name="ChevronRight" size={18} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default OdataExchange;

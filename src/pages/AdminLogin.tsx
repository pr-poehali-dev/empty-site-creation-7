import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/4a2cb8d4-f9ea-4107-a828-aced0209a15e";
const BOT_USERNAME = "mirtehniki_plus_bot";

export default function AdminLogin() {
  const [phone, setPhone] = useState("+");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "telegram" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (!value.startsWith("+")) value = "+" + value;
    const cleaned = "+" + value.replace(/[^\d]/g, "");
    if (cleaned.length <= 16) {
      setPhone(cleaned);
    }
  };

  const openTelegramBot = () => {
    const startParam = phone.replace("+", "");
    window.open(`https://t.me/${BOT_USERNAME}?start=${startParam}`, "_blank");
  };

  const checkPhone = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${AUTH_URL}/?action=check_phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await resp.json();

      if (!data.allowed) {
        toast({ title: "Доступ запрещён", description: data.error, variant: "destructive" });
        return;
      }

      if (data.need_telegram) {
        setStep("telegram");
        toast({ title: "Привяжите Telegram", description: "Нажмите кнопку ниже и напишите боту" });
        return;
      }

      await sendCode();
    } catch {
      toast({ title: "Ошибка", description: "Не удалось проверить номер", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const sendCode = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${AUTH_URL}/?action=send_code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await resp.json();

      if (resp.ok) {
        setStep("code");
        toast({ title: "Код отправлен", description: "Проверьте Telegram" });
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось отправить код", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const checkTelegramLink = async () => {
    setCheckingLink(true);
    try {
      const resp = await fetch(`${AUTH_URL}/?action=check_telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await resp.json();

      if (data.linked) {
        setTelegramLinked(true);
        toast({ title: "Telegram привязан", description: "Теперь отправьте код" });
      } else {
        toast({ title: "Telegram не привязан", description: "Нажмите 'Привет Telegram' и напишите боту", variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось проверить привязку", variant: "destructive" });
    } finally {
      setCheckingLink(false);
    }
  };

  const verifyCode = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${AUTH_URL}/?action=verify_code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await resp.json();

      if (resp.ok) {
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        toast({ title: "Добро пожаловать!" });
        if (data.user.role === "owner") {
          navigate("/admin/dashboard");
        } else {
          navigate("/admin/manager");
        }
      } else {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось проверить код", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const phoneDigits = phone.replace(/\D/g, "");
  const isPhoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 15;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-white/[0.08] bg-card p-6 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl sm:text-2xl font-semibold">Вход в панель управления</h1>
          <p className="text-sm text-muted-foreground mt-1">Мир Техники плюс</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Номер телефона</label>
            <Input
              type="tel"
              placeholder="+7XXXXXXXXXX"
              value={phone}
              onChange={handlePhoneChange}
              disabled={step !== "phone"}
              className="h-11 rounded-xl bg-secondary border-white/[0.08] text-base"
            />
          </div>

          {step === "phone" && (
            <Button
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
              onClick={checkPhone}
              disabled={!isPhoneValid || loading}
            >
              {loading ? (
                <Icon name="Loader2" size={18} className="animate-spin" />
              ) : (
                <Icon name="ArrowRight" size={18} />
              )}
              <span className="ml-2">{loading ? "Проверка..." : "Продолжить"}</span>
            </Button>
          )}

          {step === "telegram" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                1. Нажмите «Привет Telegram» и напишите боту<br />
                2. Нажмите «Я привязал» для проверки
              </p>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl border-white/[0.08] hover:bg-white/[0.06]"
                onClick={openTelegramBot}
              >
                <Icon name="Send" size={18} />
                <span className="ml-2">Привет Telegram</span>
              </Button>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl border-white/[0.08] hover:bg-white/[0.06]"
                onClick={checkTelegramLink}
                disabled={checkingLink}
              >
                {checkingLink ? (
                  <Icon name="Loader2" size={18} className="animate-spin" />
                ) : (
                  <Icon name="CheckCircle" size={18} />
                )}
                <span className="ml-2">{checkingLink ? "Проверка..." : "Я привязал"}</span>
              </Button>
              <Button
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                onClick={sendCode}
                disabled={!telegramLinked || loading}
              >
                {loading ? (
                  <Icon name="Loader2" size={18} className="animate-spin" />
                ) : (
                  <Icon name="MessageSquare" size={18} />
                )}
                <span className="ml-2">{loading ? "Отправка..." : "Отправить код в Telegram"}</span>
              </Button>
              <button
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                onClick={() => { setStep("phone"); setTelegramLinked(false); }}
              >
                Изменить номер
              </button>
            </div>
          )}

          {step === "code" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Код из Telegram</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-11 rounded-xl bg-secondary border-white/[0.08] text-center text-xl tracking-[0.3em] font-mono"
                />
              </div>
              <Button
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                onClick={verifyCode}
                disabled={code.length < 6 || loading}
              >
                {loading ? (
                  <Icon name="Loader2" size={18} className="animate-spin" />
                ) : (
                  <Icon name="LogIn" size={18} />
                )}
                <span className="ml-2">{loading ? "Проверка..." : "Войти"}</span>
              </Button>
              <button
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                onClick={() => { setStep("phone"); setCode(""); }}
              >
                Изменить номер
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
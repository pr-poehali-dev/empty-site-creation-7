import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const AUTH_URL = "https://functions.poehali.dev/4a2cb8d4-f9ea-4107-a828-aced0209a15e";
const BOT_USERNAME = "mirtehniki_plus_bot";

export default function AdminLogin() {
  const [phone, setPhone] = useState("+7");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "telegram" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 1) return "+7";
    if (digits.length <= 4) return `+7 (${digits.slice(1)}`;
    if (digits.length <= 7) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`;
    if (digits.length <= 9) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  };

  const cleanPhone = (formatted: string) => "+" + formatted.replace(/\D/g, "");

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = raw.replace(/\D/g, "");
    if (digits.length <= 11) {
      setPhone(formatPhone(raw));
    }
  };

  const openTelegramBot = () => {
    const clean = cleanPhone(phone);
    const startParam = clean.replace("+", "");
    window.open(`https://t.me/${BOT_USERNAME}?start=${startParam}`, "_blank");
  };

  const checkPhone = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${AUTH_URL}/?action=check_phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone(phone) }),
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
        body: JSON.stringify({ phone: cleanPhone(phone) }),
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
        body: JSON.stringify({ phone: cleanPhone(phone) }),
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
        body: JSON.stringify({ phone: cleanPhone(phone), code }),
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

  const phoneDigits = cleanPhone(phone).replace("+", "");
  const isPhoneValid = phoneDigits.length === 11;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Вход в панель управления</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Номер телефона</label>
            <Input
              type="tel"
              placeholder="+7 (___) ___-__-__"
              value={phone}
              onChange={handlePhoneChange}
              disabled={step !== "phone"}
            />
          </div>

          {step === "phone" && (
            <Button
              className="w-full"
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
              <p className="text-sm text-muted-foreground text-center">
                1. Нажмите «Привет Telegram» и напишите боту<br />
                2. Нажмите «Я привязал» для проверки
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={openTelegramBot}
              >
                <Icon name="Send" size={18} />
                <span className="ml-2">Привет Telegram</span>
              </Button>
              <Button
                variant="outline"
                className="w-full"
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
                className="w-full"
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
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => { setStep("phone"); setTelegramLinked(false); }}
              >
                Изменить номер
              </Button>
            </div>
          )}

          {step === "code" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Код из Telegram</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="______"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-2xl tracking-widest"
                  autoFocus
                />
              </div>
              <Button
                className="w-full"
                onClick={verifyCode}
                disabled={code.length !== 6 || loading}
              >
                {loading ? (
                  <Icon name="Loader2" size={18} className="animate-spin" />
                ) : (
                  <Icon name="LogIn" size={18} />
                )}
                <span className="ml-2">{loading ? "Проверка..." : "Войти"}</span>
              </Button>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => { setStep("phone"); setCode(""); }}
              >
                Изменить номер
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
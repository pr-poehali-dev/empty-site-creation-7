import { useState } from "react";
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
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [loading, setLoading] = useState(false);
  const [checkingTelegram, setCheckingTelegram] = useState(false);
  const { toast } = useToast();

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 1) return "+7";
    if (digits.length <= 4) return `+7 (${digits.slice(1)}`;
    if (digits.length <= 7) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`;
    if (digits.length <= 9) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  };

  const cleanPhone = (formatted: string) => {
    return "+" + formatted.replace(/\D/g, "");
  };

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

  const checkTelegramLinked = async () => {
    setCheckingTelegram(true);
    try {
      const resp = await fetch(`${AUTH_URL}/?action=check_telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone(phone) }),
      });
      const data = await resp.json();
      if (data.linked) {
        toast({ title: "Telegram привязан", description: "Теперь можно отправить код" });
        return true;
      } else {
        toast({ title: "Telegram не привязан", description: "Нажмите 'Привет Telegram' и напишите боту", variant: "destructive" });
        return false;
      }
    } catch {
      toast({ title: "Ошибка", description: "Не удалось проверить привязку", variant: "destructive" });
      return false;
    } finally {
      setCheckingTelegram(false);
    }
  };

  const sendCode = async () => {
    setLoading(true);
    try {
      const linked = await checkTelegramLinked();
      if (!linked) {
        setLoading(false);
        return;
      }

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
        window.location.href = "/admin/dashboard";
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
              disabled={step === "code"}
            />
          </div>

          {step === "phone" && (
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={openTelegramBot}
                disabled={!isPhoneValid}
              >
                <Icon name="Send" size={18} />
                <span className="ml-2">Привет Telegram</span>
              </Button>

              <Button
                className="w-full"
                onClick={sendCode}
                disabled={!isPhoneValid || loading}
              >
                {loading ? (
                  <Icon name="Loader2" size={18} className="animate-spin" />
                ) : (
                  <Icon name="MessageSquare" size={18} />
                )}
                <span className="ml-2">
                  {loading ? "Отправка..." : "Отправить код в Telegram"}
                </span>
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

          <p className="text-xs text-muted-foreground text-center">
            Если Telegram не привязан — нажмите «Привет Telegram», напишите боту, затем отправьте код
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

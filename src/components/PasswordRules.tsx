import Icon from "@/components/ui/icon";

export const passwordChecks = (password: string) => [
  { label: "Минимум 8 символов", ok: password.length >= 8 },
  { label: "Заглавная латинская буква (A–Z)", ok: /[A-Z]/.test(password) },
  { label: "Строчная латинская буква (a–z)", ok: /[a-z]/.test(password) },
  { label: "Цифра (0–9)", ok: /\d/.test(password) },
  {
    label: "Специальный символ (! @ # $ % & *)",
    ok: /[!@#$%^&*()\-_=+[\]{};:,.<>/?~`|\\'"]/.test(password),
  },
  {
    label: "Только английская раскладка",
    ok: password.length > 0 && !/[^\x20-\x7E]/.test(password),
  },
];

export const isPasswordValid = (password: string) =>
  passwordChecks(password).every((c) => c.ok);

export default function PasswordRules({ password }: { password: string }) {
  const checks = passwordChecks(password);
  return (
    <div className="rounded-xl bg-secondary/50 border border-white/[0.06] p-3 space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Требования к паролю
      </div>
      {checks.map((c) => (
        <div key={c.label} className="flex items-center gap-2">
          <Icon
            name={c.ok ? "CheckCircle2" : "Circle"}
            size={14}
            className={c.ok ? "text-green-500 shrink-0" : "text-muted-foreground shrink-0"}
          />
          <span className={`text-xs ${c.ok ? "text-green-500" : "text-muted-foreground"}`}>
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

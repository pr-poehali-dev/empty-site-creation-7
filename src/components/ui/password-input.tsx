import { useState, useEffect, useRef, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type PasswordInputProps = React.ComponentProps<typeof Input> & {
  allowAutofill?: boolean;
};

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, allowAutofill, onChange, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const [locked, setLocked] = useState(!allowAutofill);
    const inner = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (allowAutofill) return;
      const t = setTimeout(() => {
        const el = inner.current;
        if (el && el.value && !props.value) {
          el.value = "";
        }
        setLocked(false);
      }, 400);
      return () => clearTimeout(t);
    }, [allowAutofill, props.value]);

    const setRefs = (el: HTMLInputElement | null) => {
      inner.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
    };

    const unlock = () => setLocked(false);

    return (
      <div className="relative">
        <Input
          {...props}
          ref={setRefs}
          type={visible ? "text" : "password"}
          readOnly={locked || props.readOnly}
          onFocus={(e) => {
            unlock();
            props.onFocus?.(e);
          }}
          onTouchStart={(e) => {
            unlock();
            props.onTouchStart?.(e);
          }}
          onChange={onChange}
          autoComplete={allowAutofill ? props.autoComplete : "new-password"}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          className={cn("pr-11 no-autofill", className)}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name={visible ? "EyeOff" : "Eye"} size={18} />
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export default PasswordInput;

import { ReactNode } from "react";
import Icon from "@/components/ui/icon";

interface TestCardProps {
  title: string;
  icon: string;
  description?: string;
  children: ReactNode;
}

const TestCard = ({ title, icon, description, children }: TestCardProps) => (
  <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-5">
    <div className="flex items-start gap-3 mb-3">
      <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        <Icon name={icon} size={18} className="text-primary" />
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold leading-tight">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
    {children}
  </div>
);

export default TestCard;

import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface Props {
  title: string;
  back: string;
  children: ReactNode;
}

const ConvertLayout = ({ title, back, children }: Props) => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const isOwner = user.role === "owner";

  useEffect(() => {
    if (!isOwner) navigate("/admin/dashboard");
  }, [isOwner, navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-white/[0.08] bg-card flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate(back)}>
            <Icon name="ArrowLeft" size={18} />
          </Button>
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
      </header>
      <main className="max-w-3xl mx-auto w-full px-4 py-6 flex-1">{children}</main>
    </div>
  );
};

export default ConvertLayout;

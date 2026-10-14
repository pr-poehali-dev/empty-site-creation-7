import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { toast } from "@/hooks/use-toast";

/** Ссылка на открытую страницу партии: скопировать или отправить в мессенджер. */
const BatchShare = ({ link, number }: { link: string; number: string }) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Ссылка скопирована" });
    } catch {
      window.prompt("Скопируйте ссылку", link);
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Партия ${number}`, text: `Партия ${number}`, url: link });
      } catch {
        /* отменили */
      }
      return;
    }
    copy();
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">Ссылка для тех, кто не в системе</div>
      <div className="rounded-lg bg-white/[0.04] px-3 py-2 text-xs font-mono break-all">{link}</div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-10 border-white/[0.1]" onClick={copy}>
          <Icon name="Copy" size={15} className="mr-1.5" />
          Скопировать
        </Button>
        <Button variant="outline" className="h-10 border-white/[0.1]" onClick={share}>
          <Icon name="Share2" size={15} className="mr-1.5" />
          Поделиться
        </Button>
      </div>
    </div>
  );
};

export default BatchShare;

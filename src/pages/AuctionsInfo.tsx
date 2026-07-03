import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface Stage {
  key: string;
  label: string;
  done: boolean;
  content: JSX.Element;
}

const Stage1Content = () => (
  <div className="space-y-6 text-sm leading-relaxed">
    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">Зачем нужен этот этап</h3>
      <p className="text-muted-foreground">
        Прежде чем бот начнёт публиковать лоты, а покупатели — делать ставки, системе нужно «место»,
        где всё это хранится, и правила, кто что может делать. Этап 1 — это невидимый фундамент:
        снаружи ничего не видно, но без него не работает ничего дальше. Как у ракеты — сначала
        стартовый стол и заправка, и только потом полёт.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">1. Кто и с каким доступом работает с аукционом</h3>
      <p className="text-muted-foreground mb-2">Мы завели три уровня доступа для сотрудников:</p>
      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
        <li><span className="text-foreground font-medium">Нет доступа</span> — сотрудник не участвует в аукционах.</li>
        <li><span className="text-foreground font-medium">Оператор</span> — может создавать и выставлять лоты, но <span className="text-foreground font-medium">не видит ставки</span> покупателей. Видит только итог: кто выиграл.</li>
        <li><span className="text-foreground font-medium">Администратор</span> — создаёт лоты и <span className="text-foreground font-medium">видит все ставки</span> в реальном времени.</li>
        <li><span className="text-foreground font-medium">Владелец видит всё и всегда</span> — это отдельное правило, оно выше любых настроек.</li>
      </ul>
      <p className="text-muted-foreground mt-2">
        Доступ выдаётся в карточке сотрудника (в настройках появился выбор «Доступ к аукциону»).
        Важно: сотрудник <span className="text-foreground font-medium">не может назначить доступ сам себе</span> — это делает владелец,
        а система проверяет право на сервере при каждом действии. Даже если кто-то попытается схитрить
        со стороны приложения, сервер откажет.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">2. Где хранятся лоты</h3>
      <p className="text-muted-foreground">
        Создано хранилище лотов. Лот — это произвольный товар, который сотрудник описывает руками:
        название, описание, <span className="text-foreground font-medium">до 5 фото</span> (первое — обложка), желаемая цена,
        количество, срок окончания и срок на оплату для победителя. У каждого лота есть статус
        (идёт / закрыт / на оплате / завершён / отменён).
      </p>
      <p className="text-muted-foreground mt-2">
        <span className="text-foreground font-medium">Дополнение (уточнили позже):</span> изначально лот привязывался к
        технической таблице сотрудников, которая на деле не используется для входа. Мы перепривязали
        автора лота к <span className="text-foreground font-medium">реальным сотрудникам</span> — тем, кто заходит через Telegram и
        кому владелец выдаёт доступ к аукциону. Так право на создание лота и оповещения в личку
        работают из одного места. Также хранение фото расширено с одного до пяти.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">3. Остаток товара и «Забрать по начальной цене»</h3>
      <p className="text-muted-foreground">
        У лота отдельно хранится <span className="text-foreground font-medium">остаток</span> — сколько единиц ещё доступно.
        Это нужно для кнопки покупателя <span className="text-foreground font-medium">«Забрать по начальной цене»</span>: когда человек
        выкупает сразу, остаток уменьшается на единицу, а когда доходит до нуля — лот закрывается.
        Так один лот может содержать несколько одинаковых товаров.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">4. Ставки покупателей</h3>
      <p className="text-muted-foreground">
        Создано хранилище ставок. Одна ставка на одного покупателя в рамках лота — и её
        <span className="text-foreground font-medium"> можно менять</span>, пока аукцион идёт. Мы храним, кто поставил (его Telegram),
        сумму и время. Такая структура выдерживает большой наплыв: тысячи людей могут ставить
        одновременно, не мешая друг другу.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">5. Победители и очередь выкупа</h3>
      <p className="text-muted-foreground">
        Создано хранилище победителей. Здесь у каждого — его цена, <span className="text-foreground font-medium">место в очереди</span> и
        статус (ждёт оплаты / оплатил / просрочил / уступил дальше). Это реализует ваше правило:
        <span className="text-foreground font-medium"> если победитель не оплатил в срок, право выкупа переходит к следующему</span> по
        величине ставки. Также помечается тип выкупа: обычный (по итогам торгов) или «забрал по начальной цене».
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">6. Платежи</h3>
      <p className="text-muted-foreground">
        Подготовлен каркас для оплаты — заполним его на этапе подключения приёма денег. Заранее,
        чтобы потом не перестраивать фундамент.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">7. Каналы бота</h3>
      <p className="text-muted-foreground">
        Создано хранилище каналов, куда бот умеет публиковать лоты, с отметкой о праве публикации.
        Боту достаточно <span className="text-foreground font-medium">минимальных прав</span> в канале — только «публиковать сообщения».
        Сотрудник сможет выбирать лишь те каналы, где у бота есть это право.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">8. Публикация одного лота в несколько каналов</h3>
      <p className="text-muted-foreground">
        Заложена возможность выставить один и тот же лот сразу в несколько каналов. При этом ставки
        и остаток товара — <span className="text-foreground font-medium">общие на лот</span>: из какого бы канала человек ни зашёл,
        все торгуются за один и тот же товар.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">Что учтено на будущее</h3>
      <p className="text-muted-foreground">
        Список у покупателя будет показывать не все лоты подряд (их могут быть тысячи), а только
        <span className="text-foreground font-medium"> его</span>: те, где он уже сделал ставку, плюс лот, по которому он только что зашёл.
        Победителю о необходимости выкупа бот напишет <span className="text-foreground font-medium">в личные сообщения</span>.
      </p>
    </div>

    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
      <h3 className="text-base font-semibold text-foreground mb-2">Итог этапа</h3>
      <p className="text-muted-foreground">
        Фундамент готов: заданы правила доступа, созданы хранилища для лотов, ставок, победителей,
        платежей и каналов, учтены мгновенный выкуп, изменение ставок, переход выкупа при неоплате
        и мультиканальная публикация. Дальше можно строить видимую часть — бота и мини-приложения.
      </p>
    </div>
  </div>
);

const Stage2Content = () => (
  <div className="space-y-6 text-sm leading-relaxed">
    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">Что делаем на этом этапе</h3>
      <p className="text-muted-foreground">
        Появляется видимая часть: сотрудник заходит в мини-приложение прямо из Telegram, а бот
        показывает удобную кнопку. Это первый экран, с которого начинается вся работа — и для
        сотрудника, и для будущего покупателя.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">1. Одна кнопка в боте</h3>
      <p className="text-muted-foreground">
        У бота слева от поля ввода появляется <span className="text-foreground font-medium">синяя кнопка «Открыть»</span>. Нажатие
        открывает мини-приложение прямо внутри Telegram — ничего скачивать не нужно. Покупателю
        достаточно написать боту «Старт», и кнопка сразу под рукой.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">2. Приложение само понимает, кто зашёл</h3>
      <p className="text-muted-foreground mb-2">
        При открытии Telegram передаёт подписанные данные о том, кто именно вошёл. Приложение сверяет
        их с базой сотрудников и показывает нужные кнопки:
      </p>
      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
        <li><span className="text-foreground font-medium">Сотрудник</span> (оператор или администратор) видит две кнопки: «Кабинет аукциона» и «Участвовать».</li>
        <li><span className="text-foreground font-medium">Покупатель</span> видит одну кнопку: «Участвовать».</li>
      </ul>
      <p className="text-muted-foreground mt-2">
        Пока кнопки ведут на заглушки «скоро» — их наполним на следующих шагах.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">3. Надёжная проверка на входе</h3>
      <p className="text-muted-foreground">
        Адрес приложения скрыть нельзя — так устроен Telegram у всех. Поэтому защита не на секретности
        адреса, а на <span className="text-foreground font-medium">подписи Telegram</span>: если кто-то откроет адрес просто в браузере,
        он увидит <span className="text-foreground font-medium">пустой экран</span> — без подписи сервер не отдаёт ни лотов, ни кабинета.
        Кабинет открывается только тому, кого владелец добавил в сотрудники и выдал доступ к аукциону.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">4. Адрес — не в коде, а в настройке</h3>
      <p className="text-muted-foreground">
        Адрес сайта хранится в отдельной настройке, а не «зашит» в программу. Если вы смените домен —
        меняется <span className="text-foreground font-medium">одно значение</span>, и кнопка бота сама начинает вести на новый адрес.
        Ничего переписывать не нужно.
      </p>
    </div>

    <div>
      <h3 className="text-base font-semibold text-foreground mb-2">5. Кнопка настройки — там же, где была</h3>
      <p className="text-muted-foreground">
        Синюю кнопку бота включает та же кнопка <span className="text-foreground font-medium">«Telegram»</span> в шапке панели владельца,
        что и раньше настраивала связь с ботом. Один клик — и связь, и кнопка приложения обновляются разом.
      </p>
    </div>

    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-4">
      <h3 className="text-base font-semibold text-foreground mb-2">Итог этапа</h3>
      <p className="text-muted-foreground">
        Сотрудник входит в мини-приложение из Telegram по одной кнопке, приложение само различает
        сотрудника и покупателя и показывает нужные кнопки, а вход надёжно защищён подписью Telegram.
        Дальше наполним кабинет: подключение каналов и создание лотов.
      </p>
    </div>
  </div>
);

const StageStub = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center mb-3">
      <Icon name="Clock" size={24} className="text-muted-foreground" />
    </div>
    <p className="text-foreground font-medium">{title}</p>
    <p className="text-sm text-muted-foreground mt-1">В работе — заполним по мере готовности.</p>
  </div>
);

const STAGES: Stage[] = [
  { key: "stage1", label: "Этап 1", done: true, content: <Stage1Content /> },
  { key: "stage2", label: "Этап 2", done: true, content: <Stage2Content /> },
  { key: "stage3", label: "Этап 3", done: false, content: <StageStub title="Этап 3. Мини-приложение сотрудника" /> },
  { key: "stage4", label: "Этап 4", done: false, content: <StageStub title="Этап 4. Мини-приложение покупателя и ставки" /> },
];

const AuctionsInfo = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("auth_user") || "{}");
  const [stage, setStage] = useState(STAGES[0].key);

  if (user.role !== "owner") {
    navigate("/admin");
    return null;
  }

  const active = STAGES.find((s) => s.key === stage) || STAGES[0];

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.08] bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-white/[0.06]"
              onClick={() => navigate("/admin/instructions")}
            >
              <Icon name="ArrowLeft" size={18} />
            </Button>
            <h1 className="text-lg sm:text-xl font-semibold">Аукционы</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {STAGES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                stage === s.key
                  ? "bg-rose-500/20 text-rose-300 font-medium"
                  : "text-muted-foreground hover:bg-white/[0.06]"
              }`}
            >
              {s.label}
              {s.done && <Icon name="Check" size={14} className="text-emerald-400" />}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-card p-4 sm:p-6">
          {active.content}
        </div>
      </main>
    </div>
  );
};

export default AuctionsInfo;
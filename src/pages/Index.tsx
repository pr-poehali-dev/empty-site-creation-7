const Index = () => {
  return (
    <div className="grain min-h-screen bg-background flex flex-col">
      <header
        className="animate-fade-in px-8 py-7 flex items-center justify-between"
        style={{ animationDelay: "0s" }}
      >
        <span
          className="text-foreground/30 tracking-[0.25em] uppercase"
          style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px" }}
        >
          — 2026
        </span>
        <nav>
          <a
            href="#"
            className="text-foreground/40 hover:text-foreground transition-colors duration-300 tracking-widest uppercase"
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px" }}
          >
            Меню
          </a>
        </nav>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <p
          className="animate-fade-up text-muted-foreground tracking-[0.3em] uppercase mb-8"
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "11px",
            animationDelay: "0.2s",
          }}
        >
          Добро пожаловать
        </p>

        <h1
          className="animate-fade-up text-foreground leading-[1.05] mb-10"
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "clamp(3.5rem, 10vw, 9rem)",
            fontWeight: 300,
            letterSpacing: "-0.01em",
            animationDelay: "0.35s",
          }}
        >
          Ваш заголовок
          <br />
          <em style={{ fontStyle: "italic", color: "hsl(40 15% 88% / 0.35)" }}>
            здесь
          </em>
        </h1>

        <p
          className="animate-fade-up text-muted-foreground max-w-md leading-relaxed mb-14"
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: "1.25rem",
            fontWeight: 300,
            animationDelay: "0.5s",
          }}
        >
          Короткое описание того, чем занимается этот сайт. Расскажите главную мысль в двух предложениях.
        </p>

        <div
          className="animate-fade-up flex items-center gap-8"
          style={{ animationDelay: "0.65s" }}
        >
          <button
            className="px-8 py-3 bg-foreground text-background tracking-widest uppercase transition-all duration-300 hover:opacity-80 hover:scale-[1.02] active:scale-[0.98]"
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px" }}
          >
            Действие
          </button>
          <a
            href="#"
            className="text-muted-foreground hover:text-foreground transition-colors duration-300 tracking-widest uppercase border-b border-border hover:border-foreground/40 pb-px"
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px" }}
          >
            Подробнее →
          </a>
        </div>
      </main>

      <footer
        className="animate-fade-in px-8 py-7 flex items-center justify-between"
        style={{ animationDelay: "0.8s" }}
      >
        <span
          className="text-foreground/20 tracking-widest"
          style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "10px" }}
        >
          © 2026
        </span>
        <div className="flex gap-1.5 items-center">
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/25" />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/12" />
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/6" />
        </div>
      </footer>
    </div>
  );
};

export default Index;

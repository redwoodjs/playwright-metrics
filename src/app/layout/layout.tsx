export const Layout: React.FC<any> = ({ children }) => {
  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b border-black">
        <div className="mx-auto max-w-5xl px-3 py-3 flex items-center justify-between">
          <a href="/" className="font-bold underline-offset-2">
            Play Report
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/runs" className="underline hover:no-underline">
              Runs
            </a>
            <a href="/leaderboard" className="underline hover:no-underline">
              Leaderboard
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-3 py-6">{children}</main>
    </div>
  );
};


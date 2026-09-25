/* Dashboard & Layered SaaS Product Preview for /updates.
   Matches the reference SaaS mockup:
   - Dashboard container with dark left sidebar & light content
   - Drops nav item highlighted in neon lime
   - Top drop hero: DCL / 001 with 3D black box prototype
   - 4 SaaS metric cards below
   - Floating dark card: UPCOMING DCL / 002
   - Floating white card: BE THE FIRST TO KNOW with avatars
*/

export default function HeroVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative select-none w-full max-w-[620px] lg:max-w-none mx-auto"
    >
      {/* Background neon lime technical framing line */}
      <svg
        className="pointer-events-none absolute -inset-6 h-[calc(100%+48px)] w-[calc(100%+48px)] text-[#a3e635] opacity-80"
        viewBox="0 0 700 620"
        fill="none"
      >
        <path
          d="M 200 40 L 590 40 L 670 120 L 670 240 M 270 330 L 250 350 L 250 410 L 270 430"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-60"
        />
        <path d="M 660 38 L 672 38 L 672 50" stroke="currentColor" strokeWidth="1.5" />
      </svg>

      {/* Background dot matrix clusters */}
      <div className="pointer-events-none absolute -left-6 top-8 hidden sm:grid grid-cols-4 gap-2 opacity-35">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        ))}
      </div>
      <div className="pointer-events-none absolute -right-6 bottom-16 hidden sm:grid grid-cols-4 gap-2 opacity-35">
        {Array.from({ length: 20 }).map((_, i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        ))}
      </div>

      <DashboardContainer />
      <UpcomingCard />
      <SubscriberCard />
    </div>
  );
}

function DashboardContainer() {
  return (
    <div className="relative rounded-[28px] border border-zinc-200/90 bg-[#f8f9fa] p-2.5 sm:p-3.5 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col md:flex-row overflow-hidden rounded-[22px] border border-zinc-200/70 bg-white">
        <Sidebar />
        <DashboardContent />
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="w-full md:w-[170px] shrink-0 bg-[#0d0d11] p-4 sm:p-5 text-white flex flex-col justify-between">
      <div>
        <div className="mb-6">
          <div className="text-[14px] font-black leading-[0.85] tracking-tight text-white">
            DYE CUT
            <br />
            <span className="text-[13px] tracking-wider text-zinc-300">LAB</span>
          </div>
        </div>

        <nav className="space-y-1 text-[11px] font-medium tracking-wide">
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-zinc-400">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Overview</span>
          </div>

          {/* Highlighted DROPS */}
          <div className="flex items-center justify-between rounded-lg bg-zinc-900/90 border border-zinc-800/80 px-2.5 py-1.5 text-[#a3e635]">
            <div className="flex items-center gap-2.5">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              <span className="font-semibold text-white">Drops</span>
            </div>
            <span className="text-[10px] text-zinc-500">›</span>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-zinc-400">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Features</span>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-zinc-400">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7V4h16v3M9 20h6M12 4v16" />
            </svg>
            <span>Packaging</span>
          </div>

          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-zinc-400">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Subscribers</span>
          </div>
        </nav>
      </div>

      <div className="mt-8 pt-4 border-t border-zinc-800/80 text-[10px] text-zinc-500 flex items-center justify-between">
        <span>SYSTEM</span>
        <span className="flex items-center gap-1.5 text-zinc-400 font-mono text-[9px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#a3e635]" /> v2.4
        </span>
      </div>
    </aside>
  );
}

function DashboardContent() {
  return (
    <div className="flex-1 p-4 sm:p-6 bg-[#fcfcfd] flex flex-col justify-between">
      {/* Top Bar */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
          RELEASE CONSOLE
        </span>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-zinc-200" />
          <span className="h-2 w-2 rounded-full bg-zinc-200" />
          <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#a3e635] ring-2 ring-white" />
          </div>
        </div>
      </div>

      <LatestDropBox />
      <MetricsRow />
    </div>
  );
}

function LatestDropBox() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
        <div className="sm:col-span-6 z-10">
          <span className="text-[9px] font-mono font-medium tracking-[0.2em] text-zinc-400 uppercase">
            LATEST DROP
          </span>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-zinc-950">
            DCL / 001
          </h3>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#a3e635]" />
            <span className="text-[11px] font-medium text-zinc-600">Early Access</span>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
            Limited release packaging system. Designed, tested, and shipped from the lab.
          </p>
          <div className="mt-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-3.5 py-1.5 text-[11px] font-semibold text-white shadow-xs">
              View Drop
              <span className="text-[#a3e635]">→</span>
            </span>
          </div>
        </div>

        {/* 3D Package Vector Mockup (DCL / 001) */}
        <div className="sm:col-span-6 relative flex items-center justify-center py-2">
          <div className="relative h-44 w-full flex items-center justify-center">
            <Dcl001Box />
            <span className="absolute bottom-2 right-2 rounded bg-zinc-100/90 border border-zinc-200/80 px-1.5 py-0.5 text-[8px] font-mono tracking-wider text-zinc-500 uppercase">
              LIMITED
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dcl001Box() {
  return (
    <svg
      viewBox="0 0 280 260"
      className="h-full w-auto drop-shadow-[0_20px_28px_rgba(0,0,0,0.18)]"
      fill="none"
    >
      <defs>
        <linearGradient id="boxFront" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#222227" />
          <stop offset="100%" stopColor="#0c0c0e" />
        </linearGradient>
        <linearGradient id="boxTop" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#2f2f36" />
          <stop offset="100%" stopColor="#43434c" />
        </linearGradient>
        <linearGradient id="boxSide" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#141416" />
          <stop offset="100%" stopColor="#080809" />
        </linearGradient>
        <radialGradient id="boxGround" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="145" cy="235" rx="100" ry="16" fill="url(#boxGround)" />
      <polygon points="120,38 215,62 145,92 50,68" fill="url(#boxTop)" stroke="#4a4a55" strokeWidth="0.8" />
      <polygon points="50,68 145,92 145,215 50,191" fill="url(#boxFront)" stroke="#2b2b32" strokeWidth="0.8" />
      <polygon points="145,92 215,62 215,185 145,215" fill="url(#boxSide)" stroke="#1d1d22" strokeWidth="0.8" />

      <g transform="matrix(0.9 0.22 0 1 54 84)">
        <path d="M 6 12 L 6 4 L 14 4" stroke="#a3e635" strokeWidth="1" strokeOpacity="0.8" fill="none" />
        <text x="8" y="32" fill="#a3e635" fontSize="22" fontWeight="800" fontFamily="sans-serif" letterSpacing="-0.5">
          DCL
        </text>
        <text x="8" y="54" fill="#a3e635" fontSize="22" fontWeight="800" fontFamily="sans-serif" letterSpacing="-0.5">
          /001
        </text>
        <path d="M 64 26 L 72 36 L 64 46" stroke="#a3e635" strokeWidth="1.8" fill="none" />
        <text x="8" y="88" fill="#71717a" fontSize="7" fontWeight="600" letterSpacing="1.5" fontFamily="monospace">
          DYE CUT LAB
        </text>
      </g>

      <g transform="matrix(0.8 -0.26 0 1 155 132)">
        <rect x="0" y="0" width="46" height="3" fill="#a3e635" fillOpacity="0.4" />
        <text x="0" y="16" fill="#52525b" fontSize="6" fontFamily="monospace" letterSpacing="1">
          SPEC. 01A
        </text>
      </g>
    </svg>
  );
}

function MetricsRow() {
  return (
    <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <div className="rounded-xl border border-zinc-200/70 bg-white p-3 shadow-2xs">
        <span className="text-[10px] font-medium text-zinc-500">Subscribers</span>
        <div className="mt-1 text-[17px] font-bold tracking-tight text-zinc-950">24,821</div>
        <span className="text-[10px] font-semibold text-[#65a30d]">+18.2%</span>
      </div>

      <div className="rounded-xl border border-zinc-200/70 bg-white p-3 shadow-2xs">
        <span className="text-[10px] font-medium text-zinc-500">Open Rate</span>
        <div className="mt-1 text-[17px] font-bold tracking-tight text-zinc-950">82%</div>
        <span className="text-[10px] font-semibold text-[#65a30d]">+9.1%</span>
      </div>

      <div className="rounded-xl border border-zinc-200/70 bg-white p-3 shadow-2xs">
        <span className="text-[10px] font-medium text-zinc-500">Updates Sent</span>
        <div className="mt-1 text-[17px] font-bold tracking-tight text-zinc-950">36</div>
        <span className="text-[10px] font-semibold text-[#65a30d]">+4</span>
      </div>

      <div className="rounded-xl border border-zinc-200/70 bg-white p-3 shadow-2xs">
        <span className="text-[10px] font-medium text-zinc-500">Drops Released</span>
        <div className="mt-1 text-[17px] font-bold tracking-tight text-zinc-950">07</div>
        <span className="text-[10px] font-semibold text-[#65a30d]">+2</span>
      </div>
    </div>
  );
}

function UpcomingCard() {
  return (
    <div className="dcl-float absolute -bottom-6 -left-3 sm:-bottom-8 sm:-left-6 w-[240px] sm:w-[270px] rounded-2xl bg-[#0f0f13] p-4 text-white shadow-[0_20px_35px_-8px_rgba(0,0,0,0.35)] border border-zinc-800 z-20">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-zinc-800/90 border border-zinc-700/60 px-2 py-0.5 text-[8px] font-mono tracking-widest text-[#a3e635] uppercase">
          UPCOMING
        </span>
        <span className="text-[9px] font-mono text-zinc-400">05.26</span>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-base font-bold tracking-tight text-white">DCL / 002</h4>
          <p className="text-[11px] text-zinc-400">Packaging System</p>
          <p className="mt-1 text-[9px] font-mono text-zinc-500">Drops on May 24, 2026</p>
          <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#a3e635]">
            <span>Get Notified</span>
            <span>→</span>
          </div>
        </div>

        <div className="relative h-18 w-18 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full" fill="none">
            <polygon points="50,15 85,32 50,49 15,32" fill="#a3e635" stroke="#84cc16" strokeWidth="0.8" />
            <polygon points="15,32 50,49 50,85 15,68" fill="#18181b" stroke="#27272a" strokeWidth="0.8" />
            <polygon points="50,49 85,32 85,68 50,85" fill="#84cc16" stroke="#65a30d" strokeWidth="0.8" />
            <circle cx="50" cy="32" r="4" fill="#18181b" opacity="0.3" />
            <path d="M 24 50 L 36 56" stroke="#a3e635" strokeWidth="1" opacity="0.6" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function SubscriberCard() {
  return (
    <div className="dcl-float-alt absolute -bottom-10 right-2 sm:-bottom-12 sm:-right-4 w-[210px] sm:w-[230px] rounded-2xl bg-white p-3.5 sm:p-4 text-zinc-900 shadow-[0_18px_32px_-8px_rgba(0,0,0,0.12)] border border-zinc-200/90 z-20">
      <span className="text-[9px] font-mono font-bold tracking-[0.18em] text-zinc-500 uppercase">
        BE THE FIRST TO KNOW
      </span>
      <p className="mt-1 text-[11px] leading-snug text-zinc-600">
        Limited drops. Exclusive features. No noise — just what matters.
      </p>

      <div className="mt-3 flex items-center justify-between pt-2 border-t border-zinc-100">
        <div className="flex -space-x-1.5">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[8px] font-bold text-white ring-1.5 ring-white">
            JD
          </span>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-700 text-[8px] font-bold text-white ring-1.5 ring-white">
            AK
          </span>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#a3e635] text-[8px] font-bold text-zinc-900 ring-1.5 ring-white">
            SL
          </span>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[8px] font-bold text-zinc-700 ring-1.5 ring-white">
            +
          </span>
        </div>
        <div className="text-right">
          <span className="block text-[10px] font-bold text-zinc-900 leading-none">+24k</span>
          <span className="text-[8px] text-zinc-400">subscribers</span>
        </div>
      </div>
    </div>
  );
}

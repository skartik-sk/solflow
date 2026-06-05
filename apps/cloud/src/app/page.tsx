import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Cloud,
  Construction,
  Gauge,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "https://solstudio.fun";

const statusItems = [
  {
    icon: <Wrench className="h-4 w-4" />,
    label: "Platform upgrade",
    value: "In progress",
  },
  {
    icon: <ShieldCheck className="h-4 w-4" />,
    label: "User projects",
    value: "Protected",
  },
  {
    icon: <Gauge className="h-4 w-4" />,
    label: "Service status",
    value: "Maintenance",
  },
];

export default function MaintenancePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8fcff] text-[#10202a]">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(16,32,42,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(16,32,42,0.045)_1px,transparent_1px)] bg-[size:42px_42px]" />
        <div className="absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute bottom-[-140px] right-[-120px] h-[420px] w-[520px] rounded-full bg-emerald-200/45 blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-slate-200/80 bg-white/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#9de7ef] text-[#10202a] shadow-sm shadow-cyan-200">
              <Cloud className="h-5 w-5" />
            </span>
            <span className="text-base font-bold">SolStudio Cloud</span>
          </Link>
          <a
            href={WEB_URL}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:text-slate-950"
          >
            Main editor
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-[1.02fr_0.98fr] lg:py-16">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
              <span className="relative h-2 w-2 rounded-full bg-cyan-500" />
            </span>
            Maintenance mode
          </div>

          <h1 className="max-w-3xl text-5xl font-black leading-[0.95] text-slate-950 md:text-7xl">
            Site is under maintenance.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            We are upgrading SolStudio Cloud so the next version is faster,
            cleaner, and more stable. The app will be back online soon.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white shadow-lg shadow-slate-300">
              <Clock3 className="h-4 w-4 text-cyan-200" />
              Back soon
            </div>
            <a
              href={WEB_URL}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition hover:border-cyan-300 hover:text-slate-950"
            >
              Visit SolStudio
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {statusItems.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur"
              >
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                  {item.icon}
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  {item.label}
                </p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -left-4 top-10 hidden h-16 w-16 rotate-[-8deg] items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 shadow-lg md:flex">
            <Construction className="h-8 w-8" />
          </div>
          <div className="absolute -right-4 bottom-20 hidden h-16 w-16 rotate-[7deg] items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-lg md:flex">
            <Sparkles className="h-8 w-8" />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xl shadow-cyan-200/60">
            <Image
              src="/maintenance-social.png"
              alt="We are under maintenance"
              width={1024}
              height={1024}
              priority
              className="aspect-square w-full rounded-lg object-cover"
            />
          </div>

          <div className="mx-auto mt-5 flex max-w-md items-center gap-3 rounded-lg border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm font-semibold text-slate-700">
              Your workflows, wallets, and project data remain safe while the
              maintenance window is active.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

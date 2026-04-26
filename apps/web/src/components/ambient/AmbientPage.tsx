'use client';

import { useEffect, useState, useMemo } from 'react';
import { GraduationCap, BookOpen, CheckSquare, Calendar, Brain, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const PHD_START = new Date('2026-01-05');
const PHD_END   = new Date('2029-07-05');

interface Metrics {
  papers: number;
  atomicNotes: number;
  tasks: { done: number; pending: number };
  meetings: number;
  memory: number;
}

export function AmbientPage() {
  const [metrics, setMetrics] = useState<Metrics>({
    papers: 0, atomicNotes: 0, tasks: { done: 0, pending: 0 }, meetings: 0, memory: 0,
  });
  const [now, setNow] = useState(new Date());
  const [latestInsight, setLatestInsight] = useState<string | null>(null);

  // Tick clock every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Refresh metrics every 60s
  useEffect(() => {
    const load = async () => {
      try {
        const [lit, notes, vtasks, meet, mem] = await Promise.all([
          apiFetch<{ total: number }>('/api/vault/literature').catch(() => ({ total: 0 })),
          apiFetch<{ total: number }>('/api/vault/atomic-notes').catch(() => ({ total: 0 })),
          apiFetch<{ tasks: Array<{ done: boolean }> }>('/api/vault/tasks?subPath=01%20PhD').catch(() => ({ tasks: [] })),
          apiFetch<Array<unknown>>('/api/meetings/sessions').catch(() => []),
          apiFetch<Array<{ content: string; category: string; date: string }>>('/api/companion/memory').catch(() => []),
        ]);
        setMetrics({
          papers: lit.total,
          atomicNotes: notes.total,
          tasks: {
            done: vtasks.tasks.filter((t) => t.done).length,
            pending: vtasks.tasks.filter((t) => !t.done).length,
          },
          meetings: (meet as Array<unknown>).length,
          memory: mem.length,
        });
        const sorted = [...mem].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
        setLatestInsight(sorted[0]?.content ?? null);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  // PhD progress
  const { pct, daysIn, daysLeft } = useMemo(() => {
    const total = PHD_END.getTime() - PHD_START.getTime();
    const elapsed = now.getTime() - PHD_START.getTime();
    const p = Math.max(0, Math.min(100, (elapsed / total) * 100));
    return {
      pct: p,
      daysIn: Math.floor(elapsed / 86400000),
      daysLeft: Math.ceil((PHD_END.getTime() - now.getTime()) / 86400000),
    };
  }, [now]);

  const timeStr = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black text-white" dir="rtl">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: 'radial-gradient(circle at 20% 30%, #4a9eff, transparent 40%), radial-gradient(circle at 80% 70%, #a78bfa, transparent 40%), radial-gradient(circle at 50% 50%, #34d399, transparent 50%)',
          filter: 'blur(60px)',
          animation: 'ambientDrift 20s ease-in-out infinite alternate',
        }}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 40 }).map((_, i) => {
          const size = 2 + Math.random() * 4;
          const duration = 15 + Math.random() * 20;
          const delay = Math.random() * 10;
          return (
            <span
              key={i}
              className="absolute rounded-full bg-white/30"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: size,
                height: size,
                animation: `ambientFloat ${duration}s linear ${delay}s infinite`,
              }}
            />
          );
        })}
      </div>

      {/* Content */}
      <div className="relative z-10 w-full h-full flex flex-col p-[3vw]">
        {/* Top bar: clock + date */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[8vw] font-black leading-none tracking-tight drop-shadow-2xl">{timeStr}</div>
            <div className="text-[1.5vw] text-white/70 mt-2">{dateStr}</div>
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2 justify-end mb-1">
              <GraduationCap className="h-[2vw] w-[2vw] text-emerald-400" />
              <span className="text-[1.2vw] uppercase tracking-widest text-white/60">PhD Journey</span>
            </div>
            <div className="text-[3vw] font-bold">{Math.round(pct)}<span className="text-white/50">%</span></div>
            <div className="text-[1vw] text-white/60">{daysIn}d in · {daysLeft}d left</div>
          </div>
        </div>

        {/* PhD progress bar — full width, animated */}
        <div className="mt-[2vw] h-[1.2vw] rounded-full bg-white/10 overflow-hidden border border-white/20">
          <div
            className="h-full rounded-full transition-all duration-[1500ms]"
            style={{
              width: `${pct}%`,
              background: 'linear-gradient(90deg, #4a9eff 0%, #a78bfa 50%, #34d399 100%)',
              backgroundSize: '200% 100%',
              animation: 'batteryShimmer 6s linear infinite',
              boxShadow: '0 0 30px rgba(74, 158, 255, 0.5)',
            }}
          />
        </div>

        {/* Center metrics grid */}
        <div className="flex-1 grid grid-cols-5 gap-[2vw] items-center my-[3vw]">
          <MetricBig icon={BookOpen} value={metrics.papers} label="أوراق" color="#60a5fa" />
          <MetricBig icon={Brain} value={metrics.atomicNotes} label="ملاحظات ذرية" color="#a78bfa" />
          <MetricBig icon={CheckSquare} value={metrics.tasks.pending} sub={`${metrics.tasks.done} منجزة`} label="مهام معلّقة" color="#fbbf24" />
          <MetricBig icon={Calendar} value={metrics.meetings} label="اجتماعات" color="#f472b6" />
          <MetricBig icon={Sparkles} value={metrics.memory} label="رؤى" color="#34d399" />
        </div>

        {/* Latest insight — ticker */}
        {latestInsight && (
          <div className="mt-auto">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-[1.5vw] w-[1.5vw] text-emerald-400" />
              <span className="text-[1vw] uppercase tracking-widest text-white/50">آخر رؤية</span>
            </div>
            <p className="text-[1.8vw] font-light text-white/90 leading-relaxed max-w-[90vw] line-clamp-3">
              {latestInsight}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-[2vw] text-center text-[0.9vw] text-white/40 tracking-widest">
          رحول · RUHOOL · Abdullah Al Hudaifi · PhD University of Birmingham
        </div>
      </div>

      <style jsx>{`
        @keyframes ambientDrift {
          0%   { transform: translate(0, 0) scale(1); }
          50%  { transform: translate(-5%, 5%) scale(1.1); }
          100% { transform: translate(5%, -5%) scale(0.95); }
        }
        @keyframes ambientFloat {
          0%   { transform: translateY(0) translateX(0); opacity: 0.3; }
          50%  { opacity: 0.8; }
          100% { transform: translateY(-100vh) translateX(50px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function MetricBig({ icon: Icon, value, label, sub, color }: {
  icon: React.ElementType; value: number; label: string; sub?: string; color: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="rounded-2xl p-[1.5vw] mb-[1vw] transition-all"
        style={{
          background: `${color}20`,
          border: `2px solid ${color}40`,
          boxShadow: `0 0 40px ${color}30`,
        }}
      >
        <Icon className="h-[3vw] w-[3vw]" style={{ color }} />
      </div>
      <div className="text-[5vw] font-black leading-none tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[1vw] text-white/70 uppercase tracking-widest mt-[0.5vw]">{label}</div>
      {sub && <div className="text-[0.8vw] text-white/40 mt-1">{sub}</div>}
    </div>
  );
}

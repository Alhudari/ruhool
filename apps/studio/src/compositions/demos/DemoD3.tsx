// Demo: d3 — force-directed research paper graph (isNew: true)
import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force';

const LABELS = ['BIM', 'الكويت', 'IFC', 'استدامة', 'تكلفة', 'جدولة', 'طاقة', 'تعاون', 'بحث', 'تحليل'];
const EDGES: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 7], [1, 4], [2, 5], [3, 6], [3, 5], [7, 8], [8, 9], [9, 0], [4, 5]];

const DemoD3: React.FC = () => {
  const frame = useCurrentFrame();

  const { nodes, links } = useMemo(() => {
    const nodes = LABELS.map((label, id) => ({ id, label, x: 540 + Math.cos(id) * 200, y: 960 + Math.sin(id) * 200 }));
    const links = EDGES.map(([s, t]) => ({ source: s, target: t }));
    const sim = forceSimulation(nodes as any)
      .force('charge', forceManyBody().strength(-1600))
      .force('link', forceLink(links as any).id((d: any) => d.id).distance(220))
      .force('center', forceCenter(540, 960))
      .force('collide', forceCollide(90))
      .stop();
    for (let i = 0; i < 200; i++) sim.tick();
    return { nodes, links };
  }, []);

  const reveal = (i: number) => interpolate(frame, [i * 4, i * 4 + 18], [0, 1], { extrapolateRight: 'clamp' });
  const wobble = (i: number) => Math.sin(frame / 14 + i) * 6;

  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #fdfbf7 0%, #f2ede3 100%)', fontFamily: 'IBM Plex Sans Arabic, Arial, sans-serif' }}>
      <svg width="100%" height="100%" viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#e8dfc9" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width="1080" height="1920" fill="url(#grid)" opacity={0.7} />
        {links.map((l: any, i) => {
          const s = nodes[l.source.id ?? l.source];
          const t = nodes[l.target.id ?? l.target];
          const op = reveal(i + 2);
          return <line key={i} x1={s.x + wobble(s.id)} y1={s.y + wobble(s.id + 1)} x2={t.x + wobble(t.id)} y2={t.y + wobble(t.id + 1)} stroke="#c9a87a" strokeWidth="1.4" strokeOpacity={op * 0.6} />;
        })}
        {nodes.map((n: any, i) => {
          const op = reveal(i);
          const r = 46 + Math.sin(frame / 18 + i) * 3;
          const x = n.x + wobble(n.id);
          const y = n.y + wobble(n.id + 1);
          return (
            <g key={i} opacity={op} transform={`translate(${x},${y})`}>
              <circle r={r + 8} fill="#ffaaa5" opacity={0.15} />
              <circle r={r} fill="#fff" stroke="#ffaaa5" strokeWidth={2.5} />
              <text textAnchor="middle" dy={8} fontSize={22} fontWeight={700} fill="#2d3748" style={{ fontFamily: 'IBM Plex Sans Arabic' }}>{n.label}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', top: 160, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 22, color: '#b8986a', letterSpacing: 8, fontWeight: 300, marginBottom: 10 }}>D3 · FORCE GRAPH</div>
        <div style={{ fontSize: 54, color: '#2d3748', fontWeight: 700 }}>شبكة البيانات المترابطة</div>
      </div>
    </AbsoluteFill>
  );
};

export default DemoD3;

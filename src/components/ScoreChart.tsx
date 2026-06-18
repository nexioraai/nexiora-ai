'use client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Point = { score: number; date: string; reason: string };

export default function ScoreChart({ data, color }: { data: Point[]; color: string }) {
  return (
    <div style={{ width: '100%', height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`scoreGrad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            content={({ active, payload, label }: any) => {
              if (!active || !payload || !payload.length) return null;
              const p = payload[0].payload;
              return (
                <div style={{ background: '#1a0e22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '8px 12px', fontSize: 12, color: '#fff', maxWidth: 220 }}>
                  <div style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</div>
                  <div style={{ fontWeight: 700, color }}>{p.score}/100</div>
                  {p.reason && <div style={{ color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{p.reason}</div>}
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="score" stroke={color} strokeWidth={2.5} fill={`url(#scoreGrad-${color.replace('#', '')})`} dot={{ fill: color, r: 4 }} activeDot={{ r: 6 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

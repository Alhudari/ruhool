'use client';

import { useState, useRef, useCallback } from 'react';
import { Monitor, MonitorOff, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiStream } from '@/lib/api';

export function ScreenShareButton({ isRTL, onAnalysis }: { isRTL: boolean; onAnalysis?: (text: string) => void }) {
  const [sharing, setSharing] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) {
        const v = document.createElement('video');
        v.autoplay = true; v.muted = true; v.style.display = 'none';
        document.body.appendChild(v);
        videoRef.current = v;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      stream.getVideoTracks()[0].onended = () => stop();
      setSharing(true);
    } catch (err) {
      console.warn('[screen-share] denied', err);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setSharing(false);
  }, []);

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');

    setStreaming(true);
    let collected = '';
    apiStream(
      '/api/chat',
      {
        message: isRTL ? 'ما الذي تراه على شاشتي الآن؟ اشرح وانصحني إن لزم.' : 'What do you see on my screen? Explain and advise.',
        agentId: 'fatin',
        images: [{ base64, mimeType: 'image/jpeg' }],
      },
      (event, data: unknown) => {
        const d = data as Record<string, unknown>;
        if (event === 'text') collected += (d.content as string) || '';
      },
      () => {
        if (onAnalysis) onAnalysis(collected);
        setStreaming(false);
      },
      () => setStreaming(false)
    );
  }, [isRTL, onAnalysis]);

  if (!sharing) {
    return (
      <button
        onClick={start}
        className="p-2 rounded-[var(--radius)] text-on-surface-tertiary hover:text-accent hover:bg-accent/10 transition-colors flex items-center justify-center"
        title={isRTL ? 'شارك الشاشة مع الفطين' : 'Share screen with Al-Fatin'}
      >
        <Monitor size={18} />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 px-2 py-1 rounded bg-accent/10">
      <span className="text-[10px] text-accent font-semibold">{isRTL ? '🔴 يعرض' : '🔴 Sharing'}</span>
      <button onClick={captureAndAnalyze} disabled={streaming} className="p-1 rounded hover:bg-accent/20 text-accent disabled:opacity-40" title={isRTL ? 'اسأل الفطين عن الشاشة' : 'Ask Al-Fatin'}>
        <Send size={12} />
      </button>
      <button onClick={stop} className="p-1 rounded hover:bg-red-500/20 text-red-500" title={isRTL ? 'إيقاف' : 'Stop'}>
        <MonitorOff size={12} />
      </button>
    </div>
  );
}

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Keyboard, Square } from 'lucide-react';
import { VoiceOrb, type OrbState } from './voice-orb';
import { useAppStore } from '@/store/app';
import { apiStream } from '@/lib/api';
import '@/styles/voice.css';

interface VoiceModeProps {
  conversationId: string | null;
  agentId?: string;
  selectedModel: string;
  onClose: () => void;
  onMessage: (userText: string, assistantText: string) => void;
  onConversationCreated?: (id: string) => void;
}

export function VoiceMode({
  conversationId,
  agentId,
  selectedModel,
  onClose,
  onMessage,
  onConversationCreated,
}: VoiceModeProps) {
  const { language } = useAppStore();
  const isRTL = language === 'ar';

  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [responseText, setResponseText] = useState('');
  const [responseWords, setResponseWords] = useState<string[]>([]);
  const [isClosing, setIsClosing] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const levelRafRef = useRef<number>(0);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const cancelStreamRef = useRef<(() => void) | null>(null);
  const convIdRef = useRef(conversationId);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasResultsRef = useRef(false);

  // Keep convId ref in sync
  useEffect(() => {
    convIdRef.current = conversationId;
  }, [conversationId]);

  // --- Audio Level Monitoring ---
  const startAudioMonitoring = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        // RMS of frequency data
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length) / 255;
        // Apply easing curve for more natural feel
        const level = Math.pow(rms, 0.7);
        setAudioLevel(Math.min(level * 2.5, 1));
        levelRafRef.current = requestAnimationFrame(updateLevel);
      };
      levelRafRef.current = requestAnimationFrame(updateLevel);

      return stream;
    } catch {
      return null;
    }
  }, []);

  const stopAudioMonitoring = useCallback(() => {
    if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // --- Speech Recognition ---
  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>).SpeechRecognition ||
          (window as unknown as Record<string, unknown>).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionAPI) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognitionAPI as any)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language === 'ar' ? 'ar-KW' : 'en-US';
    hasResultsRef.current = false;

    let finalTranscript = '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      hasResultsRef.current = true;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t + ' ';
        } else {
          interim += t;
        }
      }
      setTranscript(finalTranscript.trim());
      setInterimText(interim);

      // Reset silence timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        // User stopped speaking — process what we have
        const full = (finalTranscript + interim).trim();
        if (full) {
          recognition.stop();
        }
      }, 2000);
    };

    recognition.onerror = () => {};

    recognition.onend = () => {
      const full = (finalTranscript + '').trim();
      if (full) {
        processUserInput(full);
      } else {
        // No results — return to idle
        setOrbState('idle');
        setAudioLevel(0);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setOrbState('listening');

    // Language auto-detection: if no results after 2.5s, try other language
    if (langSwitchTimerRef.current) clearTimeout(langSwitchTimerRef.current);
    langSwitchTimerRef.current = setTimeout(() => {
      if (!hasResultsRef.current && recognitionRef.current) {
        const altLang = language === 'ar' ? 'en-US' : 'ar-KW';
        recognitionRef.current.lang = altLang;
        try {
          recognitionRef.current.stop();
          setTimeout(() => {
            if (recognitionRef.current) {
              try { recognitionRef.current.start(); } catch {}
            }
          }, 100);
        } catch {}
      }
    }, 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // --- Process user input -> send to API ---
  const processUserInput = useCallback(
    (text: string) => {
      setOrbState('processing');
      setInterimText('');
      setResponseText('');
      setResponseWords([]);
      stopAudioMonitoring();

      let collected = '';
      let currentConvId = convIdRef.current;

      const cancel = apiStream(
        '/api/chat',
        {
          conversationId: currentConvId,
          message: text,
          model: selectedModel,
          ...(agentId ? { agentId } : {}),
        },
        (event, data: unknown) => {
          const d = data as Record<string, unknown>;
          if (event === 'conversation') {
            currentConvId = d.conversationId as string;
            convIdRef.current = currentConvId;
            onConversationCreated?.(currentConvId);
          } else if (event === 'text') {
            if (orbState !== 'speaking') {
              setOrbState('speaking');
            }
            const chunk = d.content as string;
            collected += chunk;
            setResponseText(collected);
            // Split into words for animation
            setResponseWords(collected.split(/(\s+)/).filter(Boolean));
          }
        },
        () => {
          // Done streaming — speak the response
          onMessage(text, collected);
          speakResponse(collected);
        },
        (error) => {
          setResponseText(`Error: ${error}`);
          setOrbState('idle');
        }
      );

      cancelStreamRef.current = cancel;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedModel, agentId, onMessage, onConversationCreated, stopAudioMonitoring]
  );

  // --- Text-to-Speech ---
  const speakResponse = useCallback(
    (text: string) => {
      if (typeof window === 'undefined') return;
      const synth = window.speechSynthesis;
      synthRef.current = synth;

      // Strip markdown
      const cleaned = text
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`[^`]*`/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[-*]\s/g, '')
        .trim();

      if (!cleaned) {
        setOrbState('idle');
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utteranceRef.current = utterance;

      // Select voice
      const voices = synth.getVoices();
      const isArabic = /[\u0600-\u06FF]/.test(cleaned);
      if (isArabic) {
        const arVoice = voices.find(
          (v) => v.lang.startsWith('ar-SA') || v.lang.startsWith('ar-KW') || v.lang.startsWith('ar')
        );
        if (arVoice) utterance.voice = arVoice;
        utterance.lang = 'ar-SA';
      } else {
        const enVoice = voices.find(
          (v) => v.lang === 'en-US' && v.name.toLowerCase().includes('natural')
        ) || voices.find((v) => v.lang === 'en-US');
        if (enVoice) utterance.voice = enVoice;
        utterance.lang = 'en-US';
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      setOrbState('speaking');

      utterance.onend = () => {
        setOrbState('idle');
        setResponseText('');
        setResponseWords([]);
        setTranscript('');
        // Auto-listen again after speaking
        setTimeout(() => {
          startAudioMonitoring();
          startListening();
        }, 500);
      };

      synth.speak(utterance);
    },
    [startAudioMonitoring, startListening]
  );

  // --- Barge-in: user speaks while AI is talking ---
  const handleBargeIn = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    if (cancelStreamRef.current) {
      cancelStreamRef.current();
    }
    setResponseText('');
    setResponseWords([]);
    setTranscript('');
    setInterimText('');
    setOrbState('idle');
    // Start listening again
    setTimeout(() => {
      startAudioMonitoring();
      startListening();
    }, 200);
  }, [startAudioMonitoring, startListening]);

  // --- Tap to speak ---
  const handleOrbTap = useCallback(() => {
    if (orbState === 'speaking') {
      handleBargeIn();
      return;
    }
    if (orbState === 'idle') {
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(30);
      startAudioMonitoring();
      startListening();
    }
  }, [orbState, handleBargeIn, startAudioMonitoring, startListening]);

  // --- Close ---
  const handleClose = useCallback(() => {
    // Clean up everything
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (synthRef.current) synthRef.current.cancel();
    if (cancelStreamRef.current) cancelStreamRef.current();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (langSwitchTimerRef.current) clearTimeout(langSwitchTimerRef.current);
    stopAudioMonitoring();

    setIsClosing(true);
    setTimeout(() => onClose(), 300);
  }, [onClose, stopAudioMonitoring]);

  // --- Switch to keyboard ---
  const handleKeyboard = useCallback(() => {
    handleClose();
  }, [handleClose]);

  // --- Swipe down to dismiss ---
  const touchStartY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const deltaY = e.changedTouches[0].clientY - touchStartY.current;
      if (deltaY > 100) {
        handleClose();
      }
    },
    [handleClose]
  );

  // --- Auto-start listening on mount ---
  useEffect(() => {
    // Load voices first (some browsers need this)
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
    // Small delay for overlay animation
    const timer = setTimeout(() => {
      startAudioMonitoring();
      startListening();
    }, 500);
    return () => {
      clearTimeout(timer);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if (synthRef.current) synthRef.current.cancel();
      if (cancelStreamRef.current) cancelStreamRef.current();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (langSwitchTimerRef.current) clearTimeout(langSwitchTimerRef.current);
      stopAudioMonitoring();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText = (() => {
    switch (orbState) {
      case 'idle':
        return isRTL ? 'اضغط للتحدث' : 'Tap to speak';
      case 'listening':
        return isRTL ? 'يستمع...' : 'Listening...';
      case 'processing':
        return isRTL ? 'يفكر...' : 'Thinking...';
      case 'speaking':
        return isRTL ? 'يتحدث...' : 'Speaking...';
    }
  })();

  return (
    <div
      className={`voice-overlay ${isClosing ? 'voice-closing' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close button */}
      <button className="voice-btn-close" onClick={handleClose} aria-label="Close voice mode">
        <X size={20} />
      </button>

      {/* Orb */}
      <button
        onClick={handleOrbTap}
        className="focus:outline-none"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        aria-label={statusText}
      >
        <VoiceOrb state={orbState} audioLevel={audioLevel} />
      </button>

      {/* Status */}
      <div className="voice-status">{statusText}</div>

      {/* Transcript / Response */}
      <div className="voice-transcript" dir={isRTL ? 'rtl' : 'ltr'}>
        {orbState === 'listening' && (
          <>
            {transcript && <span className="voice-transcript-text">{transcript}</span>}
            {interimText && <span className="voice-transcript-interim"> {interimText}</span>}
          </>
        )}
        {orbState === 'processing' && transcript && (
          <span className="voice-transcript-text" style={{ opacity: 0.6 }}>{transcript}</span>
        )}
        {(orbState === 'speaking' || responseWords.length > 0) && (
          <span
            className="voice-transcript-text"
            dir={/[\u0600-\u06FF]/.test(responseText) ? 'rtl' : 'ltr'}
          >
            {responseWords.map((word, i) => (
              <span
                key={i}
                className="voice-word"
                style={{ animationDelay: `${i * 0.03}s` }}
              >
                {word}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="voice-controls">
        <button
          className="voice-btn-keyboard"
          onClick={handleKeyboard}
          aria-label={isRTL ? 'لوحة المفاتيح' : 'Switch to keyboard'}
        >
          <Keyboard size={20} />
        </button>
        <button
          className="voice-btn-stop"
          onClick={handleClose}
          aria-label={isRTL ? 'إيقاف' : 'Stop'}
        >
          <Square size={24} fill="white" color="white" />
        </button>
      </div>
    </div>
  );
}

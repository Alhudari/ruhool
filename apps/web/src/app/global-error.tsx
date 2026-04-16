'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" dir="ltr">
      <body style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', background: '#0a0a0a', color: '#fafaf7', padding: '2rem' }}>
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.75rem' }}>Application Error</h1>
          <p lang="ar" dir="rtl" style={{ opacity: 0.75, marginBottom: '1rem' }}>
            خطأ في التطبيق
          </p>
          {error.message && (
            <pre style={{ fontSize: '0.75rem', opacity: 0.7, background: '#1a1a1a', padding: '0.75rem', borderRadius: '0.25rem', overflow: 'auto', textAlign: 'left' }}>
              {error.message}
            </pre>
          )}
          <button
            onClick={reset}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '0.25rem', background: '#7c5aed', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Try again / إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}

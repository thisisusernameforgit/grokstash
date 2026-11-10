import React from 'react';

export default function Logo() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 24
    }}>
      <svg width="36" height="36" viewBox="0 0 24 24">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#BB86FC" />
            <stop offset="100%" stopColor="#03DAC6" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="20" height="20" rx="4" fill="url(#grad)" />
        <path d="M7 13h10M7 9h10" stroke="#121212"
          strokeWidth="2" strokeLinecap="round" />
      </svg>

      <span style={{
        fontSize: 28,
        fontWeight: 500,
        color: 'var(--md-on-surface)'
      }}>
        Grokstash
      </span>
    </div>
  );
}

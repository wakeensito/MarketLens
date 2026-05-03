import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BrandWordmarkInner } from './BrandWordmark';

interface Props {
  query: string;
  onReset: () => void;
}

export default function Header({ query, onReset }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <motion.header
      className={`header${scrolled ? ' header--scrolled' : ''}`}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' as const }}
    >
      <button type="button" className="header-logo" onClick={onReset}>
        <BrandWordmarkInner variant="header" />
      </button>

      {query && (
        <div className="header-query-label">"{query}"</div>
      )}

      <div className="header-spacer" />

      <span className="nav-badge">Beta</span>

      <button className="header-btn-ghost" onClick={onReset}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M9 11.5L4.5 7L9 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        New analysis
      </button>
    </motion.header>
  );
}

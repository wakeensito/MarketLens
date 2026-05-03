import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Search, ArrowRight } from 'lucide-react';
import { EXAMPLE_QUERIES } from '../mockData';
import { BrandWordmarkInner } from './BrandWordmark';

interface Props {
  onSearch: (query: string) => void;
}

const PLACEHOLDERS = [
  'e.g. AI-powered fitness coaching app for Gen Z…',
  'e.g. D2C supplements brand for endurance athletes…',
  'e.g. SaaS platform for independent dental practices…',
  'e.g. Micro-mobility startup for suburban commuters…',
  'e.g. B2B marketplace for sustainable packaging…',
  'e.g. Mental health platform for enterprise employees…',
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' as const } },
};

export default function SearchHero({ onSearch }: Props) {
  const [value, setValue] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (value.trim()) onSearch(value.trim());
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  const fillChip = (q: string) => {
    setValue(q);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (value) return;
    const id = setInterval(() => {
      setPhIdx(i => (i + 1) % PLACEHOLDERS.length);
    }, 3200);
    return () => clearInterval(id);
  }, [value]);

  return (
    <motion.div
      className="hero"
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <motion.div className="hero-eyebrow" variants={item}>
        Market Intelligence Engine
      </motion.div>

      <motion.div className="hero-brand" variants={item}>
        <BrandWordmarkInner variant="hero" />
      </motion.div>

      <motion.p className="hero-tagline" variants={item}>
        Type a business idea. Get the full competitive landscape,
        saturation score, and entry roadmap.
      </motion.p>

      <motion.div className="hero-card" variants={item}>
        <div className="hero-search-box">
          <span className="hero-search-icon">
            <Search size={18} strokeWidth={1.8} />
          </span>
          <div className="hero-search-input-wrap">
            <input
              ref={inputRef}
              className="hero-search-input"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKey}
              autoFocus
            />
            {!value && (
              <AnimatePresence mode="wait">
                <motion.span
                  key={phIdx}
                  className="hero-placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' as const }}
                >
                  {PLACEHOLDERS[phIdx]}
                </motion.span>
              </AnimatePresence>
            )}
          </div>
          <button
            className="hero-search-submit"
            onClick={submit}
            disabled={!value.trim()}
          >
            Analyse
            <ArrowRight size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="hero-card-divider" />

        <div className="hero-examples">
          <span className="hero-examples-label">Try</span>
          {EXAMPLE_QUERIES.map(q => (
            <button key={q} className="hero-chip" onClick={() => fillChip(q)}>
              {q}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

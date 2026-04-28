import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { motion, type Variants } from 'framer-motion';
import { EXAMPLE_QUERIES } from '../mockData';

interface Props {
  onSearch: (query: string) => void;
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

export default function LandingScreen({ onSearch }: Props) {
  const [value, setValue] = useState('');
  const [phIdx, setPhIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = value.trim().length > 4;

  useEffect(() => {
    const id = setInterval(() => setPhIdx(i => (i + 1) % EXAMPLE_QUERIES.length), 3200);
    return () => clearInterval(id);
  }, []);

  const submit = () => { if (valid) onSearch(value.trim()); };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submit();
  };

  const handleExample = (ex: string) => {
    setValue(ex);
    inputRef.current?.focus();
  };

  return (
    <motion.div
      className="landing"
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -12, transition: { duration: 0.22 } }}
    >
      <motion.div className="landing-eyebrow" variants={item}>
        MarketLens Intelligence Engine
      </motion.div>

      <motion.h1 className="landing-wordmark" variants={item}>
        <span className="landing-wordmark-primary">Market</span>
        <span className="landing-wordmark-accent">Lens</span>
      </motion.h1>

      <motion.p className="landing-sub" variants={item}>
        Drop in a business idea. Get a competitive landscape,
        saturation score, and entry roadmap — in minutes.
      </motion.p>

      <motion.div className="command-field" variants={item}>
        <div className="command-row">
          <span className="command-prompt">›</span>
          <input
            ref={inputRef}
            className="command-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKey}
            placeholder={EXAMPLE_QUERIES[phIdx]}
            autoFocus
          />
          <div className="command-divider" />
          <button className="command-submit" onClick={submit} disabled={!valid}>
            Analyze
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 6.5h9M8 3l3.5 3.5L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </motion.div>

      <motion.div className="landing-examples" variants={item}>
        <span className="landing-examples-label">Try:</span>
        {EXAMPLE_QUERIES.map(ex => (
          <button key={ex} className="landing-pill" onClick={() => handleExample(ex)}>
            {ex}
          </button>
        ))}
      </motion.div>
    </motion.div>
  );
}

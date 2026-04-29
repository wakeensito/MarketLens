import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { motion, useMotionValue, useTransform, useSpring, type Variants } from 'framer-motion';
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
  const landingRef = useRef<HTMLDivElement>(null);
  const valid = value.trim().length > 4;

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(mouseY, [0, 1], [8, -8]), { stiffness: 80, damping: 18 });
  const rotateY = useSpring(useTransform(mouseX, [0, 1], [-8, 8]), { stiffness: 80, damping: 18 });
  const glowX   = useSpring(useTransform(mouseX, [0, 1], [-30, 30]), { stiffness: 60, damping: 20 });
  const glowY   = useSpring(useTransform(mouseY, [0, 1], [-30, 30]), { stiffness: 60, damping: 20 });

  useEffect(() => {
    const id = setInterval(() => setPhIdx(i => (i + 1) % EXAMPLE_QUERIES.length), 3200);
    return () => clearInterval(id);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = landingRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  }, [mouseX, mouseY]);

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
      ref={landingRef}
      className="landing"
      variants={container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -12, transition: { duration: 0.22 } }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Animated background orbs */}
      <div className="landing-orb landing-orb-1" />
      <div className="landing-orb landing-orb-2" />
      <div className="landing-orb landing-orb-3" />

      {/* Subtle cursor-following glow */}
      <motion.div
        className="landing-cursor-glow"
        style={{ x: glowX, y: glowY }}
      />

      <motion.div className="landing-eyebrow" variants={item}>
        MarketLens Intelligence Engine
      </motion.div>

      {/* 3D tilting wordmark */}
      <motion.h1
        className="landing-wordmark"
        variants={item}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
          perspective: 800,
        }}
      >
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

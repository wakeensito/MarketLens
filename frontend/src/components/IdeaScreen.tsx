import { useRef, useEffect, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import WizardNav from './WizardNav';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function IdeaScreen({ value, onChange, onNext, onBack }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const valid = value.trim().length > 8;

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && valid) onNext();
  };

  return (
    <div className="wizard-layout">
      <WizardNav onBack={onBack} backLabel="Cancel" step={1} totalSteps={3} />
      <motion.div
        className="wizard-content"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.38, ease: 'easeOut' as const }}
      >
        <div className="wizard-screen">
          <div className="wizard-progress">
            <div className="wizard-progress-fill" style={{ width: '33%' }} />
          </div>

          <p className="wizard-question">Describe your business idea</p>

          <input
            ref={ref}
            className="ghost-input"
            placeholder="e.g. AI-powered expense tracking for freelancers"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKey}
          />

          <div className="wizard-hint">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M7 6v4M7 4.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Be specific — the more detail, the sharper the analysis
          </div>

          <div className="wizard-actions">
            <button className="wizard-btn-primary" onClick={onNext} disabled={!valid}>
              Next →
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

import { motion } from 'framer-motion';
import WizardNav from './WizardNav';
import { INDUSTRIES } from '../mockData';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function IndustryScreen({ value, onChange, onNext, onBack }: Props) {
  return (
    <div className="wizard-layout">
      <WizardNav onBack={onBack} backLabel="Back" step={2} totalSteps={3} />
      <motion.div
        className="wizard-content"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.38, ease: 'easeOut' as const }}
      >
        <div className="wizard-screen">
          <div className="wizard-progress">
            <div className="wizard-progress-fill" style={{ width: '66%' }} />
          </div>

          <p className="wizard-question">Which industry does it fall under?</p>

          <div className="industry-grid">
            {INDUSTRIES.map(ind => (
              <button
                key={ind}
                className={`industry-chip${value === ind ? ' industry-chip--selected' : ''}`}
                onClick={() => onChange(ind)}
              >
                {ind}
              </button>
            ))}
          </div>

          <div className="wizard-actions">
            <button className="wizard-btn-primary" onClick={onNext} disabled={!value}>
              Next →
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

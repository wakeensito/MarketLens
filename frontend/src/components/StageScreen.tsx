import { motion } from 'framer-motion';
import WizardNav from './WizardNav';
import { STAGES } from '../mockData';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StageScreen({ value, onChange, onNext, onBack }: Props) {
  return (
    <div className="wizard-layout">
      <WizardNav onBack={onBack} backLabel="Back" step={3} totalSteps={3} />
      <motion.div
        className="wizard-content"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.38, ease: 'easeOut' as const }}
      >
        <div className="wizard-screen">
          <div className="wizard-progress">
            <div className="wizard-progress-fill" style={{ width: '100%' }} />
          </div>

          <p className="wizard-question">Where are you in the process?</p>

          <div className="stage-list">
            {STAGES.map(s => (
              <button
                key={s}
                className={`stage-chip${value === s ? ' stage-chip--selected' : ''}`}
                onClick={() => onChange(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="wizard-actions">
            <button
              className="wizard-btn-primary wizard-btn-primary--accent"
              onClick={onNext}
              disabled={!value}
            >
              Analyze the market
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

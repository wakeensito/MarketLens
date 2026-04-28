interface Props {
  onBack: () => void;
  backLabel: string;
  step: number;
  totalSteps: number;
}

export default function WizardNav({ onBack, backLabel, step, totalSteps }: Props) {
  return (
    <nav className="wizard-nav">
      <button className="wizard-nav-back" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 13L5 8L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {backLabel}
      </button>
      <div className="wizard-nav-wordmark">
        <span className="wizard-nav-primary">Market</span>
        <span className="wizard-nav-accent">Lens</span>
      </div>
      <div className="wizard-nav-step">{step} of {totalSteps}</div>
    </nav>
  );
}

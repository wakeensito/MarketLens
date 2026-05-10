import { Link } from 'react-router-dom';
import { BrandWordmarkInner } from '../components/BrandWordmark';
import { ThemePicker } from '../components/ThemePicker';
import { CONTACT_EMAIL } from './legalConstants';
import './legal.css';

export default function TermsPage() {
  return (
    <div className="legal-shell">
      <a href="#main" className="legal-skip-link">Skip to content</a>
      <header className="legal-nav">
        <Link to="/" className="legal-nav-home" aria-label="Back to plinths">
          <BrandWordmarkInner variant="header" />
        </Link>
        <ThemePicker />
      </header>

      <main id="main" tabIndex={-1} className="legal-main">
        <article className="legal-article">
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-subtitle">Coming soon</p>

          <p className="legal-lede">
            We're finalising the terms that govern your use of Plinths. In the meantime,
            our <Link to="/privacy">Privacy Policy</Link> describes how we collect, use,
            and protect your information.
          </p>

          <p>
            Questions in the meantime? Email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </article>
      </main>
    </div>
  );
}

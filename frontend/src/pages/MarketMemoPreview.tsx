import { Link } from 'react-router-dom';
import { BrandWordmarkInner } from '../components/BrandWordmark';
import { ThemePicker } from '../components/ThemePicker';
import MarketMemo from '../components/MarketMemo';
import { MOCK_MEMO } from '../mockData';

/** Isolated prototype route (/memo) — renders the Market Memo on mock data so
 *  the bands-as-hero + citation-grounded treatment can be felt before any
 *  backend wiring. Not linked from the app; dev-only. */
export default function MarketMemoPreview() {
  return (
    <div className="memo-preview-shell">
      <header className="memo-preview-nav">
        <Link to="/" className="memo-preview-home" aria-label="Back to plinths">
          <BrandWordmarkInner variant="header" />
        </Link>
        <div className="memo-preview-nav-right">
          <span className="memo-preview-flag">prototype · mock data</span>
          <ThemePicker />
        </div>
      </header>
      <main className="memo-preview-main">
        <MarketMemo memo={MOCK_MEMO} />
      </main>
    </div>
  );
}

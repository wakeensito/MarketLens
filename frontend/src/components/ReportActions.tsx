import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Loader2, ChevronDown } from 'lucide-react';
import { exportReport } from '../api';
import { useAuthContext } from '../hooks/useAuth';
import ReportFeedback, { type FeedbackRating } from './ReportFeedback';

type ExportFormat = 'md' | 'csv' | 'pdf';

interface Props {
  reportId: string;
  /** Builds the Markdown export for the current surface (memo or classic report). */
  buildMarkdown: (briefId: string, dateStr: string) => string;
  onFeedback?: (rating: FeedbackRating, comment: string | null) => void | Promise<void>;
  /** "Compare plans" path — opens the proactive UpgradeModal then PricingSection. */
  onRequestUpgrade?: () => void;
  /** Direct Pro Monthly checkout — skips comparison for users who already decided. */
  onUpgradeToPro?: () => void;
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Feedback thumbs + brief-id/date stamp + Pro-gated export menu. Shared by the
 *  Market Memo and any report surface so the footer behaves identically. */
export default function ReportActions({ reportId, buildMarkdown, onFeedback, onRequestUpgrade, onUpgradeToPro }: Props) {
  const auth = useAuthContext();
  const planRaw = (auth.user?.plan ?? '').trim().toLowerCase();
  const isPaid  = auth.isAuthenticated && planRaw !== '' && planRaw !== 'free';

  const [briefId] = useState(() => `PLN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`);
  const [dateStr] = useState(() => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const exportWrapRef = useRef<HTMLDivElement>(null);
  const triggerRef    = useRef<HTMLButtonElement>(null);
  const firstItemRef  = useRef<HTMLButtonElement>(null);

  // Close on outside click + Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!exportWrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Focus first row when the menu opens
  useEffect(() => {
    if (menuOpen) {
      const id = requestAnimationFrame(() => firstItemRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [menuOpen]);

  async function exportMarkdown() {
    if (exportingFormat) return;
    setExportingFormat('md');
    setExportError(null);
    try {
      const md = buildMarkdown(briefId, dateStr);
      downloadBlob(md, `${briefId}.md`, 'text/markdown;charset=utf-8');
      setMenuOpen(false);
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      setExportingFormat(null);
    }
  }

  async function exportCsv() {
    if (exportingFormat) return;
    setExportingFormat('csv');
    setExportError(null);
    try {
      const { download_url } = await exportReport(reportId);
      window.open(download_url, '_blank', 'noopener,noreferrer');
      setMenuOpen(false);
    } catch {
      setExportError('Export failed. Please try again.');
    } finally {
      setExportingFormat(null);
    }
  }

  function exportPdf() {
    if (exportingFormat) return;
    // Browser "Save as PDF" — no backend required.
    setMenuOpen(false);
    window.print();
  }

  function handleLockedShortcut() {
    setMenuOpen(false);
    if (onUpgradeToPro) onUpgradeToPro();
    else onRequestUpgrade?.();
  }

  function handleComparePlans() {
    setMenuOpen(false);
    onRequestUpgrade?.();
  }

  function onFormatSelect(format: ExportFormat) {
    if (format === 'md') return exportMarkdown();
    if (!isPaid) return handleLockedShortcut();
    if (format === 'csv') return exportCsv();
    if (format === 'pdf') return exportPdf();
  }

  return (
    <>
      <ReportFeedback key={reportId} reportId={reportId} onFeedback={onFeedback} />
      <div className="report-footer">
        <span className="report-footer-text">
          {briefId} · {dateStr}
        </span>
        <div className="report-export-group">
          {exportError && <span className="report-export-error">{exportError}</span>}
          <div className="report-export-wrap" ref={exportWrapRef}>
            <button
              ref={triggerRef}
              type="button"
              className="report-export-btn"
              onClick={() => setMenuOpen(o => !o)}
              disabled={exportingFormat !== null}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {exportingFormat
                ? <Loader2 size={12} strokeWidth={2} className="spin" />
                : <Download size={12} strokeWidth={2} />}
              {exportingFormat ? 'Exporting…' : 'Export'}
              <ChevronDown
                size={11}
                strokeWidth={2}
                className={`report-export-chev${menuOpen ? ' is-open' : ''}`}
              />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  aria-label="Export format"
                  className="report-export-menu"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.18, ease: 'easeOut' as const }}
                >
                  <button
                    ref={firstItemRef}
                    type="button"
                    role="menuitem"
                    className="report-export-menu-item"
                    onClick={() => onFormatSelect('md')}
                    disabled={exportingFormat !== null}
                  >
                    <span className="report-export-menu-item-name">Markdown</span>
                    {exportingFormat === 'md' && (
                      <Loader2 size={11} strokeWidth={2} className="spin report-export-menu-item-spin" />
                    )}
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`report-export-menu-item${isPaid ? '' : ' is-locked'}`}
                    onClick={() => onFormatSelect('csv')}
                    disabled={exportingFormat !== null}
                  >
                    <span className="report-export-menu-item-name">CSV</span>
                    {!isPaid && <span className="report-export-pro">Pro</span>}
                    {exportingFormat === 'csv' && (
                      <Loader2 size={11} strokeWidth={2} className="spin report-export-menu-item-spin" />
                    )}
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={`report-export-menu-item${isPaid ? '' : ' is-locked'}`}
                    onClick={() => onFormatSelect('pdf')}
                    disabled={exportingFormat !== null}
                  >
                    <span className="report-export-menu-item-name">PDF</span>
                    {!isPaid && <span className="report-export-pro">Pro</span>}
                  </button>

                  {!isPaid && (
                    <button
                      type="button"
                      role="menuitem"
                      className="report-export-compare"
                      onClick={handleComparePlans}
                    >
                      Compare plans
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}

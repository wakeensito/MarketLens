import { AnimatePresence, motion } from 'framer-motion';
import LandingScreen from './components/LandingScreen';
import Header from './components/Header';
import PipelineTracker from './components/PipelineTracker';
import ReportView from './components/ReportView';
import { useAnalysis } from './hooks/useAnalysis';

export default function App() {
  const {
    screen, query, stages, report, error, reportId, finalizing,
    startAnalysis, handleReset, handleRetry,
  } = useAnalysis();

  const isWorkspace = screen === 'analysis' || screen === 'report';

  return (
    <div className="app">
      <AnimatePresence mode="wait">
        {screen === 'landing' && (
          <LandingScreen key="landing" onSearch={startAnalysis} />
        )}

        {isWorkspace && (
          <motion.div
            key="workspace"
            className="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.35 }}
          >
            <Header query={query} onReset={handleReset} />

            <div className="workspace-main">
              <AnimatePresence mode="wait">
                {screen === 'analysis' ? (
                  <motion.div
                    key="pipeline"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  >
                    <PipelineTracker
                      stages={stages}
                      query={query}
                      finalizing={finalizing}
                      error={error}
                      onRetry={handleRetry}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="report"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    {report && reportId && <ReportView report={report} reportId={reportId} />}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

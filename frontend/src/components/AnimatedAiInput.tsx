import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, Paperclip } from 'lucide-react';
import { AnthropicIcon, GeminiIcon, OpenAiIcon } from './model-brand-icons';

type BrandIcon = ComponentType<{ className?: string }>;

const AI_MODELS = [
  { id: 'claude-3-haiku', label: 'Claude 3 Haiku', Icon: AnthropicIcon },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', Icon: AnthropicIcon },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', Icon: AnthropicIcon },
  { id: 'gpt-4-1-mini', label: 'GPT-4.1 Mini', Icon: OpenAiIcon },
  { id: 'gpt-4-1', label: 'GPT-4.1', Icon: OpenAiIcon },
  { id: 'gemini-3-1-pro', label: 'Gemini 3.1 Pro', Icon: GeminiIcon },
  { id: 'o3-mini', label: 'o3-mini', Icon: OpenAiIcon },
] as const satisfies readonly { id: string; label: string; Icon: BrandIcon }[];

type ModelId = (typeof AI_MODELS)[number]['id'];

function useAutoResizeTextarea(minHeight: number, maxHeight: number) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const el = textareaRef.current;
      if (!el) return;
      if (reset) {
        el.style.height = `${minHeight}px`;
        return;
      }
      el.style.height = `${minHeight}px`;
      const next = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
      el.style.height = `${next}px`;
    },
    [minHeight, maxHeight],
  );

  useEffect(() => {
    adjustHeight();
  }, [adjustHeight]);

  useEffect(() => {
    const onResize = () => adjustHeight();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

export interface AnimatedAiInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string, modelId?: string) => void;
  placeholder: string;
  /** Submit enabled when trimmed length is greater than this (default 4 → need 5+ chars). */
  minChars?: number;
}

const MIN_H = 72;
const MAX_H = 280;

const AnimatedAiInput = forwardRef<HTMLTextAreaElement, AnimatedAiInputProps>(
  function AnimatedAiInput(
    { value, onChange, onSubmit, placeholder, minChars = 4 },
    forwardedRef,
  ) {
    const { textareaRef, adjustHeight } = useAutoResizeTextarea(MIN_H, MAX_H);
    const [selectedId, setSelectedId] = useState<ModelId>(AI_MODELS[0].id);
    const detailsRef = useRef<HTMLDetailsElement>(null);

    const closeModelDropdown = useCallback(() => {
      detailsRef.current?.removeAttribute('open');
    }, []);

    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef, textareaRef],
    );

    const canSubmit = value.trim().length > minChars;

    useEffect(() => {
      adjustHeight();
    }, [value, adjustHeight]);

    const selected = AI_MODELS.find(m => m.id === selectedId) ?? AI_MODELS[0];
    const SelectedIcon = selected.Icon;

    const fireSubmit = () => {
      if (!canSubmit) return;
      onSubmit(value.trim(), selectedId);
      adjustHeight(true);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
        e.preventDefault();
        fireSubmit();
      }
    };

    return (
      <div className="ai-input">
        <div className="ai-input__body">
          <textarea
            ref={setRefs}
            id="landing-idea-input"
            className="ai-input__textarea"
            value={value}
            placeholder={placeholder}
            rows={2}
            onChange={e => {
              onChange(e.target.value);
              adjustHeight();
            }}
            onKeyDown={onKeyDown}
            autoFocus
            spellCheck
          />
        </div>

        <div className="ai-input__toolbar">
          <div className="ai-input__toolbar-left">
            <details ref={detailsRef} className="ai-input__dropdown">
              <summary className="ai-input__model-trigger" aria-label="Model">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={selectedId}
                    className="ai-input__model-trigger-inner"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.35, ease: 'easeOut' as const }}
                  >
                    <SelectedIcon className="ai-input__model-icon" aria-hidden />
                    <span className="ai-input__model-label">{selected.label}</span>
                    <ChevronDown className="ai-input__chevron" aria-hidden />
                  </motion.span>
                </AnimatePresence>
              </summary>
              <ul className="ai-input__menu" role="listbox" aria-label="Models">
                {AI_MODELS.map(m => {
                  const Icon = m.Icon;
                  const active = m.id === selectedId;
                  return (
                    <li key={m.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className="ai-input__menu-item"
                        data-active={active ? '' : undefined}
                        onClick={() => {
                          setSelectedId(m.id);
                          closeModelDropdown();
                        }}
                      >
                        <Icon className="ai-input__model-icon" aria-hidden />
                        <span>{m.label}</span>
                        {active && <Check className="ai-input__check" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </details>

            <span className="ai-input__sep" aria-hidden />

            <label className="ai-input__attach" title="Attach (coming soon)">
              <input type="file" className="ai-input__file" tabIndex={-1} />
              <Paperclip className="ai-input__attach-icon" aria-hidden />
            </label>
          </div>

          <button
            type="button"
            className="ai-input__send"
            aria-label="Analyze"
            disabled={!canSubmit}
            onClick={fireSubmit}
          >
            <span className="ai-input__send-label">Analyze</span>
            <ArrowRight className="ai-input__send-arrow" aria-hidden />
          </button>
        </div>
      </div>
    );
  },
);

export default AnimatedAiInput;

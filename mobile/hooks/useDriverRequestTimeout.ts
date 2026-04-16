import { useCallback, useEffect, useRef, useState } from "react";
import { showMessage } from "react-native-flash-message";

export type DriverRequestPhase = "idle" | "countdown" | "cooldown" | "retrying" | "exhausted";

export interface UseDriverRequestTimeoutOptions {
  /** When true, run per-driver countdown and timed retries (waiting for first acceptance). */
  enabled: boolean;
  /**
   * Stable id for this wait session (e.g. ride Mongo id). When it changes, retry counters reset.
   * Required so brief `enabled` flickers do not wipe progress.
   */
  sessionKey?: string | null;
  /** Each timeout calls this (assign-new-driver) until maxRetries is reached. */
  onRetryDriver: () => Promise<void>;
  onExhausted?: () => void;
  onRetrySuccess?: () => void;
  perDriverSeconds?: number;
  /**
   * How many times to call `onRetryDriver` after a timeout (default 4).
   * One initial wait-only window, then up to this many auto reassignments; then the next timeout exhausts.
   */
  maxRetries?: number;
  cooldownMs?: number;
}

const DEFAULT_PER_DRIVER = 60;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_COOLDOWN_MS = 4000;

export function useDriverRequestTimeout(options: UseDriverRequestTimeoutOptions) {
  const {
    enabled,
    sessionKey = null,
    onRetryDriver,
    onExhausted,
    onRetrySuccess,
    perDriverSeconds = DEFAULT_PER_DRIVER,
    maxRetries = DEFAULT_MAX_RETRIES,
    cooldownMs = DEFAULT_COOLDOWN_MS,
  } = options;

  const [phase, setPhase] = useState<DriverRequestPhase>("idle");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const saved = useRef({ onRetryDriver, onExhausted, onRetrySuccess });
  saved.current = { onRetryDriver, onExhausted, onRetrySuccess };

  const cfg = useRef({ perDriverSeconds, maxRetries, cooldownMs });
  cfg.current = { perDriverSeconds, maxRetries, cooldownMs };

  const timersRef = useRef<{
    tick?: ReturnType<typeof setInterval>;
    cooldown?: ReturnType<typeof setTimeout>;
  }>({});
  const retriesDoneRef = useRef(0);
  const exhaustedRef = useRef(false);
  const lastSessionKeyRef = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    if (timersRef.current.tick) {
      clearInterval(timersRef.current.tick);
      timersRef.current.tick = undefined;
    }
    if (timersRef.current.cooldown) {
      clearTimeout(timersRef.current.cooldown);
      timersRef.current.cooldown = undefined;
    }
  }, []);

  const runExhausted = useCallback(() => {
    clearTimers();
    exhaustedRef.current = true;
    setPhase("exhausted");
    setSecondsLeft(null);
    saved.current.onExhausted?.();
  }, [clearTimers]);

  const markAccepted = useCallback(() => {
    clearTimers();
    exhaustedRef.current = false;
    retriesDoneRef.current = 0;
    lastSessionKeyRef.current = null;
    setRetryCount(0);
    setPhase("idle");
    setSecondsLeft(null);
  }, [clearTimers]);

  const cancel = useCallback(() => {
    markAccepted();
  }, [markAccepted]);

  const startCountdownRef = useRef<() => void>(() => {});

  startCountdownRef.current = () => {
    clearTimers();
    const { perDriverSeconds: pd, maxRetries: mr, cooldownMs: cd } = cfg.current;
    setPhase("countdown");
    let s = pd;
    setSecondsLeft(s);

    timersRef.current.tick = setInterval(() => {
      s -= 1;
      setSecondsLeft(s);
      if (s > 0) return;

      clearInterval(timersRef.current.tick!);
      timersRef.current.tick = undefined;
      setSecondsLeft(0);

      // After maxRetries API calls, one more wait window; when it ends, exhaust without another call.
      if (retriesDoneRef.current >= mr) {
        runExhausted();
        return;
      }

      setPhase("cooldown");
      showMessage({
        type: "info",
        message: "Driver didn't respond — finding another…",
        duration: 2800,
      });

      timersRef.current.cooldown = setTimeout(async () => {
        timersRef.current.cooldown = undefined;
        setPhase("retrying");
        try {
          await saved.current.onRetryDriver();
          saved.current.onRetrySuccess?.();
          retriesDoneRef.current += 1;
          setRetryCount(retriesDoneRef.current);
          startCountdownRef.current();
        } catch {
          runExhausted();
        }
      }, cd);
    }, 1000);
  };

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setSecondsLeft(null);
      if (!exhaustedRef.current) {
        setPhase("idle");
      }
      return;
    }

    const key = sessionKey ?? "";
    if (!key) {
      return;
    }

    if (lastSessionKeyRef.current !== key) {
      lastSessionKeyRef.current = key;
      retriesDoneRef.current = 0;
      exhaustedRef.current = false;
      setRetryCount(0);
      setPhase("idle");
    }

    if (exhaustedRef.current) {
      setPhase("exhausted");
      setSecondsLeft(null);
      return;
    }

    startCountdownRef.current();

    return () => {
      clearTimers();
    };
  }, [enabled, sessionKey, clearTimers]);

  const retryNow = useCallback(async () => {
    if (exhaustedRef.current) return;
    clearTimers();
    setPhase("retrying");
    const { maxRetries: mr } = cfg.current;
    try {
      await saved.current.onRetryDriver();
      saved.current.onRetrySuccess?.();
      retriesDoneRef.current += 1;
      setRetryCount(retriesDoneRef.current);
      if (retriesDoneRef.current > mr) {
        runExhausted();
        return;
      }
      startCountdownRef.current();
    } catch {
      runExhausted();
    }
  }, [clearTimers, runExhausted]);

  return {
    phase,
    secondsLeft,
    retryCount,
    maxRetries: cfg.current.maxRetries,
    retryNow,
    cancel,
    markAccepted,
  };
}

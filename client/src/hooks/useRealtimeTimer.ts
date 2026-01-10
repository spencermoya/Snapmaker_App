import { useState, useEffect, useRef } from "react";

interface UseRealtimeTimerProps {
  elapsedTimeSeconds: number | null | undefined;
  timeRemainingSeconds: number | null | undefined;
  isActive: boolean;
}

interface RealtimeTimerResult {
  displayElapsedSeconds: number;
  displayRemainingSeconds: number;
}

export function useRealtimeTimer({
  elapsedTimeSeconds,
  timeRemainingSeconds,
  isActive,
}: UseRealtimeTimerProps): RealtimeTimerResult {
  const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(
    elapsedTimeSeconds ?? 0
  );
  const [displayRemainingSeconds, setDisplayRemainingSeconds] = useState(
    timeRemainingSeconds ?? 0
  );
  const lastSyncRef = useRef<number>(Date.now());

  useEffect(() => {
    if (elapsedTimeSeconds !== null && elapsedTimeSeconds !== undefined) {
      setDisplayElapsedSeconds(elapsedTimeSeconds);
      lastSyncRef.current = Date.now();
    } else {
      setDisplayElapsedSeconds(0);
    }
  }, [elapsedTimeSeconds]);

  useEffect(() => {
    if (timeRemainingSeconds !== null && timeRemainingSeconds !== undefined) {
      setDisplayRemainingSeconds(timeRemainingSeconds);
      lastSyncRef.current = Date.now();
    } else {
      setDisplayRemainingSeconds(0);
    }
  }, [timeRemainingSeconds]);

  useEffect(() => {
    if (!isActive) {
      setDisplayElapsedSeconds(elapsedTimeSeconds ?? 0);
      setDisplayRemainingSeconds(0);
    }
  }, [isActive, elapsedTimeSeconds]);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      const elapsed = (Date.now() - lastSyncRef.current) / 1000;
      
      if (elapsedTimeSeconds !== null && elapsedTimeSeconds !== undefined) {
        setDisplayElapsedSeconds(elapsedTimeSeconds + elapsed);
      }
      
      if (timeRemainingSeconds !== null && timeRemainingSeconds !== undefined) {
        const newRemaining = Math.max(0, timeRemainingSeconds - elapsed);
        setDisplayRemainingSeconds(newRemaining);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isActive, elapsedTimeSeconds, timeRemainingSeconds]);

  return {
    displayElapsedSeconds,
    displayRemainingSeconds,
  };
}

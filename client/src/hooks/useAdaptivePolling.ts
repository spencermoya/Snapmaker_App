import { useState, useEffect, useCallback } from "react";

interface AdaptivePollingConfig {
  idleInterval: number;
  activeInterval: number;
  backgroundInterval: number | false;
}

const DEFAULT_CONFIG: AdaptivePollingConfig = {
  idleInterval: 30000,
  activeInterval: 5000,
  backgroundInterval: false,
};

export function useAdaptivePolling(
  isPrinting: boolean,
  config: Partial<AdaptivePollingConfig> = {}
) {
  const { idleInterval, activeInterval, backgroundInterval } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  const [isVisible, setIsVisible] = useState(!document.hidden);
  const [currentInterval, setCurrentInterval] = useState<number | false>(
    isPrinting ? activeInterval : idleInterval
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsVisible(visible);
      console.log(`[AdaptivePolling] Visibility changed: ${visible ? 'visible' : 'hidden'}`);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) {
      setCurrentInterval(backgroundInterval);
      console.log(`[AdaptivePolling] Background mode: interval = ${backgroundInterval === false ? 'paused' : backgroundInterval + 'ms'}`);
    } else if (isPrinting) {
      setCurrentInterval(activeInterval);
      console.log(`[AdaptivePolling] Active (printing): interval = ${activeInterval}ms`);
    } else {
      setCurrentInterval(idleInterval);
      console.log(`[AdaptivePolling] Idle: interval = ${idleInterval}ms`);
    }
  }, [isVisible, isPrinting, idleInterval, activeInterval, backgroundInterval]);

  return {
    interval: currentInterval,
    isVisible,
    isPaused: currentInterval === false,
  };
}

export function useVisibility() {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return isVisible;
}

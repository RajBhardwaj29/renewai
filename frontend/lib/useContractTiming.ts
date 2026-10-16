'use client';

import { useEffect, useState } from 'react';
import { observeUtcDay, utcDay } from './contractTiming';

export function useUtcDay() {
  const [day, setDay] = useState(() => utcDay());
  useEffect(() => observeUtcDay(setDay, {
    now: Date.now,
    setTimer: (callback, delay) => setTimeout(callback, delay),
    clearTimer: (timer) => clearTimeout(timer),
    window,
    document,
  }), []);
  return day;
}

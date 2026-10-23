"use strict";

/**
 * Notify only on a transition from below to at/above the configured threshold.
 * Invalid readings, disabled notifications, and unavailable CPU metrics never notify.
 * @param {boolean} wasAbove
 * @param {number} currentPercent
 * @param {number} threshold
 * @param {boolean} enabled
 * @param {boolean} [available]
 */
export function shouldNotifyCpuThreshold(wasAbove, currentPercent, threshold, enabled, available = true) {
  if (!enabled || !available || !Number.isFinite(currentPercent) || currentPercent < 0 || currentPercent > 100 ||
      !Number.isFinite(threshold) || threshold < 0 || threshold > 100) return false;
  return !wasAbove && currentPercent >= threshold;
}

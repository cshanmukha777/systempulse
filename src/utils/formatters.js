"use strict";

/** @param {number} value */
function clampPercent(value) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** @param {number} value */
function formatPercent(value) {
  return clampPercent(value).toFixed(1) + "%";
}

/** @param {number} value */
function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "Unavailable";
  if (value === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return (value / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1) + " " + units[exponent];
}

module.exports = { clampPercent, formatPercent, formatBytes };

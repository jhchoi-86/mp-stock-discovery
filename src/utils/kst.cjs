/**
 * KST (Korea Standard Time) Utility
 * [TASK-CC02] Centralized time logic for MP Stock Discovery
 */

/**
 * Returns a Date object adjusted to KST (+9h)
 * @param {number|string|Date} date - Input date
 * @returns {Date} KST adjusted Date object
 */
const toKST = (date = new Date()) => {
    const d = new Date(date);
    // Adjust by 9 hours
    return new Date(d.getTime() + (9 * 60 * 60 * 1000));
};

/**
 * Returns KST date string in YYYY-MM-DD format
 * @param {number|string|Date} date 
 * @returns {string} e.g. "2026-04-11"
 */
const getKSTDateString = (date = new Date()) => {
    return toKST(date).toISOString().split('T')[0];
};

/**
 * Returns KST ISO string without 'Z' (e.g. "2026-04-16T10:58:47.654")
 * Matches user request for "actual KST" display format.
 */
const getKstISO = (date = new Date()) => {
    return toKST(date).toISOString().replace('Z', '');
};

/**
 * Returns KST date string in YYYYMMDD format
 */
const getKstDateCompact = (date = new Date()) => {
    return getKSTDateString(date).replace(/-/g, '');
};

/**
 * Returns current timestamp in KST ms
 * @returns {number}
 */
const nowKST = () => toKST().getTime();

/**
 * Returns a Date object adjusted to KST (+9h)
 * Alias for toKST() to match analyzer/publishing requests
 */
const getKstNow = () => toKST();

module.exports = { 
    toKST, 
    getKSTDateString, 
    getKstDateString: getKSTDateString,
    getKstISO, 
    getKstDateCompact,
    nowKST, 
    getKstNow 
};

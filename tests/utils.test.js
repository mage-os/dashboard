import { getDaysSince, getStaleClass, getStaleLevel, formatAge, formatDateUTC, isLightColor, getReviewStatus } from '../src/utils.js';

const DAY_MS = 1000 * 60 * 60 * 24;

describe('getDaysSince', () => {
    const now = new Date('2025-03-15T12:00:00Z').getTime();

    test('returns 0 for today', () => {
        expect(getDaysSince('2025-03-15T10:00:00Z', now)).toBe(0);
    });

    test('returns 1 for yesterday', () => {
        expect(getDaysSince('2025-03-14T12:00:00Z', now)).toBe(1);
    });

    test('returns correct days for weeks ago', () => {
        expect(getDaysSince('2025-03-01T12:00:00Z', now)).toBe(14);
    });

    test('returns correct days for months ago', () => {
        expect(getDaysSince('2025-01-15T12:00:00Z', now)).toBe(59);
    });

    test('returns negative for future date', () => {
        expect(getDaysSince('2025-03-20T12:00:00Z', now)).toBeLessThan(0);
    });
});

describe('getStaleClass', () => {
    const thresholds = { warningDays: 30, criticalDays: 90 };
    const now = new Date('2025-06-01T12:00:00Z').getTime();

    test('returns empty string for recent items', () => {
        expect(getStaleClass('2025-05-25T12:00:00Z', thresholds, now)).toBe('');
    });

    test('returns stale-warning for items older than warningDays', () => {
        expect(getStaleClass('2025-04-20T12:00:00Z', thresholds, now)).toBe('stale-warning');
    });

    test('returns stale-critical for items older than criticalDays', () => {
        expect(getStaleClass('2025-02-01T12:00:00Z', thresholds, now)).toBe('stale-critical');
    });

    test('returns stale-warning at exactly warningDays', () => {
        const exactWarning = new Date(now - 30 * DAY_MS).toISOString();
        expect(getStaleClass(exactWarning, thresholds, now)).toBe('stale-warning');
    });

    test('returns stale-critical at exactly criticalDays', () => {
        const exactCritical = new Date(now - 90 * DAY_MS).toISOString();
        expect(getStaleClass(exactCritical, thresholds, now)).toBe('stale-critical');
    });
});

describe('getStaleLevel', () => {
    const thresholds = { warningDays: 30, criticalDays: 90 };
    const now = new Date('2025-06-01T12:00:00Z').getTime();

    test('returns ok for recent items', () => {
        expect(getStaleLevel('2025-05-25T12:00:00Z', thresholds, now)).toBe('ok');
    });

    test('returns warning for items in warning range', () => {
        expect(getStaleLevel('2025-04-20T12:00:00Z', thresholds, now)).toBe('warning');
    });

    test('returns critical for items in critical range', () => {
        expect(getStaleLevel('2025-02-01T12:00:00Z', thresholds, now)).toBe('critical');
    });
});

describe('formatAge', () => {
    const now = new Date('2025-06-15T12:00:00Z').getTime();

    test('returns "today" for same day', () => {
        expect(formatAge('2025-06-15T10:00:00Z', now)).toBe('today');
    });

    test('returns "1 day ago" for yesterday', () => {
        expect(formatAge('2025-06-14T12:00:00Z', now)).toBe('1 day ago');
    });

    test('returns "Nd ago" for days', () => {
        expect(formatAge('2025-06-01T12:00:00Z', now)).toBe('14d ago');
    });

    test('returns "Nmo ago" for months', () => {
        expect(formatAge('2025-03-15T12:00:00Z', now)).toBe('3mo ago');
    });

    test('returns "Ny ago" for years', () => {
        expect(formatAge('2023-06-15T12:00:00Z', now)).toBe('2y ago');
    });
});

describe('formatDateUTC', () => {
    test('formats ISO date string', () => {
        expect(formatDateUTC('2025-03-15T14:30:45Z')).toBe('2025-03-15 14:30:45');
    });

    test('returns "-" for null', () => {
        expect(formatDateUTC(null)).toBe('-');
    });

    test('returns "-" for undefined', () => {
        expect(formatDateUTC(undefined)).toBe('-');
    });

    test('returns "-" for empty string', () => {
        expect(formatDateUTC('')).toBe('-');
    });

    test('handles date with milliseconds', () => {
        expect(formatDateUTC('2025-03-15T14:30:45.123Z')).toBe('2025-03-15 14:30:45');
    });
});

describe('isLightColor', () => {
    test('white is light', () => {
        expect(isLightColor('ffffff')).toBe(true);
    });

    test('black is not light', () => {
        expect(isLightColor('000000')).toBe(false);
    });

    test('yellow is light', () => {
        expect(isLightColor('ffff00')).toBe(true);
    });

    test('dark blue is not light', () => {
        expect(isLightColor('000080')).toBe(false);
    });
});

describe('getReviewStatus', () => {
    test('returns approved when last review is APPROVED', () => {
        const pr = { reviews: { nodes: [{ state: 'APPROVED' }] }, reviewRequests: { totalCount: 0 } };
        expect(getReviewStatus(pr)).toBe('approved');
    });

    test('returns changes_requested when last review is CHANGES_REQUESTED', () => {
        const pr = { reviews: { nodes: [{ state: 'CHANGES_REQUESTED' }] }, reviewRequests: { totalCount: 0 } };
        expect(getReviewStatus(pr)).toBe('changes_requested');
    });

    test('returns commented when last review is COMMENTED', () => {
        const pr = { reviews: { nodes: [{ state: 'COMMENTED' }] }, reviewRequests: { totalCount: 0 } };
        expect(getReviewStatus(pr)).toBe('commented');
    });

    test('returns review_requested when there are pending requests', () => {
        const pr = { reviews: { nodes: [] }, reviewRequests: { totalCount: 1 } };
        expect(getReviewStatus(pr)).toBe('review_requested');
    });

    test('returns none when no reviews and no requests', () => {
        const pr = { reviews: { nodes: [] }, reviewRequests: { totalCount: 0 } };
        expect(getReviewStatus(pr)).toBe('none');
    });

    test('handles missing reviews object', () => {
        const pr = {};
        expect(getReviewStatus(pr)).toBe('none');
    });
});

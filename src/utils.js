import tinycolor from 'tinycolor2';

export function getDaysSince(dateString, now = Date.now()) {
    return Math.floor((now - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
}

export function getStaleClass(dateString, thresholds, now = Date.now()) {
    const days = getDaysSince(dateString, now);
    if (days >= thresholds.criticalDays) return 'stale-critical';
    if (days >= thresholds.warningDays) return 'stale-warning';
    return '';
}

export function getStaleLevel(dateString, thresholds, now = Date.now()) {
    const days = getDaysSince(dateString, now);
    if (days >= thresholds.criticalDays) return 'critical';
    if (days >= thresholds.warningDays) return 'warning';
    return 'ok';
}

export function formatAge(dateString, now = Date.now()) {
    const days = getDaysSince(dateString, now);
    if (days < 1) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(days / 365);
    return `${years}y ago`;
}

export function formatDateUTC(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toISOString().replace('T', ' ').substring(0, 19);
}

export function isLightColor(hex) {
    return tinycolor(hex).isLight();
}

export function getReviewStatus(pr) {
    const lastReview = pr.reviews?.nodes?.[0];
    const pendingRequests = pr.reviewRequests?.totalCount || 0;
    if (lastReview) {
        switch (lastReview.state) {
            case 'APPROVED': return 'approved';
            case 'CHANGES_REQUESTED': return 'changes_requested';
            case 'COMMENTED': return 'commented';
        }
    }
    if (pendingRequests > 0) return 'review_requested';
    return 'none';
}

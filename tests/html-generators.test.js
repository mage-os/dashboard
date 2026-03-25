import { getReviewStatusBadge, getWorkflowStatusIcon } from '../src/html-generators.js';

describe('getReviewStatusBadge', () => {
    test('returns approved badge', () => {
        const pr = { reviews: { nodes: [{ state: 'APPROVED' }] }, reviewRequests: { totalCount: 0 } };
        const badge = getReviewStatusBadge(pr);
        expect(badge).toContain('review-approved');
        expect(badge).toContain('Approved');
    });

    test('returns changes requested badge', () => {
        const pr = { reviews: { nodes: [{ state: 'CHANGES_REQUESTED' }] }, reviewRequests: { totalCount: 0 } };
        const badge = getReviewStatusBadge(pr);
        expect(badge).toContain('review-changes');
        expect(badge).toContain('Changes Requested');
    });

    test('returns commented badge', () => {
        const pr = { reviews: { nodes: [{ state: 'COMMENTED' }] }, reviewRequests: { totalCount: 0 } };
        const badge = getReviewStatusBadge(pr);
        expect(badge).toContain('review-commented');
        expect(badge).toContain('Reviewed');
    });

    test('returns review requested badge', () => {
        const pr = { reviews: { nodes: [] }, reviewRequests: { totalCount: 2 } };
        const badge = getReviewStatusBadge(pr);
        expect(badge).toContain('review-pending');
        expect(badge).toContain('Review Requested');
    });

    test('returns no review badge when no reviews or requests', () => {
        const pr = { reviews: { nodes: [] }, reviewRequests: { totalCount: 0 } };
        const badge = getReviewStatusBadge(pr);
        expect(badge).toContain('review-none');
        expect(badge).toContain('No Review');
    });
});

describe('getWorkflowStatusIcon', () => {
    test('returns success icon', () => {
        const icon = getWorkflowStatusIcon('success');
        expect(icon).toContain('ci-success');
        expect(icon).toContain('Success');
    });

    test('returns failure icon', () => {
        const icon = getWorkflowStatusIcon('failure');
        expect(icon).toContain('ci-failure');
        expect(icon).toContain('Failure');
    });

    test('returns cancelled icon', () => {
        const icon = getWorkflowStatusIcon('cancelled');
        expect(icon).toContain('ci-cancelled');
    });

    test('returns running icon for in_progress', () => {
        const icon = getWorkflowStatusIcon('in_progress');
        expect(icon).toContain('ci-running');
    });

    test('returns running icon for queued', () => {
        const icon = getWorkflowStatusIcon('queued');
        expect(icon).toContain('ci-running');
    });

    test('returns fallback icon for unknown status', () => {
        const icon = getWorkflowStatusIcon('unknown');
        expect(icon).toContain('No runs');
    });

    test('returns fallback icon for null', () => {
        const icon = getWorkflowStatusIcon(null);
        expect(icon).toContain('No runs');
    });
});

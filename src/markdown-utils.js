// Escape untrusted text (issue/PR titles, labels, logins) for inline Markdown,
// including inside table cells and link text.
export function escapeMarkdown(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/\r?\n|\r/g, ' ')
        .replace(/([\\`*_[\]<>|])/g, '\\$1')
        .trim();
}

// Link URLs come from the GitHub API, but guard against characters that would
// terminate the Markdown link destination.
export function markdownLink(text, url) {
    const safeUrl = String(url || '').replace(/[()\s]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
    return `[${escapeMarkdown(text)}](${safeUrl})`;
}

export function formatAgeDays(days) {
    if (days === null || days === undefined) return '-';
    return `${days}d`;
}

export function formatPriorityFactors(factors, separator = ' | ') {
    return Object.entries(factors || {})
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v}`)
        .join(separator);
}

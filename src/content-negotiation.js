// Dependency-free so it can be bundled into the Cloudflare Pages Function.

function parseAccept(header) {
    return String(header || '')
        .split(',')
        .map(part => {
            const [type, ...params] = part.trim().toLowerCase().split(';').map(s => s.trim());
            const qParam = params.find(p => p.startsWith('q='));
            const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
            return { type, q: Number.isFinite(q) ? q : 0 };
        })
        .filter(entry => entry.type);
}

function qualityFor(entries, mediaType) {
    const [major] = mediaType.split('/');
    const exact = entries.find(e => e.type === mediaType);
    if (exact) return exact.q;
    const range = entries.find(e => e.type === `${major}/*`);
    if (range) return range.q;
    const any = entries.find(e => e.type === '*/*');
    return any ? any.q : 0;
}

/**
 * True only when the client explicitly asks for text/markdown and ranks it at
 * least as high as HTML (ties go to whichever is listed first). Browsers never
 * list text/markdown, so they always get HTML.
 */
export function prefersMarkdown(acceptHeader) {
    const entries = parseAccept(acceptHeader);
    const mdIndex = entries.findIndex(e => e.type === 'text/markdown' || e.type === 'text/x-markdown');
    if (mdIndex === -1 || entries[mdIndex].q <= 0) return false;

    const mdQ = entries[mdIndex].q;
    const htmlQ = qualityFor(entries, 'text/html');
    if (mdQ !== htmlQ) return mdQ > htmlQ;

    const htmlIndex = entries.findIndex(e => e.type === 'text/html');
    return htmlIndex === -1 || mdIndex < htmlIndex;
}

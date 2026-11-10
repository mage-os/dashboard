// Cloudflare Pages Function for the `/` route only (static assets elsewhere are
// served without invoking a Function). Agents that send `Accept: text/markdown`
// get the Markdown twin of the dashboard; everyone else gets index.html.
import { prefersMarkdown } from '../src/content-negotiation.js';

export async function onRequestGet({ request, env, next }) {
    if (!prefersMarkdown(request.headers.get('Accept'))) {
        const response = await next();
        const headers = new Headers(response.headers);
        headers.append('Vary', 'Accept');
        return new Response(response.body, { status: response.status, headers });
    }

    const markdown = await env.ASSETS.fetch(new URL('/index.md', request.url));
    if (!markdown.ok) {
        return next();
    }

    const headers = new Headers(markdown.headers);
    headers.set('Content-Type', 'text/markdown; charset=utf-8');
    headers.set('Content-Location', '/index.md');
    headers.append('Vary', 'Accept');
    return new Response(markdown.body, { status: 200, headers });
}

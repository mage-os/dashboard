export const PRODUCTION_BRANCH = 'main';

/**
 * Cloudflare Pages builds every pushed branch as a preview, without access to
 * a GitHub token. Those builds use the latest data branch snapshot instead of
 * the API. Builds outside Cloudflare (GitHub Actions, local) are never previews.
 * https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables
 */
export function isPreviewBuild(env) {
    if (env.CF_PAGES !== '1') return false;
    const branch = env.CF_PAGES_BRANCH ?? '';
    return branch !== '' && branch !== PRODUCTION_BRANCH;
}

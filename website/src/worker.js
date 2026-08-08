const primaryHost = 'docflowlocal.com';
const alternateHost = 'www.docflowlocal.com';
const indexNowKey = '393eedac11f37df862e931238f00bae8';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    const needsPrimaryHost = url.hostname === alternateHost;
    const needsHttps = url.hostname === primaryHost && url.protocol !== 'https:';

    if (needsPrimaryHost || needsHttps) {
      url.protocol = 'https:';
      url.hostname = primaryHost;
      url.port = '';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === `/${indexNowKey}.txt`) {
      return new Response(indexNowKey, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};

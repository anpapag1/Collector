import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Custom HTML template for the web export.
 *
 * Includes the SPA redirect script needed for GitHub Pages:
 * when a user refreshes on a deep link (e.g. /login), GitHub Pages
 * serves 404.html which encodes the path as a query-string and
 * redirects here.  The inline script below decodes it and restores
 * the original URL via history.replaceState before React boots.
 *
 * @see https://github.com/rafgraph/spa-github-pages
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* SPA redirect decoder for GitHub Pages */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function (l) {
                if (l.search[1] === '/') {
                  var decoded = l.search
                    .slice(1)
                    .split('&')
                    .map(function (s) {
                      return s.replace(/~and~/g, '&');
                    })
                    .join('?');
                  window.history.replaceState(null, null,
                    l.pathname.slice(0, -1) + decoded + l.hash
                  );
                }
              })(window.location);
            `,
          }}
        />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

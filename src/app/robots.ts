import type { MetadataRoute } from "next";

/**
 * Crawler policy.
 *
 * Closed beta: nothing is meant to be crawled yet. Blanket disallow rather
 * than a list of paths, because robots.txt is fetched by anyone who asks for
 * it — naming /admin in here would advertise the admin panel to every reader
 * instead of hiding it.
 *
 * Note what this does and does not do. It stops well-behaved crawlers from
 * *fetching* pages, which keeps bot traffic off the free-tier database. It is
 * not access control, and it is not a guarantee of staying out of search
 * results: a URL that gets linked publicly can still be listed, without a
 * snippet, because the crawler was forbidden from reading the page.
 *
 * If the beta URL ever gets shared somewhere public, this has to be swapped
 * for the opposite arrangement — allow crawling, and serve a `noindex` in the
 * root layout's metadata. A crawler that is blocked here can never fetch the
 * page, so it can never see a `noindex`; the two cancel each other out.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}

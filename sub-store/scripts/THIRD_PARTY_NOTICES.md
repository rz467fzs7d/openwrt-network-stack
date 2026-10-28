# Third-party detection code

The `parseYoutubePremium` and `parseGooglePlay` functions and browser User-Agent
in `parser.js` are adapted from:

- Project: lmc999/RegionRestrictionCheck
- Source: https://github.com/lmc999/RegionRestrictionCheck/blob/1a856acc4bf42e27fec3ff64b1e9731892b5c3bb/check.sh
- Functions: `MediaUnlockTest_YouTube_Premium`, `WebTest_GooglePlayStore`
- License: GNU Affero General Public License v3.0 (included in
  `LICENSE.RegionRestrictionCheck`)
- JavaScript adaptation: 2026-10-26

Changes adapt Bash/curl requests and output to Sub-Store HTTP META, structured
results, scoped execution, request timeouts, caching, and logs.
The upstream's fixed YouTube cookie was removed on 2026-10-28 after live
cookie/no-cookie comparisons showed it suppressed the upstream CN signal.
The cache namespace was changed so cookie-based results are not reused.
HTTP errors and exceptions are reported as unknown instead of parsing error pages. No additional
CN decision signals or aggregate country inference are introduced. In particular,
`www.google.cn` in the YouTube response is retained as the upstream heuristic;
it is not an independently verified country assertion. Google Play's localized
text is retained without converting it to a country code.

The complete corresponding source for this adaptation is `parser.js` in this
repository, with regression tests in `parser.google.test.js`. Retain this notice,
the upstream attribution, and the license when distributing the adaptation.

# Third-party detection code

The `parseYoutubePremium` and `parseGooglePlay` functions, YouTube request cookie,
and browser User-Agent in `parser.js` are adapted from:

- Project: lmc999/RegionRestrictionCheck
- Source: https://github.com/lmc999/RegionRestrictionCheck/blob/1a856acc4bf42e27fec3ff64b1e9731892b5c3bb/check.sh
- Functions: `MediaUnlockTest_YouTube_Premium`, `WebTest_GooglePlayStore`
- License: GNU Affero General Public License v3.0 (included in
  `LICENSE.RegionRestrictionCheck`)
- JavaScript adaptation: 2026-10-26

Changes adapt Bash/curl requests and output to Sub-Store HTTP META, structured
results, scoped execution, request timeouts, caching, and logs. HTTP errors and
exceptions are reported as unknown instead of parsing error pages. No additional
CN decision signals or aggregate country inference are introduced. In particular,
`www.google.cn` in the YouTube response is retained as the upstream heuristic;
it is not an independently verified country assertion. Google Play's localized
text is retained without converting it to a country code.

The complete corresponding source for this adaptation is `parser.js` in this
repository, with regression tests in `parser.google.test.js`. Retain this notice,
the upstream attribution, and the license when distributing the adaptation.

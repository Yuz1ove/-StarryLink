# StarryLink Hero fonts

These self-hosted WOFF2 files are restricted to the homepage Hero wordmarks. They are deliberately tiny glyph subsets and add no runtime package dependency.

## Inter Tight 500 — `StarryLink`

- File: `inter-tight-500-starrylink.woff2`
- Use: the Latin `StarryLink` wordmark and matching homepage header glyphs only
- Subset: `StarryLink` (`U+004C U+0053 U+0061 U+0069 U+006B U+006E U+0072 U+0074 U+0079`)
- Size: 1,576 bytes
- SHA-256: `b46b36ce799331df3d78f52882ae7097ae86f1674d8c8c2483899969d839bf86`
- Designer/source: Rasmus Andersson, [Inter Tight](https://github.com/rsms/inter-gf-tight)
- Google Fonts source commit: `c194f94c60b569b47876811321f5ef1f0c2614a2`
- Retrieved: 2026-07-19 from the official Google Fonts CSS endpoint; CDN asset revision `v9` (an asset revision, not a semantic font version)
- Exact source asset: `https://fonts.gstatic.com/l/font?kit=NGSnv5HMAFg6IuGlBNMjxJEL2VmU3NS7Z2mjPQ-qWTxe5P19VovWWMZM&skey=68e231d243ba982&v=v9`
- License: SIL Open Font License 1.1; see `INTER-TIGHT-OFL.txt`

## Noto Serif TC 400 — `星夜`

- File: `noto-serif-tc-400-xingye.woff2`
- Use: the two-glyph Chinese signature and matching homepage header glyphs only
- Subset: `星夜` (`U+591C U+661F`)
- Size: 1,180 bytes
- SHA-256: `72a48943a4bb757b3692fa7791aceceddc35d06c876f968fb92f59b25f666ca6`
- Designer/source: Google / Adobe, [Noto Serif CJK](https://github.com/notofonts/noto-cjk); upstream Serif release 2.003
- Google Fonts source commit: `985fa52c81c1d6692ccdd82bc3656e8fb932fd89`
- Retrieved: 2026-07-19 from the official Google Fonts CSS endpoint; CDN asset revision `v36` (an asset revision, not a semantic font version)
- Exact source asset: `https://fonts.gstatic.com/l/font?kit=XLYzIZb5bJNDGYxLBibeHZ0BnHwmuanx8cUaGX9aMOpGIWThCudrEvs&skey=dafe25338141b30f&v=v36`
- License: SIL Open Font License 1.1; see `NOTO-SERIF-TC-OFL.txt`

Both faces use `font-display: swap`, explicit `unicode-range`, and `font-synthesis: none`. The fallback stacks retain metric-conscious platform options: Avenir Next / Helvetica Neue / Arial first, followed by Bahnschrift / Roboto / Roboto Condensed / Avenir Next Condensed for Latin, and Songti TC / PMingLiU / MingLiU / Noto Serif CJK TC for the Chinese signature. A failed font request therefore leaves the Hero legible and within its responsive bounds. On the reference macOS renderer, blocking both WOFF2 requests changes the 1440px `StarryLink` width from 655.77px to 665.47px (about 1.5%) with zero horizontal overflow.

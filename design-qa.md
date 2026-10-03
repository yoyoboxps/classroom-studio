# Design QA · 2026-10-03

final result: passed

## Evidence and normalization

- Source: `/Users/yoyo/Documents/AI_API/電腦版版型.png` (1435 × 1096), `/Users/yoyo/Documents/AI_API/手機版版型.png` (807 × 1949).
- Desktop viewport: 1435 × 1096 CSS pixels. Implementation: `.preview/desktop.png`, full page 1435 × 1137 before final theme-color-only update.
- Mobile viewport: 403 × 974 CSS pixels. Reference normalized from 807 × 1949 to 403 × 974. Implementation: `.preview/mobile.png`, full page includes the explicit demo notice below the source content.
- Same state: image tab, 3:2, standard quality, 100-point quota, used 35, estimate 5, remaining 65.
- Side-by-side full-view evidence: `.preview/desktop-comparison.png` and `.preview/mobile-comparison.png`. Final mobile screenshot captured again after responsive image decoding; the comparison composite should be regenerated if used for final exports.
- Focused review: form, controls, and usage text are readable at native mobile resolution in the saved screenshot; asset separately inspected at `public/jellyfish-mobile.webp`.

## Comparison history

1. Initial desktop render had not yet decoded the image. After load, both images had nonzero natural dimensions and were visible.
2. Initial mobile spacing was too large, and the desktop crop did not match the mobile composition. Added picture/source with the supplied mobile asset; reduced navigation height and input/button dimensions.
3. Removed the layout space reserved for a scrollbar; checked client width equals viewport width and no horizontal overflow. Re-captured both viewports and compared.

## Required surfaces

- Typography: system sans-serif fallbacks approximate the supplied typeface; source font file was not supplied. Hierarchy and labels preserved. Native OS CJK rendering differs slightly.
- Layout: desktop wide preview and horizontal settings; mobile class selector and stacked settings. Primary generate control remains reachable in the first mobile screen. Small spacing differences remain.
- Colors: near-black background, orange action/selected ratio, blue used points and light-blue forecast. Borders and muted text follow source.
- Assets: actual user-supplied raster image crops and logo; separate desktop/mobile variants. Download returns the original desktop sample WebP, rather than claiming it is an AI result.
- Copy: source headings, description, values and controls preserved. Explicit demo-mode notice intentionally added.

## Interaction checks

- Ratio 1:1 updates dimensions to 1024 × 1024; switch back to 3:2 updates to 1536 × 1024.
- Demo generation shows loading then a clear completion notice; remaining points stay at 65.
- Video tab exposes photo upload, 6-second output, 720p, and 20-point estimate.
- Missing photo prevents submission with a clear notice.
- Sample download completed as `classroom-studio-sample.webp`.
- Browser captured no warning/error logs during these checks.
- 403px and 1435px layout checks: no horizontal overflow.

## Follow-up polish / limits

P3: source font is unknown; native type rendering, small gaps, and standard select arrows differ slightly. An explicit demo notice adds page height.
Real authentication and provider generation are not verified without configuration. Supporting teacher/admin pages retain their existing workflow and are outside this source-screen comparison.

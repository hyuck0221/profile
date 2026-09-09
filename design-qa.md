# Design QA — profile career timeline

## Comparison setup

- Source visual truth path: `/Users/shimhyuck/.codex/generated_images/01a0561c-b64a-71b1-9bf8-0879f8317431/exec-900d4ebf-b959-46ef-9a17-145256b5926e.png`
- Implementation screenshot path: `/Users/shimhyuck/clone2/profile/qa-profile-implementation-desktop-final2.jpg`
- Combined comparison path: `/Users/shimhyuck/clone2/profile/qa-profile-comparison-final2.png`
- Additional responsive evidence: `/Users/shimhyuck/clone2/profile/qa-profile-implementation-tablet-final2.jpg`, `/Users/shimhyuck/clone2/profile/qa-profile-implementation-mobile-final2.jpg`
- Target viewport: CSS `1440 x 1024`
- Source pixels: `1487 x 1058`, normalized to `1440 x 1024` for comparison
- Implementation pixels: `1425 x 1013` from a `1440 x 1024` CSS viewport at device scale `1`, normalized to `1440 x 1024` for comparison; latest final2 evidence reflects the final information-architecture refinement
- Comparison state: profile route, profile navigation active, screen-entry date `2026-08-31`, no hover or focus state

## Findings

No actionable P0, P1, or P2 differences remain after the responsive fix.

- Fonts and typography: Inter is used for interface and company text, JetBrains Mono is used for eyebrow/date metadata, and the company name is now reduced to a 28px secondary heading so it does not compete with the profile identity.
- Spacing and layout rhythm: the career block occupies the former left whitespace, the right profile rail remains separated by a vertical rule, and the desktop composition keeps the same sparse editorial balance.
- Colors and tokens: the warm paper background, near-black ink, hairline rules, and structural blue map to the existing design tokens; no gradients or unnecessary elevation were introduced.
- Image quality and asset fidelity: the source contains no required raster imagery. Timeline lines and markers are UI primitives, not replacements for source imagery; no placeholder image or custom illustration was introduced.
- Copy and content: the implementation shows `아우토크립트`, top-aligned `입사 2022년 9월`, the screen-entry date under `현재`, five requested career records, and the `기록 보기` link. The status/year badges and tenure chip are removed. The current date is calculated on page entry, and the right rail no longer renders the `HSHIM STUDIO` label.
- States and interactions: the `기록 보기` link navigated to `journal.html` and returned successfully; browser console warnings and errors were empty.

## Comparison history

1. Initial responsive comparison at `768 x 1024` found a P2 wrapping issue in the two milestone labels: `2022년 9월 입사` and `2026년 8월 31일 현재` broke across lines because the right rail consumed too much width.
2. The fix reduced the intermediate profile rail width and switched to a single-column profile layout at widths up to `48rem`.
3. Post-fix evidence at `768 x 1024` shows the career timeline above the profile rail with no horizontal overflow or overlapping sections. The milestone dates remain readable, and the desktop `1440 x 1024` composition remains unchanged.
4. The latest refinement reduced the company heading from the previous display scale to `28px` and removed the right-rail `HSHIM STUDIO` label. Fresh desktop, tablet, and mobile captures show the requested hierarchy and clean rail.
5. The final information-architecture pass removed the `재직 중`, `4년차`, and tenure chip, moved entry/current dates above, and replaced the single employment line with the five-item career record timeline below.

## Focused region comparison

The career block was reviewed as the focused region using the combined source/implementation comparison and the rendered DOM bounds. A separate crop was not needed because the timeline, company name, dates, five records, and link are all above the fold and legible at the target viewport.

## Open questions

- The generated source visual incorrectly marks `이력` as the active navigation item. The implementation keeps `프로필` active because this screen is `index.html`; this is an intentional route-state correction.
- The source visual includes a GitHub glyph while the existing profile implementation retains its text link and external-arrow treatment. This is a P3 polish opportunity, not a functional or hierarchy issue.

## Implementation checklist

- [x] Add career timeline to the profile screen.
- [x] Show the company, entry date, current date, and five career records.
- [x] Calculate the current date from the screen-entry date.
- [x] Change the link label and destination to `기록 보기` → `journal.html`.
- [x] Keep the company name visually secondary at `28px`.
- [x] Remove the `재직 중`, `4년차`, and tenure indicators.
- [x] Remove the right-rail `HSHIM STUDIO` label.
- [x] Verify desktop, tablet, and mobile layouts.
- [x] Verify navigation and console output.

## Follow-up polish

- [P3] If desired, add a real icon-library GitHub mark to the existing external link while preserving the current text treatment.

final result: passed

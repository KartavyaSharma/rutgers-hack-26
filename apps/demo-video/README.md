# Bell demo videos

Two walkthroughs made with [Remotion](https://www.remotion.dev), 1920×1080 at 30 fps. Both render
the real app components with dummy data, so the videos stay in step with the apps.

| Video   | Length | Entry                | Shows                                                                  |
| ------- | ------ | -------------------- | ---------------------------------------------------------------------- |
| Patient | ~72 s  | `src/index.ts`       | The tablet (`@bell/ui`): Hey Bell, English to Chinese, emergency, Voice only and touch, a fasting menu |
| Staff   | ~49 s  | `src/staff/index.ts` | Ruth's request flying from her tablet into the staff app (`apps/staff`), approve and back to her, Bell handled, Tasks |

```
pnpm --filter @bell/demo-video studio          # preview the patient video
pnpm --filter @bell/demo-video studio:staff    # preview the staff video (renders Ruth's clip first)
pnpm --filter @bell/demo-video render          # out/bell-patient-demo.mp4
pnpm --filter @bell/demo-video render:staff    # out/bell-staff-demo.mp4 (renders Ruth's clip first)
```

The staff video shows Ruth's tablet next to the staff screen. The two can't share a stylesheet,
so her tablet is its own composition in the patient bundle (`RuthTablet`, `src/scenes/ruth.ts`),
rendered by `pnpm clips` to `public/generated/ruth-tablet.mp4` and played inside the staff video.
Both follow one timeline, `src/story.ts`.

The two entries are separate bundles because the tablet and the staff app each have their own
Tailwind theme (`text-sm`, `--muted` and the radii mean different things in each).

- `src/patient-demo.tsx`, `src/scenes/`, `src/tablet/`: the patient video. Each scene says what
  the tablet shows at every frame, where the taps land, and the captions beside it.
- `src/staff/`: the staff video. `script.ts` is the timeline (states, clicks, camera, toasts,
  captions); `staff-screen.tsx` lays out the staff app around its real parts (the shell and the
  parts that fetch are rebuilt there); `data.ts` is Priya's shift, mostly from the demo seed.
  `@/` resolves into `apps/staff` (see `remotion.config.ts`).
- `src/stage/`: shared pieces (captions, the Bell mark and lockup, the tap indicator).
- `src/lib/css-clock.tsx`: drives the UI's CSS animations frame by frame.

Times are written in seconds via `s()`.

# Bergamot — notes for Claude

- Owner's app: Mind — a strong journal and notes, plus tasks, habits, the day log and the guided start. Split from Citrus Maxima (Amaerys/citrus-maxima) on 16/11/2026, after Mandarin, Clementine and Calamansi. Plain English in the UI, dates dd/mm/yyyy, the week starts on Sunday.
- One data owner per kind: the journal (entries, reflections), notes, tasks, habits and their ticks, the day log → Bergamot. Goals (aims, resolutions, time goals) → Citrus Plan: Bergamot only links to them by id and reads `hub/citrus/plan.json › goals`. Shifts → Mandarin (`hub/mandarin/shifts.json`, read by `roster.js`, turned into kinds of day by `day.js`). People → Clementine. The media library → Sudachi (later). Never write into another app's Drive folder.
- Drive contract: `HUB.md` in the Citrus repo. Bergamot writes `My Apps/hub/bergamot/{state,status}.json` and `backups/`. It reads `hub/mandarin/shifts.json`, `hub/citrus/plan.json` (goals), `hub/claude/status.json` (the inbox: it takes `task` and `note` items, after a tap), `hub/<app>/status.json` for apps a habit counts from, and once `hub/citrus/state.json` (the Mind migration, with Undo and a before-migration backup).
- Folders are found by tag, never by path (`claude/drive-layout.md`): `G.appFolder(root, app)` queries `appProperties.citrusApp`, oldest wins, cached and checked once per session; nothing tagged → the old path `My Apps/hub/<app>`. Bergamot creates and tags only its own folder there, never moves or renames it (Citrus does), and status.json says `drive: { byTag: true }`.
- Journal text and note bodies never go into `status.json`: only counts, mood numbers and titles. Tests check this.
- The journal lock is per device (localStorage `bergamot.lock`: a salted PBKDF2 hash, never the PIN, never synced). It hides the journal (and journal search) only; it is not encryption.
- Every delete and bulk change has Undo (`ctx.undoTo(before)` = replaceState with `exact`, so it holds on every device). Habit ticks (`habitLog`) merge cell by cell.
- Owner's facts the logic depends on: GP in Riyadh (Asia/Riyadh), 12-hour shifts 08:00–20:00 / 20:00–08:00, sleeps after nights.
- Before every deploy: `bash test/all.sh` must pass, then `sh scripts-bump.sh` (service worker module list and cache name).
- Never commit real names, journal words, notes or places: tests use made-up data (`test/fixture.mjs`); real data stays out of the repo (`test/data/` is git-ignored).
- Browser tests pin the clock (`page.clock.install`) and run in Asia/Riyadh.
- Keep `tools/check-imports.mjs` green. `tools/icons.mjs` redraws the PNG icons from `docs/icons/icon.svg`; `tools/css-prune.mjs` drops CSS rules for classes nothing uses.
- Add seminal upgrades to the App Building Master Log (skill: app-master-log).

# SOP: Browser Download and Sort

## Goal
Download target files from a known web page and sort them into policy-approved folders.

## Inputs
- `url`
- `download_selector` or deterministic navigation steps
- `destination_root` (must be allowlisted)
- optional file naming rule

## Preconditions
- Browser toolchain available.
- Destination root is in allowlist.
- If login required, credentials path is explicitly approved.

## Procedure
1. `browser.open` target URL.
2. Optional login steps using approved selectors only.
3. Navigate deterministically to download trigger.
4. `browser.download` and capture file path.
5. Validate filename/type against expected pattern.
6. `fs.move` file to destination subfolder.
7. Emit artifact event with final path.

## Failure Handling
- Selector not found: retry with bounded alternate selector map.
- Download timeout: bounded retry.
- Destination blocked by policy: halt and request approval/update.

## Outputs
- Moved file artifact paths.
- Event timeline with download metadata and any retry history.


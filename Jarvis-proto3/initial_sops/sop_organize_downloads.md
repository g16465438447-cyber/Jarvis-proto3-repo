# SOP: Organize Downloads

## Goal
Sort files in Downloads into categorized folders using deterministic rules.

## Inputs
- `downloads_path`
- category rules (extension/name patterns -> destination subfolders)

## Preconditions
- Downloads root and target folders are allowlisted.
- Rule conflicts resolved before execution.

## Procedure
1. `fs.list` current files in Downloads.
2. Classify each file by first matching deterministic rule.
3. Create missing destination folders if policy allows.
4. `fs.move` files to destination folders.
5. Emit move summary artifact.

## Failure Handling
- Rule conflict: halt and output conflict list.
- Move permission error: retry once then mark failed.

## Outputs
- Categorized folder structure.
- File move report artifact.


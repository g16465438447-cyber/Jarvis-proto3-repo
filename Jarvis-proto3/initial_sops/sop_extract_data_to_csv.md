# SOP: Extract Data to CSV

## Goal
Extract structured fields from local source files and produce a normalized CSV.

## Inputs
- `input_paths` (files/folder in allowlisted roots)
- extraction field map
- `output_csv_path`

## Preconditions
- Input files exist and are readable.
- Output path is allowlisted and writable.

## Procedure
1. `fs.list`/`fs.search` candidate files.
2. For each file, run `extract.text` or `extract.table`.
3. Validate required fields per row.
4. Normalize formats (dates, numeric, currency).
5. Write CSV to output path.
6. Register CSV as artifact.

## Failure Handling
- Parse failure on file: log file-level error; continue if policy allows partial.
- Missing required fields: flag row and include error reason.

## Outputs
- CSV artifact path.
- Summary counts: processed, failed, skipped.


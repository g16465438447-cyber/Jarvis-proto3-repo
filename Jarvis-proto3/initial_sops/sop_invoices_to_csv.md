# SOP: Invoices to CSV Pipeline

## Goal
From an invoice folder: rename files, extract totals, and produce a consolidated CSV.

## Inputs
- `invoice_folder`
- rename convention
- required fields (`invoice_id`, `date`, `vendor`, `total`)
- `output_csv_path`

## Preconditions
- Invoice folder and output path are allowlisted.
- Field extraction templates defined for expected invoice formats.

## Procedure
1. Run rename pass (deterministic pattern + collision checks).
2. Extract fields from each invoice file.
3. Validate required fields and normalize amounts.
4. Append valid rows to CSV dataset.
5. Write CSV and register artifact.
6. Emit summary (valid rows, invalid rows, error reasons).

## Failure Handling
- Rename collision: halt and rollback.
- Extraction mismatch: add to failure list and continue if partial allowed.

## Outputs
- Consolidated CSV.
- Exception report for failed invoice parses.


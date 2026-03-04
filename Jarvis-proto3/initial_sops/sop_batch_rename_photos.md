# SOP: Batch Rename Photos

## Goal
Apply deterministic rename rules to photo files in an allowlisted folder.

## Inputs
- `source_folder`
- `pattern` (e.g., `trip_YYYYMMDD_{index}`)
- optional filter (`.jpg`, `.png`)

## Preconditions
- Source folder is allowlisted.
- Rename pattern validated and collision-safe.

## Procedure
1. `fs.list` files matching filter.
2. Sort by deterministic key (created time or filename).
3. Generate target names.
4. Validate no collisions.
5. Execute rename sequence (`fs.rename`) with rollback map.
6. Log before/after filename mapping artifact.

## Failure Handling
- Name collision: halt and return collision report.
- Partial failure: rollback successful renames via reverse map.

## Outputs
- Renamed file set.
- Rename map artifact (`old_name -> new_name`).


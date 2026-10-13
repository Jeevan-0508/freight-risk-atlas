# Getting started

## Run the tool

Freight Risk Atlas is a static browser tool. Serve the repository so the page can load `taxonomy.json`:

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173/docs/`.

## Use the assessment workflow

1. Scope a movement by geography, mode, and stage.
2. Review only indicators observable in that scope.
3. Mark an indicator present only when you have a source you could show.
4. Read the patterns ranked by in-scope indicator coverage.
5. Clear the false-positive gates before treating a pattern as a finding.
6. Export the assessment when you need a portable record of the inputs and outputs.

## Validate the model

```bash
python3 scripts/check_figures.py
python3 scripts/inspect_site.py
```

The scripts check README figures and the deployed site/model relationship. Use `scripts/sync_taxonomy.py` only when deliberately updating the deployment copy from `data/taxonomy.json`.

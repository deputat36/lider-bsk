#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'crm/v4/assets/v4/calculations.js'
text = path.read_text(encoding='utf-8')
old = "  const catalogClient = isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl) ? null : supabaseClient;\n  calculationCatalogLoadPromise = loadCalculationCatalog({ supabaseClient: catalogClient, fallbackRows: CATALOG }).then((result) => {"
new = "  calculationCatalogLoadPromise = loadCalculationCatalog({ supabaseClient, fallbackRows: CATALOG }).then((result) => {"
if old not in text:
    raise SystemExit('expected staging catalog bypass marker not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')

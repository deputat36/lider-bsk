#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'crm' / 'v4' / 'assets' / 'v4' / 'calculations.js'
text = path.read_text(encoding='utf-8')
needle = "  calculationCatalogLoadPromise = loadCalculationCatalog({ supabaseClient, fallbackRows: CATALOG }).then((result) => {"
replacement = "  const catalogClient = isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl) ? null : supabaseClient;\n  calculationCatalogLoadPromise = loadCalculationCatalog({ supabaseClient: catalogClient, fallbackRows: CATALOG }).then((result) => {"
if replacement in text:
    print('staging catalog no-network guard already present')
    sys.exit(0)
if needle not in text:
    raise SystemExit('Missing ensureCalculationCatalog load marker')
text = text.replace(needle, replacement, 1)
path.write_text(text, encoding='utf-8')
print('staging catalog no-network guard applied')

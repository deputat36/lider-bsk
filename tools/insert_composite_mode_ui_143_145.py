#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'crm/v4/assets/v4/calculations.js'
text = path.read_text(encoding='utf-8')
render_start = text.find("function renderModeFields(mode = 'banner') {")
render_end = text.find('\nfunction area()', render_start)
if render_start < 0 or render_end < 0:
    raise SystemExit('renderModeFields region not found')
region = text[render_start:render_end]
if "if (mode === 'composite')" in region and '<b>Составное изделие:</b>' in region:
    print('Composite mode UI already present')
    raise SystemExit(0)
marker = region.find("  if (mode === 'banner') {")
if marker < 0:
    raise SystemExit('renderModeFields banner marker not found')
absolute = render_start + marker
block = r'''  if (mode === 'composite') {
    return `
      <div class="v4-calc-mode-help"><b>Составное изделие:</b> соберите изделие из материалов и работ. В расчёте оно сохраняется одной позицией, а для клиента можно показать одну итоговую строку или только выбранные компоненты.</div>
      <div class="v4-form-grid">
        <label>Название изделия<input id="calcCompositeTitle" placeholder="Например: Световая вывеска 3×1 м"></label>
        <label>Как показать клиенту
          <select id="calcCompositeVisibility"><option value="single_line">Одной строкой</option><option value="detailed">Подробно по компонентам</option></select>
        </label>
        <label>Итог клиенту вручную, ₽<input id="calcCompositeClient" type="number" min="0" step="1" placeholder="Для одной строки; пусто = сумма компонентов / общая наценка"></label>
        <label>Комментарий<input id="calcCompositeComment" placeholder="Что входит в комплект"></label>
      </div>
      <div id="calcCompositeComponents">
        ${renderCompositeComponentRow(0)}
        ${renderCompositeComponentRow(1)}
      </div>
      <div class="v4-form-actions"><button id="calcCompositeAddComponentBtn" type="button">+ Добавить компонент</button></div>
      <div class="v4-calc-mode-help">В режиме «Подробно» цена изделия для расчёта равна сумме только отмеченных клиентских компонентов. Скрытые расходы остаются внутренними.</div>
    `;
  }
'''
text = text[:absolute] + block + text[absolute:]
path.write_text(text, encoding='utf-8')
print('Composite mode UI inserted into renderModeFields')

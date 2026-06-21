function renderCalculationsPlaceholder() {
  const box = document.getElementById('calculationsBox');
  if (!box) return;
  box.innerHTML = `
    <section class="v4-subcard">
      <h3>Расчёты</h3>
      <div class="v4-empty">Расчётный модуль будет перенесён отдельным пакетом. Заявки, карточка, потребности, контроль контактов и аудит уже могут работать без падения интерфейса.</div>
    </section>
  `;
}

function bootCalculationsPlaceholder() {
  renderCalculationsPlaceholder();
  document.addEventListener('leader-v4:lead-card-rendered', renderCalculationsPlaceholder);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootCalculationsPlaceholder);
else bootCalculationsPlaceholder();

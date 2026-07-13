document.addEventListener('DOMContentLoaded', function () {
  window.setTimeout(function () {
    document.querySelectorAll('[name="message"]').forEach(function (field) {
      if (!field.value.trim()) {
        field.value = 'Срочная заявка: нужно быстро рассчитать рекламу. Срок: ';
      }
    });
  }, 700);
});

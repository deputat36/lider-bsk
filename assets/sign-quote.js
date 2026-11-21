// Tailor the existing request form to a sign project; submission and attribution stay in the shared form.
(function () {
  'use strict';
  function init() {
    const host = document.querySelector('#leader-lead-form[data-sign-task]');
    const form = host && host.querySelector('form');
    if (!form) return;
    const city = form.elements.city;
    const delivery = form.elements.delivery;
    const message = form.elements.message;
    const row = message.parentElement;
    const cityList = document.createElement('datalist');
    cityList.id = city.id + '-options';
    ['Борисоглебск', 'Поворино', 'Грибановский'].forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      cityList.appendChild(option);
    });
    city.after(cityList);
    city.setAttribute('list', cityList.id);
    city.labels[0].textContent = 'Где находится объект?';
    city.placeholder = 'Выберите или введите населённый пункт';
    delivery.labels[0].textContent = 'Нужен ли монтаж?';
    row.before(city.parentElement, delivery.parentElement);
    const discuss = Array.from(delivery.options).find(option => option.value === 'Нужно обсудить');
    discuss.defaultSelected = true;
    delivery.value = discuss.value;
    form.elements.quantity.placeholder = 'Например, одна вывеска шириной 3 м';
    const explicitChoice = new URLSearchParams(location.search);
    function preset() {
      if (form.elements.service.value !== 'Вывеска / наружная реклама') return;
      message.placeholder = host.dataset.signPlaceholder;
      if (explicitChoice.has('offer') || explicitChoice.has('scenario')) return;
      const task = form.elements.namedItem('brief_0');
      if (task && !task.value) task.value = host.dataset.signTask;
      if (message.value === form.__leaderAutoMessage) {
        message.value = '';
        form.__leaderAutoMessage = '';
      }
    }
    preset();
    form.addEventListener('reset', () => queueMicrotask(preset));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

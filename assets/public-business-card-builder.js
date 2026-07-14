(function(){
  'use strict';

  document.addEventListener('DOMContentLoaded', function(){
    var box = document.getElementById('card-calc');
    var summary = document.getElementById('card-summary');

    function valueOf(name){
      var element = box && box.querySelector('[data-calc="' + name + '"]');
      return element ? element.value : '';
    }

    function buildSummary(){
      return [
        'Заказ: визитки',
        'Вид: ' + valueOf('kind'),
        'Формат: ' + valueOf('format'),
        'Стороны печати: ' + valueOf('sides'),
        'Тираж: ' + valueOf('qty'),
        'Бумага: ' + valueOf('paper'),
        'Ламинация: ' + valueOf('lamination'),
        'Скругление углов: ' + valueOf('corners'),
        'Макет / дизайн: ' + valueOf('design')
      ].join('\n');
    }

    function updateSummary(){
      if(summary){
        summary.textContent = buildSummary();
      }
    }

    function ensureOption(select, value){
      if(!select){
        return;
      }
      for(var i = 0; i < select.options.length; i += 1){
        if(select.options[i].value === value){
          return;
        }
      }
      select.add(new Option(value, value));
    }

    if(box){
      box.addEventListener('change', updateSummary);
      updateSummary();
    }

    var button = document.getElementById('send-card-summary');
    if(button){
      button.addEventListener('click', function(){
        var message = document.querySelector('[name="message"]');
        var service = document.querySelector('[name="service"]');
        if(service){
          ensureOption(service, 'Визитки');
          service.value = 'Визитки';
        }
        if(message){
          message.value = buildSummary();
        }
        var requestSection = document.getElementById('request');
        if(requestSection){
          requestSection.scrollIntoView({behavior:'smooth'});
        }
      });
    }
  });
})();

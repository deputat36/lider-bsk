(function(){
  'use strict';

  document.addEventListener('DOMContentLoaded', function(){
    var box = document.getElementById('card-calc');
    var summary = document.getElementById('card-summary');
    var customQtyField = document.getElementById('card-custom-qty-field');
    var customQty = document.getElementById('card-custom-qty');
    var lastSummary = '';

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
        'Тираж: ' + quantity(),
        'Бумага: ' + valueOf('paper'),
        'Ламинация: ' + valueOf('lamination'),
        'Скругление углов: ' + valueOf('corners'),
        'Макет / дизайн: ' + valueOf('design')
      ].join('\n');
    }

    function quantity(){
      if(valueOf('qty') !== 'Другой тираж') return valueOf('qty');
      return customQty.value && customQty.checkValidity()
        ? Number(customQty.value) + ' шт.'
        : 'Укажите свой тираж';
    }

    function updateSummary(){
      var custom = valueOf('qty') === 'Другой тираж';
      if(customQtyField) customQtyField.hidden = !custom;
      if(customQty){
        customQty.disabled = !custom;
        customQty.required = custom;
      }
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
      box.addEventListener('input', updateSummary);
      updateSummary();
    }

    var button = document.getElementById('send-card-summary');
    if(button){
      button.addEventListener('click', function(){
        if(!box || !customQty || !customQty.reportValidity()) return;
        var message = document.querySelector('[name="message"]');
        var service = document.querySelector('[name="service"]');
        var form = message && message.closest('form');
        if(service){
          ensureOption(service, 'Визитки');
          service.value = 'Визитки';
          service.dispatchEvent(new Event('change', {bubbles:true}));
        }
        if(message){
          var nextSummary = buildSummary();
          if(lastSummary && message.value.includes(lastSummary)){
            message.value = message.value.replace(lastSummary, nextSummary);
          }else if(!message.value || message.value === message.defaultValue){
            message.value = nextSummary;
          }else{
            message.value = nextSummary + '\n\n' + message.value;
          }
          lastSummary = nextSummary;
          message.dispatchEvent(new Event('input', {bubbles:true}));
        }
        if(form){
          var quantityField = form.querySelector('[name="quantity"]');
          if(quantityField) quantityField.value = quantity();
          var mockup = form.querySelector('[name="mockup"]');
          if(mockup){
            var design = valueOf('design');
            mockup.value = design === 'Нужен дизайн с нуля'
              ? 'Макета нет, нужен дизайн'
              : design === 'Есть пример, нужно доработать' ? design : 'Макет готов';
            mockup.dispatchEvent(new Event('change', {bubbles:true}));
          }
        }
        var requestSection = document.getElementById('request');
        if(requestSection){
          requestSection.scrollIntoView({behavior:'smooth'});
        }
      });
    }
  });
})();

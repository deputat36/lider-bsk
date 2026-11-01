(function(){
  function applyContactsPreset(){
    var query=new URLSearchParams(location.search);
    var catalog=window.LeaderServiceCatalog;
    if((catalog&&catalog.find(query.get('service')))||query.get('scenario'))return;
    var form=document.querySelector('[data-leader-lead-widget]');
    if(!form)return;
    var service=form.querySelector('[name="service"]');
    var message=form.querySelector('[name="message"]');
    if(service){
      for(var i=0;i<service.options.length;i++){
        if(service.options[i].value==='Другое'){
          service.value='Другое';
          break;
        }
      }
    }
    if(message&&!message.value){
      message.value='Страница контактов. Нужна консультация и расчёт рекламной задачи.';
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyContactsPreset);else applyContactsPreset();
})();

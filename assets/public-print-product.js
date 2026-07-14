(function(){
  function applyPrintProductPreset(){
    var page=document.body;
    if(!page||!page.classList.contains('page-print-product'))return;
    var serviceName=page.getAttribute('data-lead-service')||'Полиграфия';
    var defaultMessage=page.getAttribute('data-lead-message')||'';
    var form=document.querySelector('[data-leader-lead-widget]');
    if(!form)return;
    var service=form.querySelector('[name="service"]');
    var message=form.querySelector('[name="message"]');
    if(service){
      var found=false;
      for(var i=0;i<service.options.length;i++){
        if(service.options[i].value===serviceName){found=true;break;}
      }
      if(!found)service.add(new Option(serviceName,serviceName));
      service.value=serviceName;
    }
    if(message&&!message.value&&defaultMessage)message.value=defaultMessage;
  }
  document.addEventListener('DOMContentLoaded',function(){setTimeout(applyPrintProductPreset,120);});
})();

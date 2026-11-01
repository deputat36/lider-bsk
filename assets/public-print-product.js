(function(){
  function applyPrintProductPreset(){
    var query=new URLSearchParams(location.search);
    var catalog=window.LeaderServiceCatalog;
    if((catalog&&catalog.find(query.get('service')))||query.get('scenario'))return;
    var page=document.body;
    if(!page||(!page.hasAttribute('data-lead-service')&&!page.hasAttribute('data-lead-message')))return;
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
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyPrintProductPreset);else applyPrintProductPreset();
})();
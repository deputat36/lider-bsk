document.addEventListener('DOMContentLoaded',function(){
  setTimeout(function(){
    var form=document.querySelector('[data-leader-lead-widget]');
    if(!form)return;
    var message=form.querySelector('[name="message"]');
    if(message&&!message.value){
      message.value='Страница «Как проходит заказ». Нужна консультация и расчёт рекламной задачи.';
    }
  },120);
});

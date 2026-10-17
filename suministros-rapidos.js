/* Accesos rápidos de suministros: comparten los límites de la venta normal. */
(function(){'use strict';
 const names=new Set(['Trapo','Aceite de Arma']);
 for(const input of inputs){
  if(!names.has(input.dataset.name))continue;
  const qty=input.closest('.qty');if(!qty||qty.querySelector('.quick'))continue;
  const group=document.createElement('div');group.className='quick';
  for(const amount of [5,10,20]){
   const button=document.createElement('button');button.type='button';button.textContent='+'+amount;
   button.setAttribute('aria-label','Añadir '+amount+' · '+input.dataset.name);
   button.onclick=()=>{input.value=Math.min(MAX_QTY,readQty(input)+amount);calc();};
   group.appendChild(button);
  }
  qty.appendChild(group);
 }
 calc(false);
})();

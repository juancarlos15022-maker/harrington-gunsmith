(function(){'use strict';const identity=()=>typeof ME!=='undefined'&&ME&&typeof AUTH!=='undefined'&&AUTH&&ME.id===AUTH.emp&&!SANDBOX?AUTH.emp:'';
 HGAdminWeb.setAdapter({identity,load:()=>sbRpc('hg_admin_web_panel',{p_pedidos:false})});
 for(const name of ['applyMe','authSave','authClear']){const old=window[name];window[name]=function(){const r=old.apply(this,arguments);HGAdminWeb.refresh();return r}}
})();

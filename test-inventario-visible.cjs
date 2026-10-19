const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(__dirname+'/inventario-jefes.js','utf8');
for(const [chief,boss,same,expected]of [[true,false,true,false],[true,true,true,false],[false,false,true,true],[false,true,true,true],[true,false,false,true]]){
 const button={hidden:true};const c={ME:{id:'chief'},AUTH:{emp:same?'chief':'other'},bossActive:boss,soyJefe:()=>chief,document:{getElementById:()=>button},invView:'',setBoss(){},applyMe(){},renderInv(){},invModal:{addEventListener(){}},closeModal(){}};vm.createContext(c);vm.runInContext(src,c);assert.equal(button.hidden,expected);c.applyMe();assert.equal(button.hidden,expected);
}
console.log('PASS: visible para jefes con Dirección desactivada; oculto para empleados y sesión ajena');
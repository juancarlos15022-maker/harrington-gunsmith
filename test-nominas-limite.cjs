const {test}=require('node:test'),assert=require('node:assert/strict');
const {limitar}=require('./nominas-limite.js');
const h=3600000,base={base:5000,c:10,desc:0,pay:23800,extra:37.6*h,worked:47.6*h};
test('nómina: 50 dólares por 10 horas, máximo 25 dólares por cinco extras',()=>{const k=limitar(base);assert.equal(k.pay,7500);assert.equal(k.ext,2500);assert.equal(k.extra,5*h);assert.equal(k.worked,base.worked);assert.equal(k.extraReal,base.extra);assert.equal(k.extraNoPagada,base.extra-5*h);});
test('nómina: paga fracciones por debajo del límite y conserva descuentos',()=>{assert.equal(limitar({...base,extra:1.5*h}).pay,5750);assert.equal(limitar({...base,extra:0,desc:1000}).pay,4000);assert.equal(limitar({...base,extra:5*h}).pay,7500);});
test('nómina: tarifa individual, recálculo estable e historial pagado intacto',()=>{assert.equal(limitar({...base,base:2000}).pay,3000);const capped=limitar(base);assert.deepEqual(limitar(capped),capped);const paid={...base,paid:{id:'anterior'}};assert.equal(limitar(paid),paid);});

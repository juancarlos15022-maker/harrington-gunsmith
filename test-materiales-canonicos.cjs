const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('proveedores: cañones con y sin tilde producen un mismo nombre sin tilde',()=>{
 const source=fs.readFileSync(__dirname+'/app.js','utf8'),c={norm:s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),matNames:()=>['Cañón de pistola']};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('const MAT_ALIAS='),source.indexOf('function recipeOf')),c);
 for(const family of ['rifle','pistola','revólver','escopeta','repetidora'])for(const prefix of ['Cañón','Cañon','canon']){assert.equal(c.canonMat(prefix+' de '+family),'Cañon de '+family);assert.equal(c.sameMat(prefix+' de '+family,'Cañon de '+family),true);}
 assert.equal(c.canonMat('Doble Cañón Escopeta'),'Doble Cañón Escopeta');
});

/** Deterministic fictional map; no React/Pixi dependencies. */
export type CountryId = 'aurelia' | 'nordland' | 'vesperia' | 'meridia' | 'solmere';
export interface Country {id:CountryId;name:string;color:number;treasury:number;}
export interface Province {id:string;name:string;col:number;row:number;ownerId:CountryId;industry:number;capital:boolean;terrain:string;}
export const COUNTRIES:readonly Country[]=[
{id:'aurelia',name:'奥瑞利亚王国',color:0xc67e67,treasury:100},
{id:'nordland',name:'北境联盟',color:0x8cb9ce,treasury:110},
{id:'vesperia',name:'维斯佩里亚领邦',color:0xb4a1d2,treasury:100},
{id:'meridia',name:'梅里迪亚同盟',color:0x79b69a,treasury:90},
{id:'solmere',name:'索尔梅尔共和国',color:0xdfb96f,treasury:90}
];
const excluded=new Set(['0,0','1,0','9,0','0,1','9,1','0,5','1,5','8,5','9,5','9,4','0,4']);
const names=["阿尔登","鸦堡","西渡","哈罗","蔷薇丘","灰烬谷","铁港","邓沼","黑苇泽","霜港","白隘","北望","石门","柯克林","狼巢","雪境","鹰渡","风暴堡","银冠","东境","长田","松林堡","永湖","黎明堡","晨辉","瓦伦","石桥","灰湖","旧港","翠原","金港","日境","琥珀岸","赤水","柏树林","溪畔","云雀原","橡木湖","炉石","高崖","岭关","苔渡","冠丘","蓝湾","风湖","下田","狐铃","清泉","苍冠","沼尽","隼岭","海湾林","南港","烬火","东岬","塔恩堡","河湾","飞龙","金冠","空谷"];
function owner(col:number,row:number):CountryId {if(row>=4&&col<=4)return 'solmere';if(col<=2)return 'aurelia';if(row<=1)return 'nordland';if(col>=7)return 'vesperia';return 'meridia';}
const capitals:Record<CountryId,string>={aurelia:'1,2',nordland:'5,1',vesperia:'8,3',meridia:'5,3',solmere:'3,4'};
export const PROVINCES:readonly Province[]=Array.from({length:60},(_,i)=>{const col=i%10,row=Math.floor(i/10),ownerId=owner(col,row),id=col+','+row;return{id,name:names[i],col,row,ownerId,industry:1+(col*7+row*11)%5,terrain:['plains','forest','hills','plains','mountains'][(col*3+row*7)%5],capital:capitals[ownerId]===id};}).filter(p=>!excluded.has(p.id));
export function countryById(id:CountryId):Country {return COUNTRIES.find(c=>c.id===id)!;}
export function provinceById(id:string):Province|undefined {return PROVINCES.find(p=>p.id===id);}

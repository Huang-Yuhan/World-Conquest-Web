/** Deterministic fictional map; no React/Pixi dependencies. */
export type CountryId = 'aurelia' | 'nordland' | 'vesperia' | 'meridia' | 'solmere';
export interface Country {id:CountryId;name:string;color:number;treasury:number;}
export interface Province {id:string;name:string;col:number;row:number;ownerId:CountryId;industry:number;capital:boolean;terrain:string;}
export const COUNTRIES:readonly Country[]=[
{id:'aurelia',name:'Kingdom of Aurelia',color:0xc67e67,treasury:100},
{id:'nordland',name:'Nordland Union',color:0x8cb9ce,treasury:110},
{id:'vesperia',name:'Vesperian Dominion',color:0xb4a1d2,treasury:100},
{id:'meridia',name:'Meridian League',color:0x79b69a,treasury:90},
{id:'solmere',name:'Republic of Solmere',color:0xdfb96f,treasury:90}
];
const excluded=new Set(['0,0','1,0','9,0','0,1','9,1','0,5','1,5','8,5','9,5','9,4','0,4']);
const names=['Arden','Ravenholm','Westford','Harrow','Rosehill','Ashvale','Ironwick','Dunmere','Blackfen','Frostport','Whitepass','Northwatch','Stonegate','Kirkwood','Wolfden','Snowreach','Eagleford','Stormhold','Silvercrest','Eastmarch','Longfield','Pinehold','Evermere','Dawnkeep','Brightfall','Valen','Stonebridge','Greymere','Oldhaven','Greenfield','Goldhaven','Sunreach','Ambercoast','Redwater','Cypress','Brookside','Larkspur','Oakmere','Hearthwick','Highcliff','Ridgegate','Mossford','Crestwick','Blueharbor','Windmere','Lowerfield','Foxglove','Clearwater','Palecrest','Marshend','Falconridge','Baywood','Southport','Cinderfall','Eastpoint','Tarnholm','Riverbend','Wyvern','Goldcrest','Hollowgate'];
function owner(col:number,row:number):CountryId {if(row>=4&&col<=4)return 'solmere';if(col<=2)return 'aurelia';if(row<=1)return 'nordland';if(col>=7)return 'vesperia';return 'meridia';}
const capitals:Record<CountryId,string>={aurelia:'1,2',nordland:'5,1',vesperia:'8,3',meridia:'5,3',solmere:'3,4'};
export const PROVINCES:readonly Province[]=Array.from({length:60},(_,i)=>{const col=i%10,row=Math.floor(i/10),ownerId=owner(col,row),id=col+','+row;return{id,name:names[i],col,row,ownerId,industry:1+(col*7+row*11)%5,terrain:['plains','forest','hills','plains','mountains'][(col*3+row*7)%5],capital:capitals[ownerId]===id};}).filter(p=>!excluded.has(p.id));
export function countryById(id:CountryId):Country {return COUNTRIES.find(c=>c.id===id)!;}
export function provinceById(id:string):Province|undefined {return PROVINCES.find(p=>p.id===id);}

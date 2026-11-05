/** 架空地图数据。只负责描述国家、省份及地图颜色。 */
export type CountryId = 'aurelia' | 'nordland' | 'vesperia' | 'meridia' | 'solmere';

export interface Country {
  id: CountryId;
  name: string;
  color: number;
}

export interface Province {
  id: string;
  name: string;
  col: number;
  row: number;
  ownerId: CountryId;
}

export const COUNTRIES: readonly Country[] = [
  { id: 'aurelia', name: '奥瑞利亚王国', color: 0xc67e67 },
  { id: 'nordland', name: '北境联盟', color: 0x8cb9ce },
  { id: 'vesperia', name: '维斯佩里亚领邦', color: 0xb4a1d2 },
  { id: 'meridia', name: '梅里迪亚同盟', color: 0x79b69a },
  { id: 'solmere', name: '索尔梅尔共和国', color: 0xdfb96f },
];

const provinceNames = [
  '阿尔登', '鸦堡', '西渡', '哈罗', '蔷薇丘', '灰烬谷', '铁港', '邓沼', '黑苇泽', '霜港',
  '白隘', '北望', '石门', '柯克林', '狼巢', '雪境', '鹰渡', '风暴堡', '银冠', '东境',
  '长田', '松林堡', '永湖', '黎明堡', '晨辉', '瓦伦', '石桥', '灰湖', '旧港', '翠原',
  '金港', '日境', '琥珀岸', '赤水', '柏树林', '溪畔', '云雀原', '橡木湖', '炉石', '高崖',
  '岭关', '苔渡', '冠丘', '蓝湾', '风湖', '下田', '狐铃', '清泉', '苍冠', '沼尽',
  '隼岭', '海湾林', '南港', '烬火', '东岬', '塔恩堡', '河湾', '飞龙', '金冠', '空谷',
];

const excluded = new Set([
  '0,0', '1,0', '9,0', '0,1', '9,1', '0,5', '1,5', '8,5', '9,5', '9,4', '0,4',
]);

function countryAt(col: number, row: number): CountryId {
  if (row >= 4 && col <= 4) return 'solmere';
  if (col <= 2) return 'aurelia';
  if (row <= 1) return 'nordland';
  if (col >= 7) return 'vesperia';
  return 'meridia';
}

export const PROVINCES: readonly Province[] = Array.from({ length: 60 }, (_, index) => {
  const col = index % 10;
  const row = Math.floor(index / 10);
  return {
    id: `${col},${row}`,
    name: provinceNames[index],
    col,
    row,
    ownerId: countryAt(col, row),
  };
}).filter((province) => !excluded.has(province.id));

export function countryById(id: CountryId): Country {
  return COUNTRIES.find((country) => country.id === id)!;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialGame,advanceTurn,recruitRegiment,RECRUIT_COST,weeklyIncome} from '../src/core/simulation.ts';
import {COUNTRIES,PROVINCES} from '../src/core/world.ts';
test('every country has a capital',()=>{for(const c of COUNTRIES){assert.ok(PROVINCES.some(p=>p.ownerId===c.id));assert.equal(PROVINCES.filter(p=>p.ownerId===c.id&&p.capital).length,1);}});
test('weekly turn generates correct income',()=>{const a=createInitialGame(),b=advanceTurn(a);assert.equal(b.date,'1936-01-08');assert.equal(b.turn,2);assert.equal(a.date,'1936-01-01');for(const c of COUNTRIES)assert.equal(b.treasury[c.id],a.treasury[c.id]+weeklyIncome(c.id));});
test('recruitment requires ownership and costs money',()=>{const a=createInitialGame(),own=PROVINCES.find(p=>p.ownerId===a.playerCountryId),foreign=PROVINCES.find(p=>p.ownerId!==a.playerCountryId);assert.ok(own&&foreign);assert.equal(recruitRegiment(a,foreign.id),null);const b=recruitRegiment(a,own.id);assert.ok(b);assert.equal(b.treasury[a.playerCountryId],a.treasury[a.playerCountryId]-RECRUIT_COST);});
test('recruitment fails when poor',()=>{const a=createInitialGame(),own=PROVINCES.find(p=>p.ownerId===a.playerCountryId);assert.ok(own);a.treasury[a.playerCountryId]=0;assert.equal(recruitRegiment(a,own.id),null);});
test('Chinese display names and campaign events',()=>{for(const c of COUNTRIES)assert.match(c.name,/\p{Script=Han}/u);for(const p of PROVINCES)assert.match(p.name,/\p{Script=Han}/u);const a=createInitialGame(),b=advanceTurn(a);assert.match(a.log[0].message,/阿斯特里亚/);assert.match(b.log[0].message,/工业/);});

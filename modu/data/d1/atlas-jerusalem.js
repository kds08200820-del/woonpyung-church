/* 예루살렘 시가지 도면 — 고도 자료 대신 언덕·골짜기·성벽·성전 산·못·문을 직접 그린다.
   좌표는 실제 위도·경도(WGS84)에 맞춰 두었으므로 다른 지도와 같은 투영을 쓴다.
   성벽 선은 발굴 결과를 바탕으로 한 통설을 단순화한 것이다(제3성벽 등 논쟁 중인 선은 점선). */
ATLAS_BASES.jerusalem = { vector:true, north:31.7875, west:35.2205, south:31.7665, east:35.2505 };

Object.assign(ATLAS_PLACES, {
  /* 지형 이름표 */
  jr_temple_mount:[31.7780,35.2354,'성전 산(모리아)','Temple Mount','p'], jr_city_of_david:[31.7728,35.2352,'다윗 성','City of David','p'],
  jr_ophel:[31.7757,35.2356,'오벨','Ophel','p'], jr_western_hill:[31.7758,35.2285,'서쪽 언덕(윗성)','Western Hill','p'], jr_zion:[31.7716,35.2288,'시온 산','Mt. Zion','p'],
  jr_olives:[31.7785,35.2448,'감람 산','Mt. of Olives','p'], jr_kidron:[31.7745,35.2392,'기드론 골짜기','Kidron Valley','w'], jr_tyropoeon:[31.7752,35.2330,'중앙 골짜기(두로베온)','Tyropoeon Valley','w'],
  jr_hinnom:[31.7705,35.2280,'힌놈 골짜기','Hinnom Valley','w'], jr_bezetha:[31.7825,35.2335,'베제다(새 성읍)','Bezetha','p'], jr_lower_city:[31.7740,35.2335,'아랫성','Lower City','p'],
  /* 물 */
  jr_gihon:[31.7737,35.2367,'기혼 샘','Gihon Spring','w'], jr_siloam:[31.7708,35.2338,'실로암 못','Pool of Siloam','w'], jr_bethesda:[31.7813,35.2361,'베데스다 못','Pool of Bethesda','w'],
  jr_enrogel:[31.7688,35.2373,'엔로겔','En-rogel','w'], jr_upper_pool:[31.7790,35.2300,'윗못','Upper Pool','w'],
  /* 구약 */
  jr_temple:[31.7780,35.2354,'성전','Temple','c'], jr_millo:[31.7762,35.2352,'밀로','Millo','x'], jr_davids_palace:[31.7748,35.2350,'다윗의 왕궁','David’s Palace','x'],
  jr_solomon_palace:[31.7768,35.2352,'솔로몬의 왕궁','Solomon’s Palace','x'], jr_broad_wall:[31.7788,35.2300,'넓은 성벽','Broad Wall','x'], jr_hezekiah_tunnel:[31.7722,35.2352,'히스기야 터널','Hezekiah’s Tunnel','w'],
  jr_kings_garden:[31.7695,35.2352,'왕의 동산','King’s Garden','x'], jr_tombs_kings:[31.7735,35.2345,'다윗 왕가의 묘','Tombs of the Kings','x'],
  /* 느헤미야의 문 (느 3장) — 자리는 추정 */
  jr_sheep_gate:[31.7803,35.2372,'양문','Sheep Gate','x'], jr_fish_gate:[31.7805,35.2322,'어문','Fish Gate','x'], jr_old_gate:[31.7800,35.2302,'옛문','Old Gate','x'],
  jr_ephraim_gate:[31.7788,35.2290,'에브라임 문','Ephraim Gate','x'], jr_valley_gate:[31.7722,35.2290,'골짜기 문','Valley Gate','x'], jr_dung_gate:[31.7702,35.2346,'분문','Dung Gate','x'],
  jr_fountain_gate:[31.7706,35.2352,'샘문','Fountain Gate','x'], jr_water_gate:[31.7738,35.2371,'수문','Water Gate','x'], jr_horse_gate:[31.7758,35.2372,'마문','Horse Gate','x'],
  jr_east_gate:[31.7772,35.2379,'동문','East Gate','x'], jr_muster_gate:[31.7787,35.2379,'함밉갓 문','Inspection Gate','x'], jr_tower_hananel:[31.7808,35.2345,'하나넬 망대','Tower of Hananel','x'],
  /* 신약 */
  jr_antonia:[31.7800,35.2343,'안토니아 요새','Antonia Fortress','c'], jr_herod_palace:[31.7765,35.2278,'헤롯의 궁(총독 관저)','Herod’s Palace','c'],
  jr_hasmonean:[31.7765,35.2322,'하스몬 궁','Hasmonean Palace','x'], jr_golgotha:[31.7784,35.2296,'골고다','Golgotha','x'], jr_tomb:[31.7791,35.2284,'예수의 무덤','Garden Tomb (traditional)','x'],
  jr_upper_room:[31.7716,35.2292,'다락방','Upper Room','x'], jr_caiaphas:[31.7727,35.2320,'가야바의 집','House of Caiaphas','x'], jr_gethsemane:[31.7794,35.2397,'겟세마네','Gethsemane','x'],
  jr_solomon_colonnade:[31.7782,35.2377,'솔로몬 행각','Solomon’s Colonnade','x'], jr_royal_stoa:[31.7760,35.2352,'왕의 행각','Royal Stoa','x'], jr_huldah:[31.7757,35.2358,'훌다 문','Huldah Gates','x'],
  jr_beautiful_gate:[31.7783,35.2362,'미문','Beautiful Gate','x'], jr_golden_gate:[31.7781,35.2384,'동문(황금문)','Golden Gate','x'], jr_akeldama:[31.7695,35.2325,'아겔다마','Akeldama','x'],
  jr_jaffa_gate:[31.7767,35.2275,'욥바 문','Jaffa Gate','x'], jr_damascus_gate:[31.7815,35.2300,'다메섹 문','Damascus Gate','x'], jr_gennath:[31.7770,35.2292,'겐낫 문','Gennath Gate','x'],
  jr_bethphage:[31.7770,35.2500,'벳바게 →','to Bethphage','p'], jr_bethany_dir:[31.7700,35.2500,'베다니 →','to Bethany','p'], jr_scopus:[31.7870,35.2440,'스코푸스 산 →','Mt. Scopus','p']
});

/* 도면 요소: 위도·경도 꼭짓점 목록 */
var ATLAS_JER = {
  hills:[ /* [중심 위도, 경도, 반지름(도), 세기] */
    [31.7782,35.2354,0.0020,.55],[31.7728,35.2352,0.0016,.5],[31.7760,35.2285,0.0032,.6],[31.7716,35.2288,0.0016,.45],[31.7790,35.2455,0.0045,.7],[31.7830,35.2340,0.0022,.35]
  ],
  valleys:{ kidron:[[31.7870,35.2385],[31.7830,35.2388],[31.7800,35.2392],[31.7770,35.2390],[31.7740,35.2388],[31.7715,35.2380],[31.7695,35.2365],[31.7675,35.2360]],
            tyropoeon:[[31.7830,35.2300],[31.7805,35.2315],[31.7780,35.2328],[31.7755,35.2335],[31.7730,35.2338],[31.7708,35.2340],[31.7695,35.2350]],
            hinnom:[[31.7830,35.2245],[31.7800,35.2245],[31.7770,35.2255],[31.7740,35.2262],[31.7715,35.2275],[31.7700,35.2300],[31.7692,35.2330],[31.7690,35.2352],[31.7675,35.2360]] },
  /* 성벽: 시대별 선. dash 는 논쟁 중인 선 */
  walls:{
    david:  { color:'#8a4b1f', pts:[[31.7762,35.2345],[31.7762,35.2360],[31.7752,35.2367],[31.7738,35.2373],[31.7718,35.2362],[31.7703,35.2347],[31.7712,35.2337],[31.7735,35.2340],[31.7752,35.2342],[31.7762,35.2345]] },
    solomon:{ color:'#8a4b1f', pts:[[31.7762,35.2345],[31.7795,35.2336],[31.7796,35.2372],[31.7762,35.2372]] },
    hezekiah:{ color:'#6d3f1a', pts:[[31.7795,35.2336],[31.7795,35.2300],[31.7788,35.2270],[31.7748,35.2264],[31.7716,35.2278],[31.7700,35.2320],[31.7703,35.2347]] },
    herod_temple:{ color:'#5a3517', fill:'rgba(120,80,40,.18)', pts:[[31.7758,35.2330],[31.7802,35.2330],[31.7802,35.2380],[31.7758,35.2380]] },
    second:{ color:'#5a3517', pts:[[31.7770,35.2292],[31.7790,35.2300],[31.7800,35.2318],[31.7800,35.2340]] },
    third:  { color:'#5a3517', dash:true, pts:[[31.7765,35.2278],[31.7830,35.2262],[31.7852,35.2320],[31.7832,35.2380],[31.7802,35.2378]] }
  },
  pools:{ siloam:[[31.7712,35.2333],[31.7712,35.2343],[31.7704,35.2343],[31.7704,35.2333]], bethesda:[[31.7817,35.2356],[31.7817,35.2366],[31.7809,35.2366],[31.7809,35.2356]], upper:[[31.7793,35.2297],[31.7793,35.2303],[31.7788,35.2303],[31.7788,35.2297]] },
  tunnel:[[31.7737,35.2367],[31.7728,35.2372],[31.7720,35.2360],[31.7714,35.2350],[31.7708,35.2338]],
  roads:[ [[31.7767,35.2275],[31.7770,35.2300],[31.7775,35.2330],[31.7758,35.2352]], [[31.7815,35.2300],[31.7800,35.2318],[31.7780,35.2328],[31.7758,35.2335],[31.7735,35.2338],[31.7708,35.2340]],
          [[31.7803,35.2372],[31.7794,35.2397],[31.7785,35.2448],[31.7770,35.2500]] ]
};

var ATLAS_MAPS_JER = [
{ id:'jer-david', title:'다윗과 솔로몬의 예루살렘', era:'BC 1000-930년', ref:'삼하 5:6-12; 왕상 6-9장; 대하 3장',
  match:[[10,5,9],[13,2,7],[18,48,48],[18,122,122],[18,125,125],[18,132,132],[18,46,46]], base:'jerusalem', bounds:[31.7830,35.2230,31.7680,35.2450],
  walls:['david','solomon'], places:['jr_temple','jr_millo','jr_davids_palace','jr_solomon_palace','jr_gihon','jr_enrogel','jr_kings_garden','jr_tombs_kings','jr_ophel','jr_city_of_david','jr_temple_mount','jr_western_hill','jr_olives'],
  emph:['jr_temple','jr_gihon','jr_davids_palace'],
  marks:[['jr_gihon','e','요압이 물길로 올라가 성을 빼앗음 · 솔로몬의 기름 부음(왕상 1:38)'],['jr_temple','e','아라우나의 타작마당 → 솔로몬 성전'],['jr_millo','e','다윗과 솔로몬이 쌓은 축대'],['jr_tombs_kings','e','다윗과 유다 왕들의 무덤']],
  waters:['jr_kidron','jr_tyropoeon','jr_hinnom'],
  text:'여부스 사람의 성은 기드론 골짜기와 중앙 골짜기 사이 좁은 능선 위에 있었고, 유일한 샘인 기혼은 성벽 밖 골짜기 바닥에 있어 수직 물길로 성 안에서 물을 길었다. 다윗은 이 물길(삼하 5:8)로 성을 빼앗아 다윗 성이라 불렀고, 밀로(축대)를 쌓아 성을 넓혔다. 솔로몬은 북쪽 높은 곳 아라우나의 타작마당에 성전을 세우고(대하 3:1) 그 사이에 왕궁을 두어, 성은 남쪽 다윗 성에서 북쪽 성전 산까지 길게 이어졌다. 시편이 노래하는 시온은 이 능선이고, 뒷날 "시온 산"이라 불리게 되는 서쪽 언덕은 아직 성 밖이었다.' },

{ id:'jer-hezekiah', title:'히스기야의 예루살렘 — 넓은 성벽과 실로암 터널', era:'BC 701년', ref:'왕하 20:20; 대하 32:1-5, 30; 사 22:9-11',
  match:[[11,20,20],[13,32,32],[22,22,22],[13,33,34]], base:'jerusalem', bounds:[31.7830,35.2230,31.7680,35.2450],
  walls:['david','solomon','hezekiah'], places:['jr_temple','jr_gihon','jr_siloam','jr_hezekiah_tunnel','jr_broad_wall','jr_upper_pool','jr_western_hill','jr_city_of_david','jr_temple_mount','jr_kings_garden','jr_enrogel','jr_olives','jr_valley_gate'],
  emph:['jr_gihon','jr_siloam','jr_hezekiah_tunnel','jr_broad_wall'],
  marks:[['jr_gihon','e','샘 어귀를 막고 물을 성 안으로 돌림'],['jr_siloam','e','터널 끝의 못 — 실로암 비문'],['jr_broad_wall','e','두께 7m — 북왕국 피난민으로 커진 성을 두름'],['jr_upper_pool','e','랍사게가 서서 외친 윗못 수도 곁(왕하 18:17)']],
  waters:['jr_kidron','jr_tyropoeon','jr_hinnom'],
  text:'앗시리아의 위협 앞에서 히스기야는 성 밖 기혼 샘의 물을 533m 길이의 바위 터널로 성 안 서남쪽 실로암 못까지 끌어들이고 샘 어귀를 막았다(왕하 20:20; 대하 32:30). 두 조가 양쪽에서 파 들어와 만난 자리에는 실로암 비문이 새겨져 있었다. 사마리아가 무너진 뒤 북쪽에서 온 피난민으로 성이 서쪽 언덕까지 커졌으므로, 히스기야는 그 언덕을 두르는 "넓은 성벽"(느 3:8)을 쌓고 무너진 곳을 고쳤다(대하 32:5). 산헤립의 사신 랍사게는 윗못 수도 곁 세탁자의 밭 큰길에 서서 성벽 위의 백성에게 외쳤다(왕하 18:17).' },

{ id:'jer-nehemiah', title:'느헤미야의 성벽과 열 문', era:'BC 445년', ref:'느 2:11-3:32; 12:27-43',
  match:[[15,2,3],[15,12,12]], base:'jerusalem', bounds:[31.7830,35.2230,31.7680,35.2450],
  walls:['david','solomon','hezekiah'], places:['jr_temple','jr_sheep_gate','jr_fish_gate','jr_old_gate','jr_ephraim_gate','jr_valley_gate','jr_dung_gate','jr_fountain_gate','jr_water_gate','jr_horse_gate','jr_east_gate','jr_muster_gate','jr_tower_hananel','jr_siloam','jr_gihon','jr_enrogel','jr_kings_garden','jr_city_of_david','jr_western_hill'],
  emph:['jr_sheep_gate','jr_valley_gate','jr_dung_gate','jr_fountain_gate','jr_water_gate'],
  routes:[{ name:'느헤미야의 밤 정찰 — 골짜기 문에서 나가 기드론을 따라 돌아옴 (느 2:13-15)', pts:['jr_valley_gate','jr_dung_gate','jr_fountain_gate','jr_water_gate','jr_valley_gate'], color:'#8e44ad', dash:true },
          { name:'봉헌식 두 찬양대 — 분문에서 갈라져 성벽 위로 (느 12:31-40)', pts:['jr_dung_gate','jr_fountain_gate','jr_water_gate','jr_horse_gate','jr_east_gate','jr_sheep_gate','jr_tower_hananel','jr_fish_gate','jr_old_gate','jr_ephraim_gate','jr_valley_gate','jr_dung_gate'], color:'#c0392b' }],
  marks:[['jr_sheep_gate','e','대제사장 엘리아십이 시작한 곳(느 3:1)'],['jr_water_gate','e','에스라가 율법을 읽은 광장(느 8:1)'],['jr_dung_gate','e','힌놈으로 쓰레기를 내가던 문']],
  waters:['jr_kidron','jr_tyropoeon','jr_hinnom'],
  text:'느헤미야는 도착한 지 사흘 뒤 밤에 골짜기 문으로 나가 힌놈과 기드론 골짜기를 따라 무너진 성벽을 살펴보았다(느 2:13-15). 느헤미야 3장은 양문에서 시작해 시계 반대 방향으로 어문·옛문·골짜기 문·분문·샘문·수문·마문·동문·함밉갓 문을 거쳐 다시 양문까지, 마흔 구역 넘는 공사를 맡은 사람들을 차례로 적는다. 오십이 일 만에 성벽이 완성되었고, 봉헌식 날 두 찬양대는 분문에서 갈라져 성벽 위를 반대 방향으로 돌아 성전에서 만났다(느 12:31-40). 성의 범위는 대체로 왕정 말기와 같았다고 본다.' },

{ id:'jer-passion', title:'고난 주간의 예루살렘 — 다락방에서 골고다까지', era:'AD 30/33년', ref:'마 26-27장; 막 14-15장; 눅 22-23장; 요 13-19장',
  match:[[39,26,27],[40,14,15],[41,22,23],[42,13,19]], base:'jerusalem', bounds:[31.7840,35.2230,31.7680,35.2470],
  walls:['hezekiah','herod_temple','second','third'], places:['jr_temple','jr_antonia','jr_herod_palace','jr_hasmonean','jr_upper_room','jr_caiaphas','jr_gethsemane','jr_golgotha','jr_tomb','jr_bethesda','jr_siloam','jr_solomon_colonnade','jr_royal_stoa','jr_akeldama','jr_gennath','jr_olives','jr_bezetha','jr_western_hill','jr_lower_city','jr_bethphage','jr_bethany_dir'],
  emph:['jr_upper_room','jr_gethsemane','jr_caiaphas','jr_herod_palace','jr_golgotha','jr_tomb'],
  routes:[{ name:'목요일 밤 — 다락방에서 기드론을 건너 겟세마네로 (요 18:1)', pts:['jr_upper_room','jr_caiaphas','jr_gethsemane'], color:'#2c6b5e' },
          { name:'체포 뒤 — 겟세마네 → 안나스·가야바의 집 → 총독 관저 (요 18:12-28)', pts:['jr_gethsemane','jr_caiaphas','jr_herod_palace'], color:'#8e44ad', dash:true },
          { name:'십자가의 길 — 관저에서 겐낫 문 밖 골고다로 (마 27:31-33)', pts:['jr_herod_palace','jr_gennath','jr_golgotha','jr_tomb'], color:'#c0392b' }],
  marks:[['jr_upper_room','e','최후의 만찬 · 발을 씻김'],['jr_gethsemane','e','기도 · 유다의 입맞춤 · 체포'],['jr_caiaphas','e','공회의 심문 · 베드로의 부인'],['jr_herod_palace','e','빌라도의 재판 · 채찍질'],['jr_hasmonean','e','헤롯 안디바 앞에 섬(눅 23:7)'],['jr_golgotha','e','십자가 — 당시 성벽 바로 밖'],['jr_tomb','e','아리마대 요셉의 새 무덤 · 부활'],['jr_akeldama','e','유다의 피밭'],['jr_temple','e','성소 휘장이 찢어짐']],
  waters:['jr_kidron','jr_tyropoeon','jr_hinnom'],
  text:'예수는 서쪽 언덕 윗성의 다락방에서 최후의 만찬을 드신 뒤 성을 나가 기드론 골짜기를 건너 감람 산 기슭 겟세마네에서 기도하다 잡히셨다(요 18:1). 결박되어 다시 골짜기를 올라 대제사장의 집에서 밤새 심문을 받았고, 아침에 총독 빌라도에게 넘겨졌는데 총독 관저는 서쪽 헤롯의 궁으로 보는 견해가 유력하다(안토니아 요새로 보는 전통도 있다). 골고다는 그때 성벽(제2성벽) 바로 밖 겐낫 문 근처 옛 채석장 자리로, 오늘의 성묘교회 터가 이에 해당하며, 무덤도 그 곁 동산에 있었다(요 19:41). 십여 년 뒤 아그립바 1세가 쌓은 제3성벽이 이 자리를 성 안으로 넣었다.' },

{ id:'jer-acts', title:'초대 교회의 예루살렘 — 오순절과 성전', era:'AD 30-35년', ref:'행 1-7장; 요 5장, 9장',
  match:[[43,1,7],[42,5,5],[42,9,9]], base:'jerusalem', bounds:[31.7840,35.2230,31.7680,35.2470],
  walls:['hezekiah','herod_temple','second','third'], places:['jr_temple','jr_solomon_colonnade','jr_beautiful_gate','jr_royal_stoa','jr_huldah','jr_antonia','jr_upper_room','jr_bethesda','jr_siloam','jr_olives','jr_gethsemane','jr_herod_palace','jr_bezetha','jr_western_hill','jr_lower_city','jr_sheep_gate','jr_golden_gate'],
  emph:['jr_upper_room','jr_solomon_colonnade','jr_beautiful_gate','jr_bethesda','jr_siloam'],
  marks:[['jr_olives','e','승천(행 1:12) — 안식일에 가기 알맞은 길'],['jr_upper_room','e','120명의 기도 · 오순절 성령'],['jr_beautiful_gate','e','베드로와 요한이 앉은뱅이를 고침(행 3:2)'],['jr_solomon_colonnade','e','사도들이 모여 가르친 곳(행 3:11; 5:12)'],['jr_bethesda','e','38년 된 병자(요 5:2)'],['jr_siloam','e','맹인이 씻고 봄(요 9:7)'],['jr_antonia','e','로마 수비대 — 뒤에 바울이 끌려 들어감(행 21:34)']],
  waters:['jr_kidron','jr_tyropoeon','jr_hinnom'],
  text:'승천을 본 제자들은 감람 산에서 "안식일에 가기 알맞은 길"(약 1km)을 걸어 성으로 돌아와 다락방에 모였고, 오순절에 성령이 임했다(행 1:12-2:4). 초대 교회는 헤롯이 크게 넓힌 성전 뜰을 모임터로 삼았는데, 동쪽 기드론 골짜기 위에 선 솔로몬 행각과 이방인의 뜰에서 안뜰로 들어가는 미문이 자주 언급된다(행 3:2, 11; 5:12). 양문 곁 베데스다 못은 다섯 행각을 가진 쌍둥이 못으로 발굴되었고, 남쪽 실로암 못도 헤롯 시대의 넓은 계단 못이 드러났다. 성전 북서쪽 안토니아 요새에는 로마 수비대가 있어 뒷날 바울을 보호했다.' }
];
ATLAS_MAPS = ATLAS_MAPS.filter(function(m){ return m.id !== 'jerusalem-ot'; }).concat(ATLAS_MAPS_JER);

/* ── 조사 자료로 덮어쓰기: 평면도도 3D 와 같은 성벽·기단·지점을 쓴다 (data/jer3d-sites.js) ── */
(function(){
  if(!window.JER3D) return;
  var J = window.JER3D;
  ATLAS_JER.walls = {
    david:{ color:'#8a4b1f', pts:J.walls.davidcity }, solomon:{ color:'#8a4b1f', pts:J.walls.solomon_link },
    hezekiah:{ color:'#6d3f1a', pts:J.walls.hezekiah }, first:{ color:'#6d3f1a', pts:J.walls.first },
    herod_temple:{ color:'#5a3517', fill:'rgba(120,80,40,.22)', pts:J.platforms.herod },
    square:{ color:'#5a3517', fill:'rgba(120,80,40,.18)', pts:J.platforms.square },
    second:{ color:'#5a3517', pts:J.walls.second }, third:{ color:'#5a3517', dash:true, pts:J.walls.third }
  };
  var map = { jr_temple:'temple_rock', jr_gihon:'gihon', jr_siloam:'siloam', jr_enrogel:'enrogel', jr_herod_palace:'herod_palace', jr_antonia:'antonia',
    jr_hasmonean:'hasmonean', jr_upper_room:'upper_room', jr_caiaphas:'caiaphas', jr_golgotha:'golgotha', jr_tomb:'tomb', jr_gethsemane:'gethsemane',
    jr_bethesda:'bethesda', jr_broad_wall:'broad_wall', jr_millo:'millo', jr_davids_palace:'david_palace', jr_akeldama:'akeldama',
    jr_solomon_colonnade:'solomon_porch', jr_royal_stoa:'royal_stoa', jr_huldah:'huldah', jr_beautiful_gate:'beautiful_gate', jr_upper_pool:'upper_pool',
    jr_hezekiah_tunnel:'hezekiah_tunnel', jr_sheep_gate:'sheep_gate', jr_fish_gate:'fish_gate', jr_valley_gate:'valley_gate', jr_dung_gate:'dung_gate',
    jr_fountain_gate:'fountain_gate', jr_water_gate:'water_gate', jr_horse_gate:'horse_gate', jr_east_gate:'east_gate', jr_muster_gate:'muster_gate', jr_tower_hananel:'hananel',
    jr_kidron:'kidron', jr_hinnom:'hinnom', jr_tyropoeon:'tyropoeon' };
  Object.keys(map).forEach(function(k){ var s = J.sites[map[k]]; if(s && ATLAS_PLACES[k]){ ATLAS_PLACES[k][0] = s[0]; ATLAS_PLACES[k][1] = s[1]; } });
  /* 시대별 성벽 고침: 느헤미야는 동쪽 능선과 성전 산만 (발굴의 통설) */
  var W = { 'jer-david':['square','david','solomon'], 'jer-hezekiah':['square','david','solomon','hezekiah'], 'jer-nehemiah':['square','david','solomon'],
            'jer-passion':['herod_temple','first','second','third'], 'jer-acts':['herod_temple','first','second','third'] };
  ATLAS_MAPS.forEach(function(m){ if(W[m.id]) m.walls = W[m.id]; });
  /* 못·터널·길도 조사 좌표로 */
  function sq(c, dLat, dLon){ return [[c[0]+dLat,c[1]-dLon],[c[0]+dLat,c[1]+dLon],[c[0]-dLat,c[1]+dLon],[c[0]-dLat,c[1]-dLon]]; }
  ATLAS_JER.pools = { siloam:sq(J.sites.siloam, .00025, .00030), bethesda:sq(J.sites.bethesda, .00040, .00025), upper:sq(J.sites.upper_pool, .00012, .00012) };
  ATLAS_JER.tunnel = [J.sites.gihon, [31.77290,35.23690], [31.77200,35.23640], [31.77130,35.23600], J.sites.siloam];
  ATLAS_JER.roads = [ [[31.77670,35.22760],[31.77680,35.23000],[31.77660,35.23300],[31.77640,35.23445]], [[31.78180,35.23050],[31.78000,35.23200],[31.77800,35.23330],[31.77500,35.23400],[31.77100,35.23500]],
                      [[31.78080,35.23700],[31.77960,35.23970],[31.77850,35.24420]] ];
  var ERA = { 'jer-david':'david', 'jer-hezekiah':'hezekiah', 'jer-nehemiah':'nehemiah', 'jer-passion':'herod', 'jer-acts':'herod' };
  ATLAS_MAPS.forEach(function(m){ if(ERA[m.id]) m.era3d = ERA[m.id]; });
  var neh = ATLAS_MAPS.filter(function(m){ return m.id === 'jer-nehemiah'; })[0];
  if(neh) neh.text = neh.text.replace('성의 범위는 대체로 왕정 말기와 같았다고 본다.', '최근 발굴에 따르면 이때 서쪽 언덕은 버려져 있었고, 성벽은 동쪽 능선(다윗 성)과 성전 산만 둘렀던 것으로 보인다. 그래서 느헤미야 3장의 문들은 이 좁은 둘레에 놓인다.');
})();

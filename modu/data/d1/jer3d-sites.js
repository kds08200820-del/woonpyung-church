/* 예루살렘 3D 복원 — 시대별 성벽·건물·못 (위도·경도, WGS84)
   근거(요약):
   · 헤롯 성전 산 기단: 오늘의 하람 알샤리프 윤곽과 같음 — 서벽 약 488m, 남벽 약 281m, 동벽 약 470m, 북벽 약 315m의 사다리꼴 (요세푸스·발굴)
   · 솔로몬·히스기야 시대 성전 산: 500규빗(약 260m) 정사각형 (미쉬나 미돗 2:1, 리트마이어의 복원)
   · 다윗 성: 성전 산 남쪽 동쪽 능선, 기혼 샘 위쪽 비탈에 성벽(케년·실로의 발굴), 남단은 실로암 못 부근
   · 히스기야: 서쪽 언덕까지 넓힌 성, 유대인 지구의 "넓은 성벽"(두께 약 7m, 아비가드 발굴)이 북쪽 선
   · 느헤미야: 서쪽 언덕은 버려져 있었고 성벽은 동쪽 능선과 성전 산만 둘렀다는 것이 최근 발굴의 통설 (느 3장의 문 이름은 이 둘레에 놓임)
   · 제2성전 말기(예수 시대): 제1성벽(하스몬 왕조), 제2성벽(겐낫 문 ~ 안토니아), 제3성벽(아그립바 1세, AD 41-44, 점선)
   · 골고다·무덤: 성묘교회 자리(당시 제2성벽 바로 밖) / 다락방: 시온 산 전승지 / 가야바의 집: 갈리칸투 전승지
   높이는 실제 비율을 따르되 3D 에서 잘 보이도록 성벽만 조금 과장했다. */
var JER3D = {
  sites: {
    temple_rock:[31.77804,35.23532], gihon:[31.77347,35.23669], siloam:[31.77070,35.23560], enrogel:[31.76820,35.23600],
    herod_palace:[31.77620,35.22775], phasael:[31.77655,35.22840], hippicus:[31.77690,35.22795], antonia:[31.78070,35.23410],
    hasmonean:[31.77690,35.23300], upper_room:[31.77185,35.22917], caiaphas:[31.77149,35.23135], golgotha:[31.77844,35.22960],
    tomb:[31.77872,35.22915], gethsemane:[31.77960,35.23970], bethesda:[31.78130,35.23625], olives:[31.77850,35.24420],
    broad_wall:[31.77580,35.23160], millo:[31.77560,35.23580], david_palace:[31.77500,35.23570], akeldama:[31.76930,35.23300],
    solomon_porch:[31.77840,35.23730], royal_stoa:[31.77640,35.23590], huldah:[31.77622,35.23580], beautiful_gate:[31.77810,35.23600],
    upper_pool:[31.77900,35.22970], hezekiah_tunnel:[31.77200,35.23600], kidron:[31.77450,35.23850], hinnom:[31.77050,35.22900], tyropoeon:[31.77450,35.23400],
    sheep_gate:[31.78080,35.23700], fish_gate:[31.78085,35.23420], valley_gate:[31.77300,35.23440], dung_gate:[31.77010,35.23480],
    fountain_gate:[31.77060,35.23640], water_gate:[31.77380,35.23660], horse_gate:[31.77600,35.23720], east_gate:[31.77850,35.23760],
    muster_gate:[31.78000,35.23760], hananel:[31.78080,35.23540]
  },
  names: {
    temple_rock:'성전', gihon:'기혼 샘', siloam:'실로암 못', enrogel:'엔로겔', herod_palace:'헤롯의 궁 (총독 관저)', phasael:'파사엘 망대', hippicus:'히피쿠스 망대',
    antonia:'안토니아 요새', hasmonean:'하스몬 궁', upper_room:'다락방', caiaphas:'가야바의 집', golgotha:'골고다', tomb:'무덤', gethsemane:'겟세마네',
    bethesda:'베데스다 못', olives:'감람 산', broad_wall:'넓은 성벽', millo:'밀로(계단식 석조)', david_palace:'다윗의 왕궁', akeldama:'아겔다마',
    solomon_porch:'솔로몬 행각', royal_stoa:'왕의 행각', huldah:'훌다 문', beautiful_gate:'미문', upper_pool:'윗못', hezekiah_tunnel:'히스기야 터널',
    kidron:'기드론 골짜기', hinnom:'힌놈 골짜기', tyropoeon:'중앙 골짜기', sheep_gate:'양문', fish_gate:'어문', valley_gate:'골짜기 문', dung_gate:'분문',
    fountain_gate:'샘문', water_gate:'수문', horse_gate:'마문', east_gate:'동문', muster_gate:'함밉갓 문', hananel:'하나넬 망대'
  },
  /* 기단(성전 산) */
  platforms: {
    herod: [[31.77612,35.23445],[31.77636,35.23741],[31.78063,35.23738],[31.78050,35.23408]],
    square:[[31.77680,35.23405],[31.77680,35.23675],[31.77915,35.23675],[31.77915,35.23405]]
  },
  /* 성벽 선 */
  walls: {
    davidcity:[[31.77640,35.23460],[31.77560,35.23440],[31.77420,35.23420],[31.77280,35.23440],[31.77120,35.23480],[31.77020,35.23520],[31.77030,35.23600],[31.77160,35.23640],[31.77320,35.23655],[31.77470,35.23660],[31.77600,35.23680],[31.77660,35.23700]],
    solomon_link:[[31.77660,35.23460],[31.77680,35.23405],[31.77915,35.23405],[31.77915,35.23675],[31.77680,35.23675],[31.77660,35.23700]],
    hezekiah:[[31.77680,35.23405],[31.77620,35.23260],[31.77580,35.23130],[31.77660,35.22900],[31.77700,35.22760],[31.77520,35.22740],[31.77300,35.22780],[31.77080,35.22880],[31.76980,35.23080],[31.76990,35.23300],[31.77020,35.23520]],
    first:[[31.77636,35.23445],[31.77690,35.23230],[31.77710,35.23000],[31.77700,35.22780],[31.77520,35.22740],[31.77300,35.22780],[31.77080,35.22880],[31.76980,35.23080],[31.76990,35.23300],[31.77020,35.23520],[31.77030,35.23600],[31.77160,35.23640],[31.77320,35.23655],[31.77470,35.23660],[31.77600,35.23700],[31.77636,35.23741]],
    second:[[31.77700,35.23020],[31.77860,35.23060],[31.78000,35.23150],[31.78070,35.23300],[31.78050,35.23408]],
    third:[[31.77700,35.22780],[31.77980,35.22700],[31.78330,35.22850],[31.78420,35.23250],[31.78300,35.23700],[31.78063,35.23738]]
  },
  /* 사람이 살던 구역 — 집을 채운다 */
  zones: {
    davidcity:[[31.77560,35.23450],[31.77560,35.23675],[31.77040,35.23600],[31.77040,35.23510]],
    westhill:[[31.77640,35.22780],[31.77620,35.23380],[31.77030,35.23480],[31.76990,35.22900]],
    lowercity:[[31.77630,35.23350],[31.77630,35.23440],[31.77050,35.23510],[31.77050,35.23440]],
    northcity:[[31.77980,35.23100],[31.78050,35.23380],[31.77700,35.23380],[31.77720,35.23050]],
    bezetha:[[31.78300,35.22900],[31.78380,35.23650],[31.78100,35.23700],[31.78050,35.22800]]
  },
  eras: {
    david:   { title:'다윗과 솔로몬 시대 (BC 1000-930)', platform:'square', temple:'solomon', walls:['davidcity','solomon_link'], zones:['davidcity'], density:1.0,
               labels:['temple_rock','gihon','millo','david_palace','siloam','enrogel','kidron','tyropoeon','olives'] },
    hezekiah:{ title:'히스기야 시대 (BC 701)', platform:'square', temple:'solomon', walls:['davidcity','solomon_link','hezekiah'], zones:['davidcity','westhill','lowercity'], density:0.9,
               labels:['temple_rock','gihon','siloam','hezekiah_tunnel','broad_wall','upper_pool','kidron','hinnom','tyropoeon','olives'] },
    nehemiah:{ title:'느헤미야 시대 (BC 445)', platform:'square', temple:'second', walls:['davidcity','solomon_link'], zones:['davidcity'], density:0.45,
               labels:['temple_rock','sheep_gate','fish_gate','hananel','valley_gate','dung_gate','fountain_gate','water_gate','horse_gate','east_gate','muster_gate','gihon','siloam','kidron','olives'] },
    herod:   { title:'예수 시대 (AD 30)', platform:'herod', temple:'herod', walls:['first','second','third'], zones:['davidcity','westhill','lowercity','northcity','bezetha'], density:1.3,
               palace:true, antonia:true,
               labels:['temple_rock','antonia','herod_palace','hasmonean','upper_room','caiaphas','golgotha','gethsemane','bethesda','siloam','solomon_porch','royal_stoa','kidron','hinnom','olives'] }
  }
};

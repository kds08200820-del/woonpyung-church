/* 바탕 지형 그림의 지리 범위 (등장방형 도법: 위도·경도가 곧 화소 비율)
   자료: 레반트 = SRTM 90m (CGIAR-CSI v4.1) · 그 밖 = NOAA ETOPO 2022. 음영·색은 이 프로그램이 직접 만들었다. */
var ATLAS_BASES = {
 "levant": {
  "north": 34.0,
  "west": 33.5,
  "south": 29.0,
  "east": 37.0,
  "w": 3000,
  "h": 4285
 },
 "neareast": {
  "north": 42,
  "west": 24,
  "south": 22,
  "east": 56,
  "w": 3600,
  "h": 2250
 },
 "medit": {
  "north": 48,
  "west": -10,
  "south": 28,
  "east": 45,
  "w": 3600,
  "h": 1309
 },
 "egypt": {
  "north": 32,
  "west": 29,
  "south": 26.5,
  "east": 36.5,
  "w": 3000,
  "h": 2200
 }
};

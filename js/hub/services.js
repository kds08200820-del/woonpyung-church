/* K-LOGOS 서비스 목록 — 첫 화면(index.html)의 상자는 이 목록으로 그린다.
   새 서비스를 열 때: 아래에 한 줄(객체)을 더하고 status 를 'open' 으로. 준비 중이면 'soon'.
   · featured: 큰 상자(한 줄 전체)  · who: 누가 쓸 수 있는지(작은 띠)  · img: 상자 그림(없으면 글만) */
window.KLOGOS_SERVICES = [
  {
    id: 'wechurch', name: 'We Church', href: 'wechurch/', status: 'open', featured: true,
    tag: '1단계 운영 중', who: '누구나',
    img: 'images/wechurch/world-768.webp',
    desc: '나로부터 집으로, 교회로, 세상으로. 내가 사는 고장의 실제 시각·날씨·계절을 그대로 따르는 가상 공간에서 내 정원과 집을 가꾸고, 교회와 이웃을 잇습니다.',
    cta: 'We Church 들어가기'
  },
  {
    id: 'woonpyung', name: '운평장로교회', href: 'home.html', status: 'open',
    tag: 'We Church 첫 교회', who: '누구나',
    img: 'images/wechurch/circle-church.webp',
    desc: '1964년부터 화성 우정읍에서 이어 온 교회입니다. 예배 안내, 주보, 말씀, 나눔터.',
    cta: '교회 홈페이지'
  },
  {
    id: 'modu', name: '모두의 성경', href: 'modu/', status: 'open',
    tag: '정회원', who: '운평장로교회 정회원',
    img: 'modu/icon-192.png', imgKind: 'icon',
    desc: '개역개정 성경, 역본 대조, 원어 낱말 사전, 주석, 성경 지도, 찬송가와 교독문.',
    cta: '열기'
  },
  { id: 'qt', name: '큐티', status: 'soon', tag: '준비 중', who: '누구나', desc: '날마다 말씀을 읽고 묵상합니다. 운평장로교회 정회원이 아닌 분께도 열 예정입니다.' },
  { id: 'lecture', name: '신앙 강좌', status: 'soon', tag: '준비 중', who: '누구나', desc: '성경과 신앙생활을 주제별로 차례차례 배우는 강좌입니다.' },
  { id: 'doctrine', name: '교리 강좌', status: 'soon', tag: '준비 중', who: '누구나', desc: '하이델베르크 교리문답과 웨스트민스터 신앙고백을 함께 공부합니다.' }
];

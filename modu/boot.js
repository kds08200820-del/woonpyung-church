/* 데이터를 읽기 전에 저장된 테마·글자크기부터 입혀서 흰 화면 깜빡임을 막는다 */
(function(){
  try{
    var s = JSON.parse(localStorage.getItem('bibleApp.settings') || '{}');
    if(s.theme) document.documentElement.setAttribute('data-theme', s.theme);
    if(s.fs) document.documentElement.style.setProperty('--fs', s.fs + 'px');
    if(s.lh) document.documentElement.style.setProperty('--lh', s.lh);
    var F = {
      myungjo:'"Bookk Myungjo","맑은 고딕",serif',
      gothic:'"Bookk Gothic","맑은 고딕",sans-serif'
    };
    if(s.font && F[s.font]) document.documentElement.style.setProperty('--bodyfont', F[s.font]);
  }catch(e){}
})();

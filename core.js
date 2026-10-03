(function(root){
  "use strict";
  var J={build:{f:[["연면적","㎡",1000]],txt:"연면적 1,000㎡ 이상"},civil:{f:[["구조물 용적","㎥",1000],["공사면적","㎡",1000],["총연장","m",200]],txt:"용적 1,000㎥, 면적 1,000㎡ 또는 연장 200m 이상"},bore:{f:[["총연장","m",200],["굴착 토사량","㎥",200]],txt:"연장 200m 또는 토사량 200㎥ 이상"},land:{f:[["면적 합계","㎡",5000]],txt:"면적 5,000㎡ 이상"},demo:{f:[["연면적","㎡",3000]],txt:"연면적 3,000㎡ 이상"},earth:{f:[["공사면적 합계","㎡",1000]],txt:"공사면적 합계 1,000㎡ 이상"},farm:{f:[["공사면적 합계","㎡",1000]],txt:"공사면적 합계 1,000㎡ 이상 및 토사 반출·반입 또는 농지전용 등을 위한 복합 토공·정지공사"},paint:{f:[],txt:"장기수선계획을 수립하는 공동주택의 건물 외부 도장"}};
  function number(value){if(value==null||String(value).trim()==="")return null;var n=Number(value);return Number.isFinite(n)&&n>=0?n:NaN;}
  function result(state,title,detail){return {state:state,title:title,detail:detail};}
  function scope(type,values,condition,sensitive,pipe){
    var j=J[type],nums=values.map(number);
    if(!j)return result("na","공사 종류를 확인하세요","");
    if(nums.some(Number.isNaN))return result("na","0 이상의 유효한 규모를 입력하세요",j.txt);
    if((type==="paint"||type==="farm")&&condition!=="yes")return result("na",condition==="no"?"이 공사 유형의 적용 조건에 해당하지 않습니다":"추가 적용 조건을 확인하세요",condition==="no"?"다른 건설공사 유형의 규모·지자체 조례 적용 여부도 확인하세요.":j.txt);
    if(type==="paint"||nums.some(function(n,i){return n!==null&&n>=j.f[i][2];}))return result("bad","신고 대상 규모·조건입니다","별표 13 제5호 기준입니다. 착공 전 신고 여부는 관할 시·군·구에 확인하세요. 분할 발주한 공사는 총 규모로 판단합니다.");
    if(nums.length!==j.f.length||nums.some(function(n){return n===null;}))return result("na","규모를 모두 확인해야 합니다","어느 한 값이 기준 이상이면 대상입니다. 빈 항목이 있어 규모 미만으로 판단할 수 없습니다. 기준: "+j.txt);
    if(sensitive!=="no"||pipe)return result("na","규모 기준 미만 · 조례 확인 필요",pipe?"별표 13 비고 제2호: 규모 미만의 관로·선로 매설공사는 관할 지자체 조례로 신고 대상에 포함할 수 있습니다.":sensitive==="yes"?"별표 13 비고 제1호: 주거지역·명시된 민감시설 주변 공사는 지자체 조례를 확인하세요.":"주거지역·민감시설 주변 해당 여부를 확인해야 합니다. 규모 미만이라도 조례로 대상에 포함될 수 있습니다.");
    return result("ok","입력한 공사의 규모 기준 미만","분할 발주한 공사는 총 규모로 판단합니다. 실제 사업 내용 및 다른 적용 기준은 관할 기관에 확인하세요.");
  }
  function wall(kind,pile,height,near){
    var p=number(pile),h=number(height),need=near?3:1.8,label="공사장 경계 방진벽 "+need+"m 이상";
    if(Number.isNaN(h)||(kind==="yard"&&Number.isNaN(p)))return result("na","0 이상의 유효한 높이를 입력하세요","");
    if(kind==="yard"){
      if(p===null)return result("na","야적물 최고 높이를 입력하세요","방진벽 1/3 이상 및 방진망·방진막 1.25배 이상");
      need=p/3;
      label="방진벽 "+(Math.ceil(need*1000)/1000)+"m 이상 (표시값은 올림) · 방진망(막) "+(Math.ceil(p*1.25*1000)/1000)+"m 이상";
    }
    label+=". 육안 추정만으로 확정하지 말고 실제 높이를 측정해 확인하세요.";
    return h===null?result("na","적용 높이 기준",label):h>=need?result("ok","방진벽 높이 기준 충족으로 추정",label):result("bad","방진벽 높이 미달 의심",label);
  }
  function wind(process,industry,height,value){
    var w=number(value),h=number(height),limits={load:[8,"제2호 다목"],blast:[8,"제5호 라목"],cut:[8,"제7호 라목"],rust:[8,"제8호 마목"],grind:[8,"제9호 라목"],paint:[8,"제10호 다목"]};
    if(!process)return result("na","작업 공정을 선택하세요","공정·업종·작업 높이에 따라 기준이 달라집니다.");
    if(process==="building")return result("na","제11호 도장 기준을 확인하세요","제10호의 5m/s·8m/s 수치를 건설공사장 외벽 도장에 일괄 적용하지 않습니다. 제11호 나·다목의 방진막·롤러방식 및 현장 안전 기준을 확인하세요.");
    var rule=limits[process];if(!rule)return result("na","작업 공정을 확인하세요","");
    var limit=rule[0];
    if(["cut","rust","grind"].indexOf(process)>-1){if(!industry)return result("na","업종을 확인하세요","강선건조업·합성수지선건조업은 10m/s, 그 밖의 업종은 8m/s입니다.");if(industry==="ship")limit=10;}
    if(process==="paint"){if(h===null||Number.isNaN(h))return result("na","도장 위치 높이를 확인하세요","0 이상의 높이가 필요합니다. 제10호의 명시된 야외 도장시설에만 적용합니다.");if(h>=5)limit=5;}
    if(w===null||Number.isNaN(w))return result("na","0 이상의 평균 풍속을 입력하세요","적용 기준: 평균초속 "+limit+"m 이상 (별표 14 "+rule[1]+")");
    return result(w>=limit?"bad":"ok",w>=limit?"선택한 공정의 작업중지 풍속 기준에 해당":"선택한 공정의 작업중지 풍속 기준 미만","별표 14 "+rule[1]+": 평균초속 "+limit+"m 이상. 그 밖의 억제조치와 동등 이상 효과의 예외 적용은 별도로 확인합니다.");
  }
  var api={J:J,number:number,scope:scope,wall:wall,wind:wind};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.AirKeeperCore=api;
})(typeof window!=="undefined"?window:globalThis);

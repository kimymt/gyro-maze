import {levels} from '../src/levels.ts';
// Closed-form bound, not a device or gameplay simulation.
// A sensor that restricts the resulting local gravity vector to a cone with
// HALF-ANGLE theta around baseline gravity can supply at most
// 9.81*(cos(theta)*dot(g0,t) + sin(theta)*sqrt(1-dot(g0,t)^2)) along tangent t,
// for the opposing tangents considered below. Tangents already inside the cone
// can attain 9.81 instead; that does not change the non-driving test.
const coneHalfAngleDegrees=30,theta=coneHalfAngleDegrees*Math.PI/180;
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const output={coneHalfAngleDegrees,coneFullOpeningDegrees:60,units:'game-world distance units',cases:[]};
for(const baseline of ['identity','reset-at-start'])for(const level of levels){
  const g0=baseline==='identity'?[0,-1,0]:level.start.up.map(n=>-n);
  const opposing=level.route.map(n=>dot(g0,n.tangent));
  const maxAlong=opposing.map(d=>d>=Math.cos(theta)?1:Math.cos(theta)*d+Math.sin(theta)*Math.sqrt(Math.max(0,1-d*d)));
  const blocked=maxAlong.map(n=>n<=0);
  let longest={length:0,startIndex:null,endIndex:null,riseAgainstBaselineGravity:0},start=-1,total=0;
  for(let i=0;i<=blocked.length;i++){
    if(blocked[i]&&start<0)start=i;
    if(!blocked[i]&&start>=0){
      const end=i-1,a=level.route[start],b=level.route[end],length=b.distance-a.distance;
      total+=length;
      if(length>longest.length)longest={length,startIndex:start,endIndex:end,riseAgainstBaselineGravity:-dot(g0,b.position.map((n,j)=>n-a.position[j]))};
      start=-1;
    }
  }
  const minDot=Math.min(...opposing),hardestIndex=opposing.indexOf(minDot);
  output.cases.push({baseline,id:level.id,baselineGravityDirection:g0,routeLength:level.routeLength,points:level.route.length,hardestTangentIndex:hardestIndex,hardestTangent:level.route[hardestIndex].tangent,minimumGravityChangeToStartPositiveAccelerationDegrees:Math.max(0,Math.acos(Math.max(-1,Math.min(1,minDot)))*180/Math.PI-90),totalNonDrivingLength:total,longestNonDrivingInterval:longest});
}
console.log(JSON.stringify(output,null,2));

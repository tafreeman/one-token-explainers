/* Swiss wireframe stations, presented through the unified reader scene host. */
(() => {
'use strict';

function create(THREE, theme) {
  const { colors, scene } = theme.makeScene(THREE, 'diagram');
  const EFF = { low: 6, medium: 11, high: 16, xhigh: 21, max: 28 };
  let KV_MODE = 'sparse', CACHE_MODE = 'hit', EFFORT = 'high';
  let reducedMotion = false;
  let settingsKey = '';
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const ease=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const seg=(t,a,b)=>ease((t-a)/(b-a));
const lin=(t,a,b)=>clamp((t-a)/(b-a),0,1);
const lerp=(a,b,u)=>a+(b-a)*u;
  const SP=24, LINE0=-14, LINE1=11*SP+14.5, D2R=Math.PI/180;
  const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
  const po={polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1};
  const fill = color => new THREE.MeshLambertMaterial({ color, ...po });
  const MAT = {
    paper: fill(colors.plate),
    ink: fill(colors.hardwareGraphite),
    inkB: new THREE.MeshBasicMaterial({ color: colors.fault }),
    mid: fill(colors.hardwareFrame),
    token: new THREE.MeshBasicMaterial({ color: colors.token, ...po }),
    edge: new THREE.LineBasicMaterial({ color: colors.ink }),
    ghost: new THREE.LineBasicMaterial({ color: colors.grid }),
    ghostTower: new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: .34, depthWrite: false }),
    dash: new THREE.LineDashedMaterial({ color: colors.ink, dashSize: 0.3, gapSize: 0.22 }),
    ghostDash: new THREE.LineDashedMaterial({ color: colors.hardwareFrame, dashSize: 0.13, gapSize: 0.11 }),
    tokEdge: new THREE.LineBasicMaterial({ color: colors.mark }),
    cache: fill(colors.cache),
    cacheLine: new THREE.LineBasicMaterial({ color: colors.cache }),
    tool: fill(colors.tool),
    fault: fill(colors.fault),
    attention: new THREE.LineBasicMaterial({ color: colors.attention })
  };
  const GEO=new Map(), EDG=new Map();
  const bg=(w,h,d)=>{const k=w+'|'+h+'|'+d;if(!GEO.has(k)) GEO.set(k,new THREE.BoxGeometry(w,h,d));return GEO.get(k);};
  const eg=geo=>{if(!EDG.has(geo.uuid)) EDG.set(geo.uuid,new THREE.EdgesGeometry(geo));return EDG.get(geo.uuid);};
  function inked(geo,fill,edge){const g=new THREE.Group();if(fill){const m=new THREE.Mesh(geo,fill);g.add(m);g.userData.mesh=m;}if(edge){const e=new THREE.LineSegments(eg(geo),edge);if(edge.isLineDashedMaterial) e.computeLineDistances();g.add(e);g.userData.edge=e;}return g;}
  const box=(w,h,d,fill,edge)=>inked(bg(w,h,d),fill===undefined?MAT.paper:fill,edge===undefined?MAT.edge:edge);
  const at=(o,x,y,z)=>{o.position.set(x,y,z);return o;};
  const mT=(x,y,z)=>new THREE.Matrix4().makeTranslation(x,y,z);
  function instFill(geo,mats,mat){const m=new THREE.InstancedMesh(geo,mat||MAT.paper,mats.length);mats.forEach((M,i)=>m.setMatrixAt(i,M));m.instanceMatrix.needsUpdate=true;m.frustumCulled=false;return m;}
  function mergedEdges(geo,mats,mat){const src=eg(geo).attributes.position.array,n=src.length,out=new Float32Array(n*mats.length),v=V();mats.forEach((M,i)=>{for(let j=0;j<n;j+=3){v.set(src[j],src[j+1],src[j+2]).applyMatrix4(M);out[i*n+j]=v.x;out[i*n+j+1]=v.y;out[i*n+j+2]=v.z;}});const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(out,3));const l=new THREE.LineSegments(g,mat||MAT.edge);if((mat||MAT.edge).isLineDashedMaterial) l.computeLineDistances();l.userData.per=n/3;return l;}
  function segs(pts,mat){const l=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),mat||MAT.ghost);if((mat||MAT.ghost).isLineDashedMaterial) l.computeLineDistances();return l;}
  function polyline(pts,mat){const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),mat||MAT.edge);if((mat||MAT.edge).isLineDashedMaterial) l.computeLineDistances();return l;}
  function bez(a,b,lift){const c=a.clone().add(b).multiplyScalar(0.5);c.y+=lift;return new THREE.QuadraticBezierCurve3(a,c,b);}
  const curveLine=(c,mat)=>{const line=polyline(c.getPoints(30),mat);line.userData.curve=c;return line;};
  function connectionSignals(parent, capacity, color) {
    const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(.105, .3, 8),
      new THREE.MeshBasicMaterial({ color }), capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.userData.connectionSignal = true;
    parent.add(mesh);
    const marker = new THREE.Object3D(), up = V(0, 1, 0), tangent = V();
    return (paths, progress) => {
      const visible = paths.filter(path => path.visible
        && path.geometry.drawRange.count >= path.geometry.attributes.position.count - 1);
      mesh.count = visible.length;
      mesh.visible = visible.length > 0;
      visible.forEach((path, i) => {
        const u = reducedMotion ? .92 : lerp(.08, .92, ease(progress));
        const curve = path.userData.curve;
        marker.position.copy(curve.getPoint(u));
        marker.quaternion.setFromUnitVectors(up, curve.getTangent(u, tangent).normalize());
        marker.updateMatrix();
        mesh.setMatrixAt(i, marker.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
  }
  function reveal(line,u){const n=line.geometry.attributes.position.count;const k=Math.round(n*clamp(u,0,1));line.geometry.setDrawRange(0,k);line.visible=k>1;}
  function torus(r,tube){const m=new THREE.Mesh(new THREE.TorusGeometry(r,tube,8,48),MAT.inkB);return m;}
  const CUBE=V(1,1,1), SLICE=V(0.28,0.74,2.0);
  function track(keys){const val=(k,t)=>k.f?k.f(t):k.p.clone();return t=>{if(t<=keys[0].t) return val(keys[0],keys[0].t);for(let k=1;k<keys.length;k++){const b=keys[k];if(t<=b.t){const a=keys[k-1];if(b.f) return b.f(t);const pa=val(a,a.t),pb=val(b,b.t);return pa.lerp(pb,ease((t-a.t)/Math.max(1e-6,b.t-a.t)));}}const z=keys[keys.length-1];return val(z,z.t);};}
  function shp(keys){return t=>{if(t<=keys[0][0]) return keys[0][1].clone();for(let k=1;k<keys.length;k++){if(t<=keys[k][0]){const a=keys[k-1],b=keys[k];return a[1].clone().lerp(b[1],ease((t-a[0])/Math.max(1e-6,b[0]-a[0])));}}return keys[keys.length-1][1].clone();};}
  const cam=(x0,y0,z0,x1,y1,z1,az,el)=>({b:[x0,y0,z0,x1,y1,z1],az,el});
  function camLerp(a,b,u){return {b:a.b.map((v,i)=>lerp(v,b.b[i],u)),az:lerp(a.az,b.az,u),el:lerp(a.el,b.el,u)};}
  function camKeys(keys){return t=>{let c=keys[0].c;for(let k=1;k<keys.length;k++){const kt=keys[k].t;if(t>=kt) c=keys[k].c;else{const u=seg(t,kt-0.05,kt);if(u>0) c=camLerp(c,keys[k].c,u);break;}}return c;};}

  /* ---------- shared figures ---------- */
  function tower(ghostOnly){
    const n=61,gap=0.2,w=5.2,y0=0.7,G=new THREE.Group();
    G.add(at(box(w+1.0,0.7,w+1.0,ghostOnly?null:MAT.paper,ghostOnly?MAT.ghost:MAT.edge),0,0.35,0));
    const pg=bg(w,0.08,w),M=[];for(let i=0;i<n;i++) M.push(mT(0,y0+0.12+i*gap,0));
    const inst=instFill(pg,M),edges=mergedEdges(pg,M),ghost=mergedEdges(pg,M,MAT.ghostTower);G.add(inst,edges,ghost);
    const H=n*gap+0.3;G.add(at(box(0.3,H,0.3,ghostOnly?null:MAT.paper,ghostOnly?MAT.ghost:MAT.edge),0,y0+H/2,0));
    const per=edges.userData.per;
    const T={G,n,gap,y0,top:y0+H,layerY:i=>y0+0.12+i*gap,_k:-1,solid(k){k=clamp(Math.round(k),0,n);if(k===T._k) return;T._k=k;inst.count=k;inst.visible=k>0;edges.geometry.setDrawRange(0,k*per);edges.visible=k>0;ghost.geometry.setDrawRange(k*per,(n-k)*per);ghost.visible=k<n;}};
    T.solid(ghostOnly?0:n);return T;
  }
  function rack(){
    const G=new THREE.Group();
    G.add(at(box(0.14,12.8,0.14),-0.25,6.4,-1.68),at(box(0.14,12.8,0.14),-0.25,6.4,1.68),at(box(0.14,12.8,0.14),1.88,6.4,-1.68),at(box(0.14,12.8,0.14),1.88,6.4,1.68));
    G.add(at(box(2.4,0.12,3.46,MAT.ink,MAT.edge),0.82,12.86,0));
    const sg=bg(2.3,0.06,3.3),SM=[];for(let k=0;k<12;k++) SM.push(mT(0.75,1+k,0));G.add(instFill(sg,SM),mergedEdges(sg,SM));
    // Paged block divider down the center of each shelf
    const divPts=[];for(let k=0;k<12;k++){divPts.push(V(-0.2,1.04+k,0),V(1.85,1.04+k,0));}G.add(segs(divPts,MAT.ghost));
    const cg=bg(0.14,0.68,2.5),BM=[],GM=[],DM=[];
    for(let k=0;k<12;k++){
      for(let s=0;s<3;s++) BM.push(mT(0.05+s*0.4,1.4+k,0));
      GM.push(mT(1.28,1.4+k,0));
      for(let s=0;s<4;s++) DM.push(mT(0.25+s*0.4,1.4+k,0));
    }
    const base=instFill(cg,BM,MAT.cache),baseE=mergedEdges(cg,BM),grow=instFill(cg,GM,MAT.cache),growE=mergedEdges(cg,GM);
    const dense=instFill(bg(0.1,0.68,2.5),DM,MAT.ink),denseE=mergedEdges(bg(0.1,0.68,2.5),DM,MAT.edge);
    G.add(base,baseE,grow,growE,dense,denseE);
    const per=baseE.userData.per, dper=denseE.userData.per;
    const R={
      G,
      set(nb,ng){nb=clamp(Math.round(nb),0,36);ng=clamp(Math.round(ng),0,12);base.count=nb;base.visible=nb>0;baseE.geometry.setDrawRange(0,nb*per);baseE.visible=nb>0;grow.count=ng;grow.visible=ng>0;growE.geometry.setDrawRange(0,ng*per);growE.visible=ng>0;},
      setDense(nd){nd=clamp(Math.round(nd),0,48);dense.count=nd;dense.visible=nd>0;denseE.geometry.setDrawRange(0,nd*dper);denseE.visible=nd>0;},
      tokSlot:V(1.68,7.4,0)
    };
    R.set(0,0);R.setDense(0);return R;
  }
  function screen(lines){
    const G=new THREE.Group();
    G.add(at(box(1.6,0.1,0.9),0,0.05,0),at(box(0.18,0.9,0.18),0,0.5,0),at(box(4.6,3.0,0.14),0,2.4,0));
    const L=[];const lens=lines||[3.4,2.6,3.8,2.2,3.0,1.6];
    lens.forEach((len,k)=>{const b=new THREE.Mesh(bg(1,0.12,0.03),MAT.mid);b.position.set(-1.95,3.45-k*0.38,0.09);b.userData.len=len;G.add(b);L.push(b);});
    const S={G,lines:L,show(u){L.forEach((b,k)=>{const v=clamp(u*L.length-k,0,1);b.visible=v>0.01;b.scale.x=Math.max(0.001,b.userData.len*v);b.position.x=-1.95+b.userData.len*v/2;});}};
    S.show(1);return S;
  }
  function cutter(G,o){
    const W=o.W,gap=o.gap||0.12,total=W.reduce((a,b)=>a+b,0)+gap*(W.length-1),y=o.y||0.95,BX=o.BX;
    const off=[];let s=0;W.forEach(w=>{off.push(s);s+=w+gap;});
    const slot=[];let x=o.row0;W.forEach(w=>{slot.push(x+w/2);x+=w+gap;});
    const rib=box(1,0.9,0.14);G.add(rib);
    const pcs=W.map((w,i)=>{if(i===o.ti) return null;const b=box(w,1,1);b.visible=false;G.add(b);return b;});
    const cut=i=>(total-off[i])/total;
    const ribPos=(i,c)=>V(BX-total+c*total+off[i]+W[i]/2,y,0);
    function piece(i,c){const k=cut(i);if(c<k) return null;const u=ease((c-k)/0.22);return V(lerp(BX+W[i]/2+0.08,slot[i],u),lerp(y,0.5,u),0);}
    function update(c){const cc=Math.min(c,1),len=Math.max(0.001,total*(1-cc));rib.scale.x=len;rib.position.set(BX-len/2,y,0);rib.visible=cc<0.999&&!o.hideRib;pcs.forEach((b,i)=>{if(!b) return;const r=piece(i,c);if(r){b.visible=true;b.position.copy(r);}else b.visible=false;});}
    function tokPos(c){const k=cut(o.ti);if(c<k){const p=ribPos(o.ti,c);p.z=0.16;return p;}return piece(o.ti,c);}
    function tokShape(c){const k=cut(o.ti),w=W[o.ti];if(c<k) return V(w*0.9,0.62,0.24);const u=ease((c-k)/0.22);return V(w,lerp(0.62,1,u),lerp(0.24,1,u));}
    return {update,tokPos,tokShape,slot,total,rib,pcs,piece,ribStart:()=>ribPos(o.ti,0)};
  }
  function blade(G,BX){G.add(at(box(0.06,2.3,1.9),BX,1.55,0),at(box(1.0,0.5,2.3),BX,2.95,0),at(box(1.0,0.12,2.3),BX,0.06,0));}
  function hollowTile(w,h,d){return box(w,h,d,null,MAT.ghostDash);}

  /* ---------- stations ---------- */
  const ST=[];
  function station(i,build){const G=new THREE.Group();G.position.x=i*SP;scene.add(G);const d=build(G);const S={i,G,_t:-1,update:d.update||(()=>{}),tok:d.tok,shape:d.shape||(()=>CUBE.clone()),cam:camKeys(d.cams),labels:d.labels||[]};ST.push(S);return S;}

  // 01 CORPUS
  station(0,G=>{
    const zs=[-4.2,-1.4,1.4,4.2],cnt=[9,11,7,8],SX=-8.5,PT=0.14,PS=0.24,FX=-1.4,CX=6.2;
    const pg=bg(2.6,PT,1.9),M=[];zs.forEach((z,s)=>{for(let k=0;k<cnt[s];k++) M.push(mT(SX,0.12+k*PS,z));});
    G.add(instFill(pg,M),mergedEdges(pg,M));
    // Printed text-line markings on top of each source document stack
    const docLines=[];zs.forEach((z,s)=>{const yTop=0.12+(cnt[s]-1)*PS+PT/2+0.01;for(let l=-2;l<=2;l++) docLines.push(V(SX-0.95,yTop,z+l*0.28),V(SX+(l===2?0.35:0.95),yTop,z+l*0.28));});
    G.add(segs(docLines,MAT.ghost));
    G.add(at(box(0.24,6.2,0.24),FX,3.1,-5.1),at(box(0.24,6.2,0.24),FX,3.1,5.1),at(box(0.24,0.24,10.44),FX,6.3,0));
    // Angled deduplication reject chute + bin beneath the filter sieve
    const chute=box(1.5,0.08,2.2);chute.position.set(FX+0.68,-0.35,0);chute.rotation.z=-0.38;G.add(chute);
    G.add(at(box(1.9,0.18,2.5,null,MAT.ghostDash),FX+1.35,-0.95,0));
    const gp=[];for(let i=1;i<8;i++){const z=-5+i*1.25;gp.push(V(FX,0,z),V(FX,6.2,z));}for(let j=1;j<5;j++){const y=j*1.24;gp.push(V(FX,y,-5),V(FX,y,5));}G.add(segs(gp));
    const cg=bg(3.2,PT,2.4),CM=[];for(let k=0;k<12;k++) CM.push(mT(CX,0.12+k*PS,0));
    const clean=instFill(cg,CM),cleanE=mergedEdges(cg,CM);G.add(clean,cleanE);
    const N=7,DUP=[1,4],mv=[];for(let k=0;k<N;k++){const b=box(2.6,PT,1.9);b.visible=false;G.add(b);mv.push(b);}
    const sch=k=>{const a=0.16+k*0.075;return [a,a+0.13,a+0.26];};
    const hk=k=>{let n=3;for(let j=0;j<k;j++) if(!DUP.includes(j)) n++;return n;};
    function mpos(k,t){const [a,b,c]=sch(k);if(t<a) return null;const p0=V(SX,0.12+cnt[k%4]*PS+0.1,zs[k%4]),p1=V(FX,2.2+(k%3)*0.9,0);
      if(t<b){const u=ease((t-a)/(b-a));return {p:p0.lerp(p1,u).add(V(0,Math.sin(u*Math.PI)*1.2,0)),s:1};}
      if(DUP.includes(k)){const u=ease((t-b)/(c-b));if(u>=1) return null;return {p:V(FX+0.3+u*1.05,lerp(p1.y,-0.88,u),0),s:1-0.65*u};}
      const p2=V(CX,0.12+hk(k)*PS,0);if(t<c){const u=ease((t-b)/(c-b));return {p:p1.lerp(p2,u).add(V(0,Math.sin(u*Math.PI)*0.8,0)),s:1};}
      return null;}
    const TK=2,[ta,,tc]=sch(TK),s2=V(SX,0.12+cnt[2]*PS+0.14,zs[2]),rest=V(CX+2.7,0.45,0);
    return {
      update(t){let n=3;for(let k=0;k<N;k++){const r=mpos(k,t),m=mv[k];if(r){m.visible=true;m.position.copy(r.p);m.scale.setScalar(r.s);}else m.visible=false;if(!DUP.includes(k)&&t>=sch(k)[2]) n++;}clean.count=n;cleanE.geometry.setDrawRange(0,n*cleanE.userData.per);},
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.06,p:s2},{t:ta,p:s2},{t:tc,f:t=>{const r=mpos(TK,t);return r?r.p.add(V(0,0.14,0)):V(CX,0.12+hk(TK)*PS+0.14,0);}},{t:0.64,p:rest},{t:0.86,p:rest},{t:1,p:V(12,0.45,0)}]),
      shape:shp([[0,CUBE],[0.06,V(1.5,0.26,0.7)],[tc,V(1.5,0.26,0.7)],[0.64,CUBE]]),
      cams:[{t:0,c:cam(-10,0,-5.6,9.6,7.6,5.6,-26,22)}],
      labels:[
        ['dedupe · quality · PII filters',V(FX,7.0,0),0.34,0.68],
        ['filtered training mix',V(CX,3.9,0),0.66,1],
        ['books',V(SX,0.12+cnt[2]*PS+0.9,zs[2]),0,0.36],
        ['near-duplicates dropped',V(FX+1.35,-0.95,0),0.36,0.68],
        ['web',V(SX,0.12+cnt[0]*PS+0.55,zs[0]),0,0.36],
        ['code',V(SX,0.12+cnt[1]*PS+0.55,zs[1]),0,0.36],
        ['papers + math',V(SX,0.12+cnt[3]*PS+0.55,zs[3]),0,0.36]
      ]
    };
  });

  // 02 TOKENS (includes '␣Eiffel' matching “…the Eiffel Tower is in Paris.”)
  station(1,G=>{
    const BX=-2.4;blade(G,BX);
    // Graduated BPE caliper ticks on cutter header
    const bpeTicks=[];for(let i=-3;i<=3;i++) bpeTicks.push(V(BX+0.51,2.8,i*0.28),V(BX+0.51,3.1,i*0.28));G.add(segs(bpeTicks,MAT.edge));
    const W=[0.95,1.45,1.45,0.72,0.72,1.65,0.46],WORDS=['the','␣Eiffel','␣Tower','␣is','␣in','','“.”'],TI=5;
    const C=cutter(G,{BX,W,gap:0.14,ti:TI,row0:-1.8});
    const cOf=t=>lin(t,0.03,0.35)*1.22;
    const cg=bg(0.3,0.3,0.3),VM=[];for(let c=0;c<28;c++) for(let r=0;r<9;r++) VM.push(mT(-1.8+c*0.42,2.4+r*0.42,-4.6));
    const wall=instFill(cg,VM),wallE=mergedEdges(cg,VM,MAT.ghost);G.add(wall,wallE);
    // Architectural vocabulary matrix frame + coordinate crosshair on ID 12842
    G.add(at(box(12.1,4.05,0.12,null,MAT.edge),3.87,4.08,-4.66));
    const cell=V(-1.8+17*0.42,2.4+5*0.42,-4.6),cellB=at(box(0.38,0.38,0.38,MAT.ink),cell.x,cell.y,cell.z);G.add(cellB);
    const xhair=segs([V(-2.15,cell.y,-4.42),V(9.9,cell.y,-4.42),V(cell.x,2.08,-4.42),V(cell.x,6.08,-4.42)],MAT.ghostDash);G.add(xhair);
    const slotP=V(C.slot[TI],0.5,0);const conn=polyline([slotP.clone().add(V(0,0.55,0)),cell]);G.add(conn);
    const IX=3.0,IZ=4.4;G.add(at(box(2.6,0.08,2.6),IX,0.04,IZ));
    const ig=[];for(let k=1;k<4;k++){const d=-1.3+k*0.65;ig.push(V(IX+d,0.09,IZ-1.3),V(IX+d,0.09,IZ+1.3),V(IX-1.3,0.09,IZ+d),V(IX+1.3,0.09,IZ+d));}G.add(segs(ig));
    const patches=[0,1,2,3].map(k=>{const b=box(0.6,0.08,0.6);b.position.set(IX-0.975+k*0.65,0.12,IZ-0.325);G.add(b);return b;});
    return {
      update(t){const c=cOf(t);C.update(c);const vocOn=t>0.35&&t<0.9;cellB.visible=vocOn;conn.visible=vocOn;xhair.visible=vocOn;
        const u=seg(t,0.64,0.84);patches.forEach((b,k)=>{const p0=V(IX-0.975+k*0.65,0.12,IZ-0.325),p1=V(6.4+k*0.55,1.1,IZ);b.position.copy(p0.lerp(p1,u));b.scale.set(lerp(1,0.37,u),lerp(1,22,u),lerp(1,0.37,u));});},
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.04,p:C.tokPos(0)},{t:0.35,f:t=>C.tokPos(cOf(t))||slotP.clone()},{t:0.5,f:t=>C.tokPos(cOf(t))||slotP.clone()},{t:0.9,p:slotP},{t:1,p:V(12,0.45,0)}]),
      shape:t=>{if(t<0.04) return CUBE.clone().lerp(C.tokShape(0),ease(t/0.04));if(t<0.9) return C.tokShape(cOf(t));return C.tokShape(2).lerp(CUBE,ease((t-0.9)/0.1));},
      cams:[{t:0,c:cam(-11.2,0,-4.9,10.2,6.9,5.2,-24,20)}],
      labels:[
        ['byte-level BPE',V(BX,3.7,0),0.04,0.36],
        ['vocabulary · 129,280 tokens*',V(-1.8,6.4,-4.6),0.36,0.68],
        ['ID 12842 (illustrative)',cell.clone().add(V(0.3,0.1,0)),0.42,0.68],
        ['image → patches → vectors',V(IX+2.2,2.4,IZ),0.68,0.98],
        ...[0,1,2,3,4,6].map(i=>[WORDS[i],t=>{const p=C.piece(i,cOf(t));return p?p.add(V(0,0.8+(i%2)*0.32,0)):V(-99,-99,0);},0.18,0.66])
      ]
    };
  });

  // 03 PRETRAIN
  station(2,G=>{
    const T=tower();G.add(T.G);
    const fg=bg(0.62,0.16,0.62),FM=[];for(let a=0;a<10;a++) for(let b=0;b<10;b++){const x=-4.95+a*1.1,z=-4.95+b*1.1;if(Math.abs(x)<3.4&&Math.abs(z)<3.4) continue;FM.push(mT(x,0.08,z));}
    G.add(instFill(fg,FM),mergedEdges(fg,FM,MAT.ghost));
    const B=[];for(let k=0;k<8;k++){if(k===5){B.push(null);continue;}const b=box(0.42,0.42,0.42);G.add(b);B.push(b);}
    const bpos=(k,t)=>{const p0=V(-11+k*0.62,0.21,0),p1=V(-1.75+k*0.5,0.95,0),p2=V(-1.75+k*0.5,T.top-0.25,0);if(t<0.04) return p0;if(t<0.12) return p0.lerp(p1,seg(t,0.04,0.12));return p1.lerp(p2,seg(t,0.12,0.29));};
    const ring=torus(0.8,0.06);ring.rotation.x=Math.PI/2;ring.position.set(0,T.top+0.9,0);G.add(ring);
    const GX=3.3,gl=polyline([V(GX,T.top,0),V(GX,0.9,0)]);G.add(gl);
    const pulses=[0,1,2].map(()=>{const b=box(0.22,0.22,0.22,MAT.ink,null);G.add(b);return b;});
    const ruler=box(1,0.12,0.36);G.add(ruler);
    const tk=[];for(let k=0;k<=16;k++){const x=-5+k*0.7;tk.push(V(x,0.12,4.6),V(x,0.5,4.6));}const ticksL=segs(tk,MAT.edge);G.add(ticksL);
    const Lr=t=>lerp(0.7,11.2,seg(t,0.76,0.94));
    return {
      update(t){B.forEach((b,k)=>{if(!b) return;b.visible=t<0.32;b.position.copy(bpos(k,t));});
        T.solid(t<0.10?0:61*lin(t,0.10,0.28));
        ring.visible=t>0.27;const gv=t>0.50&&t<0.76;gl.visible=gv;pulses.forEach((p,k)=>{p.visible=gv;const f=((t-0.50)*7+k/3)%1;p.position.set(GX,T.top-f*(T.top-0.9),0);});
        const L=Lr(t);ruler.visible=t>0.74;ruler.scale.x=L;ruler.position.set(-5+L/2,0.06,4.6);ticksL.visible=t>0.74;ticksL.geometry.setDrawRange(0,2*(1+Math.floor(L/0.7+0.001)));},
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.04,p:bpos(5,0)},{t:0.29,f:t=>bpos(5,t)},{t:0.33,p:V(0,T.top+0.9,0)},{t:0.74,p:V(0,T.top+0.9,0)},{t:0.77,p:V(-4.3,0.5,4.6)},{t:0.95,f:t=>V(-5+Lr(t),0.5,4.6)},{t:1,p:V(12,0.45,0)}]),
      shape:shp([[0,CUBE],[0.04,V(0.62,0.62,0.62)],[0.29,V(0.62,0.62,0.62)],[0.33,CUBE]]),
      cams:[{t:0,c:cam(-11.6,0,-5.6,5.6,15,5.6,-28,16)},{t:0.29,c:cam(-5.6,0,-5.6,5.6,15.4,5.6,-28,16)},{t:0.76,c:cam(-6,0,-3.5,7,8,5.2,-24,20)}],
      labels:[
        ['tower · 61 layers*',V(-3.2,9.5,0),0.05,0.29],
        ['loss = −log p(“ Paris”)',V(0.9,T.top+1.5,0),0.29,0.52],
        ['gradients flow through active computation',V(GX+0.3,8,0),0.52,0.76],
        ['1,048,576 · YaRN ×16*',t=>V(-5+Lr(t),0.9,4.6),0.76,1],
        ['65,536',V(-5,0.9,4.6),0.76,0.88],
        ['causal mask: position n sees ≤ n',V(-3.2,5.0,0),0.12,0.29],
        ['accelerator cluster',V(-5,0.2,5),0,0.24]
      ]
    };
  });

  // 04 POST-TRAIN
  station(3,G=>{
    const PX=-4,T=tower();T.G.position.x=PX;G.add(T.G);
    const R=tower(true);R.G.scale.setScalar(0.6);R.G.position.set(-10.5,0,-5.5);G.add(R.G);
    const tether=polyline([V(PX,T.top,0),V(-10.5,R.top*0.6,-5.5)],MAT.dash);G.add(tether);
    const sft=[0,1,2,3].map(k=>{const b=box(2.2,0.12,1.6);b.position.set(-11,0.1+k*0.2,3.2);G.add(b);return b;});
    const gp=k=>V(6.4,6.6,-5.25+k*1.5),PASS=[0,2,3,6];
    const graders=[0,1,2,3,4,5,6,7].map(k=>{const b=box(0.8,0.8,0.8);b.position.copy(gp(k));G.add(b);return b;});
    const A=V(PX,T.top+0.1,0);
    const curves=graders.map((_,k)=>bez(A,gp(k).add(V(0,0.45,0)),3.2+k*0.12));
    const solid=curves.map(c=>{const l=curveLine(c);G.add(l);return l;});
    const dashed=curves.map(c=>{const l=curveLine(c,MAT.ghostDash);l.visible=false;G.add(l);return l;});
    G.add(at(box(2.4,3.2,0.12),6.4,1.7,-8.2));
    const dl=[];for(let k=0;k<7;k++){const y=2.9-k*0.36;dl.push(V(5.4,y,-8.13),V(k%3===2?6.7:7.4,y,-8.13));}G.add(segs(dl,MAT.edge));
    const feed=polyline([V(6.4,3.4,-8.2),V(6.4,6.1,-5.25)],MAT.dash);G.add(feed);
    return {
      update(t){sft.forEach((b,k)=>{const a=0.03+k*0.04,u=seg(t,a,a+0.09);b.visible=u<0.999;b.position.set(lerp(-11,PX,u),lerp(0.1+k*0.2,0.9,u),lerp(3.2,0,u));});
        curves.forEach((c,k)=>{const pass=PASS.includes(k),g=t>0.42;const r=seg(t,0.22+k*0.01,0.34+k*0.01);if(g&&!pass){solid[k].visible=false;dashed[k].visible=true;}else{dashed[k].visible=false;reveal(solid[k],r);}
          graders[k].userData.mesh.material=(g&&pass)?MAT.ink:MAT.paper;});
        feed.visible=t>0.51&&t<0.77;tether.visible=t>0.74;},
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.06,p:V(-11,1.15,3.2)},{t:0.16,p:V(PX,1.0,0)},{t:0.24,p:A.clone()},{t:0.26,p:A.clone()},{t:0.42,f:t=>curves[2].getPoint(lin(t,0.26,0.42))},{t:0.46,p:gp(2).add(V(0,0.95,0))},{t:0.74,p:gp(2).add(V(0,0.95,0))},{t:0.86,p:V(7.6,0.45,0)},{t:1,p:V(12,0.45,0)}]),
      shape:shp([[0,CUBE],[0.06,V(0.55,0.55,0.55)],[0.26,V(0.55,0.55,0.55)],[0.46,V(0.6,0.6,0.6)],[0.86,CUBE]]),
      cams:[{t:0,c:cam(-12.2,0,-8.6,7.6,15,5.8,-30,20)}],
      labels:[
        ['SFT · worked demonstrations',V(-11,2.0,3.2),0,0.28],
        ['policy samples a group of 8 (illustrative)',V(0.6,T.top+3.3,0),0.29,0.43],
        ['verifiers: tests pass · answer matches',V(6.4,8.0,-5.25),0.43,0.52],
        ['constitution → AI feedback',V(6.4,3.7,-8.2),0.52,0.76],
        ['frozen reference model',V(-10.5,R.top*0.6+0.7,-5.5),0.76,1],
        ['KL penalty',V(-7.2,T.top*0.82,-2.8),0.76,1]
      ]
    };
  });

  // 05 RELEASE
  station(4,G=>{
    G.add(at(box(0.8,9,0.8),0,4.5,-4.2),at(box(0.8,9,0.8),0,4.5,4.2),at(box(0.8,0.8,9.2),0,9.4,0));
    const checks=[...Array(10)].map((_,k)=>{const b=box(0.5,0.5,0.5);b.position.set(0,10.05,-3.6+k*0.8);G.add(b);return b;});
    const scan=box(0.05,8.4,7.8);scan.position.y=4.4;G.add(scan);
    G.add(at(box(2.2,3.0,0.12),-7,1.5,-5));const dl=[];for(let k=0;k<6;k++){const y=2.6-k*0.36;dl.push(V(-7.8,y,-4.93),V(k%2?-6.6:-6.2,y,-4.93));}G.add(segs(dl,MAT.edge));
    const ring=torus(1.5,0.09);ring.rotation.y=Math.PI/2;ring.position.set(6.5,1.8,0);G.add(ring);
    const sx=t=>lerp(-7,7,seg(t,0.36,0.64));
    return {
      update(t){checks.forEach((b,k)=>{b.userData.mesh.material=t>0.06+k*0.036?MAT.ink:MAT.paper;});scan.visible=t>0.34&&t<0.66;scan.position.x=sx(t);},
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.1,p:V(-6,1.8,0)},{t:0.62,p:V(2,1.8,0)},{t:0.78,p:V(9,1.8,0)},{t:1,p:V(12,0.45,0)}]),
      cams:[{t:0,c:cam(-8.6,0,-5.4,8.4,10.6,5,-32,16)}],
      labels:[
        ['capability + dangerous-capability evals',V(0,10.9,0),0.04,0.46],
        ['red-team sweep',t=>V(sx(t),8.9,3.9),0.36,0.64],
        ['safety classifier · stop_reason "refusal"',V(6.5,3.7,0),0.3,1],
        ['weights frozen from here on',V(9.6,0.9,1.5),0.8,1],
        ['system card',V(-7,3.4,-5),0.1,0.6]
      ]
    };
  });

  // 06 REQUEST (interactive Prefix Cache Mode: Hit doubled lines + suffix fast-forward vs Miss full prefill)
  station(5,G=>{
    const BX=-0.6;blade(G,BX);
    const W=[...Array(8).fill(0.48),0.62,0.36,0.52,1.0,0.44,1.0,0.7,0.62,0.32],TI=13;
    const C=cutter(G,{BX,W,gap:0.07,ti:TI,row0:0.0,hideRib:true});
    const cOf=t=>lin(t,0.48,0.72)*1.22;
    const R0=BX-C.total;
    const slabs=[['tools',4.4,R0,2.1],['system',3.1,R0+2.2,2.1],['messages',1.8,R0+4.37,C.total-4.37]].map(([name,y,x0,len],idx)=>{
      const b=box(1,0.9,0.22);
      G.add(b);
      let dbl=null;
      if(idx<2){
        // Doubled cache outline bars above prefix slabs (tools & system) on Cache Hit
        dbl=new THREE.Group();
        dbl.add(polyline([V(-0.5,0.54,0),V(0.5,0.54,0)],MAT.cacheLine),polyline([V(-0.5,0.65,0),V(0.5,0.65,0)],MAT.cacheLine));
        G.add(dbl);
      }
      return {name,b,dbl,pre:V(-9.4,y,0),post:V(x0+len/2,0.95,0),len};
    });
    const slabAt=(s,t)=>{const u=seg(t,0.08,0.28);return {p:s.pre.clone().lerp(s.post,u),len:lerp(3.0,s.len,u)};};
    const slotP=V(C.slot[TI],0.5,0);
    const px=C.slot[7]+0.24;
    const brMiss=polyline([V(0,1.45,0),V(0,1.62,0),V(px,1.62,0),V(px,1.45,0)],MAT.ghostDash);G.add(brMiss);
    const brHit=new THREE.Group();
    brHit.add(
      polyline([V(0,1.45,0),V(0,1.58,0),V(px,1.58,0),V(px,1.45,0)],MAT.cacheLine),
      polyline([V(0,1.69,0),V(px,1.69,0)],MAT.cacheLine)
    );
    G.add(brHit);
    // Prefill sweep indicator across either uncached suffix (hit) or entire stack (miss)
    const suf0=C.slot[8]-W[8]/2, rowEnd=C.slot[W.length-1]+W[W.length-1]/2;
    const sweep=box(0.08,1.25,1.3,MAT.ink,null);G.add(sweep);
    const msgTok=t=>{const pre=V(-8.9,1.8,0.14),post=C.ribStart();return pre.lerp(post,seg(t,0.08,0.28));};
    return {
      update(t){
        const hit=CACHE_MODE==='hit';
        slabs.forEach(s=>{
          const a=slabAt(s,t);
          s.b.visible=t<0.48;
          s.b.position.copy(a.p);
          s.b.scale.x=a.len;
          if(s.dbl){
            s.dbl.visible=hit&&t<0.48;
            s.dbl.position.copy(a.p);
            s.dbl.scale.x=a.len;
          }
        });
        C.rib.visible=false;
        C.update(cOf(t));
        if(t>=0.48&&cOf(t)<1){
          const len=Math.max(0.001,C.total*(1-Math.min(cOf(t),1)));
          C.rib.visible=true;C.rib.scale.x=len;C.rib.position.set(BX-len/2,0.95,0);
        }
        brHit.visible=hit&&t>0.74;
        brMiss.visible=!hit&&t>0.74;
        // Animate prefill sweep: fast-forward to suffix on hit, full prompt stack on miss
        const su=lin(t,0.77,0.94);
        const swOn=t>0.77&&t<0.95;
        sweep.visible=swOn;
        if(swOn){
          const x0=hit?suf0:0;
          sweep.position.set(lerp(x0,rowEnd,ease(su)),0.62,0);
        }
        // Highlight prefilled tokens briefly as sweep passes
        C.pcs.forEach((b,k)=>{
          if(!b||!b.visible) return;
          const xk=C.slot[k];
          const x0=hit?suf0:0;
          const passed=swOn&&xk>=x0&&xk<=lerp(x0,rowEnd,ease(su));
          b.userData.mesh.material=passed?MAT.ink:MAT.paper;
        });
      },
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.06,p:V(-8.9,1.8,0.14)},{t:0.28,f:t=>msgTok(t)},{t:0.48,f:()=>C.ribStart()},{t:0.74,f:t=>C.tokPos(cOf(t))||slotP.clone()},{t:0.9,p:slotP},{t:1,p:V(12,0.45,0)}]),
      shape:t=>{if(t<0.06) return CUBE.clone().lerp(V(0.9,0.5,0.24),ease(t/0.06));if(t<0.48) return V(0.9,0.5,0.24);if(t<0.9) return C.tokShape(cOf(t));return C.tokShape(2).lerp(CUBE,ease((t-0.9)/0.1));},
      cams:[{t:0,c:cam(-11.6,0,-1,1.2,5.2,1,-20,22)},{t:0.48,c:cam(-11.6,0,-1.2,11,4,1.2,-20,22)},{t:0.74,c:cam(-1.4,0,-1.2,11,3.2,1.2,-20,22)}],
      labels:[
        ['render order = cache order',V(R0+2,2.2,0),0.28,0.48],
        ['same tokenizer as training',V(BX,3.7,0),0.48,0.74],
        [()=>CACHE_MODE==='hit'?'eligible prefix read · $0.20 / MTok (doubled)':'eligible prefix write · $10 / MTok (5m)',V(px/2,2.7,0),0.74,1],
        ['prefix: tools + system',V(px/2,2.1,0),0.74,1],
        ['same ID as in stage 2',slotP.clone().add(V(0.4,1.6,0)),0.64,0.74],
        ...slabs.map(s=>[s.name,t=>slabAt(s,t).p.add(V(0,0.75,0)),0,0.28])
      ]
    };
  });

  // 07 FORWARD PASS (Layer 18 sync in Step 7.3 + interactive Sparse/Dense KV Mode)
  station(6,G=>{
    const T=tower();G.add(T.G);
    const LA=10, LM=17, yA=T.layerY(LA), yM=T.layerY(LM);
    // Align exactly with stops-manifest.js Stage 7 boundaries: 7.1=0.06, 7.2=0.248, 7.3=0.436, 7.4=0.624, 7.5=0.812
    const layerIdx7=t=>t<0.41?LA:t<0.435?lerp(LA,LM,seg(t,0.41,0.435)):LM;
    const act=at(box(5.5,0.1,5.5),0,yA,0);G.add(act);
    const EX=-9,EZ=-4.4,EG=new THREE.Group();G.add(EG);
    EG.add(at(box(3.2,6,1.4),EX,3,EZ));
    // 2D embedding matrix grid: row rulings + hidden-channel column rulings
    const rl=[];for(let k=1;k<24;k++){const y=k*0.25;rl.push(V(EX-1.6,y,EZ+0.71),V(EX+1.6,y,EZ+0.71));}
    for(let c=-3;c<=3;c++) rl.push(V(EX+c*0.42,0.02,EZ+0.71),V(EX+c*0.42,5.98,EZ+0.71));
    EG.add(segs(rl));
    const row=new THREE.Group();
    row.add(box(3.2,0.24,1.4));
    const rowCells=[];for(let c=-5;c<=5;c++) rowCells.push(V(c*0.26,-0.12,0.71),V(c*0.26,0.12,0.71));
    row.add(segs(rowCells,MAT.edge));
    G.add(row);
    const AZ=3.2,AG=new THREE.Group();G.add(AG);
    // Context sequence rail beneath compressed blocks, local window, and masked future
    AG.add(at(polyline([V(-13.1,yA-0.38,AZ),V(5.2,yA-0.38,AZ)],MAT.ghost),0,0,0));
    const blocks=[-12.2,-10.6,-9.0,-7.4].map((x,k)=>{
      const sel=k===0||k===2;
      const b=box(1.3,0.7,0.7,MAT.ink,MAT.edge);
      // Multi-slice compression ribs showing 4:1 compressed history summary
      const ribs=segs([V(-0.32,-0.35,0.36),V(-0.32,0.35,0.36),V(0,-0.35,0.36),V(0,0.35,0.36),V(0.32,-0.35,0.36),V(0.32,0.35,0.36)],MAT.ghost);
      b.add(ribs);
      at(b,x,yA,AZ);AG.add(b);
      return {x,sel,b};
    });
    const win=[-6.1,-5.4,-4.7,-4.0,-3.3];
    const winBoxes=win.map(x=>{const b=at(box(0.56,0.56,0.56),x,yA,AZ);AG.add(b);return b;});
    [3.4,4.1,4.8].forEach(x=>AG.add(at(hollowTile(0.56,0.56,0.56),x,yA,AZ)));
    // RoPE rotary phase ring around the query origin
    const ropePts=[];for(let a=0;a<=32;a++){const th=a/32*Math.PI*2;ropePts.push(V(Math.cos(th)*0.85,yA+0.28,Math.sin(th)*0.85));}
    AG.add(polyline(ropePts,MAT.cacheLine));
    const src=V(0,yA+0.3,0);
    const sparseTargets=[...blocks.filter(o=>o.sel).map(o=>V(o.x,yA+0.36,AZ)),...win.map(x=>V(x,yA+0.3,AZ))];
    const arcs=sparseTargets.map((p,k)=>{const l=curveLine(bez(src,p,2.2+k*0.14),MAT.attention);AG.add(l);return l;});
    const denseTargets=blocks.filter(o=>!o.sel).map(o=>V(o.x,yA+0.36,AZ));
    const denseArcs=denseTargets.map((p,k)=>{const l=curveLine(bez(src,p,2.6+k*0.22),MAT.attention);AG.add(l);return l;});
    const attentionSignals=connectionSignals(AG,arcs.length+denseArcs.length,colors.attention);
    // Stepped Causal Mask barrier + top stop-bracket over future tokens
    AG.add(at(box(0.14, 1.28, 1.08, MAT.fault), 2.95, yA + 0.26, AZ));
    AG.add(at(box(2.15, 0.08, 0.72, MAT.fault), 3.98, yA + 0.86, AZ));
    AG.add(polyline([V(0.3,yA+0.25,0.4),V(3.1,yA+0.25,AZ)],MAT.ghostDash));
    const MG=new THREE.Group();G.add(MG);
    const epos=a=>{const ang=a/384*Math.PI*2;return V(Math.cos(ang)*4.95,yM,Math.sin(ang)*4.95);};
    const dial=[];for(let a=0;a<384;a++){const ang=a/384*Math.PI*2,c=Math.cos(ang),s=Math.sin(ang),r0=a%32===0?4.4:4.68;dial.push(V(c*r0,yM,s*r0),V(c*5.24,yM,s*5.24));}MG.add(segs(dial,MAT.ghost));
    const SEL=[27,120,189,264,303,357];
    // Stepped FFN expert housings (narrow waist + wider intermediate slab) + upper weighted-sum merge collar
    const sel=SEL.map(a=>{
      const g=new THREE.Group();
      g.add(box(0.36,0.52,0.36,MAT.ink),box(0.56,0.22,0.56,MAT.paper,MAT.edge));
      g.position.copy(epos(a));MG.add(g);return g;
    });
    const sharedExp=new THREE.Group();
    sharedExp.add(box(0.72,0.92,0.72,MAT.ink),box(0.98,0.34,0.98,MAT.cache,MAT.edge));
    at(sharedExp,0,yM,-3.4);MG.add(sharedExp);
    const router=torus(0.55,0.07);router.rotation.x=Math.PI/2;router.position.y=yM;MG.add(router);
    const mergeCollar=torus(0.42,0.05);mergeCollar.rotation.x=Math.PI/2;mergeCollar.position.y=yM+1.15;MG.add(mergeCollar);
    const elines=SEL.map(a=>{const p=epos(a);p.y+=0.35;const l=polyline([V(0,yM,0),p]);MG.add(l);return l;});
    const mlines=SEL.map(a=>{const p=epos(a);p.y+=0.48;const l=curveLine(bez(p,V(0,yM+1.15,0),0.65),MAT.cacheLine);MG.add(l);return l;});
    MG.add(polyline([V(0,yM,0),V(0,yM,-3.4)]),curveLine(bez(V(0,yM+0.48,-3.4),V(0,yM+1.15,0),0.7),MAT.cacheLine));
    // 4-stream mHC conduits + mixing collars revealed during Step 7.4 (0.624..0.812)
    const MHC=new THREE.Group();G.add(MHC);
    const mhcPts=[];
    for(const [dx,dz] of [[-0.36,-0.36],[0.36,-0.36],[-0.36,0.36],[0.36,0.36]]) mhcPts.push(V(dx,0.8,dz),V(dx,T.top+0.2,dz));
    MHC.add(segs(mhcPts,MAT.attention));
    for(let cy=2.4;cy<T.top-0.4;cy+=2.2) MHC.add(at(box(0.92,0.08,0.92,MAT.cache,MAT.edge),0,cy,0));
    const yH=T.top+0.5,NB=36,H=[],H2=[];for(let k=0;k<NB;k++){const r=Math.abs(Math.sin(k*12.9898)*43758.5453)%1;H.push(0.12+r*0.55);}H[23]=3.0;H[9]=2.1;H[30]=1.5;H[15]=1.05;
    for(let k=0;k<18;k++){const r=Math.abs(Math.sin(k*78.233)*12345.678)%1;H2.push(0.08+r*0.35);}H2[7]=1.4;H2[12]=0.8;
    const bgeo=bg(0.2,1,0.2),bars=new THREE.InstancedMesh(bgeo,MAT.ink,NB),mtp=new THREE.InstancedMesh(bgeo,MAT.mid,18);bars.frustumCulled=false;mtp.frustumCulled=false;G.add(bars,mtp);
    const normCrown=torus(0.68,0.055);normCrown.rotation.x=Math.PI/2;normCrown.position.y=T.top+0.26;G.add(normCrown);
    const m4=new THREE.Matrix4(),sc=V(),q=new THREE.Quaternion();
    function setBars(u){for(let k=0;k<NB;k++){const h=Math.max(0.02,H[k]*u);m4.compose(V(-4.2+k*0.24,yH+h/2,0),q,sc.set(1,h,1));bars.setMatrixAt(k,m4);}bars.instanceMatrix.needsUpdate=true;for(let k=0;k<18;k++){const h=Math.max(0.02,H2[k]*u);m4.compose(V(-2.1+k*0.24,yH+h/2,-1.4),q,sc.set(1,h,1));mtp.setMatrixAt(k,m4);}mtp.instanceMatrix.needsUpdate=true;}
    const topBar=V(-4.2+23*0.24,yH+3.0+0.6,0);
    return {
      update(t){
        const in71=activeStepId?activeStepId==='7.1':(t<0.235);
        const in72=activeStepId?activeStepId==='7.2':(t>=0.235&&t<0.436);
        const in73=activeStepId?activeStepId==='7.3':(t>=0.436&&t<0.624);
        const in74=activeStepId?activeStepId==='7.4':(t>=0.624&&t<0.812);
        const in75=activeStepId?activeStepId==='7.5':(t>=0.812);
        EG.visible=in71;
        row.visible=in71&&t<0.21;const ru=seg(t,0.04,0.16);row.position.set(lerp(EX,-4.4,ru),3.6,lerp(EZ,-1.2,ru));
        // Synchronize cutaway top, act highlight plate, MG ring, mHC conduits, and LM head with stops-manifest.js
        const li=in72?LA:in73?LM:layerIdx7(t);
        let k=61;
        if(in72) k=LA+1;
        else if(in73) k=LM+1;
        else if(in74) k=Math.round(lerp(LM+1,61,lin(t,0.624,0.78)));
        T.solid(k);
        act.position.y=T.layerY(li);
        act.visible=in72||in73;
        AG.visible=in72;
        const dense=KV_MODE==='dense';
        blocks.forEach(o=>{
          const active=dense||o.sel;
          o.b.userData.mesh.visible=active;
          o.b.userData.edge.material=active?MAT.edge:MAT.ghost;
        });
        winBoxes.forEach(b=>{b.userData.mesh.material=dense?MAT.ink:MAT.paper;});
        arcs.forEach((l,j)=>reveal(l,in72?seg(t,0.20+j*0.004,0.242+j*0.004):0));
        denseArcs.forEach((l,j)=>{if(dense&&in72) reveal(l,seg(t,0.20+j*0.005,0.242+j*0.005));else l.visible=false;});
        attentionSignals([...arcs,...denseArcs],lin(t,0.248,0.436));
        MG.visible=in73;
        sel.forEach(b=>{b.position.y=yM+0.35*seg(t,0.434,0.46);});
        elines.forEach(l=>reveal(l,in73?seg(t,0.42,0.435):0));
        mlines.forEach(l=>reveal(l,in73?seg(t,0.434,0.46):0));
        MHC.visible=in74;
        normCrown.visible=bars.visible=mtp.visible=in75;setBars(in75?seg(t,0.79,0.812):0);
      },
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.06,p:V(EX+1.75,3.6,EZ)},{t:0.16,p:V(-2.6,3.6,-1.2)},{t:0.22,p:V(0,yA,0)},{t:0.41,p:V(0,yA,0)},{t:0.435,p:V(0,yM,0)},{t:0.615,p:V(0,yM,0)},{t:0.79,p:V(0,T.top+0.1,0)},{t:0.812,p:topBar},{t:0.94,p:topBar},{t:0.97,p:V(6,T.top-1,0)},{t:1,p:V(12,0.45,0)}]),
      shape:shp([[0,CUBE],[0.16,CUBE],[0.22,V(0.42,1.5,0.42)],[0.79,V(0.42,1.5,0.42)],[0.812,V(0.7,0.7,0.7)],[0.97,CUBE]]),
      cams:[{t:0,c:cam(-11,0,-5.6,3.4,T.top+0.4,3.4,-30,18)},{t:0.23,c:cam(-13,yA-1.6,-0.8,5.4,yA+3.4,3.8,-26,24)},{t:0.434,c:cam(-5.6,yM-0.6,-5.6,5.6,yM+2.0,5.6,-30,34)},{t:0.622,c:cam(-3.4,0,-3.4,3.4,T.top+1,3.4,-30,16)},{t:0.81,c:cam(-4.6,T.top-4,-2.6,4.6,T.top+4.3,2.6,-28,16)}],
      labels:[
        ['embedding table · 129,280 × 7,168*',V(EX,6.6,EZ),0,0.22],
        ['E[12842] → float[7,168]',V(-3.6,4.3,-1.2),0.06,0.23],
        [()=>KV_MODE==='dense'?'dense: attend stored history':'CSA: selected + recent KV',V(-9.6,yA-1.0,AZ),0.24,0.43],
        ['RMSNorm + RoPE, then attention',V(0.6,yA+1.9,0),0.24,0.43],
        ['router · top-6 of 384* (layer 18)',V(0.8,yM+1.4,0),0.434,0.62],
        ['6 routed experts + weighted sum',epos(120).add(V(0.3,0.9,0)),0.48,0.62],
        ['4-stream mHC × 61 layers*',V(3.2,9.5,0),0.622,0.805],
        ['LM head → 129,280 logits',V(-4.6,yH+0.7,0),0.81,1],
        ['p(“ right”) = 0.31 (illustrative)',topBar.clone().add(V(0.4,0.4,0)),0.81,1],
        [()=>KV_MODE==='dense'?'all historical KV slabs attended':'older context, compressed',V(-11.4,yA+1.1,AZ),0.28,0.43],
        ['DeepSeek-V4-Pro · 128-token window',V(-4.7,yA+1.0,AZ),0.31,0.43],
        ['future: masked',V(4.1,yA+1.15,AZ),0.34,0.43],
        ['shared expert · always on',V(0.2,yM+1.1,-3.4),0.46,0.62],
        ['MTP head: token after next',V(-2.4,yH+1.6,-1.4),0.84,1]
      ]
    };
  });

  // 08 PREFILL (interactive Sparse/Dense KV Mode updates rack density & callout)
  station(7,G=>{
    const TX=-3,T=tower();T.G.position.x=TX;G.add(T.G);
    const K=rack();K.G.position.x=4.2;G.add(K.G);
    const NI=12,TI=9;
    const row=[...Array(NI)].map((_,i)=>{if(i===TI) return null;const b=box(0.34,0.34,0.34);G.add(b);return b;});
    const rpos=(i,t)=>{const p0=V(-12+i*0.52,0.17,0),p1=V(TX-2.2+i*0.4,0.95,0),p2=V(TX-2.2+i*0.4,T.top-0.3,0);if(t<0.06) return p0;if(t<0.12) return p0.lerp(p1,seg(t,0.06,0.12));return p1.lerp(p2,lin(t,0.12,0.5));};
    const others=[-2.4,2.4].map(z=>[...Array(8)].map((_,i)=>{const b=hollowTile(0.34,0.34,0.34);G.add(b);return {b,z,i};}));
    const slotW=K.tokSlot.clone().add(V(4.2,0,0));
    return {
      update(t){
        row.forEach((b,i)=>{if(!b) return;b.visible=t<0.52;b.position.copy(rpos(i,t));});
        const ry=rpos(0,t).y;
        const shelves=clamp(Math.floor(ry-0.4),0,12)*(t>0.12?1:0);
        T.solid(t<0.12?0:61*lin(t,0.12,0.5));
        const fillShelves=t>=0.5?12:shelves;
        K.set(3*fillShelves,0);
        K.setDense(KV_MODE==='dense'?4*fillShelves:0);
        others.forEach(set=>set.forEach(o=>{const u=seg(t,0.66,0.86);o.b.visible=t>0.62;o.b.position.set(lerp(-12+o.i*0.5,TX-2.0+o.i*0.5,u),0.95,o.z);}));
      },
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.06,p:rpos(TI,0)},{t:0.5,f:t=>rpos(TI,t)},{t:0.62,p:slotW},{t:0.92,p:slotW},{t:1,p:V(12,0.45,0)}]),
      shape:shp([[0,CUBE],[0.06,V(0.5,0.5,0.5)],[0.5,V(0.5,0.5,0.5)],[0.62,SLICE]]),
      cams:[{t:0,c:cam(-6.2,0,-3,6.7,14,3,-28,18)},{t:0.62,c:cam(-12.6,0,-3,6.7,14,3,-28,18)}],
      labels:[
        ['all prompt tokens in parallel',V(TX-4,4.5,0),0.05,0.34],
        [()=>KV_MODE==='dense'?'illustrative dense KV cache':'hybrid KV · compressed + local',V(6.4,10.6,1.2),0.35,0.66],
        ['KV cache · keys + values per layer',V(5,13.7,0),0.3,0.95],
        ['“ Paris” lives here now',slotW.clone().add(V(0.6,0.8,0)),0.62,0.95],
        ['illustrative continuous batching',V(-8.6,1.9,2.4),0.66,0.98],
        ['time to first token grows with prompt length',V(TX-3.6,T.top+1.2,0),0.2,0.36]
      ]
    };
  });

  // 09 THINK (aligned with 9.1=0.06, 9.2=0.373, 9.3=0.687)
  station(8,G=>{
    const TX=-5.5,T=tower();T.G.position.x=TX;G.add(T.G);
    const K=rack();K.G.position.x=0.2;G.add(K.G);K.set(36,0);
    G.add(at(box(8.8,0.1,1.7),7.7,0.05,0));
    const pos=k=>V(3.6+(k%14)*0.6,0.33,k<14?-0.38:0.38);
    const tiles=[...Array(28)].map((_,k)=>{const b=hollowTile(0.42,0.42,0.42);b.position.copy(pos(k));G.add(b);return b;});
    const fly=hollowTile(0.42,0.42,0.42);G.add(fly);
    const slotW=K.tokSlot.clone().add(V(0.2,0,0));
    const read=curveLine(bez(V(TX,T.top,0),slotW.clone().add(V(0,0.4,0)),2.4),MAT.attention);G.add(read);
    const div=at(box(0.08,1.6,1.9),12.25,0.8,0);G.add(div);
    const toolPick=at(box(1.45,0.52,0.52,MAT.tool,MAT.edge),13.3,0.42,0);G.add(toolPick);
    return {
      update(t){const N=EFF[EFFORT],n=Math.max(t>=0.05?3:0,N*lin(t,0.05,0.68)),c=Math.floor(n),f=n-c;tiles.forEach((b,k)=>{b.visible=k<Math.min(c,N);});
        const inFlight=c<N&&t>0.05&&t<0.68;fly.visible=inFlight;if(inFlight){const p0=V(TX,T.top+0.4,0),p1=pos(c);const u=ease(f);fly.position.copy(p0.lerp(p1,u)).add(V(0,Math.sin(u*Math.PI)*2.0,0));}
        read.visible=(inFlight&&f<0.55)||t>=0.68;div.visible=t>=0.36;toolPick.visible=t>=0.68;},
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.06,p:slotW},{t:0.92,p:slotW},{t:1,p:V(12,0.45,0)}]),
      shape:()=>SLICE.clone(),
      cams:[{t:0,c:cam(-8.7,0,-2,14.2,14,2,-26,20)}],
      labels:[
        [()=>`illustrative thinking · effort ${EFFORT}`,V(7.6,1.7,0),0.05,0.37],
        ['raw reasoning encrypted · optional readable summary',V(10.4,2.6,0),0.37,0.68],
        ['reasoning selects get_weather · attends KV',V(12.8,1.8,0),0.68,1]
      ]
    };
  });

  // 10 DECODE (aligned with 10.1=0.06, 10.2=0.295, 10.3=0.53, 10.4=0.765)
  station(9,G=>{
    const TX=-6,T=tower();T.G.position.x=TX;G.add(T.G);
    const K=rack();K.G.position.x=-0.8;G.add(K.G);
    const NB=16,bgeo=bg(0.18,1,0.18),bars=new THREE.InstancedMesh(bgeo,MAT.ink,NB);bars.frustumCulled=false;G.add(bars);
    // Top-p sampling bracket above the active vocabulary probability bars
    const sampBr=polyline([V(TX-2.1,T.top+2.55,0),V(TX-2.1,T.top+2.75,0),V(TX+1.75,T.top+2.75,0),V(TX+1.75,T.top+2.55,0)],MAT.cacheLine);G.add(sampBr);
    const m4=new THREE.Matrix4(),sc=V(),q=new THREE.Quaternion(),yH=T.top+0.5;
    const W=[2.0,0.8,0.9,0.5,0.5,1.1,0.8],PARTS=['get_weather','({"','city','": ','"','Paris','"})'],TI=5;
    const slot=[];let x=3.4;W.forEach(w=>{slot.push(x+w/2);x+=w+0.1;});
    const tk=k=>0.14+k*0.1;
    const tiles=W.map((w,k)=>{if(k===TI) return null;const b=box(w,1,1);G.add(b);return b;});
    const ghosts=W.map(w=>{const b=hollowTile(w,1,1);G.add(b);return b;});
    const picker=box(0.24,0.24,0.24,MAT.ink,null);G.add(picker);
    const slotW=K.tokSlot.clone().add(V(-0.8,0,0));
    const copy=curveLine(bez(V(TX,T.top+0.2,0),slotW.clone().add(V(0,0.4,0)),2.2),MAT.attention);G.add(copy);
    const peak=k=>(k*5+3)%NB;
    function setBars(t){let tick=Math.floor(Math.max(0,t-0.06)/0.11);tick=clamp(tick,0,6);const ph=clamp(((Math.max(0,t-0.06))%0.11)/0.11,0,1);for(let j=0;j<NB;j++){let h=0.12+(Math.abs(Math.sin((j+1)*(tick+3)*7.13))%1)*0.5;if(j===peak(tick)) h=1.8;h*=0.5+0.5*ease(ph*2);m4.compose(V(TX-2.0+j*0.24,yH+h/2,0),q,sc.set(1,h,1));bars.setMatrixAt(j,m4);}bars.instanceMatrix.needsUpdate=true;}
    return {
      update(t){bars.visible=t>=0.05&&t<0.9;sampBr.visible=t>=0.28&&t<0.53;setBars(t);
        tiles.forEach((b,k)=>{if(!b) return;const a=tk(k),u=seg(t,a,a+0.04);b.visible=t>a;b.position.set(slot[k],lerp(3.2,0.5,u),0);});
        ghosts.forEach((b,k)=>{const prev=k-1;b.visible=(prev>=0&&t>tk(prev)+0.04&&t<tk(k)&&k<W.length)||(t>=0.52&&t<0.72&&(k===4||k===5));b.position.set(slot[k],0.5,0);});
        let pk=-1;for(let k=0;k<W.length;k++){if(t>tk(k)-0.035&&t<tk(k)) pk=k;}picker.visible=pk>=0||(t>=0.29&&t<0.36);if(picker.visible){const usePk=pk>=0?pk:2;const tick=clamp(Math.floor((tk(usePk)-0.06)/0.11),0,6);const p0=V(TX-2.0+peak(tick)*0.24,yH+2.0,0),p1=V(slot[usePk],1.2,0);const u=pk>=0?lin(t,tk(pk)-0.035,tk(pk)):0.45;picker.position.copy(p0.lerp(p1,u)).add(V(0,Math.sin(u*Math.PI)*1.5,0));}
        const grown=clamp(Math.floor((t-0.14)/0.1)+1,0,7);K.set(36,t<0.14?0:grown);copy.visible=(t>=0.05&&t<0.28)||(t>=0.74&&t<0.9);},
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.06,p:slotW},{t:0.62,p:slotW},{t:0.7,p:V(TX,T.top+0.6,0)},{t:0.76,p:V(slot[TI],0.5,0)},{t:0.92,p:V(slot[TI],0.5,0)},{t:1,p:V(12,0.45,0)}]),
      shape:shp([[0,CUBE],[0.06,SLICE],[0.62,SLICE],[0.7,V(0.6,0.6,0.6)],[0.76,V(1.1,1,1)],[0.92,V(1.1,1,1)],[1,CUBE]]),
      cams:[{t:0,c:cam(-9.2,0,-2,11.4,15.8,2,-24,18)}],
      labels:[
        ['often memory-bound: weights + selected cached history',V(-0.6,13.8,0),0.05,0.29],
        ['sampler · selects from probability distribution',V(TX-1.2,T.top+3.1,0),0.29,0.52],
        ['MTP draft, verified next step',V(5.2,2.1,0),0.52,0.76],
        ['“Paris” ≠ “ Paris”: different IDs',V(slot[TI],2.3,0),0.76,1],
        [t=>PARTS.filter((_,k)=>t>tk(k)+0.02).join('')||'…',V(slot[0]-W[0]/2,2.6,0),0.36,0.52]
      ]
    };
  });

  // 11 STREAM
  station(10,G=>{
    const W=[2.0,0.8,0.9,0.5,0.5,1.1,0.8],TI=5;const slot=[];let x=-11.8;W.forEach(w=>{slot.push(x+w/2);x+=w+0.1;});
    W.forEach((w,k)=>{if(k!==TI) G.add(at(box(w,1,1),slot[k],0.5,0));});
    const FX=-3.6;G.add(at(box(0.18,2.2,0.18),FX,1.1,-1.0),at(box(0.18,2.2,0.18),FX,1.1,1.0),at(box(0.18,0.18,2.18),FX,2.2,0));
    G.add(at(box(9.6,0.08,1.4),1.6,0.04,0),at(box(9.6,0.36,0.06),1.6,0.22,-0.7),at(box(9.6,0.36,0.06),1.6,0.22,0.7));
    const ring=torus(0.95,0.07);ring.rotation.y=Math.PI/2;ring.position.set(1.6,0.62,0);G.add(ring);
    const SCR=screen([3.4,2.6,3.8,2.2,3.0,1.6]),SX=9.8,RY=-0.35;SCR.G.position.x=SX;SCR.G.rotation.y=RY;G.add(SCR.G);
    const onScreen=(lx,ly)=>V(SX+lx*Math.cos(RY)+0.12*Math.sin(RY),ly,-lx*Math.sin(RY)+0.12*Math.cos(RY));
    const pulses=[...Array(5)].map(()=>{const b=box(0.16,0.16,0.16,MAT.ink,null);G.add(b);return b;});
    const tgt=onScreen(-0.9,3.45-2*0.38);
    return {
      update(t){const v=t>0.24&&t<0.86;pulses.forEach((b,k)=>{b.visible=v;b.position.set(-3+(((t-0.24)*5+k/5)%1)*9.6,0.5,0);});SCR.show(seg(t,0.36,0.86));},
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.08,p:V(slot[TI],0.5,0)},{t:0.2,p:V(slot[TI],0.5,0)},{t:0.3,p:V(FX,0.6,0)},{t:0.62,p:V(6.6,0.6,0)},{t:0.74,p:tgt},{t:0.92,p:tgt},{t:1,p:V(12,0.45,0)}]),
      shape:shp([[0,CUBE],[0.08,V(1.1,1,1)],[0.2,V(1.1,1,1)],[0.3,V(0.5,0.6,0.3)],[0.62,V(0.5,0.6,0.3)],[0.74,V(1.4,0.44,0.3)],[0.92,V(1.4,0.44,0.3)],[1,CUBE]]),
      cams:[{t:0,c:cam(-12.3,0,-1.7,12.3,4.6,1.7,-22,22)}],
      labels:[
        ['detokenize: IDs → UTF-8 bytes',V(FX,3.0,0),0.06,0.37],
        ['server-sent events · content_block_delta',V(1.6,1.7,1.0),0.37,0.68],
        ['stop_reason "tool_use"',V(SX,0.4,1.4),0.68,1],
        ['your app',onScreen(0,4.3),0.44,0.68],
        ['safety classifier (can end with "refusal")',V(1.6,2.1,0),0.72,1]
      ]
    };
  });

  // 12 TOOL LOOP (Prefix Cache Hit/Miss live sync + Step 12.4 150K Compaction visual)
  station(11,G=>{
    const SCR=screen(),SX=-9.6;SCR.G.position.x=SX;SCR.G.rotation.y=-0.35;G.add(SCR.G);
    G.add(at(box(2.2,2.2,2.2),-3.6,1.1,0));
    G.add(segs([V(-12.4,0.01,-2.6),V(-1.9,0.01,-2.6),V(-1.9,0.01,-2.6),V(-1.9,0.01,2.6),V(-1.9,0.01,2.6),V(-12.4,0.01,2.6),V(-12.4,0.01,2.6),V(-12.4,0.01,-2.6)],MAT.ghostDash));
    const res=box(1.5,0.7,0.7,MAT.tool);G.add(res);
    const loop=bez(V(-2.0,1.0,0),V(3.0,0.5,0),9);const loopL=curveLine(loop);G.add(loopL);
    const MX=5.0,T=tower();T.G.scale.setScalar(0.5);T.G.position.x=MX;G.add(T.G);const mtop=T.top*0.5;
    const pre=[...Array(7)].map((_,k)=>{const b=box(0.32,0.32,0.32);b.position.set(0.9+k*0.38,0.16,1.2);G.add(b);return b;});
    const nw=[0,1].map(()=>{const b=box(0.42,0.42,0.42);G.add(b);return b;});
    const dbl=[polyline([V(0.7,0.55,1.2),V(3.4,0.55,1.2)],MAT.cacheLine),polyline([V(0.7,0.68,1.2),V(3.4,0.68,1.2)],MAT.cacheLine)];dbl.forEach(l=>G.add(l));
    const W=[0.62,0.5,0.5,0.56,0.7,0.42,0.95,0.28],TI=6,ANS=['It’s',' 18',' °C',' and',' clear',' in',' Paris','.'];const slot=[];let x=7.0;W.forEach(w=>{slot.push(x+w/2);x+=w+0.08;});
    const ta=k=>0.66+k*0.022;
    const ans=W.map((w,k)=>{if(k===TI) return null;const b=box(w,1,1);G.add(b);return b;});
    G.add(at(box(0.16,3.2,0.16),13.7,1.6,0),at(box(0.9,0.08,0.9),13.7,0.04,0));
    // Step 12.4 — 150K Server-Side Compaction cue along back context rail (z = -2.0)
    const CZ=-2.0, CX0=1.6;
    const compRail=polyline([V(-2.5,0.02,CZ),V(5.7,0.02,CZ)],MAT.ghostDash);G.add(compRail);
    const compTurns=[...Array(8)].map((_,k)=>{
      const b=box(0.54,0.44,0.62);
      b.position.set(-2.1+k*0.78,0.22,CZ);
      b.visible=false;G.add(b);return b;
    });
    const compSlab=new THREE.Group();
    compSlab.position.set(CX0,0.34,CZ);
    compSlab.add(
      box(1.9,0.54,0.72,MAT.paper,MAT.edge),
      box(2.08,0.68,0.88,null,MAT.edge),
      polyline([V(-1.04,0.44,0),V(1.04,0.44,0)],MAT.edge),
      polyline([V(-1.04,0.56,0),V(1.04,0.56,0)],MAT.edge)
    );
    compSlab.visible=false;G.add(compSlab);
    return {
      update(t){
        const hit=CACHE_MODE==='hit';
        const ru=lin(t,0.3,0.5);
        res.visible=t>0.22&&t<0.52;
        res.position.copy(t<0.3?V(-3.6,1.1,0).lerp(V(-2.0,1.0,0),seg(t,0.22,0.3)):loop.getPoint(ease(ru)).add(V(0,0.5,0)));
        reveal(loopL,seg(t,0.28,0.4));
        dbl.forEach(l=>{l.visible=hit&&t>0.48;});
        const preU=seg(t,0.48,0.62);
        pre.forEach((b,k)=>{
          const x0=0.9+k*0.38;
          if(hit){
            b.visible=t>0.42;
            b.position.set(x0,0.16,1.2);
          }else{
            b.visible=t>0.42&&t<0.64;
            b.position.set(lerp(x0,MX-0.75+k*0.24,preU),lerp(0.16,mtop,preU),lerp(1.2,0,preU));
          }
        });
        nw.forEach((b,k)=>{b.visible=t>0.46&&t<0.64;const u=seg(t,0.52,0.62);b.position.set(lerp(3.7+k*0.48,MX,u),lerp(0.21,mtop,u),lerp(1.2,0,u));});
        ans.forEach((b,k)=>{if(!b) return;const a=ta(k);b.visible=t>a;b.position.set(slot[k],lerp(2.4,0.5,seg(t,a,a+0.03)),0);});
        // Step 12.4 compaction animation
        const compOn=t>0.76;
        const cu=seg(t,0.79,0.92);
        compRail.visible=compOn;
        compTurns.forEach((b,k)=>{
          b.visible=compOn&&cu<0.96;
          if(b.visible){
            const x0=-2.1+k*0.78;
            b.position.set(lerp(x0,CX0,cu),0.22,CZ);
            b.scale.set(lerp(1,0.22,cu),lerp(1,0.85,cu),1);
          }
        });
        const slabU=seg(cu,0.28,1);
        compSlab.visible=compOn&&slabU>0.02;
        if(compSlab.visible){
          compSlab.scale.set(lerp(0.4,1,slabU),lerp(0.6,1,slabU),1);
        }
      },
      tok:track([{t:0,p:V(-12,0.45,0)},{t:0.08,p:V(-3.6,1.1,1.25)},{t:0.2,p:V(-3.6,1.1,1.25)},{t:0.3,p:V(-2.0,1.0,0)},{t:0.5,f:t=>loop.getPoint(ease(lin(t,0.3,0.5)))},{t:0.62,p:V(MX,mtop+0.3,0)},{t:0.8,p:V(slot[TI],0.5,0)},{t:0.93,p:V(slot[TI],0.5,0)},{t:1,p:V(13.15,0.45,0)}]),
      shape:shp([[0,CUBE],[0.08,V(0.9,0.36,0.24)],[0.2,V(0.9,0.36,0.24)],[0.3,V(0.7,0.7,0.7)],[0.62,V(0.7,0.7,0.7)],[0.8,V(0.95,1,1)],[0.93,V(0.95,1,1)],[1,V(0.8,0.8,0.8)]]),
      cams:[{t:0,c:cam(-12.5,0,-2.8,14.2,9.6,2.7,-22,20)}],
      labels:[
        ['your code runs get_weather',V(-3.6,2.9,0),0.04,0.2],
        [()=>innerWidth<520?'tool_result · {"temp_c": 18, "conditions": "clear"}':'tool_result · {"temp_c": 18, "conditions": "clear"} (illustrative)',V(-1.6,2.3,0),0.2,0.29],
        [()=>CACHE_MODE==='hit'?'eligible prefix read · $0.20 / MTok':'eligible prefix write · $10 / MTok (5m)',V(2.0,1.4,1.2),0.29,0.53],
        ['150K compaction → summary',V(CX0,1.55,CZ),0.76,1],
        [t=>ANS.filter((_,k)=>t>ta(k)+0.02).join('')||'…',V(slot[0]-W[0]/2,2.7,0),0.53,0.76],
        [()=>CACHE_MODE==='hit'?'prefill only the new tokens':'prefill entire prompt stack',V(MX+1.5,mtop+0.6,0),0.42,0.53],
        ['stop_reason "end_turn"',V(9.5,-0.9,0),0.68,0.76],
        ['whole conversation sent again',V(0.5,5.6,0),0.36,0.46],
        ['your app',V(-7,0.3,3.0),0.04,0.29],
        ['your screen',V(13.7,3.7,0),0.62,0.76]
      ]
    };
  });

  /* ---------- token + line ---------- */
  MAT.token.depthTest=false;MAT.tokEdge.depthTest=false;
  const TOKEN=new THREE.Group();const tokM=new THREE.Mesh(bg(1,1,1),MAT.token);tokM.renderOrder=20;const tokE=new THREE.LineSegments(eg(bg(1,1,1)),MAT.tokEdge);tokE.renderOrder=21;
  // Internal registration ticks so when TOKEN elongates into float[7,168] or a KV slice it reads as a segmented tensor
  const tokTicksPts=[];
  for(const y of [-0.25,0,0.25]) tokTicksPts.push(V(-0.5,y,0.502),V(0.5,y,0.502),V(0.502,y,-0.5),V(0.502,y,0.5));
  const tokTicks=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tokTicksPts),MAT.tokEdge);
  tokTicks.renderOrder=21;TOKEN.add(tokM,tokE,tokTicks);scene.add(TOKEN);
  const lineS=polyline([V(LINE0,0.01,0),V(LINE0+0.01,0.01,0)],MAT.edge),lineD=polyline([V(LINE0,0.01,0),V(LINE1,0.01,0)],MAT.ghostDash);scene.add(lineS,lineD);
  const tickPts=[];for(let i=0;i<=12;i++){const x=i===0?LINE0:i===12?LINE1:i*SP-SP/2;tickPts.push(V(x,0.01,-0.5),V(x,0.01,0.5));}scene.add(segs(tickPts,MAT.edge));
  function setLine(x){x=clamp(x,LINE0+0.01,LINE1);const a=lineS.geometry.attributes.position;a.setX(1,x);a.needsUpdate=true;lineS.geometry.computeBoundingSphere();const b=lineD.geometry.attributes.position;b.setX(0,x);b.needsUpdate=true;lineD.computeLineDistances();lineD.geometry.computeBoundingSphere();}
  function tokenAt(g){const i=clamp(Math.floor(g),0,11),t=clamp(g-i,0,1),S=ST[i];const p=S.tok(t).add(V(i*SP,0,0));const s=S.shape(t);return {p,s,i,t};}
  function setStations(g){for(const S of ST){const t=clamp(g-S.i,0,1);if(S._t!==t){S.update(t);S._t=t;}}}

  /* ---------- cameras ---------- */
  function camWorld(S,t){const c=S.cam(t);const b=c.b.slice();b[0]+=S.i*SP;b[3]+=S.i*SP;return {b,az:c.az,el:c.el};}
  function storyCam(g){const i=clamp(Math.floor(g),0,11),t=g-i,Wd=0.1;
    if(t<Wd&&i>0) return camLerp(camWorld(ST[i-1],1),camWorld(ST[i],0),ease((t+Wd)/(2*Wd)));
    if(t>1-Wd&&i<11) return camLerp(camWorld(ST[i],1),camWorld(ST[i+1],0),ease((t-(1-Wd))/(2*Wd)));
    return camWorld(ST[i],clamp(t,0,1));}
  const _dir=V(),_rt=V(),_up=V(),_o=V(),_q=V();
  function frameCam(c3,c,aspect,fx,fy,shift){
    const az=c.az*D2R,el=c.el*D2R,b=c.b;
    _dir.set(Math.cos(el)*Math.sin(az),Math.sin(el),Math.cos(el)*Math.cos(az));_rt.set(Math.cos(az),0,-Math.sin(az));_up.crossVectors(_dir,_rt).normalize();
    _o.set((b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2);
    let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;
    for(let i=0;i<8;i++){_q.set(i&1?b[3]:b[0],i&2?b[4]:b[1],i&4?b[5]:b[2]).sub(_o);const u=_q.dot(_rt),v=_q.dot(_up);if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v;}
    const hView=Math.max((v1-v0)/fy,(u1-u0)/(aspect*fx));
    const tgt=_o.clone().addScaledVector(_rt,(u0+u1)/2).addScaledVector(_up,(v0+v1)/2+hView*shift);
    c3.position.copy(tgt).addScaledVector(_dir,170);c3.up.set(0,1,0);c3.lookAt(tgt);
    const hh=hView/2,ww=hh*aspect;c3.left=-ww;c3.right=ww;c3.top=hh;c3.bottom=-hh;c3.near=1;c3.far=420;c3.updateProjectionMatrix();
  }


  const camera = new THREE.OrthographicCamera();
  // Flat paper-thin architectural drafting grid across all 12 stations (no thick 3D plank).
  const foundation = new THREE.Group();
  const grid = [];
  for (let x = Math.ceil(LINE0); x <= Math.floor(LINE1); x += 2) grid.push(V(x, -0.01, -6.5), V(x, -0.01, 6.5));
  for (let z = -6; z <= 6; z += 2) grid.push(V(LINE0, -0.01, z), V(LINE1, -0.01, z));
  foundation.add(segs(grid, new THREE.LineBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.42 })));
  scene.add(foundation);

  const openingCam = cam(-13, -1, -6.3, 57, 13.8, 6.3, -61, 24);
  const openingClose = cam(-10, 0, -5.3, 8, 6.5, 5.3, -38, 24);
  const overview = cam(-14, -1, -6, LINE1, 17, 6, -73, 27);

  /* Pose follow. The diagram is a pure function of pose g, so easing g glides the camera, token
     and stations together instead of stepping with each wheel notch or stage seam. Leaving or
     entering the opening or full-line shots, and jumps over a stage, still cut (the host
     crossfades those). Critical damping matches the spatial rig; one stalled frame can only
     advance the follow by about the recent frame pace, so a hitch never reads as a leap. */
  const POSE_SMOOTH = .18, MAX_GLIDE = 1, POSE_EPS = .0004, POSE_VEL_EPS = .004;
  const STEP_FLOOR = 1 / 30, STEP_PACE_CAP = 2, PACE_RATE = .15;
  const follow = { ready: false, g: 0, v: 0, t: 0, pace: 1 / 60, moving: false, shot: '' };
  const poseGoal = state => state.opening ? 0.22 : clamp(state.diagramPose ?? 0, 0, 12);
  const shotKind = state => state.opening ? 'opening'
    : (state.overview || (state.recap && state.camera === 'overhead')) ? 'line' : 'story';
  // Without a frame clock (tests, headless reconstruction) every pose is exact and order-independent.
  function cuts(state) {
    return typeof performance === 'undefined' || !follow.ready || !!state.reducedMotion || !!state.snapCamera
      || follow.shot !== shotKind(state)
      || Math.abs(poseGoal(state) - follow.g) > MAX_GLIDE;
  }
  function followPose(state) {
    const goal = poseGoal(state);
    const clock = typeof performance !== 'undefined' ? performance.now() : 0;
    const gap = follow.ready ? Math.max(0, (clock - follow.t) / 1000) : 0;
    const snap = cuts(state);
    follow.t = clock;
    follow.shot = shotKind(state);
    follow.ready = true;
    if (!snap) {
      const step = Math.min(gap, Math.max(STEP_FLOOR, follow.pace * STEP_PACE_CAP));
      // The first frame of a new flight has no meaningful gap; the next one starts the clock.
      const dt = follow.moving ? step : 0;
      if (follow.moving) follow.pace += (step - follow.pace) * PACE_RATE;
      if (dt) {
        const omega = 2 / POSE_SMOOTH, e = Math.exp(-omega * dt);
        const change = follow.g - goal, temp = (follow.v + omega * change) * dt;
        follow.g = goal + (change + temp) * e;
        follow.v = (follow.v - omega * temp) * e;
      }
    }
    const still = Math.abs(follow.g - goal) < POSE_EPS && Math.abs(follow.v) < POSE_VEL_EPS;
    if (snap || still) { follow.g = goal; follow.v = 0; }
    follow.moving = !snap && !still;
    return follow.g;
  }

  let activeStepId = '';
  function update(state, aspect, viewportWidth) {
    const settings = state.settings || {};
    const stepHint = (!state.opening && !state.recap && !state.overview && state.stepId) ? String(state.stepId) : '';
    const nextSettings = [settings.kv, settings.cache, settings.effort, !!state.reducedMotion, stepHint].join('|');
    if (settingsKey !== nextSettings) {
      KV_MODE = settings.kv === 'dense' ? 'dense' : 'sparse';
      CACHE_MODE = settings.cache === 'miss' ? 'miss' : 'hit';
      EFFORT = Object.hasOwn(EFF, settings.effort) ? settings.effort : 'high';
      reducedMotion = !!state.reducedMotion;
      activeStepId = stepHint;
      ST.forEach(station => { station._t = -1; });
      settingsKey = nextSettings;
    }

    const g = followPose(state);
    const moving = follow.moving;
    const { p, s, i, t } = tokenAt(g);
    const compact = (typeof window !== 'undefined' ? window.innerWidth < 768 : viewportWidth < 500) || aspect < 0.85;
    const fullLine = Boolean(state.overview || (state.recap && state.camera === 'overhead'));
    setStations(g);
    foundation.visible = true;
    for (const station of ST) {
      station.G.visible = state.opening ? station.i < (compact ? 1 : 3)
        : fullLine || station.i === i
          || (station.i === i - 1 && t < 0.04) || (station.i === i + 1 && t > 0.94);
    }
    TOKEN.position.copy(p);
    TOKEN.scale.copy(s).multiplyScalar(state.opening ? 1.65 : 1);
    setLine(fullLine ? LINE1 : p.x);

    let shot = storyCam(g);
    if (state.opening) shot = compact ? openingClose : openingCam;
    if (fullLine) shot = overview;
    if (!state.opening && !fullLine && (state.camera === 'overhead' || state.camera === 'close' || compact)) {
      const { b, az, el } = shot;
      shot = state.camera === 'overhead'
        ? { b, az: -26, el: 66 }
        : { b, az: az - (compact ? 14 : 5), el: el + (compact ? 5 : 2) };
    }
    const scale = state.opening ? 0.94 : (state.camera === 'close' || compact ? 0.99 : 0.86);
    const shift = state.recap || state.present ? 0.09 : 0.0;
    frameCam(camera, shot, aspect, scale, scale, shift);

    const station = ST[i];
    let activeCoverage;
    if (compact && state.opening) {
      const noun = theme.projectedExtent(THREE, station.G, camera);
      const center = noun.getCenter(new THREE.Vector2());
      const size = noun.getSize(new THREE.Vector2());
      const zoom = Math.min(1.3 / size.y, 1.76 / size.x);
      const halfHeight = camera.top;
      const halfWidth = camera.right;
      camera.left = halfWidth * (center.x - 1 / zoom);
      camera.right = halfWidth * (center.x + 1 / zoom);
      camera.bottom = halfHeight * (center.y - 1 / zoom);
      camera.top = halfHeight * (center.y + 1 / zoom);
      camera.updateProjectionMatrix();
      activeCoverage = size.y * zoom / 2;
    }
    const matches = station.labels.filter(([text, , start, end]) => text && t >= start && t <= end);
    let active = matches[0];
    if (matches.length > 1) {
      // Prefer interactive mode labels (functions) or narrower step-specific intervals over broad station spans.
      const minSpan = Math.min(...matches.map(([, , s0, e0]) => e0 - s0));
      const specific = matches.filter(([lbl, , s0, e0]) => typeof lbl === 'function' || (e0 - s0) <= minSpan + 0.12);
      const pool = specific.length ? specific : matches;
      const [s0, e0] = [pool[0][2], pool[0][3]];
      const uPool = clamp((t - s0) / Math.max(0.01, e0 - s0), 0, 0.999);
      active = pool[Math.min(pool.length - 1, Math.floor(uPool * pool.length))];
    }
    // token: where the token block sits, so a host page can dock its own token marker onto the drawing.
    const token = p.clone();
    if (state.opening || state.recap || fullLine || !active) return { anchor: p, label: '“ Paris”', activeCoverage, moving, token };
    const [label, position] = active;
    const anchor = typeof position === 'function' ? position(t) : position.clone();
    return { anchor: anchor.add(V(i * SP, 0, 0)), label: typeof label === 'function' ? label(t) : label, moving, token };
  }

  // Opening, story and full-line shots are different framings of the hall, not one path.
  const shotChanges = state => follow.ready && follow.shot !== shotKind(state);

  return { scene, camera, update, cuts, shotChanges };
}

window.ReaderDiagram = Object.freeze({ create });
})();

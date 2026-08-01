/* ============================================================
   3D COSMOLOGY: THE WORLD-CAGE — v2, painterly upgrade
   Atmosphere fresnel, drifting clouds, high-res fbm terrain from
   the shared palettes, bump relief, river tubes, vegetation,
   volcano glow, day/night, flyTo tweens, fading sprite labels,
   luminous kingdom borders.
   ============================================================ */
(function(){
'use strict';
const D=TDA_DATA, G=TDA_GEO;
const { WORLD, KINGDOMS, MOUNTAINS, RIVERS, FORESTS, FOREST_RING, SETTLEMENTS,
        WONDERS, HIDDEN, ISLANDS, COSMOS, coastNoise } = D;
const mount=document.getElementById('cosmosMount');
let renderer,scene,camera,clock,leviathans=[],pickables=[],started=false,running=false;
let rot={theta:Math.PI*0.25, phi:Math.PI*0.32, dist:4200};
let tgt={x:0,y:0,z:0};
let tween=null;
/* Scale of the cage. The ocean between the continent's coast and the wall is
   the point: R_WALL-R_CONT_A is the narrowest gap (due east/west), and canon
   wants it to read as a great ocean, not a moat. At 1850 that gap is 850
   scene units — 85% of the continent's own major radius, and 150% of its
   minor — so the wall stands a continent's width off the coast at every
   bearing. Everything downstream (bowl, oceans, wall furniture, pillar and
   star heights, leviathan orbits, camera framing) is derived from these. */
const R_CONT_A=1000, R_CONT_B=740;
const CAGE=1.321;                      // scale-up applied when the ocean was widened
const R_INNER=1800;                    // inner ocean, out to the foot of the wall
const R_WALL=1850, WALL_H=225;
const R_OUTER=3050;
const R_CLOUD=R_CONT_A*1.22;           // cloud decks belong to the continent, not the cage
const KX=R_CONT_A/WORLD.a, KZ=R_CONT_B/WORLD.b;   // miles -> scene units
const wx2s=x=>(x-WORLD.cx)*KX, wy2s=y=>(y-WORLD.cy)*KZ;

let dayNight=0.14; // 0 = noon, 1 = deep night
let SEASON=1;
let contMat=null, sun=null, under=null, ambient=null, cloudDisc=null, cloudDisc2=null;
let nightLights=null, wallMat=null, labelGroup=null, borderGroup=null, starPoints=null;
let volcanoGlows=[], atmoShell=null;

function texFromCanvas(fn,w,h){
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  fn(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.anisotropy=4; return t;
}

/* ---- fresnel atmosphere shader (ported from the reference globe) ---- */
function atmosphereMaterial(color,intensity,inside){
  return new THREE.ShaderMaterial({
    uniforms:{ glowColor:{value:new THREE.Color(color)}, intensity:{value:intensity} },
    vertexShader:`varying vec3 vN;
      void main(){ vN=normalize(normalMatrix*normal);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader:`uniform vec3 glowColor; uniform float intensity; varying vec3 vN;
      void main(){
        float f=pow(0.65 - dot(vN, vec3(0.0,0.0,1.0)), 2.6) * intensity;
        gl_FragColor=vec4(glowColor, clamp(f,0.0,1.0)); }`,
    side: inside?THREE.BackSide:THREE.FrontSide,
    blending:THREE.AdditiveBlending, transparent:true, depthWrite:false,
  });
}

/* ---- cloud texture: fbm-stamped, semi-transparent, drifting ---- */
function buildCloudTexture(w,h,seed){
  return texFromCanvas((g)=>{
    g.clearRect(0,0,w,h);
    const img=g.createImageData(w,h);
    const Dd=img.data;
    for(let j=0;j<h;j++) for(let i=0;i<w;i++){
      const dx=i/w-0.5, dy=j/h-0.5;
      const r=Math.sqrt(dx*dx+dy*dy)*2;
      if(r>1){ continue; }
      const n=G.fbm(i*0.018+seed*37, j*0.018+seed*61);
      const n2=G.fbm(i*0.05+seed*11, j*0.05+seed*7);
      let a=(n*0.75+n2*0.25-0.46)*3.2;
      a*=Math.max(0,1-r*r);           // fade at the rim
      if(a<=0) continue;
      const o=(j*w+i)*4;
      Dd[o]=235; Dd[o+1]=240; Dd[o+2]=246; Dd[o+3]=Math.min(210,a*255);
    }
    g.putImageData(img,0,0);
  },w,h);
}

/* ---- bump map baked from the mountain field ---- */
function buildBumpTexture(w,h){
  const pad=1.13;
  const x0=WORLD.cx-WORLD.a*pad, x1=WORLD.cx+WORLD.a*pad;
  const y0=WORLD.cy-WORLD.b*pad, y1=WORLD.cy+WORLD.b*pad;
  return texFromCanvas((g)=>{
    const img=g.createImageData(w,h);
    const Dd=img.data;
    for(let j=0;j<h;j++){
      const y=y0+(j+0.5)/h*(y1-y0);
      for(let i=0;i<w;i++){
        const x=x0+(i+0.5)/w*(x1-x0);
        let v=18;
        const md=G.MTNFIELD.sample(x,y);
        if(md<110){
          const t=1-md/110;
          const ridge=G.fbm(x*0.02,y*0.02);
          v=18+t*(120+ridge*117);
        } else v=18+G.fbm(x*0.008,y*0.008)*26;
        const o=(j*w+i)*4;
        Dd[o]=Dd[o+1]=Dd[o+2]=v; Dd[o+3]=255;
      }
    }
    g.putImageData(img,0,0);
  },w,h);
}

/* ---- quick placeholder continent texture (until the worker's 4096 arrives) ---- */
function paintContinentPlaceholder(g,w,h){
  const img=g.createImageData(w,h);
  const pad=1.13;
  G.paintRegion(img.data,w,h,
    WORLD.cx-WORLD.a*pad, WORLD.cy-WORLD.b*pad,
    WORLD.cx+WORLD.a*pad, WORLD.cy+WORLD.b*pad,
    {style:'satellite',season:SEASON,waterAlpha:0});
  g.putImageData(img,0,0);
}
function requestHiResContinent(){
  if(!window.__requestCosmosTexture||!contMat) return;
  window.__requestCosmosTexture('satellite',SEASON,4096).then(bitmap=>{
    const t=new THREE.CanvasTexture(bitmap);
    t.anisotropy=8;
    const old=contMat.map;
    contMat.map=t; contMat.needsUpdate=true;
    if(old) old.dispose();
  });
}

/* ---- ice wall texture: carved faces, glowing eyes ---- */
function paintWall(g,w,h,emissive){
  if(!emissive){
    const grad=g.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,'#dceef8'); grad.addColorStop(0.5,'#9cc4dc'); grad.addColorStop(1,'#5d86a4');
    g.fillStyle=grad; g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(40,70,95,0.35)';
    for(let i=0;i<w;i+=8){ g.beginPath(); g.moveTo(i,0); g.lineTo(i+((i*7)%13)-6,h); g.stroke(); }
  } else { g.fillStyle='#000'; g.fillRect(0,0,w,h); }
  const faces=28, fw=w/faces;
  for(let i=0;i<faces;i++){
    const x=i*fw+fw/2, y=h*0.52, s=fw*0.36;
    if(!emissive){
      g.strokeStyle='rgba(30,55,80,0.75)'; g.lineWidth=3;
      g.beginPath(); g.ellipse(x,y,s*0.75,s,0,0,7); g.stroke();
      g.beginPath(); g.moveTo(x-s*0.3,y+s*0.35); g.quadraticCurveTo(x,y+s*0.55,x+s*0.3,y+s*0.35); g.stroke();
      g.beginPath(); g.moveTo(x,y-s*0.1); g.lineTo(x-s*0.1,y+s*0.15); g.lineTo(x+s*0.08,y+s*0.15); g.stroke();
      g.beginPath(); g.moveTo(x-s*0.55,y-s*0.5); g.quadraticCurveTo(x,y-s*0.95,x+s*0.55,y-s*0.5); g.stroke();
    }
    g.fillStyle= emissive ? '#8fd8ff' : 'rgba(150,225,255,0.95)';
    g.beginPath(); g.ellipse(x-s*0.32,y-s*0.18,s*0.13,s*0.09,0,0,7); g.fill();
    g.beginPath(); g.ellipse(x+s*0.32,y-s*0.18,s*0.13,s*0.09,0,0,7); g.fill();
  }
}

function makeLeviathan(len,rad,color){
  const seg=60, pts=[];
  for(let i=0;i<=seg;i++) pts.push(new THREE.Vector3((i/seg-0.5)*len,0,0));
  const curve=new THREE.CatmullRomCurve3(pts);
  const geo=new THREE.TubeGeometry(curve,seg,rad,10,false);
  const mat=new THREE.MeshStandardMaterial({color:color,roughness:0.85,metalness:0.1,emissive:0x03151c,emissiveIntensity:0.7});
  const mesh=new THREE.Mesh(geo,mat);
  const head=new THREE.Mesh(new THREE.SphereGeometry(rad*1.6,14,12),mat);
  head.position.x=len/2; mesh.add(head);
  for(let i=1;i<5;i++){
    const fin=new THREE.Mesh(new THREE.ConeGeometry(rad*0.9,rad*2.6,6),mat);
    fin.position.set(len/2 - i*len/5.2, rad*0.9, 0); fin.rotation.z=0.4;
    mesh.add(fin);
  }
  return mesh;
}

/* ---- text sprites for feature labels ---- */
function makeTextSprite(text,px,color){
  const c=document.createElement('canvas');
  const g=c.getContext('2d');
  const font=`600 ${px}px Georgia,serif`;
  g.font=font;
  const w=Math.ceil(g.measureText(text).width)+16, h=px+14;
  c.width=w; c.height=h;
  g.font=font; g.textAlign='center'; g.textBaseline='middle';
  g.strokeStyle='rgba(0,0,0,0.8)'; g.lineWidth=4; g.lineJoin='round';
  g.strokeText(text,w/2,h/2);
  g.fillStyle=color; g.fillText(text,w/2,h/2);
  const t=new THREE.CanvasTexture(c);
  const m=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false});
  const s=new THREE.Sprite(m);
  s.scale.set(w*0.85,h*0.85,1);
  return s;
}

function init(){
  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(2,devicePixelRatio));
  mount.appendChild(renderer.domElement);
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x02050a);
  scene.fog=new THREE.FogExp2(0x02050a,0.00009);
  camera=new THREE.PerspectiveCamera(48,1,1,20000);
  clock=new THREE.Clock();

  ambient=new THREE.AmbientLight(0x556677,0.55); scene.add(ambient);
  sun=new THREE.DirectionalLight(0xfff0d0,1.0); sun.position.set(1500,2400,900); scene.add(sun);
  under=new THREE.DirectionalLight(0x224466,0.35); under.position.set(-1200,600,-1500); scene.add(under);

  /* stars */
  {
    const n=1400, pos=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      const r=6000+Math.random()*7000, th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
      pos[i*3]=r*Math.sin(ph)*Math.cos(th); pos[i*3+1]=Math.abs(r*Math.cos(ph))*0.7+400; pos[i*3+2]=r*Math.sin(ph)*Math.sin(th);
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    starPoints=new THREE.Points(g,new THREE.PointsMaterial({color:0x9db4cc,size:3,sizeAttenuation:true,transparent:true,opacity:0.8}));
    scene.add(starPoints);
  }

  /* atmosphere: a fresnel halo hugging the cage — rim glow, not a sky box */
  {
    atmoShell=new THREE.Mesh(new THREE.SphereGeometry(R_WALL*1.38,48,32),
      atmosphereMaterial(0x5b86c8,0.85,false));
    atmoShell.scale.y=0.5;
    atmoShell.position.y=-40;
    scene.add(atmoShell);
  }

  /* the bowl */
  {
    const prof=[];
    prof.push(new THREE.Vector2(0,-260));
    prof.push(new THREE.Vector2(R_INNER*0.7,-250));
    prof.push(new THREE.Vector2(R_WALL,-180));
    prof.push(new THREE.Vector2(R_WALL+185,-40));
    prof.push(new THREE.Vector2(R_OUTER,-20));
    const geo=new THREE.LatheGeometry(prof,72);
    const mat=new THREE.MeshStandardMaterial({color:0x1c2733,roughness:0.9,metalness:0.25,side:THREE.DoubleSide});
    scene.add(new THREE.Mesh(geo,mat));
  }
  /* outer ocean */
  {
    const geo=new THREE.RingGeometry(R_WALL+40,R_OUTER,96,1);
    const mat=new THREE.MeshStandardMaterial({color:0x061420,roughness:0.35,metalness:0.5,transparent:true,opacity:0.96});
    const m=new THREE.Mesh(geo,mat); m.rotation.x=-Math.PI/2; m.position.y=-14; scene.add(m);
  }
  /* inner ocean */
  {
    const geo=new THREE.CircleGeometry(R_INNER,96);
    const mat=new THREE.MeshStandardMaterial({color:0x0a2233,roughness:0.3,metalness:0.45,transparent:true,opacity:0.93});
    const m=new THREE.Mesh(geo,mat); m.rotation.x=-Math.PI/2; m.position.y=-6; scene.add(m);
  }

  /* Mor'kaleth beneath the west inner ocean + spire + watch rings */
  {
    const grp=new THREE.Group();
    const mx=-1120,mz=55;
    const city=new THREE.Group();
    for(let i=0;i<9;i++){
      const hgt=24+(i*17)%46;
      const t=new THREE.Mesh(new THREE.BoxGeometry(14,hgt,14),
        new THREE.MeshStandardMaterial({color:0x0c1018,roughness:0.9}));
      const a=i/9*Math.PI*2;
      t.position.set(mx+Math.cos(a)*60,-30+hgt/2,mz+Math.sin(a)*46);
      city.add(t);
    }
    grp.add(city);
    grp.userData={name:'Mor’kaleth — The Drowned Crown',info:HIDDEN.find(h=>h.id==='morkaleth').info};
    for(let i=0;i<7;i++){
      const a=i/7*Math.PI*2;
      const tw=new THREE.Mesh(new THREE.CylinderGeometry(3.4,4.6,42,8),
        new THREE.MeshStandardMaterial({color:0x9adfb8,emissive:0x1c5a3c,emissiveIntensity:0.8}));
      tw.position.set(mx+Math.cos(a)*125,15,mz+Math.sin(a)*100);
      tw.userData={name:'Circle of Silence — Kingdom Watch',info:HIDDEN.find(h=>h.id==='circle1').info};
      pickables.push(tw); grp.add(tw);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(2.4,8,8),
        new THREE.MeshBasicMaterial({color:0xd9ffe9}));
      lamp.position.copy(tw.position); lamp.position.y=38; grp.add(lamp);
    }
    const wx=mx+55, wz=mz+185;
    // the Spire of Ascension: a separate drowned structure among the ruins (LOCKED ruling)
    const spire=new THREE.Mesh(new THREE.ConeGeometry(6,86,8),
      new THREE.MeshStandardMaterial({color:0x2a2038,emissive:0x6a3c9a,emissiveIntensity:0.55}));
    spire.position.set(mx-42,8,mz-72);
    spire.userData={name:'The Spire of Ascension (drowned)',
      info:'The tower built to pierce Aethyria, standing whole on the seafloor among Mor\u2019kaleth\u2019s ruins \u2014 a separate structure from the Weapon under the second Circle. [Weapon = the cannon: LOCKED, July 2026]'};
    pickables.push(spire); grp.add(spire);
    // the Weapon itself: the tree-killing cannon, broken and sealed
    const weap=HIDDEN.find(h=>h.id==='weapon');
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(7,10,105,10),
      new THREE.MeshStandardMaterial({color:0x191420,metalness:0.7,roughness:0.5,emissive:0x4a2a68,emissiveIntensity:0.35}));
    barrel.rotation.z=Math.PI/2.35; barrel.position.set(wx,-6,wz);
    barrel.userData={name:weap.name,info:weap.info};
    const breach=new THREE.Mesh(new THREE.SphereGeometry(15,10,8),
      new THREE.MeshStandardMaterial({color:0x14101c,metalness:0.6,roughness:0.6}));
    breach.position.set(wx-36,-18,wz);
    breach.userData=barrel.userData;
    pickables.push(barrel,breach); grp.add(barrel,breach);
    for(let i=0;i<5;i++){
      const a=i/5*Math.PI*2;
      const tw=new THREE.Mesh(new THREE.CylinderGeometry(2.6,3.6,34,8),
        new THREE.MeshStandardMaterial({color:0x9adfb8,emissive:0x1c5a3c,emissiveIntensity:0.8}));
      tw.position.set(wx+Math.cos(a)*58,12,wz+Math.sin(a)*48);
      tw.userData={name:'Circle of Silence — Weapon Watch',info:HIDDEN.find(h=>h.id==='circle2').info};
      pickables.push(tw); grp.add(tw);
    }
    scene.add(grp); pickables.push(city.children[0]); city.children[0].userData=grp.userData;
  }

  /* the continent: fbm-painted from the shared palettes, bump-mapped */
  {
    const tex=texFromCanvas(paintContinentPlaceholder,2048,1524);
    const geo=new THREE.CircleGeometry(1,192);
    // A3/E5 fix: an UNLIT material — scene lights were over-driving the light
    // palette colors (the Southern Sunlands washed to white). The texture is
    // painted by the same paintRegion as the 2D map (satellite now carries its
    // own baked hillshade), so 3D land == 2D palette, pixel for pixel.
    // Day/night is applied as a color multiplier in applyTimeOfDay.
    contMat=new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:0.35});
    const m=new THREE.Mesh(geo,contMat);
    m.scale.set(R_CONT_A*1.13,R_CONT_B*1.13,1);
    m.rotation.x=-Math.PI/2; m.position.y=6;
    m.userData={name:'The Crown of Tears',info:'The oval landmass — 30 million square miles, 62 million souls, nine great kingdoms and the Ring. Open the Map view for the full layered atlas.'};
    pickables.push(m); scene.add(m);
    requestHiResContinent();
  }

  /* rivers as slim emissive tubes */
  {
    for(const r of RIVERS){
      if(r.underground) continue;
      const pts=r.path.map(p=>new THREE.Vector3(wx2s(p[0]),8,wy2s(p[1])));
      const curve=new THREE.CatmullRomCurve3(pts);
      const geo=new THREE.TubeGeometry(curve,36,2.4,6,false);
      const mat=new THREE.MeshStandardMaterial({
        color: r.poison?0x4a5c22:0x14405e,
        emissive: r.poison?0x5a7a1e:0x2e7fbf, emissiveIntensity:0.75, roughness:0.4});
      const m=new THREE.Mesh(geo,mat);
      m.userData={name:r.name,info:r.note||'River of the Crown of Tears.'};
      pickables.push(m); scene.add(m);
    }
  }

  /* vegetation: instanced conifer clusters (Forest Ring, Jotunwood, Whisperwood) */
  {
    const spots=[];
    // the Ring (respecting the Sulphur Coast gap)
    for(let i=0;i<950;i++){
      const a=G.hash2(i,1)*Math.PI*2;
      const deg=(-a*180/Math.PI+360)%360;
      if(deg>=FOREST_RING.gapStartDeg&&deg<=FOREST_RING.gapEndDeg) continue;
      const rr=FOREST_RING.inner+(FOREST_RING.outer-FOREST_RING.inner)*G.hash2(i,2);
      const c=coastNoise(a);
      spots.push([WORLD.cx+Math.cos(a)*WORLD.a*rr*c, WORLD.cy+Math.sin(a)*WORLD.b*rr*c, 0.9+G.hash2(i,3)]);
    }
    for(const fo of FORESTS){
      for(let i=0;i<130;i++){
        const a=G.hash2(i,fo.x)*Math.PI*2, r=Math.sqrt(G.hash2(i,fo.y));
        const x=fo.x+Math.cos(a)*fo.rx*r, y=fo.y+Math.sin(a)*fo.ry*r;
        if(fo.hole && Math.hypot(x-fo.hole.x,y-fo.hole.y)<=fo.hole.r) continue;  // the Wardwood's clearing
        spots.push([x, y, 0.8+G.hash2(i,5)]);
      }
    }
    const geo=new THREE.ConeGeometry(4.4,15,5);
    const mat=new THREE.MeshStandardMaterial({color:0x1d4a28,roughness:0.9});
    const inst=new THREE.InstancedMesh(geo,mat,spots.length);
    const M=new THREE.Matrix4(), q=new THREE.Quaternion(), sc=new THREE.Vector3(), pos=new THREE.Vector3();
    spots.forEach((s,i)=>{
      pos.set(wx2s(s[0]), 6+5.5*s[2], wy2s(s[1]));
      sc.set(s[2],s[2],s[2]);
      M.compose(pos,q,sc);
      inst.setMatrixAt(i,M);
    });
    inst.instanceMatrix.needsUpdate=true;
    scene.add(inst);
  }

  /* volcanoes: glowing cones on the Burning Peaks, the Serpent's Spine, the Drowning Pillars */
  {
    const vents=[];
    for(const m of MOUNTAINS){
      if(m.id==='burning') for(const p of m.path) vents.push([p[0],p[1],1.15]);
      if(m.id==='serpent') for(let i=0;i<m.path.length;i+=2) vents.push([m.path[i][0],m.path[i][1],1]);
    }
    for(const isl of ISLANDS) if(isl.kind==='pillar') vents.push([isl.x,isl.y,0.8]);
    // the three volcanoes standing on the Isle of the Last Fish
    for(const isl of ISLANDS) if(isl.volcanoes) for(const v of isl.volcanoes) vents.push([v[0],v[1],0.55]);
    const rockMat=new THREE.MeshStandardMaterial({color:0x3a2f28,roughness:0.95});
    for(const v of vents){
      const cone=new THREE.Mesh(new THREE.ConeGeometry(13*v[2],34*v[2],7),rockMat);
      cone.position.set(wx2s(v[0]),6+17*v[2],wy2s(v[1]));
      scene.add(cone);
      const glow=new THREE.Mesh(new THREE.SphereGeometry(3.6*v[2],8,8),
        new THREE.MeshBasicMaterial({color:0xff7a3a,transparent:true,opacity:0.9}));
      glow.position.set(cone.position.x,cone.position.y+17*v[2],cone.position.z);
      volcanoGlows.push(glow);
      scene.add(glow);
    }
    const l1=new THREE.PointLight(0xff6a30,0.5,420); l1.position.set(wx2s(3050),80,wy2s(1450)); scene.add(l1);
    const l2=new THREE.PointLight(0xff6a30,0.4,420); l2.position.set(wx2s(6500),70,wy2s(1050)); scene.add(l2);
  }

  /* sea-mountains: jagged rock standing out of the water around the Last Fish */
  {
    const rockMat=new THREE.MeshStandardMaterial({color:0x2e2a26,roughness:0.95});
    for(const sm of (D.SEAMOUNTS||[])){
      const cone=new THREE.Mesh(new THREE.ConeGeometry(7*sm.s,30*sm.s,5),rockMat);
      cone.position.set(wx2s(sm.x),4+13*sm.s,wy2s(sm.y));
      cone.rotation.y=sm.s*3.1;
      cone.userData={name:sm.name,info:sm.info};
      pickables.push(cone); scene.add(cone);
    }
  }

  /* islands */
  {
    for(const isl of ISLANDS){
      if(isl.hidden) continue;          // the hidden isles belong to the map's Hidden World layer
      const sx=wx2s(isl.x), sz=wy2s(isl.y);
      const col={lush:0x2f7a44,snow:0xdfe8ee,sand:0xd6c491,rock:0x6b6660,pirate:0x3f7a4e,pillar:0x241f1c,grey:0x6a6d70}[isl.kind]||0x555;
      const m=new THREE.Mesh(new THREE.CylinderGeometry(isl.rx*KX,isl.rx*KX*1.12,isl.kind==='pillar'?26:10, 12),
        new THREE.MeshStandardMaterial({color:col,roughness:0.95}));
      m.scale.z=isl.ry/isl.rx;
      m.position.set(sx,isl.kind==='pillar'?7:2,sz);
      if(isl.name){ m.userData={name:isl.name,info:isl.info}; pickables.push(m); }
      scene.add(m);
      if(isl.id==='lastlight'){
        const glow=new THREE.PointLight(0x8fe0a8,0.5,180); glow.position.set(sx,26,sz); scene.add(glow);
        // soft fresnel shell over the Sanctuary
        const shell=new THREE.Mesh(new THREE.SphereGeometry(Math.max(18,isl.rx*KX*2.6),24,18), atmosphereMaterial(0x7fe8a8,0.7,false));
        shell.position.set(sx,10,sz); shell.scale.y=0.5;
        scene.add(shell);
      }
    }
  }

  /* the Celestial Circle: a tiny ring of standing stones, faintly lit */
  {
    const cc=WONDERS.find(w=>w.id==='celestialcircle');
    if(cc){
      const cx=wx2s(cc.x), cz=wy2s(cc.y);
      const grp=new THREE.Group();
      const stoneMat=new THREE.MeshStandardMaterial({color:0xb8b2a4,roughness:0.85,emissive:0x8a8474,emissiveIntensity:0.25});
      for(let i=0;i<6;i++){
        const a=i/6*Math.PI*2;
        const stone=new THREE.Mesh(new THREE.BoxGeometry(2.2,7.5,3),stoneMat);
        stone.position.set(cx+Math.cos(a)*10,9.5,cz+Math.sin(a)*10);
        stone.rotation.y=-a;
        grp.add(stone);
      }
      grp.children.forEach(st=>{ st.userData={name:cc.name,info:cc.info}; pickables.push(st); });
      const l=new THREE.PointLight(0xffffff,0.35,130);
      l.position.set(cx,16,cz);
      grp.add(l);
      scene.add(grp);
    }
  }

  /* World Tree (readable scale) + glow shell */
  {
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(6,10,150,10),
      new THREE.MeshStandardMaterial({color:0x6a4a2a,roughness:0.9}));
    trunk.position.set(0,81,0);
    const canopy=new THREE.Mesh(new THREE.SphereGeometry(56,18,14),
      new THREE.MeshStandardMaterial({color:0x2f9c52,emissive:0x1a7a3a,emissiveIntensity:0.5,roughness:0.7}));
    canopy.position.set(0,172,0);
    const glow=new THREE.PointLight(0x6affa0,0.9,700); glow.position.set(0,180,0);
    const shell=new THREE.Mesh(new THREE.SphereGeometry(74,24,18), atmosphereMaterial(0x6affa0,0.8,false));
    shell.position.copy(canopy.position);
    const ud={name:'The World Tree',info:WONDERS.find(w=>w.id==='worldtree').info+' (Rendered at readable scale — a three-mile tree is true to canon but invisible at world scale.)'};
    trunk.userData=ud; canopy.userData=ud;
    pickables.push(trunk,canopy);
    scene.add(trunk,canopy,glow,shell);
  }

  /* drifting cloud layers above the continent */
  {
    const t1=buildCloudTexture(1024,1024,1);
    cloudDisc=new THREE.Mesh(new THREE.CircleGeometry(R_CLOUD,72),
      new THREE.MeshBasicMaterial({map:t1,transparent:true,opacity:0.5,depthWrite:false}));
    cloudDisc.rotation.x=-Math.PI/2; cloudDisc.position.y=130;
    scene.add(cloudDisc);
    const t2=buildCloudTexture(512,512,2);
    cloudDisc2=new THREE.Mesh(new THREE.CircleGeometry(R_CLOUD*0.92,72),
      new THREE.MeshBasicMaterial({map:t2,transparent:true,opacity:0.32,depthWrite:false}));
    cloudDisc2.rotation.x=-Math.PI/2; cloudDisc2.position.y=170;
    scene.add(cloudDisc2);
  }

  /* settlement lights: emissive points sized by importance, visible at night */
  {
    const caps=SETTLEMENTS.filter(s=>s.type==='capital');
    const rest=SETTLEMENTS.filter(s=>s.type!=='capital');
    nightLights=new THREE.Group();
    for(const [set,size] of [[caps,7],[rest,3.2]]){
      const pos=new Float32Array(set.length*3);
      set.forEach((s,i)=>{ pos[i*3]=wx2s(s.x); pos[i*3+1]=10; pos[i*3+2]=wy2s(s.y); });
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
      nightLights.add(new THREE.Points(g,new THREE.PointsMaterial({
        color:0xffd9a0,size,sizeAttenuation:false,transparent:true,opacity:0,
        blending:THREE.AdditiveBlending,depthWrite:false})));
    }
    scene.add(nightLights);
  }

  /* luminous kingdom borders (toggleable) */
  {
    borderGroup=new THREE.Group();
    const mat=new THREE.LineBasicMaterial({color:0xd8c27a,transparent:true,opacity:0.55});
    for(const k of KINGDOMS){
      // world-space outline, densely sampled so it can be clipped to the coast
      const wpts=[];
      if(k.shape==='circle'){
        for(let i=0;i<=96;i++){ const a=i/96*Math.PI*2;
          wpts.push([k.cx+Math.cos(a)*k.rx, k.cy+Math.sin(a)*k.ry]); }
      } else {
        for(let i=0;i<k.poly.length;i++){
          const a=k.poly[i], b=k.poly[(i+1)%k.poly.length];
          const L=Math.hypot(b[0]-a[0],b[1]-a[1]), n=Math.max(1,Math.ceil(L/25));
          for(let j=0;j<n;j++) wpts.push([a[0]+(b[0]-a[0])*j/n, a[1]+(b[1]-a[1])*j/n]);
        }
        wpts.push(wpts[0]);
      }
      // A3: keep only the on-land portions — same clip the 2D map applies
      const segs=[];
      for(let i=0;i<wpts.length-1;i++){
        const a=wpts[i], b=wpts[i+1];
        if(G.onContinent(a[0],a[1]) && G.onContinent(b[0],b[1])){
          segs.push(new THREE.Vector3(wx2s(a[0]),9,wy2s(a[1])),
                    new THREE.Vector3(wx2s(b[0]),9,wy2s(b[1])));
        }
      }
      if(!segs.length) continue;
      const g=new THREE.BufferGeometry().setFromPoints(segs);
      borderGroup.add(new THREE.LineSegments(g,mat));
    }
    scene.add(borderGroup);
  }

  /* sprite labels: kingdoms + capitals, fading by camera distance */
  {
    labelGroup=new THREE.Group();
    for(const k of KINGDOMS){
      const c=k.shape==='circle'?[k.cx,k.cy]:(()=>{let x=0,y=0;for(const p of k.poly){x+=p[0];y+=p[1];}return [x/k.poly.length,y/k.poly.length];})();
      const s=makeTextSprite(k.name.toUpperCase(),30,'#e8d9a0');
      s.position.set(wx2s(c[0]),46,wy2s(c[1]));
      s.userData.far=1;
      labelGroup.add(s);
    }
    for(const st of SETTLEMENTS){
      if(st.type!=='capital') continue;
      const s=makeTextSprite(st.name,22,'#ffffff');
      s.position.set(wx2s(st.x),24,wy2s(st.y));
      s.userData.far=0;
      labelGroup.add(s);
    }
    scene.add(labelGroup);
  }

  /* ice wall with faces */
  {
    const tex=texFromCanvas((g,w,h)=>paintWall(g,w,h,false),4096,256);
    const emi=texFromCanvas((g,w,h)=>paintWall(g,w,h,true),4096,256);
    tex.wrapS=THREE.RepeatWrapping; emi.wrapS=THREE.RepeatWrapping;
    const geo=new THREE.CylinderGeometry(R_WALL,R_WALL,WALL_H,128,1,true);
    wallMat=new THREE.MeshStandardMaterial({map:tex,emissiveMap:emi,emissive:0x9fdcff,emissiveIntensity:1.4,side:THREE.DoubleSide,roughness:0.55});
    const wall=new THREE.Mesh(geo,wallMat); wall.position.y=WALL_H/2-30;
    wall.userData={name:'The Ice Wall',info:COSMOS.wall};
    pickables.push(wall); scene.add(wall);
    const cap=new THREE.Mesh(new THREE.TorusGeometry(R_WALL,10,10,120),
      new THREE.MeshStandardMaterial({color:0xcfe6f2,roughness:0.4}));
    cap.rotation.x=Math.PI/2; cap.position.y=WALL_H-30; scene.add(cap);
  }

  /* the one dry place in the Ice Wall */
  {
    const a=253*Math.PI/180;
    const gx=Math.cos(a)*R_WALL, gz=-Math.sin(a)*R_WALL;
    const patch=new THREE.Mesh(new THREE.PlaneGeometry(120*CAGE,WALL_H*0.9),
      new THREE.MeshStandardMaterial({color:0x2f7a44,emissive:0x1f6a34,emissiveIntensity:0.7,side:THREE.DoubleSide}));
    patch.position.set(gx*0.995,WALL_H/2-30,gz*0.995);
    patch.lookAt(0,WALL_H/2-30,0);
    patch.userData={name:'The Green Reach',info:'The one place in the Ice Wall that is dry land: vegetation where nothing should grow, air dense and heavy, the most spiritual ground in the world. Reached only through the Veiled Vortex at the alignment. The gate to the God Engine waits beyond it. [Established prior session; name PROPOSED]'};
    pickables.push(patch); scene.add(patch);
    const gl=new THREE.PointLight(0x4fd47a,0.7,300); gl.position.set(gx*0.96,WALL_H/2,gz*0.96); scene.add(gl);
  }

  /* four pillars + guardian stars */
  {
    for(const p of COSMOS.pillars){
      const a=p.deg*Math.PI/180;
      const x=Math.cos(a)*R_WALL, z=-Math.sin(a)*R_WALL;
      const pil=new THREE.Mesh(new THREE.CylinderGeometry(26*CAGE,34*CAGE,560*CAGE,10),
        new THREE.MeshStandardMaterial({color:0x59616e,metalness:0.85,roughness:0.35}));
      pil.position.set(x,WALL_H-30+250*CAGE,z);
      pil.userData={name:`The ${p.dir} Pillar`,info:p.guardian};
      pickables.push(pil); scene.add(pil);
      for(let i=0;i<4;i++){
        const band=new THREE.Mesh(new THREE.TorusGeometry(30*CAGE,3.4*CAGE,8,24),
          new THREE.MeshStandardMaterial({color:0x8a94a2,metalness:0.9,roughness:0.3}));
        band.rotation.x=Math.PI/2;
        band.position.set(x,WALL_H-30+(90+i*120)*CAGE,z);
        scene.add(band);
      }
      if(p.star!=='missing'){
        const col=p.star==='yellow'?0xffd45a:0xff4a3a;
        const star=new THREE.Mesh(new THREE.SphereGeometry(22*CAGE,16,14),
          new THREE.MeshBasicMaterial({color:col}));
        star.position.set(x,WALL_H-30+620*CAGE,z);
        star.userData={name:`Guardian Star — ${p.dir}`,info:p.guardian};
        pickables.push(star); scene.add(star);
        const halo=new THREE.Mesh(new THREE.SphereGeometry(38*CAGE,16,14),
          new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.22}));
        halo.position.copy(star.position); scene.add(halo);
        const l=new THREE.PointLight(col,1.1,900*CAGE); l.position.copy(star.position); scene.add(l);
        star.userData.halo=halo;
      } else {
        const socket=new THREE.Mesh(new THREE.RingGeometry(16*CAGE,26*CAGE,24),
          new THREE.MeshBasicMaterial({color:0x334455,transparent:true,opacity:0.5,side:THREE.DoubleSide}));
        socket.position.set(x,WALL_H-30+620*CAGE,z);
        socket.userData={name:'The Missing Star — East',info:p.guardian};
        pickables.push(socket); scene.add(socket);
      }
    }
  }

  /* three leviathans in the outer ocean */
  {
    const specs=[
      // between the coast (1000 x 740) and the wall (1850): the outer ocean
      {r:1310,len:1150,rad:26,speed:0.05, col:0x0d2530, name:'First Leviathan'},
      {r:1520,len:1350,rad:32,speed:-0.035,col:0x0a1f2a, name:'Second Leviathan'},
      {r:1700,len:1200,rad:28,speed:0.028, col:0x0c2230, name:'Third Leviathan'},
    ];
    for(const s of specs){
      const lev=makeLeviathan(s.len,s.rad,s.col);
      lev.userData.orbit=s; lev.userData.phase=Math.random()*Math.PI*2;
      lev.userData.name=s.name; lev.userData.info=COSMOS.leviathans;
      pickables.push(lev);
      leviathans.push(lev); scene.add(lev);
    }
  }

  /* picking */
  const ray=new THREE.Raycaster(), v2=new THREE.Vector2();
  let downAt=null;
  renderer.domElement.addEventListener('pointerdown',e=>{ downAt=[e.clientX,e.clientY]; });
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!downAt||Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])>5){downAt=null;return;}
    downAt=null;
    const r=renderer.domElement.getBoundingClientRect();
    v2.x=((e.clientX-r.left)/r.width)*2-1; v2.y=-((e.clientY-r.top)/r.height)*2+1;
    ray.setFromCamera(v2,camera);
    const hits=ray.intersectObjects(pickables,true);
    let obj=hits[0]&&hits[0].object;
    while(obj&&!obj.userData.name) obj=obj.parent;
    const panel=document.getElementById('infoPanel');
    if(obj){
      panel.querySelector('.ip-body').innerHTML=
        `<div class="ip-kicker">THE WORLD-CAGE</div><h2>${obj.userData.name}</h2><div class="ip-sect">${obj.userData.info}</div>`;
      panel.classList.add('open');
    } else panel.classList.remove('open');
  });

  /* orbit: custom drag + wheel */
  let drag=false,last=null;
  renderer.domElement.addEventListener('pointerdown',e=>{drag=true;last=[e.clientX,e.clientY];});
  window.addEventListener('pointerup',()=>drag=false);
  window.addEventListener('pointermove',e=>{
    if(!drag) return;
    tween=null;
    rot.theta-=(e.clientX-last[0])*0.005;
    rot.phi=Math.min(1.45,Math.max(0.12,rot.phi-(e.clientY-last[1])*0.004));
    last=[e.clientX,e.clientY];
  });
  renderer.domElement.addEventListener('wheel',e=>{
    e.preventDefault();
    tween=null;
    rot.dist=Math.min(9250,Math.max(300,rot.dist*Math.exp(e.deltaY*0.0011)));
  },{passive:false});

  /* controls */
  const dn=document.getElementById('dayNight');
  dn.addEventListener('input',()=>{ dayNight=dn.value/1000; applyTimeOfDay(); });
  dayNight=dn.value/1000;
  document.getElementById('cosmosBorders').addEventListener('change',function(){ borderGroup.visible=this.checked; });
  document.getElementById('cosmosLabels').addEventListener('change',function(){ labelGroup.visible=this.checked; });
  document.getElementById('cosmosClouds').addEventListener('change',function(){ cloudDisc.visible=cloudDisc2.visible=this.checked; });

  applyTimeOfDay();
  resize();
}

/* ---- day/night: sun sweep + palette lerp; night belongs to the lights and the eyes ---- */
function applyTimeOfDay(){
  const t=dayNight;
  const el=(1-t)*1.05-0.12;             // sun elevation factor
  const az=0.6+t*1.9;
  sun.position.set(Math.cos(az)*4200, Math.max(-600,Math.sin(el*Math.PI/2)*4200), Math.sin(az)*4200);
  sun.intensity=Math.max(0.04, 1.05*(1-t*1.05));
  sun.color.setHSL(0.1-0.04*t, 0.5, 0.75-0.25*t);
  ambient.intensity=0.55-0.33*t;
  ambient.color.setHex(t>0.5?0x33415c:0x556677);
  under.intensity=0.35-0.22*t;
  const bg=new THREE.Color(0x02050a).lerp(new THREE.Color(0x01020a), t);
  scene.background=bg; scene.fog.color=bg;
  if(nightLights) nightLights.children.forEach(p=>{ p.material.opacity=Math.max(0,(t-0.35)/0.65)*0.95; });
  if(contMat){ const l=1-0.72*t; contMat.color.setRGB(l, l*(1-0.06*t), Math.min(1,l*(1+0.16*t))); }
  if(wallMat) wallMat.emissiveIntensity=1.4+t*1.6;
  if(starPoints) starPoints.material.opacity=0.5+t*0.5;
  if(cloudDisc){ cloudDisc.material.opacity=0.5-0.28*t; cloudDisc2.material.opacity=0.32-0.18*t; }
  if(atmoShell) atmoShell.material.uniforms.intensity.value=0.85-0.55*t;
  for(const g of volcanoGlows) g.material.opacity=0.65+t*0.35;
}

/* ---- flyTo: eased camera tween to a map feature ---- */
function flyTo(f){
  const sx=wx2s(f.x), sz=wy2s(f.y);
  const th=Math.atan2(sz,sx)+Math.PI*0.35;
  tween={
    t:0, dur:2.2,
    from:{theta:rot.theta, phi:rot.phi, dist:rot.dist, tx:tgt.x, ty:tgt.y, tz:tgt.z},
    to:{theta:th, phi:0.62, dist:520, tx:sx, ty:10, tz:sz},
  };
}
window.__cosmosFlyTo=function(f){ if(started) flyTo(f); else { pendingFly=f; } };
let pendingFly=null;
window.__cosmosSeason=function(s){ SEASON=s; if(started) requestHiResContinent(); };
/* test hook: the cage's proportions, so the ocean gap can be asserted */
window.__cosmosScale=function(){
  const levs=[{r:1310,len:1150},{r:1520,len:1350},{r:1700,len:1200}].map(o=>({
    r:o.r, min:o.r, max:Math.round(Math.hypot(o.r,o.len/2)) }));
  // every ocean feature the 2D world carries must fall between coast and wall
  let farthest=0, inside=true;
  const probe=[...ISLANDS.map(i=>[i.x,i.y]), ...(D.MAELSTROMS||[]).map(m=>[m.x,m.y]),
               ...(D.SEAMOUNTS||[]).map(s=>[s.x,s.y])];
  for(const [x,y] of probe){
    const d=Math.hypot(wx2s(x),wy2s(y));
    if(d>farthest) farthest=d;
    if(d>=R_WALL) inside=false;
  }
  // does the default camera actually frame the whole cage? Project the wall's
  // rim and the guardian stars' tops into NDC and check they land on screen.
  let fits=true, margin=0;
  if(camera){
    camera.updateMatrixWorld();
    const v=new THREE.Vector3();
    const heights=[-30, WALL_H-30, WALL_H-30+620*CAGE+38*CAGE];
    for(let i=0;i<48;i++){
      const a=i/48*Math.PI*2;
      for(const hy of heights){
        v.set(Math.cos(a)*R_WALL, hy, Math.sin(a)*R_WALL).project(camera);
        margin=Math.max(margin,Math.abs(v.x),Math.abs(v.y));
        if(Math.abs(v.x)>1||Math.abs(v.y)>1||v.z>1) fits=false;
      }
    }
  }
  return { contA:R_CONT_A, contB:R_CONT_B, wall:R_WALL, inner:R_INNER, outer:R_OUTER,
    gapMajor:R_WALL-R_CONT_A, gapMinor:R_WALL-R_CONT_B,
    leviathans:levs, worldCorner:Math.round(Math.hypot(WORLD.cx*KX,WORLD.cy*KZ)),
    farthestFeature:Math.round(farthest), featuresInside:inside,
    dist:Math.round(rot.dist), framingMargin:+margin.toFixed(3), fitsDefaultView:fits };
};

function resize(){
  if(!renderer) return;
  const r=mount.getBoundingClientRect();
  renderer.setSize(r.width,r.height);
  camera.aspect=r.width/r.height; camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);

function easeInOut(u){ return u<0.5 ? 2*u*u : 1-Math.pow(-2*u+2,2)/2; }
function animate(){
  if(!running) return;
  requestAnimationFrame(animate);
  const dt=clock.getDelta();
  const t=clock.getElapsedTime();
  if(tween){
    tween.t+=dt;
    const u=Math.min(1,tween.t/tween.dur), e=easeInOut(u);
    const F=tween.from, T=tween.to;
    let dth=T.theta-F.theta;
    dth=((dth+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
    rot.theta=F.theta+dth*e;
    rot.phi=F.phi+(T.phi-F.phi)*e;
    rot.dist=F.dist+(T.dist-F.dist)*e;
    tgt.x=F.tx+(T.tx-F.tx)*e; tgt.y=F.ty+(T.ty-F.ty)*e; tgt.z=F.tz+(T.tz-F.tz)*e;
    if(u>=1) tween=null;
  } else if(rot.dist>1980){
    // relax the look-at target back to the world's centre when zoomed out
    tgt.x*=0.98; tgt.y*=0.98; tgt.z*=0.98;
  }
  camera.position.set(
    tgt.x+Math.cos(rot.theta)*Math.sin(rot.phi)*rot.dist,
    tgt.y+Math.cos(rot.phi)*rot.dist,
    tgt.z+Math.sin(rot.theta)*Math.sin(rot.phi)*rot.dist);
  camera.lookAt(tgt.x,tgt.y,tgt.z);
  for(const lev of leviathans){
    const o=lev.userData.orbit, ph=lev.userData.phase;
    const a=t*o.speed+ph;
    lev.position.set(Math.cos(a)*o.r,-8+Math.sin(t*0.7+ph)*4,Math.sin(a)*o.r);
    lev.rotation.y=-a-(o.speed>0?Math.PI/2:-Math.PI/2);
    lev.rotation.x=Math.sin(t*0.5+ph)*0.05;
  }
  if(cloudDisc){ cloudDisc.rotation.z=t*0.006; cloudDisc2.rotation.z=-t*0.0042; }
  // label fade by camera distance
  if(labelGroup&&labelGroup.visible){
    for(const s of labelGroup.children){
      const d=camera.position.distanceTo(s.position);
      const o= s.userData.far
        ? Math.max(0,Math.min(1,(d-660)/660))*Math.max(0,Math.min(1,(6870-d)/2110))
        : Math.max(0,Math.min(1,(2110-d)/1190));
      s.material.opacity=o;
      s.visible=o>0.02;
    }
  }
  renderer.render(scene,camera);
}

function setRunning(on){
  if(on&&!running){ running=true; clock.getDelta(); animate(); }
  else if(!on) running=false;
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden') setRunning(false);
  else if(started&&document.getElementById('viewCosmos').classList.contains('active')) setRunning(true);
});

window.__cosmosStart=function(){
  if(!started){ started=true; init(); }
  else resize();
  setRunning(true);
  if(pendingFly){ flyTo(pendingFly); pendingFly=null; }
};
window.__cosmosStop=function(){ setRunning(false); };
})();

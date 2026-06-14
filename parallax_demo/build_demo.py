# -*- coding: utf-8 -*-
"""clinic.png 2.5D 패럴랙스 + 파티클/광원/비네팅 데모 빌더.
   깊이맵(clinic_depth.png)이 있으면 재사용, 없으면 Depth-Anything으로 추정.
   실행: d:/kohya_ss/venv/Scripts/python.exe parallax_demo/build_demo.py
"""
import base64, io, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "clinic.png")
DEPTH = os.path.join(HERE, "clinic_depth.png")
OUT = os.path.join(HERE, "parallax_clinic.html")

img = Image.open(SRC).convert("RGB")
W, H = img.size
print(f"원본: {W}x{H}")

if os.path.exists(DEPTH):
    depth_img = Image.open(DEPTH).convert("L")
    print("기존 깊이맵 재사용")
else:
    from transformers import pipeline
    import torch
    dev = 0 if torch.cuda.is_available() else -1
    try:
        pipe = pipeline("depth-estimation", model="LiheYoung/depth-anything-small-hf", device=dev)
    except Exception as e:
        print("fallback dpt:", e)
        pipe = pipeline("depth-estimation", model="Intel/dpt-hybrid-midas", device=dev)
    pred = pipe(img)["predicted_depth"]
    d = pred.squeeze().detach().cpu().numpy().astype(np.float32)
    d = np.array(Image.fromarray(d).resize((W, H), Image.BILINEAR), dtype=np.float32)
    d = (d - d.min()) / (d.max() - d.min() + 1e-6)
    depth_img = Image.fromarray((d * 255).astype(np.uint8))
    depth_img.save(DEPTH)
    print("깊이맵 생성:", DEPTH)

def b64(im):
    buf = io.BytesIO(); im.save(buf, format="PNG"); return base64.b64encode(buf.getvalue()).decode()

TPL = r"""<!doctype html><html><head><meta charset="utf-8"><title>2.5D 패럴랙스+이펙트 - 진료소</title>
<style>
 html,body{margin:0;height:100%;background:#06080b;overflow:hidden;font-family:sans-serif}
 #wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
 canvas{box-shadow:0 12px 70px #000b}
 #ctrl{position:fixed;top:14px;left:14px;color:#cfe;font-size:12px;background:#000a;
       padding:10px 12px;border-radius:10px;line-height:2}
 #hint{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);color:#9fb3c2;
       font-size:13px;background:#0008;padding:7px 14px;border-radius:20px}
 input[type=range]{vertical-align:middle;width:110px}
</style></head><body>
<div id="wrap"><canvas id="c"></canvas></div>
<div id="ctrl">
 패럴랙스 <input id="s" type="range" min="0" max="0.12" step="0.005" value="0.055"><br>
 파티클 <input id="p" type="range" min="0" max="1.5" step="0.05" value="1"><br>
 광원 글로우 <input id="g" type="range" min="0" max="1.5" step="0.05" value="1"><br>
 <label><input id="dep" type="checkbox"> 깊이맵 보기</label>
</div>
<div id="hint">마우스를 움직여 보세요 · 먼지가 떠다니고 등불이 일렁입니다</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
const IMG="data:image/png;base64,__IMG__", DEP="data:image/png;base64,__DEP__";
const ASPECT=__W__/__H__;
const canvas=document.getElementById('c');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
const scene=new THREE.Scene();
const cam=new THREE.OrthographicCamera(-1,1,1,-1,-1,1);

const L=new THREE.TextureLoader();
const tImg=L.load(IMG), tDep=L.load(DEP);
tImg.minFilter=tDep.minFilter=THREE.LinearFilter;

// --- 배경 (패럴랙스 + 비네팅 + 플리커) ---
const uni={uImage:{value:tImg},uDepth:{value:tDep},uOffset:{value:new THREE.Vector2()},
  uStrength:{value:0.055},uZoom:{value:1.12},uShowDepth:{value:0},uTime:{value:0}};
const bg=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms:uni,
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.0);}`,
 fragmentShader:`precision highp float;uniform sampler2D uImage,uDepth;uniform vec2 uOffset;
  uniform float uStrength,uZoom,uShowDepth,uTime;varying vec2 vUv;
  void main(){vec2 uv=(vUv-0.5)/uZoom+0.5;float d=texture2D(uDepth,uv).r;
   vec3 col=texture2D(uImage,uv+uOffset*uStrength*(d-0.5)).rgb;
   if(uShowDepth>0.5){gl_FragColor=vec4(vec3(d),1.0);return;}
   float vig=smoothstep(1.25,0.35,length(vUv-0.5)*1.55);col*=mix(0.5,1.0,vig);
   col*=0.95+0.05*sin(uTime*2.3)+0.03*sin(uTime*7.1);
   gl_FragColor=vec4(col,1.0);}`}));
bg.renderOrder=0;scene.add(bg);

// --- 부드러운 원형 텍스처 ---
function soft(c){const s=64,cv=document.createElement('canvas');cv.width=cv.height=s;
 const x=cv.getContext('2d'),gr=x.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
 gr.addColorStop(0,c);gr.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=gr;x.fillRect(0,0,s,s);
 return new THREE.CanvasTexture(cv);}

// --- 파티클 (먼지 + 불씨) ---
function makeParticles(n,opt){
 const pos=new Float32Array(n*3),v=[];
 for(let i=0;i<n;i++){const x=opt.x0+Math.random()*opt.xw, y=Math.random()*2-1;
  pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=0;
  v.push({vx:(Math.random()-0.5)*opt.sway,vy:opt.rise*(0.5+Math.random()),ph:Math.random()*6.28,x});}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
 const mat=new THREE.PointsMaterial({size:opt.size,map:soft(opt.color),transparent:true,
  blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,opacity:opt.opacity});
 const pts=new THREE.Points(geo,mat);pts.renderOrder=3;scene.add(pts);
 return {pts,pos,v,opt,geo};
}
const dust=makeParticles(170,{x0:-1,xw:2,sway:0.0008,rise:0.0006,size:0.02,
  color:'rgba(215,228,255,0.9)',opacity:0.55});
const ember=makeParticles(36,{x0:-0.85,xw:0.45,sway:0.0006,rise:0.0016,size:0.035,
  color:'rgba(255,170,80,0.95)',opacity:0.8});

// --- 광원 글로우 (랜턴 좌측 / 창문 중앙) ---
function glow(c,x,y,sc){const m=new THREE.SpriteMaterial({map:soft(c),blending:THREE.AdditiveBlending,
  transparent:true,depthTest:false});const s=new THREE.Sprite(m);s.position.set(x,y,0);
  s.scale.set(sc,sc,1);s.renderOrder=2;scene.add(s);return s;}
const lamp=glow('rgba(255,180,95,0.55)',-0.6,0.02,0.7);
const lamp2=glow('rgba(255,150,70,0.4)',0.78,-0.18,0.4);
const win=glow('rgba(150,195,235,0.3)',0.0,0.28,0.9);

// --- 사이즈 ---
function resize(){let w=innerWidth,h=innerWidth/ASPECT;if(h>innerHeight){h=innerHeight;w=h*ASPECT;}
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(w,h,false);
 canvas.style.width=w+'px';canvas.style.height=h+'px';}
addEventListener('resize',resize);resize();

// --- 입력 ---
let tx=0,ty=0,mx=0,my=0,pAmt=1,gAmt=1;
addEventListener('pointermove',e=>{tx=(e.clientX/innerWidth)*2-1;ty=-((e.clientY/innerHeight)*2-1);});
s.oninput=e=>uni.uStrength.value=+e.target.value;
p.oninput=e=>{pAmt=+e.target.value;dust.pts.visible=ember.pts.visible=pAmt>0;};
g.oninput=e=>gAmt=+e.target.value;
dep.onchange=e=>uni.uShowDepth.value=e.target.checked?1:0;

function step(P){const{pos,v,opt}=P;for(let i=0;i<v.length;i++){const o=v[i];
  pos[i*3]+= o.vx + Math.sin(t*1.3+o.ph)*0.0004;
  pos[i*3+1]+= o.vy*pAmt;
  if(pos[i*3+1]>1.05){pos[i*3+1]=-1.05;pos[i*3]=o.x0!==undefined?o.x:pos[i*3];}
  if(pos[i*3]<-1.1)pos[i*3]=1.1; if(pos[i*3]>1.1)pos[i*3]=-1.1;}
 P.geo.attributes.position.needsUpdate=true;}

let t=0;
function tick(){t+=0.016;uni.uTime.value=t;
 const ax=Math.sin(t*0.55)*0.5,ay=Math.cos(t*0.42)*0.3;
 mx+=((tx+ax)-mx)*0.055;my+=((ty+ay)-my)*0.055;uni.uOffset.value.set(mx,my);
 // 파티클/글로우도 살짝 패럴랙스
 dust.pts.position.set(mx*0.04,my*0.04,0);ember.pts.position.set(mx*0.06,my*0.06,0);
 step(dust);step(ember);
 const fl=0.75+0.25*Math.sin(t*6.0)+0.12*Math.sin(t*13.0);
 lamp.material.opacity=0.55*gAmt*fl;lamp2.material.opacity=0.4*gAmt*(0.8+0.2*Math.sin(t*5.0));
 win.material.opacity=0.3*gAmt*(0.9+0.1*Math.sin(t*1.7));
 dust.pts.material.opacity=0.55*Math.min(pAmt,1);ember.pts.material.opacity=0.8*Math.min(pAmt,1);
 renderer.render(scene,cam);requestAnimationFrame(tick);}
tick();
</script></body></html>"""

html = (TPL.replace("__IMG__", b64(img)).replace("__DEP__", b64(depth_img))
           .replace("__W__", str(W)).replace("__H__", str(H)))
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print("\n완료 ->", OUT)

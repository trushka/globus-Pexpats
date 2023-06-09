
const d=220, R=160, roAtmDeg=-52, imgPath='', T_earth='map.png',
		obliquity=18/180*3.14, roV1=.00025, roV2=0.0005, posZ=1700,
		canvasId='#earth', color='#10A1DE', fogC='#060813',
		coord='48.13,16.95'.split(','), uShift=-.15;

import * as THREE from "https://cdn.skypack.dev/three@0.124";//"./three.module.js";

const {Vector2,
MathUtils: math, 
Vector3, Euler,
Quaternion,
WebGLRenderer,
WebGLRenderTarget,
Scene,
Group,
PerspectiveCamera,
OrthographicCamera,
Mesh,
RawShaderMaterial,
TextureLoader, Texture,
Color,
IcosahedronGeometry, ConeGeometry,
Points,
Float32BufferAttribute,
PointsMaterial,
BufferGeometry,
BufferAttribute,
Fog,
CurvePath,
CubicBezierCurve3,
Raycaster,
MeshLambertMaterial, MeshBasicMaterial,
ShaderLib, ShaderChunk
} = THREE;

Object.assign(Math, math);
var positions=[], particles, particle, count = 0, dpr, lastW,
	W=1, H=1, aspect=1,
	roAtm=-Math.degToRad(roAtmDeg);

var mouseX = 0, mouseY = 0, x0, y0;
const vec2=(x,y)=>new Vector2(x,y),
 vec3=(x,y,z)=>new Vector3(x,y,z),
 quat=new Quaternion(),
 lookAt=vec3(), PI=Math.PI, wX=vec3(1,0,0), wY=vec3(0,1,0),
 canvas=document.querySelector(canvasId), container=document.querySelector('.animation'); 

var renderer = new WebGLRenderer({alpha:true, antialias:true, canvas: canvas});//
var rTargets=[new WebGLRenderTarget(W,H,{depthBuffer:false, stencilBuffer:false})];
rTargets[1]=rTargets[0].clone();

var scene = new Scene(), scene2 = new Scene(), planet = new Group(),
	camera = new PerspectiveCamera( 18, aspect, 1, 10000 );
// 	pCamera = new OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
camera.position.z=posZ;
camera.updateMatrixWorld();

planet.rotateY(PI*.25).rotateZ(obliquity)//.updateMatrixWorld();
var pAxis=vec3(0,1,0).applyQuaternion(planet.quaternion);

const targUV=vec2(coord[1], coord[0]).multiplyScalar(1/180);
const targE = new Euler().set(0, targUV.x*PI-uShift*PI*2, -targUV.y*PI),
	targPos=vec3(-R, 0, 0).applyEuler(targE), dir=vec3();

var vVPort=window.visualViewport||{scale: 1}, rect0={};
function checkResize(){
	let rect=canvas.getBoundingClientRect();
	if (W!=rect.width || H!=rect.height || dpr!=(dpr=devicePixelRatio*vVPort.scale)) {
		W=rect.width; H=rect.height;
		let w=W*dpr, h=H*dpr, j=0;

		renderer.setDrawingBufferSize(W, H, dpr);
		rTargets[0].setSize(w, h);
		rTargets[1].setSize(w, h);

		camera.aspect=W/H;
		camera.updateProjectionMatrix();
		let l=camera.position.length(),
			r=vec3(0, l*Math.tan(Math.asin(R/l)), 0).project(camera).y*H;
		container.style.opacity=1;
		camera.zoom*=W/1.3/r;
		camera.updateProjectionMatrix();
	}
	const {left, top, right, bottom} = rect
	return bottom>0 && top < window.innerHeight
};

var Emap = (new TextureLoader()).load( imgPath+T_earth, function(t){
	var testCanvas=document.createElement('canvas'), tCtx=testCanvas.getContext('2d'), Ew, Eh;
	var img=t.image;
	Ew=testCanvas.width=img.width; Eh=testCanvas.height=img.height;
	tCtx.scale(1, -1);
	tCtx.drawImage(img,0,-Eh);
	var idata=tCtx.getImageData(0, 0, Ew, Eh);
	Egeometry.vertices.forEach((p, i)=>{
		var u=.5-Math.atan2(-p.z, -p.x)/2/PI+uShift,
			v=.5+Math.asin(p.y/R)/PI,
			color = idata.data[(Math.floor(u%1*Ew)+Math.floor(v*Eh)*Ew)*4];
		if (!color) points0.push(p);
		//if (!(i%1000)) console.log(i);
	})
} );

Emap.wrapS = THREE.RepeatWrapping;

var matScale={
	set value(val) {this.val=val*camera.zoom},
	get value() {return this.val}
}
var Ematerial=new PointsMaterial({
	map: Emap,
	transparent: true,
	alphaTest: 0.004,
	size: R*.06,
	color: new Color(color).multiplyScalar(.8),
	blending: 2,
	depthTest: false,
	onBeforeCompile: sh=>{
		console.log (sh)
		sh.uniforms.scale=matScale;
		sh.fragmentShader=sh.fragmentShader.replace('#include <map_particle_fragment>', `
	    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
	    float r = length(cxy), delta = fwidth(r)*.5;
	    diffuseColor.a *= 1.-smoothstep(1. - delta, 1.+delta, r);
		  diffuseColor.a *= smoothstep( ${(R*.3).toFixed(1)},  ${(-R).toFixed(1)}, fogDepth-${(posZ).toFixed(1)} );
		`);
		sh.vertexShader=`
			uniform sampler2D map;
			uniform mat3 uvTransform;
		`+sh.vertexShader.replace('}', `
			vec2 vUv = ( uvTransform * vec3( uv.x+${uShift}, uv.y, 1 ) ).xy;
			if (texture2D( map, vUv ).r >.9) fogDepth=5000.;
		}`)

	}
});//, opacity: 0
Ematerial.extensions = {derivatives: 1};
var Egeometry=new IcosahedronGeometry(R,64);
var Earth = new Points(new BufferGeometry().setFromPoints(Egeometry.vertices), Ematerial);
Egeometry.uv=[];
Egeometry.vertices.forEach(v=>{
	Egeometry.uv.push(.5-Math.atan2(-v.z, -v.x)/2/PI);
	Egeometry.uv.push(.5+Math.asin(v.y/R)/PI)
})
Earth.geometry.addAttribute('uv', new Float32BufferAttribute(Egeometry.uv, 2));

var Pmaterial = new PointsMaterial({
	size: d*.56,
	transparent: true,
	alphaTest: 0.004,
	depthTest: false,
	blending: 5,
	//opacity: .85,
	color: color,//.multiplyScalar(2),
	map: new TextureLoader().load(imgPath+'point.svg'),
	onBeforeCompile: function(sh){
		sh.uniforms.scale=matScale;
		sh.vertexShader='\
			attribute float flash;\n\
			varying float vSize;\n\
			'			+sh.vertexShader.replace(/}\s*$/, `
			  vSize=max(flash, 0.0);
			  gl_PointSize*=vSize;
			  vSize=1.-vSize;
				vSize=1.-vSize*abs(vSize);
			}			`);
		sh.fragmentShader='\
			varying float vSize;\n\
			'			+sh.fragmentShader.replace("#include <map_particle_fragment>", `
				#ifdef T_POINT
				 vec2 cxy = 2.0 * gl_PointCoord - 1.0;
			   float r = length(cxy), delta = fwidth(r); 
				 diffuseColor.a =1.0 - smoothstep(1. - delta, 1. + delta, r);
				 diffuseColor.a = (1.+delta -r)/delta;
				#else
				 //float r=sqrt(r2);
				 #include <map_particle_fragment>
				 //diffuseColor.rgb =mix(vec3(1.1), diffuse, min(r*2.3, 1.));
				 //diffuseColor.a=cos(min(r*r,1.)*PI)*.5+.5;
				 diffuseColor.a *= 2.6;
				#endif
			 diffuseColor.a *= smoothstep( ${(R*.2).toFixed(1)},  ${(-R*.4).toFixed(1)}, fogDepth-${(posZ).toFixed(1)} )*vSize;
			 #ifndef T_POINT
			  diffuseColor.a *= diffuseColor.a-.15;
			 #endif
     `);
			// console.log(sh, sh.vertexShader, sh.fragmentShader);
	}
});//, opacity: 0  ///  
Pmaterial.extensions = {derivatives: 1};

var pCount=50, points = [targPos];
var flashes=new Float32Array(pCount);
var points32=new Float32Array(pCount*3);
var Pgeometry=new BufferGeometry();
Pgeometry.setAttribute( 'position', new BufferAttribute( points32, 3 ) );
Pgeometry.setAttribute( 'flash', new BufferAttribute( flashes, 1 ) );

var Flashes=new Points(Pgeometry, Pmaterial);
//Flashes.renderOrder=1;
planet.add(Flashes, Earth)
scene.add(planet);
planet.position.z=-R

scene.fog=new Fog(color, posZ-R/2, posZ+R);
var t0=performance.now(), dMax=1000/15, dMin=1000/45, dT=1000/61, af, Pactive=[],
	axis=vec3(0,1,0).applyAxisAngle(vec3(0,0,1), obliquity), points0=[],
	pUp=0, pDn=[], flTimer=[], vecTest=new Vector3(), transStart, pLast, transactions=[],
	Tmaterial=Pmaterial.clone();
Tmaterial.__proto__=Pmaterial;
Tmaterial.defines={T_POINT: 1};
Tmaterial.blending=2;
Tmaterial.size=.047*d; Tmaterial.opacity=.75;
Tmaterial.color.multiplyScalar(.8);

Pmaterial.color.multiplyScalar(2)

function addTransaction(a,b,i, to){
	//console.log (pUp, a, b); //return
	var an=a.angleTo(b), l=R*1.13+an*5.5, center=a.clone().add(b).setLength(l),
	 ab=b.clone().sub(a).multiplyScalar(.25), cn=center.clone().setLength((l-R)*.7), n;//=an*160+16;
	var curve = new CurvePath();
	curve.add(new CubicBezierCurve3(a, a.clone().add(cn), center.clone().sub(ab), center));
	curve.add(new CubicBezierCurve3(center, center.clone().add(ab), b.clone().add(cn), b));
	n=curve.getLength()/R*200;

	var tFlashes=new Float32Array(n+1);
	//tFlashes.forEach(function(f,i){if (i) tFlashes[i]=tFlashes[i-1]+1/n});
	var tGeometry=new BufferGeometry().setFromPoints( curve.getSpacedPoints(n) );
	tGeometry.setAttribute( 'flash', new BufferAttribute( tFlashes, 1 ) );
	transactions[i]=Object.assign(new Points(tGeometry, Tmaterial), {timer: 0, n, to});

	planet.add(transactions[i]);
}

function addPoint(i0, i, c=0){ //return
	if (c++>1500) return //console.log(c);
	if (i0 === 0) return;
	if (i0) delete flTimer[i0];
	if (!i) {
		if (points.length==1) i=1
		else if (!points.some(function(p, j){return !points[i=j+1] && !transactions[i]})) i=transactions.length;
		if (i>=pCount && (!i0 || points[i0].isNew)) return false
	}
	var point=points0[Math.floor(Math.random()*points0.length)].clone();

	var dis2targ=points[i0]?.distanceTo(targPos);
	var isTarg = i0 && dis2targ<R*1.5 && dis2targ>R*.25 && Math.random()**2*dis2targ<R*.4;
	if (isTarg) {i=0; point=targPos;}
	else if (point.distanceTo(targPos)<.25*R) return addPoint(i0, i, c);

	var dLast, pointW=Earth.localToWorld(point.clone()).applyAxisAngle(axis, roV1*150);
	if (pointW.angleTo(camera.position)+pointW.x/R>1.7+Math.random() ) return addPoint(i0, i, c);
	if (i0 &&  points[i0].distanceTo(point)>R*1.84 ) return addPoint(i0, i, c);
	if (points.some((v, i)=> v!=targPos && (v.up>-1 || flashes[i]>.05) && v.distanceTo(point)<R*(v.pInd==i0?.18:.4))) return addPoint(i0, i, c);

	if (i0) addTransaction(points[i0], point, i0, i)

	if (isTarg) return true;

	point.pInd=i;
	points[i]=point;
	point.isNew=!i0;
	point.up=+!i0;
	points32[i*3]=point.x;
	points32[i*3+1]=point.y;
	points32[i*3+2]=point.z;
	Pgeometry.attributes.position.needsUpdate=true;
	// if (i0 && pUp<6 && Math.random()>.65) {  //fork
	// 	flTimer[i0]=Math.random()<.5?Math.random()*200+230:Math.random()*100;
	// 	points[i0].up=1
	// }
	return true
}
points32[0]=targPos.x;
points32[1]=targPos.y;
points32[2]=targPos.z;

// interactions
var dx = 0, dy = 0, ready, pointers={},
	raycaster = new Raycaster();

container.addEventListener('pointerdown', e=>{
	pointers[e.pointerId]={
		x0 : e.clientX,
		y0 : e.clientY
	}
	e.preventDefault();
});
window.addEventListener('pointermove', e=>{
	if (!ready || !pointers[e.pointerId]) return;
	e.preventDefault();
	let p=pointers[e.pointerId];
	dx = Math.lerp(dx, p.x0-(p.x0 = e.clientX), .3);
	dy = Math.lerp(dy, p.y0-(p.y0 = e.clientY), .3);
	//console.log(e.type, active.identifier, dx, x0)
	ready = 0;
	pointers.touch=(e.pointerType=='touch');
});
window.addEventListener('pointercancel', e=>delete pointers[e.pointerId]);
window.addEventListener('pointerup', e=>delete pointers[e.pointerId]);
window.addEventListener('pointerdown', e=>{delete pointers.touch;})

requestAnimationFrame(function animate() {
	requestAnimationFrame(animate);
	if (!checkResize()) return;
	var t=performance.now(), dt=t-t0;
	if (!Emap.image || !tTexture) return;// || dt<dMin
	dt=Math.min(dt, dMax);
	t0=t;
	planet.position.z-=planet.position.z*.08;
	//pAxis.applyAxisAngle(wY, roV2*dt);
	planet.rotateOnWorldAxis(pAxis, roV1*dt);

	var ax=vec3(0,1,0).applyQuaternion(planet.quaternion);
	dx*=1-.0015*dt;
	dy*=1-.0015*dt;
	if (pointers.touch) document.scrollingElement.scrollTop+=Math.round(dy*.3);
	planet.rotateOnWorldAxis(wX, -dy*.005);
	planet.rotateOnWorldAxis(wY, -dx*.005);
	var aCorr=Math.sqrt(1-ax.angleTo(pAxis)/3.15);
	planet.applyQuaternion(quat.clone().setFromUnitVectors(ax, pAxis).slerp(quat, 1-.0008*dt*aCorr));

	var count=0, newTr, newP, pAdded=0, maxDn=Math.random()*.6;
	pUp=0;
	if (points.length==1) addPoint();
	points.forEach(function(p,i){
		//if ((flTimer[i]-=dt)<0) pAdded=addPoint(i), p.up=1;
		count++;
		if (p.up>0) {
			pUp++;
			if ((flashes[i]+=(1.005-flashes[i])*.005*dt) > .95 ) {
				p.up=-1;
			}
			if (flashes[i]>.8 && !transactions[i] && !pAdded) {
				pAdded=addPoint(i);
				//p.up=-1;
			}
		}
		if (p.up<0) {
			if ((flashes[i]-=(1.11-flashes[i])*flashes[i]*.006*dt) < 0.005) {
				delete points[i];
				//if (flashes[i]<maxDn) 
				newP=1;
			}
		}
		if (!i) flashes[i]+=(.95-flashes[i])*.003*dt

	})
	transactions.forEach((tr, i) => {
		var arr=tr.geometry.attributes.flash.array, n=arr.length,
			t=tr.timer+=dt/Math.pow(tr.n, .3)*.008, {to}=tr;//, tt=t*t;
		arr.forEach(function(v,j){
			var df=j/n-t, dj=n-j;
			arr[j]=(df<0) ? 1+df : +(df<.2)*(1-df*df*8);

			if (!(dj%6) && dj<31) arr[j]*=Math.pow(1.14, 6-dj/6)
		});
		if ( t>1 && arr[n-1]<-0.4 ) {
			tr.geometry.dispose();
			planet.remove(tr);
			delete transactions[i];
			if (to) delete points[to];
		} else {
			if (t<1) pUp++;
			if (t>.8 && !transactions[to]) newTr=to;
			tr.geometry.attributes.flash.needsUpdate=true
		}
		var flUp = Math.smoothstep(t, .6, .95);
		if (!to && t<1) flashes[0] = Math.max(flashes[0], .95+flUp*.4);
		else if (to && !points[to]?.up) flashes[to] =t>1? .3+arr[n-1]*.7:flUp;
	})
	if (!points[points.length-1]) points.length--;
	if (newTr) {
		var p=points[newTr];
		if (!p.startTr && pUp<pCount && !pAdded) {
			pAdded = p.startTr=addPoint(newTr);
			//if (p.startTr && transactions[newTr] && transactions[newTr].timer>1.2) p.up=1;
		}
	}
	if (pUp<3 && Math.random()<.2 && !pAdded) pAdded=addPoint();
	Pgeometry.attributes.flash.needsUpdate=true;
	// point.lookAt(lookAt);
	// tEarth.rotation.set(0,0,0);
	// tEarth.rotateOnAxis(dir, -point.rotation.z)
	//tTexture.rotation=;
	//tTexture.needsUpdate=true;
	renderer.render( scene, camera)//, rTargets[0] );
	//renderer.render( bloom, pCamera );
	ready=1;
});

let tTexture, tCanvas, tMaterial, tEarth;

document.fonts.load('bold 50px "Futura LT"').then(function(){
	tCanvas=document.createElement('canvas');

	const
		ctx=tCanvas.getContext('2d'),
		text='BRATISLAVA',
		fnt=ctx.font = 'bold 80px "Futura LT"',
		textMetrics = ctx.measureText(text),
		asc=textMetrics.actualBoundingBoxAscent;

	tCanvas.width=textMetrics.width+3;
	tCanvas.height=asc + textMetrics.actualBoundingBoxDescent+3;
	ctx.beginPath();
	ctx.font=fnt;
	// ctx.fillStyle = "#000";
	// ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "#00a1e5";
	ctx.fillText(text, 1.5, asc+1.5);

	tTexture=new Texture(tCanvas);
	tTexture.needsUpdate=true;

	const {repeat}=tTexture,
		{width, height}=tCanvas;

	repeat.y=44;
	repeat.x=repeat.y*height/width*.94;

	tTexture.offset.set(1,1);//copy(repeat).multiplyScalar(.5);
	//tTexture.center.set(.5,.5);

	//tTexture.matrix.setUvTransform(-10+.5, -20+.5, 20, 40, 0, 0, 0);
	//tTexture.matrixAutoUpdate=false;
	tTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();

	tMaterial=new MeshBasicMaterial({
		map: tTexture,
		transparent: true,
		alphaTest: .1,
		onBeforeCompile: sh=>{
			sh.uniforms.targUV={value: targUV};
			sh.fragmentShader=sh.fragmentShader.replace('}', 'if (vUv.x<0.||vUv.y<0.||vUv.x>1.||vUv.y>1.) discard;}');
			sh.vertexShader='uniform vec2 targUV;\n'
			 + sh.vertexShader.replace('#include <uv_vertex>', `vUv = ( uvTransform * vec3( uv.x*2.-1.-targUV.x+${(uShift*2)}, uv.y-.5-targUV.y, 1 ) ).xy;`);
		}
	})

	tEarth=new Mesh(new IcosahedronGeometry(R*1.01, 48), tMaterial);
	planet.add(tEarth);

	Object.assign(window, {Earth, Egeometry, Ematerial, tTexture, tCanvas, tMaterial, tEarth, ShaderLib, ShaderChunk, targUV, vec3})
})
const point=new Mesh(new ConeGeometry(5, 10,8), new MeshBasicMaterial({color: '#fff', wireframe: true}))
point.position.x = -R;

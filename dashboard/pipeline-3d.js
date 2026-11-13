"use strict";
/* Real-time 3D geometry for observed pipeline transfers. No clock-driven packets. */
window.StampPipeline3D = (() => {
  const vertex = `attribute vec3 position; attribute vec3 color; varying vec3 tint;
    void main(){gl_Position=vec4(position,1.0);tint=color;}`;
  const fragment = `precision mediump float; varying vec3 tint;
    void main(){gl_FragColor=vec4(tint,1.0);}`;
  const palette = {idle:[.28,.42,.55],success:[.25,.81,.69],running:[.36,.86,1],failure:[1,.38,.47],selected:[.88,1,.88],lab:[.62,.5,.9]};
  const mix=(color,factor)=>color.map(v=>Math.min(1,v*factor));
  function create(canvas){
    let gl;
    try{gl=canvas.getContext("webgl",{alpha:false,antialias:true,depth:true,stencil:false});}catch{return null}
    if(!gl)return null;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
    let program;
    try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));}
    catch{canvas.remove();return null}
    const buffer=gl.createBuffer(),p=gl.getAttribLocation(program,"position"),c=gl.getAttribLocation(program,"color");
    let width=1,height=1,yaw=-.14,pitch=.32,zoom=1;
    function configure(w,h,rotation,tilt,magnification){
      width=w;height=h;yaw=rotation;pitch=tilt;zoom=magnification;
      const ratio=Math.min(window.devicePixelRatio||1,2),x=Math.round(w*ratio),y=Math.round(h*ratio);
      if(canvas.width!==x||canvas.height!==y){canvas.width=x;canvas.height=y;gl.viewport(0,0,x,y)}
    }
    function project(world){
      const [x,y,z]=world,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
      const horizontal=x*cy-z*sy,turn=x*sy+z*cy,vertical=-y*cp-turn*sp,depth=-y*sp+turn*cp;
      const scale=Math.min(width/9.5,height/5.3)*zoom*12/(12+depth);
      return {x:width*.5+horizontal*scale,y:height*.57-vertical*scale,z:Math.max(-.98,Math.min(.98,depth/16))};
    }
    function stream(nodes,links,pulses,selected,states,topology=[],metrics={}){
      if(gl.isContextLost())return false;
      const triangles=[],lines=[];
      function add(target,world,color){const pt=project(world);target.push(pt.x/width*2-1,1-pt.y/height*2,pt.z,...color)}
      function triangle(a,b,c,color){add(triangles,a,color);add(triangles,b,color);add(triangles,c,color)}
      function segment(a,b,color){add(lines,a,color);add(lines,b,color)}
      function ribbon(a,b,color,pixels){
        // Offset in screen space, perpendicular to the projected direction.
        // A fixed world-X offset collapses horizontal links into zero-area faces.
        const start=project(a),end=project(b),dx=end.x-start.x,dy=end.y-start.y;
        const length=Math.hypot(dx,dy);if(length<.01)return;
        const ox=-dy/length*pixels/2,oy=dx/length*pixels/2;
        const point=(p,x,y)=>[(p.x+x)/width*2-1,1-(p.y+y)/height*2,p.z,...color];
        const v1=point(start,ox,oy),v2=point(start,-ox,-oy);
        const v3=point(end,ox,oy),v4=point(end,-ox,-oy);
        triangles.push(...v1,...v2,...v3,...v2,...v4,...v3);
      }
      function box(at,size,color){
        const [x,y,z]=at,s=size,half=s*.8;
        const vertices=[[x-s,y-half,z-s],[x+s,y-half,z-s],[x+s,y-half,z+s],[x-s,y-half,z+s],
          [x-s,y+half,z-s],[x+s,y+half,z-s],[x+s,y+half,z+s],[x-s,y+half,z+s]];
        for(const [indices,factor] of [[[0,1,5,4],.48],[[1,2,6,5],.62],[[2,3,7,6],.56],[[3,0,4,7],.65],[[4,5,6,7],1.17],[[0,1,2,3],.4]]){
          const [a,b,c,d]=indices,v=mix(color,factor);triangle(vertices[a],vertices[b],vertices[c],v);triangle(vertices[a],vertices[c],vertices[d],v);
          for(const [i,j] of [[a,b],[b,c],[c,d],[d,a]])segment(vertices[i],vertices[j],mix(color,1.27));
        }
      }
      function sphere(at,radius,color){
        const point=(latitude,longitude)=>[
          at[0]+radius*Math.cos(latitude)*Math.cos(longitude),
          at[1]+radius*Math.sin(latitude),
          at[2]+radius*Math.cos(latitude)*Math.sin(longitude)
        ];
        for(let row=0;row<8;row++){
          const a=-Math.PI/2+row*Math.PI/8,b=a+Math.PI/8;
          for(let column=0;column<12;column++){
            const c=column*Math.PI/6,d=c+Math.PI/6;
            const shade=.55+.4*Math.max(0,-Math.sin(a)*.7+Math.cos(c)*.3);
            const tint=mix(color,shade);
            triangle(point(a,c),point(b,c),point(b,d),tint);
            triangle(point(a,c),point(b,d),point(a,d),tint);
          }
        }
      }
      function ring(at,radius,color,tilt=0){
        const point=angle=>[at[0]+Math.cos(angle)*radius,
          at[1]+Math.sin(angle)*radius*Math.sin(tilt),
          at[2]+Math.sin(angle)*radius*Math.cos(tilt)];
        for(let i=0;i<36;i++)segment(point(i*Math.PI/18),point((i+1)*Math.PI/18),color);
      }
      function module(node,size,color){
        const [x,y,z]=node.pos;
        if(node.id==="research"){
          sphere(node.pos,.28,color);
          ring(node.pos,.4,mix(color,1.2),.55);
          ring(node.pos,.46,mix(color,.7),-.55);
        }else if(node.id==="market_map"){
          box([x,y+.13,z],.29,mix(color,.4));
          const caps=metrics.marketCaps||[];
          const total=caps.reduce((sum,value)=>sum+value,0);
          if(total>0){
            caps.slice(0,4).forEach((cap,index)=>{
              const height=.08+cap/total*.38;
              const center=[x-.2+index*.13,y+.03-height,z];
              box(center,.052,mix(color,.8+index*.1));
              segment([center[0],y+.05,z],[center[0],y-height,z],mix(color,1.2));
            });
          }else box([x,y-.07,z],.19,color);
          ring([x,y+.4,z],.4,mix(color,.75));
        }else if(node.id.startsWith("venue_")){
          box(node.pos,size,mix(color,.55));
          for(let level=0;level<3;level++){
            const row=y-.08+level*.08;
            segment([x-size*.75,row,z-size-.003],[x+size*.75,row,z-size-.003],mix(color,1.25));
          }
        }else{
          box([x,y+.08,z],size,mix(color,.38));
          box([x,y-.09,z],size*.7,color);
          ring([x,y+.32,z],size*1.35,mix(color,.8));
        }
      }
      function dock(at,size,color){
        const y=at[1]+size*.8+.06;
        for(let i=0;i<8;i++){
          const a=i*Math.PI/4,b=(i+1)*Math.PI/4;
          segment([at[0]+Math.cos(a)*size*1.65,y,at[2]+Math.sin(a)*size*1.65],
            [at[0]+Math.cos(b)*size*1.65,y,at[2]+Math.sin(b)*size*1.65],color);
        }
      }
      for(let x=-4.2;x<=4.2;x+=.6)segment([x,2.3,-2],[x,2.3,2],[.09,.18,.26]);
      for(let z=-2;z<=2;z+=.5)segment([-4.2,2.3,z],[4.2,2.3,z],[.09,.18,.26]);
      const positions=new Map(nodes.map(node=>[node.id,node.pos]));
      const curve=(a,b,t)=>{const mid=[(a[0]+b[0])/2,Math.min(a[1],b[1])-.55,(a[2]+b[2])/2];
        return [0,1,2].map(i=>(1-t)**2*a[i]+2*(1-t)*t*mid[i]+t*t*b[i])};
      for(const [from,to] of topology){
        const a=positions.get(from),b=positions.get(to);if(!a||!b)continue;
        for(let i=0;i<28;i++)ribbon(curve(a,b,i/28),curve(a,b,(i+1)/28),[.11,.23,.30],1.4);
      }
      for(const link of links){
        const a=positions.get(link.from),b=positions.get(link.to);if(!a||!b)continue;
        const active=selected?.from===link.from&&selected?.to===link.to;
        const related=selected?.id===link.from||selected?.id===link.to;
        const color=active?[.76,1,.88]:link.live?[.35,.78,.96]:related?[.28,.65,.59]:[.1,.25,.29];
        for(let i=0;i<28;i++)ribbon(curve(a,b,i/28),curve(a,b,(i+1)/28),color,active?4:link.live?2.8:1.6);
        // Fixed arrowheads indicate direction; only event packets move.
        const before=project(curve(a,b,.81)),tip=project(curve(a,b,.85));
        const vx=tip.x-before.x,vy=tip.y-before.y,size=Math.hypot(vx,vy);
        if(size>.01){const nx=vx/size,ny=vy/size,back=project(curve(a,b,.85));
          const from=[back.x-9*nx-4*ny,back.y-9*ny+4*nx];
          const other=[back.x-9*nx+4*ny,back.y-9*ny-4*nx];
          const arrow=(p,q)=>{lines.push(p[0]/width*2-1,1-p[1]/height*2,tip.z,...color,
            q[0]/width*2-1,1-q[1]/height*2,tip.z,...color)};
          arrow(from,[tip.x,tip.y]);arrow(other,[tip.x,tip.y]);}
      }
      for(const node of nodes){
        const status=states[node.id],color=node.id===selected?.id?palette.selected:status==="running"?palette.running:
          status==="failure"?palette.failure:status==="success"?palette.success:node.id==="lab"?palette.lab:palette.idle;
        const size=node.id.startsWith("venue_")?.15:.23;
        dock(node.pos,size,node.id===selected?.id?palette.selected:mix(color,.7));
        module(node,size,color);
        segment([node.pos[0],node.pos[1]+.27,node.pos[2]],[node.pos[0],2.3,node.pos[2]],mix(color,.33));
      }
      for(const pulse of pulses||[]){
        const a=positions.get(pulse.from),b=positions.get(pulse.to);if(a&&b&&Number.isFinite(pulse.progress)){
          sphere(curve(a,b,Math.max(0,Math.min(1,pulse.progress))),.065,[.92,1,.65]);
        }
      }
      function render(target,primitive){
        if(!target.length)return;
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(target),gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(p,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(c,3,gl.FLOAT,false,24,12);
        gl.drawArrays(primitive,0,target.length/6);
      }
      gl.clearColor(.024,.052,.078,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.enableVertexAttribArray(p);gl.enableVertexAttribArray(c);
      render(triangles,gl.TRIANGLES);render(lines,gl.LINES);
      return true;
    }
    canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();canvas.style.display="none"});
    canvas.addEventListener("webglcontextrestored",()=>{canvas.style.display=""});
    return {configure,project,draw:stream,available:()=>!gl.isContextLost()};
  }
  return {create};
})();

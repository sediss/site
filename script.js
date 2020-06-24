const cassiniPolys = _ObjectData.polys.map(tri => tri.map(x => new LV3(x.x, x.y, x.z).scale(1)));
const cassiniDimensions = compute3DModelDimensions(cassiniPolys);
objMapEachPoint(cassiniPolys, p => {
    return p.sub(cassiniDimensions.median);
});
/**
 * @type {Array<number>}
 */
const cassiniEdges = [];
const cassiniTris = [];
for (let i = 0; i < cassiniPolys.length; i++) {
    const [t1, t2, t3] = cassiniPolys[i];
    // L1
    cassiniEdges.push(t1.x, t1.y, t1.z, 1);
    cassiniEdges.push(t2.x, t2.y, t2.z, 1);
    // L2
    cassiniEdges.push(t2.x, t2.y, t2.z, 1);
    cassiniEdges.push(t3.x, t3.y, t3.z, 1);
    // L3
    cassiniEdges.push(t3.x, t3.y, t3.z, 1);
    cassiniEdges.push(t1.x, t1.y, t1.z, 1);

    
    cassiniTris.push(t1.x, t1.y, t1.z, 1);
    cassiniTris.push(t2.x, t2.y, t2.z, 1);
    cassiniTris.push(t3.x, t3.y, t3.z, 1);
}

const canvas = document.getElementById('glc');
let canvasSize = { width: 300, height: 300 };
/**
 * @type {WebGLRenderingContext} 
 */
const gl = canvas.getContext('webgl');
const dpi = window.devicePixelRatio;
let cassiniScalar = 24;

function updateCanvasSize() {
    canvasSize = {
        width: window.innerWidth * dpi,
        height: window.innerHeight * dpi,
    };
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    cassiniScalar = window.innerWidth >= 600 ? 32 : 24;
}
updateCanvasSize();
window.onresize = () => updateCanvasSize();

// chosen empirically to maximise color randomness
// whilst being smaller than iphone 11's gpu uniform buffer limit
const gpuRandomColorV3Length = 100;

const CassiniShader = {
    vert: `
            attribute vec4 pos;
            attribute float colorIndex;
            uniform mat4 mat;
            uniform float colorShift;
            uniform vec3 colors[100];
            varying vec4 color;
            
            void main() {
                gl_Position = mat * pos;
                float multiplesOf100 = (colorIndex + colorShift) / 100.0;
                highp int mults = int(multiplesOf100);
                highp int index = int(colorIndex + colorShift) - (mults * 100);
                color = vec4(colors[index].x, colors[index].y, colors[index].z, 1.0);
            }
        `,
    frag: `
            varying highp vec4 color;
            void main() {
                gl_FragColor = color;
            }
        `,
};
CassiniShader.program = ShaderManager.createShader(gl, CassiniShader.vert, CassiniShader.frag);
CassiniShader.access = {
    pos: gl.getAttribLocation(CassiniShader.program, 'pos'),
    colorIndex: gl.getAttribLocation(CassiniShader.program, 'colorIndex'),
    mat: gl.getUniformLocation(CassiniShader.program, 'mat'),
    colors: gl.getUniformLocation(CassiniShader.program, 'colors'),
    colorShift: gl.getUniformLocation(CassiniShader.program, 'colorShift'),
};

const DebrisShader = {
    vert: `
            attribute vec4 pos;
            uniform mat4 mat;
            
            void main() {
                gl_Position = mat * pos;
            }
        `,
    frag: `
            uniform highp vec4 color;
            void main() {
                gl_FragColor = color;
            }
        `,
};

// setup cassini GPU data
gl.useProgram(CassiniShader.program);

const cassiniLinePointsBuffer = createBuffer(gl, cassiniEdges);
setBuffer(gl, CassiniShader.access.pos, cassiniLinePointsBuffer, 4);

const colors = Array(gpuRandomColorV3Length * 3).fill().map(() => Math.random());
gl.uniform3fv(CassiniShader.access.colors, new Float32Array(colors));

const colorIndices = Array(Math.floor(cassiniEdges.length / 4)).fill(0).map((_, i) => i % gpuRandomColorV3Length);
const colorIndicesBuffer = createBuffer(gl, colorIndices);
setBuffer(gl, CassiniShader.access.colorIndex, colorIndicesBuffer, 1);

// setup debris rendering
DebrisShader.program = ShaderManager.createShader(gl, DebrisShader.vert, DebrisShader.frag);
DebrisShader.access = {
    pos: gl.getAttribLocation(DebrisShader.program, 'pos'),
    mat: gl.getUniformLocation(DebrisShader.program, 'mat'),
    color: gl.getUniformLocation(DebrisShader.program, 'color'),
};

gl.useProgram(DebrisShader.program);
// debris points
const angleToRadian = Math.PI / 180;
const circlePoints = Array.from({ length: 36 }, (_, i) => new LV3(
    Math.cos(i * 10 * angleToRadian),
    Math.sin(i * 10 * angleToRadian),
    0
));
const debrisBuffer = createBuffer(gl, lv3Poly2Arr4(circlePoints));
setBuffer(gl, DebrisShader.access.pos, debrisBuffer, 4);

const cassiniTrisBuffer = createBuffer(gl, cassiniTris);
setBuffer(gl, DebrisShader.access.pos, cassiniTrisBuffer, 4);


const getDebrisRadii = () => Math.max(canvasSize.width, canvasSize.height);
const debrisRadii = getDebrisRadii();
const debrisList = Array.from({ length: 600}, () => {
    return new LV3(
        (Math.random()-0.5) * 2 * debrisRadii,
        (Math.random()-0.5) * 2 * debrisRadii,
        (Math.random()-0.5) * 2 * debrisRadii,
    );
});
function resetDebri(index) {
    const debrisRadii = getDebrisRadii();
    debrisList[index] = new LV3(
        // -debrisRadii * 0.7,
        (Math.random()-0.5) * 2 * debrisRadii,
        (Math.random()-0.5) * 2 * debrisRadii,
        (Math.random()-0.5) * 2 * debrisRadii,
    );
}
const debrisDirection = buildMatrix([
    LMat4.rotateY(59),
]).multLV3(new LV3(1, 0, 0));

gl.useProgram(CassiniShader.program);

gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LEQUAL);

let time = 0;

function setMat(pointer, matIn) {
    const mat = matIn.transpose();
    gl.uniformMatrix4fv(pointer, false, mat.arr);
}

let prevDelta = 0;
const drawScene = (delta) => {
    const timeDifference = delta - prevDelta;
    prevDelta = delta;
    const dt = timeDifference * 0.025;
    time += dt;
    const D = 100;
    const maxWH = Math.max(canvasSize.width, canvasSize.height);

    const projectionMatrix = buildMatrix([
        scalingMat(0.5, -0.5, 0.5),
        scalingMat(
            dpi / canvasSize.width,
            dpi / canvasSize.height,
            dpi / (maxWH * 100),
        ),
        createPerspectiveMatrix(D),
    ]);

    
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const cassiniAngleT = time * 0.2;
    // setup cassini mat
    const cassiniMat = buildMatrix([
        projectionMatrix,
        LMat4.scale(cassiniScalar),
        LMat4.rotateY(40 + cassiniAngleT * 0.5),
        LMat4.rotateZ(cassiniAngleT),
        LMat4.rotateX(cassiniAngleT),
        LMat4.trans(-8, 0, 10),
    ]);

    // draw debris
    gl.useProgram(DebrisShader.program);

    gl.uniform4fv(DebrisShader.access.color, new Float32Array([1, 1, 1, 1]));
    setBuffer(gl, DebrisShader.access.pos, debrisBuffer, 4);
    
    for (let i = 0; i < debrisList.length; i++) {
        const debriPoint = debrisList[i];
        const debrisMat = buildMatrix([
            projectionMatrix,
            LMat4.trans(-canvasSize.width * 0.18, 0, 0),
            LMat4.trans(debriPoint.x, debriPoint.y, debriPoint.z),
            LMat4.scale(0.75 * dpi),
        ]);
        setMat(DebrisShader.access.mat, debrisMat);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 36);

        debrisList[i].iadd(debrisDirection.scale(10 * dt));
        const debrisRadii = getDebrisRadii();
        const J = debrisRadii * 1.01;//canvasSize.width * 0.12;
        if (debriPoint.x > J || debriPoint.y > J || debriPoint.z > J) {
            resetDebri(i);
        }
    }

    gl.clear(gl.DEPTH_BUFFER_BIT);

    setMat(DebrisShader.access.mat, cassiniMat);
    gl.uniform4fv(DebrisShader.access.color, new Float32Array([Math.random()*0.125, Math.random()*0.125, Math.random()*0.125, 1]));
    const MP = Math.floor(cassiniTris.length / 6);
    setBuffer(gl, DebrisShader.access.pos, cassiniTrisBuffer, 4);
    gl.drawArrays(gl.TRIANGLES, 0, MP);

    //draw cassini edges

    gl.useProgram(CassiniShader.program);

    gl.uniform1f(CassiniShader.access.colorShift, time % gpuRandomColorV3Length);
    

    setMat(CassiniShader.access.mat, cassiniMat);
    
    setBuffer(gl, CassiniShader.access.pos, cassiniLinePointsBuffer, 4);
    gl.drawArrays(gl.LINES, 0, Math.floor(cassiniEdges.length / 4));




    requestAnimationFrame(drawScene);
};
requestAnimationFrame(drawScene);


function buildMatrix(mats = []) {
    return mats.reduce((p, c) => p.mult(c), LMat4.identity());
}

function scalingMat(x, y, z) {
    return new LMat4([
        x, 0, 0, 0,
        0, y, 0, 0,
        0, 0, z, 0,
        0, 0, 0, 1,
    ]);
}

function lv3ToArr4(p) {
    return [p.x, p.y, p.z, 1];
}

function lv3Poly2Arr4(poly) {
    return poly.flatMap(p => lv3ToArr4(p));
}

function polys2Arr(polys) {
    const arr = [];
    for (let i = 0; i < polys.length; i++) {
        const poly = polys[i];
        for (let j = 0; j < poly.length; j++) {
            const p = poly[j];
            arr.push(p.x);
            arr.push(p.y);
            arr.push(p.z);
            arr.push(1);
        }
    }
    return arr;
}


function getAverage(pts) {
    return pts.reduce((p, c) => p.add(c.scale(1 / pts.length)), new LV3(0, 0, 0));
}

function findAvgPointInObj(obj) {
    const points = getPoints(obj);
    return getAverage(points);
}
function getPoints(polys) {
    return polys.reduce((p, c) => p.concat(c), [])
}
function centerToOrigin(obj) {
    const middle = findAvgPointInObj(obj);
    obj.forEach(tri => {
        tri.forEach(p => {
            p.isub(middle);
        });
    });
    return obj;
}

function objMapEachPoint(polys, mapF) {
    for (let j = 0; j < polys.length; j++) {
        for (let i = 0; i < polys[j].length; i++) {
            polys[j][i] = mapF(polys[j][i].copy());
        }
    }
}


function compute3DModelDimensions(obj) {
    const points = getPoints(obj);
    let minP = points[0].copy();
    let maxP = points[0].copy();
    const invLen = 1 / points.length;
    const avg = points[0].scale(invLen);
    const xs = [points[0].x];
    const ys = [points[0].y];
    const zs = [points[0].z];

    for (let i = 1; i < points.length; i++) {
        const p = points[i];
        minP.x = Math.min(minP.x, p.x);
        maxP.x = Math.max(maxP.x, p.x);
        minP.y = Math.min(minP.y, p.y);
        maxP.y = Math.max(maxP.y, p.y);
        minP.z = Math.min(minP.z, p.z);
        maxP.z = Math.max(maxP.z, p.z);

        avg.iadd(p.scale(invLen));

        xs.push(p.x);
        ys.push(p.y);
        zs.push(p.z);
    }

    xs.sort();
    ys.sort();
    zs.sort();

    let median = undefined;
    if (xs.length % 2 === 0) {
        const i1 = Math.floor(xs.length / 2);
        const i2 = i1 - 1;
        const p1 = new LV3(xs[i1], ys[i1], zs[i1]);
        const p2 = new LV3(xs[i2], ys[i2], zs[i2]);
        median = p1.add(p2).scale(0.5);
    } else {
        const i = Math.floor(xs.length / 2);
        median = new LV3(xs[i], ys[i], zs[i]);
    }
    
    return {
        min: minP,
        max: maxP,
        size: maxP.sub(minP),
        avg,
        median,
    };
}

function drawLine(gl, pointer, buffer, p1, p2) {
    setBuffer(gl, pointer, buffer, 4);
    updateBuffer(gl, buffer, [
        p1.x, p1.y, p1.z, 1,
        p2.x, p2.y, p2.z, 1,
    ]);
    gl.drawArrays(gl.LINES, 0, 2);
}

function drawPoly(gl, pointer, buffer, points, fill = true) {
    setBuffer(gl, pointer, buffer, 4);
    updateBuffer(gl, buffer, points.flatMap(x => [x.x, x.y, x.z, 1]));
    gl.drawArrays(fill ? gl.TRIANGLE_FAN : gl.LINE_LOOP, 0, points.length);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function createPerspectiveMatrix(D) {
    return new LMat4([
        D, 0, 0, 0,
        0, D, 0, 0,
        0, 0, D, 0,
        0, 0, 1/D, D,
    ]);
}



async function addInfo(str) {
    const inf = document.querySelector('#info');
    const elem = document.createElement('div');
    elem.innerHTML = ``;
    inf.appendChild(elem);
    const elemStack = [elem];
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        const elem = elemStack[elemStack.length-1];
        if (typeof c === 'string') {
            if (c === '=') elem.innerHTML += '&nbsp;';
            else if (c === '*') elem.innerHTML += '&nbsp;&nbsp;&nbsp;&nbsp;';
            else elem.innerHTML += str[i];
        } else {
            if (!c.end) {
                const newTag = document.createElement(c.tag);
                c.attributes && Object.keys(c.attributes).forEach(k => newTag.setAttribute(k, c.attributes[k]));
                elemStack.push(newTag);
                elem.appendChild(newTag);
            } else {
                elemStack.pop();
            }
        }
        await sleep(30);
    }
}

// complex array inner string flat map
function cpxaisfm(arr) {
    const rv = [];
    for (let v of arr) {
        if (typeof v === 'string') v.split('').forEach(c => rv.push(c));
        else rv.push(v);
    }
    return rv;
}

const enableLongMessages = window.innerWidth >= 600;

const maybeKeepLongMessage = (msgArr) => {
    if (!enableLongMessages) return [];
    return msgArr;
};


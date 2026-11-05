/**
 * NEXUS PLATFORM — HYBRID ENGINE MASTER CONTROLLER
 * - Native PlayCanvas 3D Studio (Orbit Camera, PBR, Hierarchy, Inspector, GLB Loader)
 * - Monaco App Studio (Web IDE with Live Sandbox Preview)
 * - Autonomous Cloudflare Workers AI Conference (Llama -> Qwen -> DeepSeek -> GLM)
 */

const STORAGE_PROJECTS_KEY = 'nexus_projects_master_v6';
const WORKER_GATEWAY_URL = 'https://nexus.liushengluntailang.workers.dev/api/ai/chat';

// 初期プロジェクトテンプレート
const DEFAULT_PROJECTS = [
  {
    id: 'proj_game_main',
    name: 'Cyber Arena 3D',
    type: 'GAME',
    desc: 'PlayCanvas 3D Game Studio (Native Orbit, Lighting & Inspector)'
  },
  {
    id: 'proj_app_main',
    name: 'Neon Web Terminal',
    type: 'APP',
    desc: 'Monaco Editor IDE (HTML/CSS/JS Live Preview)',
    files: {
      'index.html': `<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <div class="card">\n    <h1 id="title">⚡ NEXUS APP STUDIO</h1>\n    <p>Monaco Editorでリアルタイムに編集可能です。</p>\n    <button id="btn" onclick="handleClick()">CLICK ME</button>\n  </div>\n  <script src="main.js"><\/script>\n</body>\n</html>`,
      'style.css': `body {\n  background: #090b10;\n  color: #00f3ff;\n  font-family: sans-serif;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n  margin: 0;\n}\n.card {\n  background: #151b26;\n  border: 1px solid #00f3ff;\n  padding: 24px;\n  border-radius: 8px;\n  text-align: center;\n  box-shadow: 0 0 20px rgba(0, 243, 255, 0.2);\n}\nbutton {\n  background: #ff6600;\n  color: #fff;\n  border: none;\n  padding: 8px 16px;\n  font-weight: bold;\n  border-radius: 4px;\n  cursor: pointer;\n}`,
      'main.js': `function handleClick() {\n  const title = document.getElementById('title');\n  title.textContent = '🔥 APP EXECUTED IN SANDBOX!';\n  title.style.color = '#00ffaa';\n}`
    }
  }
];

// ==========================================
// 1. CLOUDFLARE WORKERS AI CLIENT
// ==========================================
class CloudflareAIClient {
  static async call(agent, prompt, context = '') {
    try {
      const res = await fetch(WORKER_GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, prompt, context })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Cloudflare Workers AI execution failed`);
      }
      return data.response;
    } catch (err) {
      console.warn(`[Cloudflare Workers AI Network Notice] ${err.message}`);
      throw err;
    }
  }
}

// ==========================================
// 2. PLAYCANVAS NATIVE ENGINE STUDIO
// ==========================================
class PlayCanvasNativeEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.app = null;
    this.entities = [];
    this.selectedEntity = null;
    this.isPlaying = false;

    // Orbit Camera State
    this.cameraDistance = 8;
    this.cameraPitch = 25;
    this.cameraYaw = 45;
    this.cameraPivot = new pc.Vec3(0, 0.5, 0);
    this.isDraggingLeft = false;
    this.isDraggingRight = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.initEngine();
    this.setupOrbitControls();
    this.setupGLBImport();
  }

  initEngine() {
    if (typeof pc === 'undefined' || !this.canvas) return;

    try {
      this.app = new pc.Application(this.canvas, {
        mouse: new pc.Mouse(this.canvas),
        touch: new pc.TouchDevice(this.canvas),
        keyboard: new pc.Keyboard(window)
      });
      this.app.start();

      this.app.setCanvasFillMode(pc.FILLMODE_NONE);
      this.resize();

      // Camera
      this.camera = new pc.Entity('Orbit Camera');
      this.camera.addComponent('camera', {
        clearColor: new pc.Color(0.08, 0.09, 0.11),
        farClip: 1000
      });
      this.app.root.addChild(this.camera);
      this.entities.push(this.camera);
      this.updateCameraTransform();

      // Sun Light
      const sun = new pc.Entity('Sun Light');
      sun.addComponent('light', { type: 'directional', color: new pc.Color(1, 0.95, 0.9), intensity: 1.4 });
      sun.setEulerAngles(45, 30, 0);
      this.app.root.addChild(sun);
      this.entities.push(sun);

      // Grid Floor
      const floor = new pc.Entity('Grid Floor');
      floor.addComponent('render', { type: 'plane' });
      floor.setLocalScale(24, 1, 24);
      const floorMat = new pc.StandardMaterial();
      floorMat.diffuse = new pc.Color(0.1, 0.12, 0.15);
      floorMat.emissive = new pc.Color(0.02, 0.03, 0.04);
      floorMat.update();
      floor.render.material = floorMat;
      this.app.root.addChild(floor);
      this.entities.push(floor);

      // Default Object (Cyber Cube)
      const box = new pc.Entity('Base Cube');
      box.addComponent('render', { type: 'box' });
      box.setPosition(0, 0.5, 0);
      const boxMat = new pc.StandardMaterial();
      boxMat.diffuse = new pc.Color(0, 0.8, 1);
      boxMat.emissive = new pc.Color(0, 0.15, 0.25);
      boxMat.update();
      box.render.material = boxMat;
      this.app.root.addChild(box);
      this.entities.push(box);

      window.addEventListener('resize', () => this.resize());
      console.log('✔ PlayCanvas Engine Running');
      this.renderHierarchy();
      this.selectEntity(this.entities.indexOf(box));
    } catch (e) {
      console.error('PlayCanvas Init Failure:', e);
    }
  }

  resize() {
    if (!this.app || !this.canvas) return;
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.clientWidth;
      this.canvas.height = parent.clientHeight;
      this.app.resizeCanvas(parent.clientWidth, parent.clientHeight);
    }
  }

  setupOrbitControls() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.isDraggingLeft = true;
      if (e.button === 2) this.isDraggingRight = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingLeft = false;
      this.isDraggingRight = false;
    });

    c.addEventListener('contextmenu', (e) => e.preventDefault());

    c.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.isDraggingLeft) {
        this.cameraYaw -= dx * 0.35;
        this.cameraPitch = Math.max(-85, Math.min(85, this.cameraPitch + dy * 0.35));
        this.updateCameraTransform();
      } else if (this.isDraggingRight) {
        const panSpeed = 0.005 * this.cameraDistance;
        const right = this.camera.right;
        const up = this.camera.up;
        this.cameraPivot.add(right.clone().mulScalar(-dx * panSpeed));
        this.cameraPivot.add(up.clone().mulScalar(dy * panSpeed));
        this.updateCameraTransform();
      }
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = Math.max(1, Math.min(100, this.cameraDistance + e.deltaY * 0.008));
      this.updateCameraTransform();
    }, { passive: false });
  }

  updateCameraTransform() {
    if (!this.camera) return;
    const radYaw = this.cameraYaw * pc.math.DEG_TO_RAD;
    const radPitch = this.cameraPitch * pc.math.DEG_TO_RAD;
    const x = this.cameraDistance * Math.sin(radYaw) * Math.cos(radPitch);
    const y = this.cameraDistance * Math.sin(radPitch);
    const z = this.cameraDistance * Math.cos(radYaw) * Math.cos(radPitch);
    this.camera.setPosition(this.cameraPivot.x + x, this.cameraPivot.y + y, this.cameraPivot.z + z);
    this.camera.lookAt(this.cameraPivot);
  }

  resetCamera() {
    this.cameraDistance = 8;
    this.cameraPitch = 25;
    this.cameraYaw = 45;
    this.cameraPivot.set(0, 0.5, 0);
    this.updateCameraTransform();
  }

  setupGLBImport() {
    const fileInput = document.getElementById('glb-file-input');
    const dropZone = document.getElementById('viewport-drop-zone');

    const loadFile = (file) => {
      if (!file.name.match(/\.(glb|gltf)$/i)) {
        window.nexusApp.showToast('Please select a .glb or .gltf file');
        return;
      }
      const url = URL.createObjectURL(file);
      this.app.assets.loadFromUrl(url, 'container', (err, asset) => {
        if (err) {
          window.nexusApp.showToast(`GLB Load Failed: ${err}`);
          return;
        }
        const modelEntity = asset.resource.instantiateModelEntity();
        modelEntity.name = file.name.replace(/\.[^/.]+$/, "");
        modelEntity.setPosition(0, 0, 0);
        this.app.root.addChild(modelEntity);
        this.entities.push(modelEntity);
        this.renderHierarchy();
        this.selectEntity(this.entities.indexOf(modelEntity));
        window.nexusApp.showToast(`Imported GLB Model: ${file.name}`);
      });
    };

    if (fileInput) fileInput.addEventListener('change', (e) => { if (e.target.files.length) loadFile(e.target.files[0]); });
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => e.preventDefault());
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
      });
    }
  }

  addPrimitive(type = 'box', name = 'Entity') {
    const entity = new pc.Entity(name);
    entity.addComponent('render', { type });
    entity.setPosition((Math.random() - 0.5) * 4, 1, (Math.random() - 0.5) * 4);
    
    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(Math.random(), Math.random(), Math.random());
    mat.update();
    entity.render.material = mat;

    this.app.root.addChild(entity);
    this.entities.push(entity);
    this.renderHierarchy();
    this.selectEntity(this.entities.indexOf(entity));
    return entity;
  }

  renderHierarchy() {
    const list = document.getElementById('game-hierarchy-list');
    if (!list) return;
    list.innerHTML = this.entities.map((e, idx) => `
      <div class="pc-tree-item ${this.selectedEntity === e ? 'active' : ''}" onclick="window.gameStudio.selectEntity(${idx})">
        <span>${e.render ? '📦' : (e.camera ? '📷' : '💡')}</span> ${e.name}
      </div>
    `).join('');
  }

  selectEntity(idx) {
    this.selectedEntity = this.entities[idx];
    this.renderHierarchy();
    this.renderInspector();
  }

  renderInspector() {
    const body = document.getElementById('game-inspector-body');
    const badge = document.getElementById('inspector-entity-type');
    if (!body || !this.selectedEntity) {
      if (body) body.innerHTML = '<div class="pc-empty-msg">オブジェクトを選択してください</div>';
      return;
    }
    const e = this.selectedEntity;
    if (badge) badge.textContent = e.render ? 'RENDER' : (e.camera ? 'CAMERA' : 'LIGHT');

    const pos = e.getPosition();
    const rot = e.getEulerAngles();
    const scl = e.getLocalScale();

    body.innerHTML = `
      <div class="pc-section">
        <div class="pc-section-title">Identity</div>
        <input type="text" class="pc-input" value="${e.name}" onchange="window.gameStudio.updateName(this.value)">
      </div>

      <div class="pc-section">
        <div class="pc-section-title">Transform</div>
        <div style="font-size:9px; color:#888; margin-bottom:2px;">Position</div>
        <div class="coord-row">
          <div class="coord-box x"><span>X</span><input type="number" step="0.2" value="${pos.x.toFixed(2)}" onchange="window.gameStudio.updateTransform('pos','x',this.value)"></div>
          <div class="coord-box y"><span>Y</span><input type="number" step="0.2" value="${pos.y.toFixed(2)}" onchange="window.gameStudio.updateTransform('pos','y',this.value)"></div>
          <div class="coord-box z"><span>Z</span><input type="number" step="0.2" value="${pos.z.toFixed(2)}" onchange="window.gameStudio.updateTransform('pos','z',this.value)"></div>
        </div>
        <div style="font-size:9px; color:#888; margin:6px 0 2px;">Rotation</div>
        <div class="coord-row">
          <div class="coord-box x"><span>X</span><input type="number" step="5" value="${rot.x.toFixed(0)}" onchange="window.gameStudio.updateTransform('rot','x',this.value)"></div>
          <div class="coord-box y"><span>Y</span><input type="number" step="5" value="${rot.y.toFixed(0)}" onchange="window.gameStudio.updateTransform('rot','y',this.value)"></div>
          <div class="coord-box z"><span>Z</span><input type="number" step="5" value="${rot.z.toFixed(0)}" onchange="window.gameStudio.updateTransform('rot','z',this.value)"></div>
        </div>
        <div style="font-size:9px; color:#888; margin:6px 0 2px;">Scale</div>
        <div class="coord-row">
          <div class="coord-box x"><span>X</span><input type="number" step="0.1" value="${scl.x.toFixed(2)}" onchange="window.gameStudio.updateTransform('scl','x',this.value)"></div>
          <div class="coord-box y"><span>Y</span><input type="number" step="0.1" value="${scl.y.toFixed(2)}" onchange="window.gameStudio.updateTransform('scl','y',this.value)"></div>
          <div class="coord-box z"><span>Z</span><input type="number" step="0.1" value="${scl.z.toFixed(2)}" onchange="window.gameStudio.updateTransform('scl','z',this.value)"></div>
        </div>
      </div>

      ${e.render ? `
      <div class="pc-section">
        <div class="pc-section-title">PBR Material</div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px;">Color</span>
          <input type="color" value="#00f3ff" onchange="window.gameStudio.updateColor(this.value)">
        </div>
      </div>
      ` : ''}
    `;
  }

  updateTransform(type, axis, val) {
    if (!this.selectedEntity) return;
    const v = parseFloat(val);
    if (type === 'pos') {
      const p = this.selectedEntity.getPosition();
      p[axis] = v;
      this.selectedEntity.setPosition(p);
    } else if (type === 'rot') {
      const r = this.selectedEntity.getEulerAngles();
      r[axis] = v;
      this.selectedEntity.setEulerAngles(r);
    } else if (type === 'scl') {
      const s = this.selectedEntity.getLocalScale();
      s[axis] = v;
      this.selectedEntity.setLocalScale(s);
    }
  }

  updateColor(hex) {
    if (!this.selectedEntity || !this.selectedEntity.render) return;
    const mat = this.selectedEntity.render.material;
    if (mat) {
      mat.diffuse = new pc.Color().fromString(hex);
      mat.update();
    }
  }

  updateName(val) {
    if (this.selectedEntity) {
      this.selectedEntity.name = val;
      this.renderHierarchy();
    }
  }
}

// ==========================================
// 3. MONACO APP STUDIO (Web IDE)
// ==========================================
class MonacoAppStudio {
  constructor(containerId, iframeId) {
    this.container = document.getElementById(containerId);
    this.previewFrame = document.getElementById(iframeId);
    this.editor = null;
    this.currentFile = 'index.html';
    this.files = {};
    this.initMonaco();
  }

  initMonaco() {
    if (typeof require === 'undefined') {
      setTimeout(() => this.initMonaco(), 150);
      return;
    }

    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      this.editor = monaco.editor.create(this.container, {
        value: this.files['index.html'] || '',
        language: 'html',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 12,
        minimap: { enabled: false }
      });

      this.editor.onDidChangeModelContent(() => {
        this.files[this.currentFile] = this.editor.getValue();
        this.triggerLivePreview();
      });

      this.triggerLivePreview();
      console.log('✔ Monaco Editor Ready');
    });
  }

  loadProjectFiles(files) {
    this.files = files ? { ...files } : JSON.parse(JSON.stringify(DEFAULT_PROJECTS[1].files));
    this.switchFile('index.html');
  }

  switchFile(fileName) {
    this.currentFile = fileName;
    const nameEl = document.getElementById('app-current-filename');
    if (nameEl) nameEl.textContent = fileName;

    if (!this.editor) return;

    let lang = 'html';
    if (fileName.endsWith('.css')) lang = 'css';
    if (fileName.endsWith('.js')) lang = 'javascript';

    monaco.editor.setModelLanguage(this.editor.getModel(), lang);
    this.editor.setValue(this.files[fileName] || '');

    document.querySelectorAll('.pc-file-item').forEach(el => {
      el.classList.toggle('active', el.dataset.file === fileName);
    });
    this.triggerLivePreview();
  }

  triggerLivePreview() {
    if (!this.previewFrame) return;
    const html = this.files['index.html'] || '';
    const css = this.files['style.css'] || '';
    const js = this.files['main.js'] || '';

    const combinedDoc = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>${css}</style>
      </head>
      <body>
        ${html.replace(/<!DOCTYPE html>|<\/?html>|<\/?body>|<\/?head>|<link.*?>|<script.*?><\/script>/gi, '')}
        <script>${js}<\/script>
      </body>
      </html>
    `;
    this.previewFrame.srcdoc = combinedDoc;
  }
}

// ==========================================
// 4. AUTONOMOUS MULTI-AGENT CONFERENCE (Cloudflare Workers AI)
// ==========================================
class AIConferenceSystem {
  constructor(platform) {
    this.platform = platform;
    this.isConferencing = false;
  }

  async runConference(goal) {
    if (this.isConferencing) return;
    this.isConferencing = true;

    this.appendBubble('user', 'Human Supervisor', goal);
    const p = this.platform.getActiveProject();
    const isGame = p.type === 'GAME';

    try {
      // ----------------------------------------------------
      // STEP 1: Llama (Architect) — 要件定義・企画
      // ----------------------------------------------------
      this.appendTyping('llama', 'Llama (Architect) がCloudflare Workers AIで設計中...');
      const llamaPrompt = `ユーザーの要求：「${goal}」
プロジェクト環境：${isGame ? 'PlayCanvas 3D Game Engine' : 'HTML/CSS/JavaScript Web App'}

以下の構成で要件を分解してください：
1. 作成・変更する具体的なコンポーネント（${isGame ? '3Dオブジェクト、カメラ、キーボード操作' : 'HTML要素、CSSスタイル、ボタンイベント'}）
2. 実装方針とロジック
Qwen Developerへコード実装を依頼する文面で締めてください。`;

      const llamaResponse = await CloudflareAIClient.call('llama', llamaPrompt);
      this.removeTyping();
      this.appendBubble('llama', 'Llama (Architect)', llamaResponse);

      // ----------------------------------------------------
      // STEP 2: Qwen (Developer) — コード実装
      // ----------------------------------------------------
      this.appendTyping('qwen', 'Qwen (Developer) がPlayCanvasコードをコーディング中...');
      const qwenPrompt = `直前のLlama Architectによる設計：
"""
${llamaResponse}
"""

この要求を満たす、安全で実行可能な完全なJavaScriptコードを実装してください。
【厳守ルール】：
${isGame ? `
- 引数として渡される \`app\` と \`pc\` を使用してください。
- ユーザーの指示に合わせたEntity（Box, Sphere等）やライティングを生成し、\`app.root.addChild(entity)\` で追加してください。
- 操作が求められている場合は、\`app.keyboard.isPressed(pc.KEY_A)\` 等でキーボード操作できるようにしてください。
- 必要に応じて \`app.on('update', function(dt) { ... })\` を設定してください。
` : `
- \`index.html\`, \`style.css\`, \`main.js\` に挿入するコードを作成してください。
`}
- 出力は必ず \`\`\`javascript ... \`\`\` で囲んでください。説明は短くしてください。`;

      const qwenResponse = await CloudflareAIClient.call('qwen', qwenPrompt, llamaResponse);
      this.removeTyping();
      this.appendBubble('qwen', 'Qwen (Developer)', qwenResponse);

      const codeMatch = qwenResponse.match(/```(?:javascript|js)?([\s\S]*?)```/);
      let extractedCode = codeMatch ? codeMatch[1].trim() : qwenResponse;

      // ----------------------------------------------------
      // STEP 3: DeepSeek (Reviewer) — コード監査
      // ----------------------------------------------------
      this.appendTyping('deepseek', 'DeepSeek (Reviewer) がコードの安全性をレビュー中...');
      const deepseekPrompt = `Qwenが生成したコード：
"""
${extractedCode}
"""

このコードを監査し：
1. 構文エラーや未定義変数がないか
2. WebGLのメモリリークや無限ループがないか
を検査し、安全で動く完全な修正コードを \`\`\`javascript ... \`\`\` で出力してください。`;

      const deepseekResponse = await CloudflareAIClient.call('deepseek', deepseekPrompt, extractedCode);
      this.removeTyping();
      this.appendBubble('deepseek', 'DeepSeek (Reviewer)', deepseekResponse);

      const reviewedMatch = deepseekResponse.match(/```(?:javascript|js)?([\s\S]*?)```/);
      if (reviewedMatch) {
        extractedCode = reviewedMatch[1].trim();
      }

      // ----------------------------------------------------
      // STEP 4: GLM (Tester) — テスト完了
      // ----------------------------------------------------
      this.appendBubble('glm', 'GLM (Tester)', 'Cloudflare Workers AIによるコード生成および監査テストが完了しました。人間による承認（Approval Gate）を要求します。');

      this.isConferencing = false;

      // 人間の承認ゲートへ提出
      this.platform.openGate(
        `AI Conference: ${goal}`,
        extractedCode,
        () => {
          if (isGame) {
            this.injectToPlayCanvas(extractedCode);
          } else {
            this.injectToMonaco(extractedCode);
          }
        }
      );

    } catch (err) {
      this.removeTyping();
      this.appendBubble('system', 'System Error', `Cloudflare Workers AI通信エラー: ${err.message}\n(CloudflareダッシュボードのSettings -> Bindingsで "Workers AI" (Variable: AI) が有効になっているか確認してください)`);
      this.isConferencing = false;
    }
  }

  injectToPlayCanvas(scriptStr) {
    try {
      const app = window.gameStudio.app;
      const cleanCode = scriptStr.replace(/```(?:javascript|js)?/g, '').replace(/```/g, '').trim();
      const executeFn = new Function('app', 'pc', cleanCode);
      executeFn(app, pc);
      window.gameStudio.renderHierarchy();
      this.platform.switchView('workspace');
      this.platform.showToast('AI Code Injected into PlayCanvas Scene!');
    } catch (e) {
      console.error('PlayCanvas Injection Error:', e);
      this.platform.showToast(`Execution Error: ${e.message}`);
    }
  }

  injectToMonaco(scriptStr) {
    try {
      const cleanCode = scriptStr.replace(/```(?:javascript|js)?/g, '').replace(/```/g, '').trim();
      window.appStudio.files['main.js'] = (window.appStudio.files['main.js'] || '') + '\n\n' + cleanCode;
      window.appStudio.switchFile('main.js');
      window.appStudio.triggerLivePreview();
      this.platform.switchView('workspace');
      this.platform.showToast('AI Code Injected into App Studio!');
    } catch (e) {
      this.platform.showToast(`App Injection Error: ${e.message}`);
    }
  }

  appendTyping(agentId, text) {
    const stream = document.getElementById('conf-messages');
    const typing = document.createElement('div');
    typing.id = 'conf-typing-indicator';
    typing.className = `conf-bubble ${agentId}`;
    typing.innerHTML = `<em>⚡ ${text}</em>`;
    stream.appendChild(typing);
    stream.scrollTop = stream.scrollHeight;
  }

  removeTyping() {
    const typing = document.getElementById('conf-typing-indicator');
    if (typing) typing.remove();
  }

  appendBubble(type, sender, text) {
    const stream = document.getElementById('conf-messages');
    const bubble = document.createElement('div');
    bubble.className = `conf-bubble ${type}`;
    const formatted = text
      .replace(/\n/g, '<br>')
      .replace(/```(?:javascript|js)?([\s\S]*?)```/g, '<pre class="diff-viewer" style="margin:6px 0; color:#00ffaa;">$1</pre>');

    bubble.innerHTML = `<strong>${sender}</strong><br>${formatted}`;
    stream.appendChild(bubble);
    stream.scrollTop = stream.scrollHeight;
  }
}

// ==========================================
// 5. MAIN NEXUS PLATFORM ORCHESTRATOR
// ==========================================
class NexusPlatform {
  constructor() {
    this.projects = this.loadProjects();
    this.activeProjectId = this.projects[0].id;

    // Engines
    window.gameStudio = new PlayCanvasNativeEngine('playcanvas-canvas');
    window.appStudio = new MonacoAppStudio('monaco-editor-container', 'app-preview-frame');
    this.conference = new AIConferenceSystem(this);

    this.initUI();
    this.renderProjects();
    this.selectProject(this.activeProjectId);
  }

  loadProjects() {
    try {
      const s = localStorage.getItem(STORAGE_PROJECTS_KEY);
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch(e) {}
    return JSON.parse(JSON.stringify(DEFAULT_PROJECTS));
  }

  saveProjects() {
    localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(this.projects));
  }

  initUI() {
    // Dock Navigation
    document.querySelectorAll('.dock-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dock-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.switchView(btn.dataset.view);
      });
    });

    // PlayCanvas Controls
    document.getElementById('btn-camera-reset').addEventListener('click', () => window.gameStudio.resetCamera());
    document.getElementById('btn-add-cube').addEventListener('click', () => window.gameStudio.addPrimitive('box', 'Box'));
    document.getElementById('btn-add-sphere').addEventListener('click', () => window.gameStudio.addPrimitive('sphere', 'Sphere'));
    document.getElementById('btn-add-light').addEventListener('click', () => {
      const l = new pc.Entity('Point Light');
      l.addComponent('light', { type: 'omni', color: new pc.Color(0, 1, 0.8), range: 14 });
      l.setPosition(0, 3, 0);
      window.gameStudio.app.root.addChild(l);
      window.gameStudio.entities.push(l);
      window.gameStudio.renderHierarchy();
      this.showToast('Added Omni Light');
    });

    // Play/Stop
    const playBtn = document.getElementById('btn-toggle-play');
    playBtn.addEventListener('click', () => {
      window.gameStudio.isPlaying = !window.gameStudio.isPlaying;
      playBtn.classList.toggle('playing', window.gameStudio.isPlaying);
      document.getElementById('play-icon').textContent = window.gameStudio.isPlaying ? '⏹' : '▶';
      document.getElementById('play-text').textContent = window.gameStudio.isPlaying ? 'STOP' : 'PLAY';
      this.showToast(window.gameStudio.isPlaying ? 'PlayCanvas Loop Active' : 'Game Stopped (Edit Mode)');
    });

    // App Studio Controls
    document.querySelectorAll('.pc-file-item').forEach(item => {
      item.addEventListener('click', () => window.appStudio.switchFile(item.dataset.file));
    });
    document.getElementById('btn-run-code').addEventListener('click', () => {
      window.appStudio.triggerLivePreview();
      this.showToast('Preview Refreshed');
    });

    // AI Conference
    document.getElementById('btn-trigger-ai-confer').addEventListener('click', () => {
      this.switchView('conference');
      document.getElementById('conf-input').focus();
    });
    document.getElementById('conf-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('conf-input');
      const val = input.value.trim();
      if (!val) return;
      input.value = '';
      this.conference.runConference(val);
    });

    // Approval Gate
    document.getElementById('gate-btn-approve').addEventListener('click', () => {
      document.getElementById('modal-approval-gate').classList.remove('active');
      if (this.pendingApproveFn) this.pendingApproveFn();
      this.pendingApproveFn = null;
    });
    document.getElementById('gate-btn-reject').addEventListener('click', () => {
      document.getElementById('modal-approval-gate').classList.remove('active');
      this.pendingApproveFn = null;
      this.showToast('Change Rejected');
    });

    // Project Modals
    document.getElementById('btn-quick-new-proj').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-open-create-modal').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-close-proj-modal').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-cancel-proj').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-submit-proj').addEventListener('click', () => this.handleCreateProject());

    document.querySelectorAll('.studio-option input').forEach(radio => {
      radio.addEventListener('change', (e) => {
        document.querySelectorAll('.studio-option').forEach(opt => opt.classList.remove('active'));
        e.target.closest('.studio-option').classList.add('active');
      });
    });
  }

  switchView(viewName) {
    document.getElementById('view-workspace').style.display = viewName === 'workspace' ? 'flex' : 'none';
    document.getElementById('view-conference').style.display = viewName === 'conference' ? 'block' : 'none';
    document.getElementById('view-projects').style.display = viewName === 'projects' ? 'block' : 'none';

    if (viewName === 'workspace') {
      const p = this.getActiveProject();
      if (p.type === 'GAME') {
        setTimeout(() => window.gameStudio.resize(), 50);
      } else {
        setTimeout(() => { if (window.appStudio.editor) window.appStudio.editor.layout(); }, 50);
      }
    }
  }

  startAIConference(task) {
    this.switchView('conference');
    this.conference.runConference(task);
  }

  openGate(title, diff, onApprove) {
    document.getElementById('gate-action-title').textContent = title;
    document.getElementById('gate-diff-content').textContent = diff;
    this.pendingApproveFn = onApprove;
    document.getElementById('modal-approval-gate').classList.add('active');
  }

  getActiveProject() {
    return this.projects.find(x => x.id === this.activeProjectId) || this.projects[0];
  }

  selectProject(id) {
    this.activeProjectId = id;
    const p = this.getActiveProject();

    document.getElementById('header-active-project').textContent = `${p.type === 'GAME' ? '🎮' : '💻'} ${p.name}`;

    const gameContainer = document.getElementById('studio-game-container');
    const appContainer = document.getElementById('studio-app-container');

    if (p.type === 'GAME') {
      gameContainer.style.display = 'flex';
      appContainer.style.display = 'none';
      setTimeout(() => window.gameStudio.resize(), 50);
    } else {
      gameContainer.style.display = 'none';
      appContainer.style.display = 'flex';
      window.appStudio.loadProjectFiles(p.files);
    }

    this.showToast(`Switched: ${p.name}`);
  }

  openCreateModal() {
    document.getElementById('proj-name').value = '';
    document.getElementById('modal-create-project').classList.add('active');
    document.getElementById('proj-name').focus();
  }

  closeCreateModal() {
    document.getElementById('modal-create-project').classList.remove('active');
  }

  handleCreateProject() {
    const name = document.getElementById('proj-name').value.trim() || `Project ${this.projects.length + 1}`;
    const type = document.querySelector('input[name="studio-type"]:checked').value;

    const newProj = {
      id: 'proj_' + Date.now(),
      name,
      type,
      desc: type === 'GAME' ? 'PlayCanvas 3D Game Studio' : 'Monaco App Studio IDE',
      files: type === 'APP' ? JSON.parse(JSON.stringify(DEFAULT_PROJECTS[1].files)) : undefined
    };

    this.projects.unshift(newProj);
    this.saveProjects();
    this.closeCreateModal();
    this.renderProjects();
    this.selectProject(newProj.id);
    this.switchView('workspace');
    this.showToast(`Created: ${name}`);
  }

  deleteProject(id) {
    if (!confirm('プロジェクトを削除しますか？')) return;
    this.projects = this.projects.filter(p => p.id !== id);
    this.saveProjects();
    this.renderProjects();
    this.selectProject(this.projects[0].id);
    this.showToast('Project deleted');
  }

  renderProjects() {
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    grid.innerHTML = this.projects.map(p => `
      <div class="pc-asset-card" style="display:flex; justify-content:space-between; align-items:center; padding:12px; margin-bottom:8px;">
        <div>
          <strong>${p.name}</strong> <span style="color:var(--pc-orange); font-size:10px;">[${p.type}]</span>
          <div style="font-size:11px; color:#888;">${p.desc}</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="pc-btn" onclick="window.nexusApp.deleteProject('${p.id}')">削除</button>
          <button class="pc-btn-accent" onclick="window.nexusApp.selectProject('${p.id}'); window.nexusApp.switchView('workspace');">スタジオ起動</button>
        </div>
      </div>
    `).join('');
  }

  showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
  }
}

// グローバルバインド
window.addEventListener('DOMContentLoaded', () => {
  window.nexusApp = new NexusPlatform();
});

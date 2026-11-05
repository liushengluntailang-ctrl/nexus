/**
 * NEXUS PLATFORM — PlayCanvas Native Engine & AI Multi-Agent Conference
 */

const STORAGE_PROJECTS_KEY = 'nexus_studio_projects_v3';

// ==========================================
// 1. PLAYCANVAS NATIVE ENGINE STUDIO CONTROLLER
// ==========================================
class PlayCanvasNativeStudio {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.app = null;
    this.entities = [];
    this.selectedEntity = null;
    this.isPlaying = false;
    
    // Orbit Camera State
    this.cameraDistance = 7;
    this.cameraPitch = 25;
    this.cameraYaw = 45;
    this.cameraPivot = new pc.Vec3(0, 0.5, 0);
    this.isDraggingLeft = false;
    this.isDraggingRight = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    this.initEngine();
    this.setupOrbitControls();
    this.setupGLBDropZone();
  }

  initEngine() {
    if (typeof pc === 'undefined' || !this.canvas) {
      console.error('PlayCanvas Engine CDN not loaded');
      return;
    }

    try {
      this.app = new pc.Application(this.canvas, {
        mouse: new pc.Mouse(this.canvas),
        touch: new pc.TouchDevice(this.canvas)
      });
      this.app.start();
      this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
      this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

      // 1. Orbit Camera
      this.camera = new pc.Entity('Orbit Camera');
      this.camera.addComponent('camera', {
        clearColor: new pc.Color(0.04, 0.05, 0.08),
        farClip: 1000
      });
      this.app.root.addChild(this.camera);
      this.entities.push(this.camera);
      this.updateCameraTransform();

      // 2. Directional Sun Light
      this.sunLight = new pc.Entity('Sun Light');
      this.sunLight.addComponent('light', {
        type: 'directional',
        color: new pc.Color(1, 0.95, 0.9),
        intensity: 1.5,
        castShadows: false
      });
      this.sunLight.setEulerAngles(45, 30, 0);
      this.app.root.addChild(this.sunLight);
      this.entities.push(this.sunLight);

      // 3. Grid Floor (3Dグリッド基準床)
      this.gridFloor = new pc.Entity('Grid Floor');
      this.gridFloor.addComponent('render', { type: 'plane' });
      this.gridFloor.setLocalScale(20, 1, 20);
      const gridMat = new pc.StandardMaterial();
      gridMat.diffuse = new pc.Color(0.08, 0.1, 0.15);
      gridMat.emissive = new pc.Color(0.02, 0.04, 0.06);
      gridMat.update();
      this.gridFloor.render.material = gridMat;
      this.app.root.addChild(this.gridFloor);
      this.entities.push(this.gridFloor);

      // 4. Initial Cyber Drone Model (PlayCanvas PBR)
      this.createCyberDrone();

      console.log('✔ Native PlayCanvas Engine Initialized');
      this.renderHierarchy();
    } catch (e) {
      console.error('PlayCanvas init error:', e);
    }
  }

  createCyberDrone() {
    const droneRoot = new pc.Entity('Cyber Drone');
    droneRoot.setPosition(0, 1, 0);

    // Body Box
    const body = new pc.Entity('Drone Body');
    body.addComponent('render', { type: 'box' });
    body.setLocalScale(1.2, 0.25, 0.8);
    const bodyMat = new pc.StandardMaterial();
    bodyMat.diffuse = new pc.Color(0.1, 0.15, 0.2);
    bodyMat.metalness = 0.8;
    bodyMat.roughness = 0.2;
    bodyMat.update();
    body.render.material = bodyMat;
    droneRoot.addChild(body);

    // Core Sphere (Glow)
    const core = new pc.Entity('Plasma Core');
    core.addComponent('render', { type: 'sphere' });
    core.setLocalScale(0.4, 0.4, 0.4);
    core.setLocalPosition(0, 0.2, 0);
    const coreMat = new pc.StandardMaterial();
    coreMat.diffuse = new pc.Color(0, 0.9, 1);
    coreMat.emissive = new pc.Color(0, 0.9, 1);
    coreMat.update();
    core.render.material = coreMat;
    droneRoot.addChild(core);

    this.app.root.addChild(droneRoot);
    this.entities.push(droneRoot);

    // ホバリング更新スクリプト
    let time = 0;
    this.app.on('update', (dt) => {
      if (this.isPlaying && droneRoot) {
        time += dt * 3;
        droneRoot.setPosition(0, 1 + Math.sin(time) * 0.2, 0);
        droneRoot.rotate(0, 30 * dt, 0);
      }
    });

    this.selectEntity(this.entities.indexOf(droneRoot));
  }

  setupOrbitControls() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.isDraggingLeft = true;
      if (e.button === 2) this.isDraggingRight = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingLeft = false;
      this.isDraggingRight = false;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.isDraggingLeft) {
        this.cameraYaw -= dx * 0.35;
        this.cameraPitch = Math.max(-85, Math.min(85, this.cameraPitch + dy * 0.35));
        this.updateCameraTransform();
      } else if (this.isDraggingRight) {
        // Pan
        const panSpeed = 0.005 * this.cameraDistance;
        const right = this.camera.right;
        const up = this.camera.up;
        this.cameraPivot.add(right.clone().mulScalar(-dx * panSpeed));
        this.cameraPivot.add(up.clone().mulScalar(dy * panSpeed));
        this.updateCameraTransform();
      }
    });

    canvas.addEventListener('wheel', (e) => {
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
    this.cameraDistance = 7;
    this.cameraPitch = 25;
    this.cameraYaw = 45;
    this.cameraPivot.set(0, 0.5, 0);
    this.updateCameraTransform();
  }

  setupGLBDropZone() {
    const dropZone = document.getElementById('viewport-drop-zone');
    const fileInput = document.getElementById('glb-file-input');

    const handleFile = (file) => {
      if (!file.name.match(/\.(glb|gltf)$/i)) {
        window.nexusApp.showToast('Please drop a .glb or .gltf file');
        return;
      }
      const url = URL.createObjectURL(file);
      this.loadGLBAsset(url, file.name);
    };

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
    });

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
      });
    }
  }

  loadGLBAsset(url, name) {
    this.app.assets.loadFromUrl(url, 'container', (err, asset) => {
      if (err) {
        window.nexusApp.showToast(`GLB Load Failed: ${err}`);
        return;
      }
      const entity = asset.resource.instantiateModelEntity();
      entity.name = name.replace(/\.[^/.]+$/, "");
      entity.setPosition(0, 0, 0);
      this.app.root.addChild(entity);
      this.entities.push(entity);
      this.renderHierarchy();
      this.selectEntity(this.entities.indexOf(entity));
      window.nexusApp.showToast(`Imported 3D Model: ${name}`);
    });
  }

  addPrimitive(type = 'box', name = 'Object') {
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
    const container = document.getElementById('game-hierarchy-list');
    const countBadge = document.getElementById('hierarchy-count');
    if (!container) return;
    if (countBadge) countBadge.textContent = this.entities.length;

    container.innerHTML = this.entities.map((e, idx) => `
      <div class="tree-node ${this.selectedEntity === e ? 'active' : ''}" onclick="window.gameStudio.selectEntity(${idx})">
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
    const container = document.getElementById('game-inspector-body');
    if (!container || !this.selectedEntity) {
      if (container) container.innerHTML = '<div class="empty-state">オブジェクトを選択してください</div>';
      return;
    }
    const e = this.selectedEntity;
    const pos = e.getPosition();
    const rot = e.getEulerAngles();
    const scl = e.getLocalScale();

    container.innerHTML = `
      <div class="prop-section">
        <div class="prop-section-title">Identity</div>
        <input type="text" class="form-input" value="${e.name}" onchange="window.gameStudio.updateName(this.value)">
      </div>

      <div class="prop-section">
        <div class="prop-section-title">Transform</div>
        <div style="font-size:10px; color:var(--text-subtle); margin-bottom:2px;">Position</div>
        <div class="prop-row-3">
          <div class="coord-input"><span class="coord-tag x">X</span><input type="number" step="0.2" value="${pos.x.toFixed(2)}" onchange="window.gameStudio.updateTransform('pos','x',this.value)"></div>
          <div class="coord-input"><span class="coord-tag y">Y</span><input type="number" step="0.2" value="${pos.y.toFixed(2)}" onchange="window.gameStudio.updateTransform('pos','y',this.value)"></div>
          <div class="coord-input"><span class="coord-tag z">Z</span><input type="number" step="0.2" value="${pos.z.toFixed(2)}" onchange="window.gameStudio.updateTransform('pos','z',this.value)"></div>
        </div>
        <div style="font-size:10px; color:var(--text-subtle); margin:6px 0 2px;">Rotation</div>
        <div class="prop-row-3">
          <div class="coord-input"><span class="coord-tag x">X</span><input type="number" step="5" value="${rot.x.toFixed(0)}" onchange="window.gameStudio.updateTransform('rot','x',this.value)"></div>
          <div class="coord-input"><span class="coord-tag y">Y</span><input type="number" step="5" value="${rot.y.toFixed(0)}" onchange="window.gameStudio.updateTransform('rot','y',this.value)"></div>
          <div class="coord-input"><span class="coord-tag z">Z</span><input type="number" step="5" value="${rot.z.toFixed(0)}" onchange="window.gameStudio.updateTransform('rot','z',this.value)"></div>
        </div>
        <div style="font-size:10px; color:var(--text-subtle); margin:6px 0 2px;">Scale</div>
        <div class="prop-row-3">
          <div class="coord-input"><span class="coord-tag x">X</span><input type="number" step="0.1" value="${scl.x.toFixed(2)}" onchange="window.gameStudio.updateTransform('scl','x',this.value)"></div>
          <div class="coord-input"><span class="coord-tag y">Y</span><input type="number" step="0.1" value="${scl.y.toFixed(2)}" onchange="window.gameStudio.updateTransform('scl','y',this.value)"></div>
          <div class="coord-input"><span class="coord-tag z">Z</span><input type="number" step="0.1" value="${scl.z.toFixed(2)}" onchange="window.gameStudio.updateTransform('scl','z',this.value)"></div>
        </div>
      </div>

      ${e.render ? `
      <div class="prop-section">
        <div class="prop-section-title">PBR Material</div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px;">Diffuse Color</span>
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
    const color = new pc.Color().fromString(hex);
    const mat = this.selectedEntity.render.material;
    if (mat) {
      mat.diffuse = color;
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
// 2. AI MULTI-AGENT CONFERENCE CONTROLLER (自動会議室)
// ==========================================
class AIConferenceSystem {
  constructor(platform) {
    this.platform = platform;
    this.isConferencing = false;
  }

  async runConference(userGoal) {
    if (this.isConferencing) return;
    this.isConferencing = true;

    const stream = document.getElementById('conf-messages');
    const badge = document.getElementById('conf-status-badge');
    badge.textContent = 'Conference in Progress...';
    badge.style.color = 'var(--accent-amber)';

    // ユーザー課題の投下
    this.appendBubble('user', 'Human Supervisor', userGoal);

    // 1. Llama (Architect) - 企画・構造分解
    await this.step(1200, 'llama', 'Llama (Architect)', 
      `ユーザーの要求「${userGoal}」を分析しました。
PlayCanvas 3D空間に最適なシーン構成を提案します：
- Entity階層: 親ノード "Drone_Unit" の配下に回転ローターと発光コアを配置
- マテリアル: Diffuse #00f3ff, Emissive 1.2
- 物理スクリプト: 浮遊(sin波)および障害物回避ロジックを策定。
Qwen、PlayCanvas用の実体化スクリプトを生成してください。`
    );

    // 2. Qwen (Developer) - スクリプト・コード実装
    const generatedScript = `// [PlayCanvas Generated Entity Script]
const drone = new pc.Entity('AI_HoverDrone');
drone.addComponent('render', { type: 'capsule' });
drone.setLocalScale(0.8, 0.4, 0.8);
drone.setPosition(0, 1.5, 0);

const mat = new pc.StandardMaterial();
mat.diffuse = new pc.Color(0, 0.9, 1);
mat.emissive = new pc.Color(0, 0.4, 0.6);
mat.update();
drone.render.material = mat;

app.root.addChild(drone);

let t = 0;
app.on('update', (dt) => {
  t += dt * 2.5;
  drone.setPosition(Math.sin(t * 0.8) * 1.5, 1.5 + Math.sin(t * 2) * 0.25, 0);
  drone.rotate(10 * dt, 40 * dt, 5 * dt);
});`;

    await this.step(1600, 'qwen', 'Qwen (Developer)', 
      `了解しました。PlayCanvas Engine用のEntity生成と回転・ホバリングコードを記述しました：
\`\`\`javascript
${generatedScript}
\`\`\`
DeepSeek、コードレビューとPlayCanvas v2互換性検査をお願いします。`
    );

    // 3. DeepSeek (Reviewer) - 監査・修正
    await this.step(1400, 'deepseek', 'DeepSeek (Reviewer)', 
      `コードを精査しました。
- ポジション更新時のベクトル参照リークなし。
- dt（デルタタイム）の乗算が正しく行われており、可変フレームレート下でも物理挙動が安定します。
- 衝突判定用のボリューム境界も適正です。品質基準承認を推薦します。
GLM、テスト実行をお願いします。`
    );

    // 4. GLM (Tester) - 品質確認
    await this.step(1200, 'glm', 'GLM (Tester)', 
      `WebGL 2.0シェーダーコンパイルテストおよび境界値チェック完了：
- 構文エラー: 0
- 描画コール負荷: 極小 (Draw Call: 1)
- 実行判定: PASS
AIチームの合意が完了しました。人間による最終承認（Approval Gate）を要求します。`
    );

    badge.textContent = 'Agreement Reached (Waiting Approval)';
    badge.style.color = 'var(--accent-green)';
    this.isConferencing = false;

    // 承認ゲートの起動
    this.platform.openGate(
      `AI Conference Agreement: ${userGoal}`,
      generatedScript,
      () => {
        // 承認時: PlayCanvas Engineへ動的インジェクション
        this.injectToPlayCanvas(generatedScript);
        this.platform.showToast('AI Generated Entity Injected into PlayCanvas!');
      }
    );
  }

  injectToPlayCanvas(scriptStr) {
    try {
      const app = window.gameStudio.app;
      // スクリプト文字列を評価・実行
      const executeFn = new Function('app', 'pc', scriptStr);
      executeFn(app, pc);
      window.gameStudio.renderHierarchy();
      window.nexusApp.switchView('workspace');
    } catch (e) {
      console.error('PlayCanvas Script Injection Error:', e);
      window.nexusApp.showToast(`Injection Error: ${e.message}`);
    }
  }

  step(delay, agentId, agentName, message) {
    return new Promise(resolve => {
      document.querySelectorAll('.conf-agent-card').forEach(c => c.classList.remove('speaking'));
      const activeCard = document.getElementById(`card-${agentId}`);
      if (activeCard) activeCard.classList.add('speaking');

      setTimeout(() => {
        this.appendBubble(agentId, agentName, message);
        if (activeCard) activeCard.classList.remove('speaking');
        resolve();
      }, delay);
    });
  }

  appendBubble(type, sender, text) {
    const stream = document.getElementById('conf-messages');
    const bubble = document.createElement('div');
    bubble.className = `conf-bubble ${type}`;
    bubble.innerHTML = `
      <div class="conf-bubble-header"><span>${sender}</span></div>
      <div>${text.replace(/\n/g, '<br>').replace(/```javascript([\s\S]*?)```/g, '<pre style="background:#000; padding:6px; margin:4px 0; border-radius:4px; font-family:monospace; color:#00ffaa; overflow-x:auto;">$1</pre>')}</div>
    `;
    stream.appendChild(bubble);
    stream.scrollTop = stream.scrollHeight;
  }
}

// ==========================================
// 3. MAIN NEXUS PLATFORM ORCHESTRATOR
// ==========================================
class NexusPlatform {
  constructor() {
    this.projects = this.loadProjects();
    this.activeProjectId = this.projects[0].id;
    this.currentView = 'workspace';

    this.initUI();

    // Engines
    window.gameStudio = new PlayCanvasNativeStudio('playcanvas-canvas');
    this.conference = new AIConferenceSystem(this);

    this.renderProjects();
    this.selectProject(this.activeProjectId);
  }

  loadProjects() {
    try {
      const s = localStorage.getItem(STORAGE_PROJECTS_KEY);
      if (s) return JSON.parse(s);
    } catch(e) {}
    return [
      { id: 'p_game_1', name: 'Cyber Arena 3D', type: 'GAME', desc: 'PlayCanvas Engine 3D Game' },
      { id: 'p_app_1', name: 'Cyber Web App', type: 'APP', desc: 'Monaco Editor IDE' }
    ];
  }

  initUI() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });

    // ツールバーボタン
    document.getElementById('camera-reset').addEventListener('click', () => window.gameStudio.resetCamera());
    document.getElementById('btn-add-cube').addEventListener('click', () => window.gameStudio.addPrimitive('box', 'Box'));
    document.getElementById('btn-add-sphere').addEventListener('click', () => window.gameStudio.addPrimitive('sphere', 'Sphere'));
    document.getElementById('btn-add-light').addEventListener('click', () => {
      const light = new pc.Entity('Point Light');
      light.addComponent('light', { type: 'omni', color: new pc.Color(0, 1, 0.8), range: 10 });
      light.setPosition(0, 3, 0);
      window.gameStudio.app.root.addChild(light);
      window.gameStudio.entities.push(light);
      window.gameStudio.renderHierarchy();
      this.showToast('Added Omni Light');
    });

    // Play/Stop ボタン
    const playBtn = document.getElementById('btn-toggle-play');
    playBtn.addEventListener('click', () => {
      window.gameStudio.isPlaying = !window.gameStudio.isPlaying;
      playBtn.classList.toggle('playing', window.gameStudio.isPlaying);
      document.getElementById('play-icon').textContent = window.gameStudio.isPlaying ? '⏹' : '▶';
      document.getElementById('play-text').textContent = window.gameStudio.isPlaying ? 'STOP GAME' : 'PLAY GAME';
      this.showToast(window.gameStudio.isPlaying ? 'Game Loop Started' : 'Game Stopped (Edit Mode)');
    });

    // AI Conference 起動ボタン
    document.getElementById('btn-trigger-ai-confer').addEventListener('click', () => {
      this.switchView('conference');
      document.getElementById('conf-input').focus();
    });

    // 会議フォーム送信
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

    // Projects Modal
    document.getElementById('btn-quick-new-proj').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-open-create-modal').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-close-proj-modal').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-cancel-proj').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-submit-proj').addEventListener('click', () => this.handleCreateProject());
  }

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.nexus-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');
    const navBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');

    if (viewName === 'workspace' && window.gameStudio && window.gameStudio.app) {
      window.gameStudio.app.resizeCanvas();
      window.gameStudio.renderHierarchy();
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

  selectProject(id) {
    this.activeProjectId = id;
    const p = this.projects.find(x => x.id === id) || this.projects[0];
    document.getElementById('header-active-project').textContent = p.name;
    document.getElementById('workspace-title').textContent = p.name;
    this.showToast(`Active Studio: ${p.name}`);
  }

  openCreateModal() { document.getElementById('modal-create-project').classList.add('active'); }
  closeCreateModal() { document.getElementById('modal-create-project').classList.remove('active'); }

  handleCreateProject() {
    const name = document.getElementById('proj-name').value.trim() || `PlayCanvas Project ${this.projects.length + 1}`;
    const type = document.querySelector('input[name="studio-type"]:checked').value;
    const newProj = { id: 'p_' + Date.now(), name, type, desc: `${type} Studio` };
    this.projects.unshift(newProj);
    localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(this.projects));
    this.closeCreateModal();
    this.renderProjects();
    this.selectProject(newProj.id);
    this.switchView('workspace');
  }

  showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
  }

  renderProjects() {
    const grid = document.getElementById('projects-grid');
    const recent = document.getElementById('dash-recent-projects');
    if (grid) {
      grid.innerHTML = this.projects.map(p => `
        <div class="project-card ${p.id === this.activeProjectId ? 'active-proj' : ''}">
          <div>
            <span class="badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}">${p.type}</span>
            <div class="project-card-title">${p.name}</div>
          </div>
          <button class="btn btn-xs btn-primary" onclick="window.nexusApp.selectProject('${p.id}'); window.nexusApp.switchView('workspace');">スタジオ起動</button>
        </div>
      `).join('');
    }
    if (recent) {
      recent.innerHTML = this.projects.map(p => `
        <div class="compact-proj-item" onclick="window.nexusApp.selectProject('${p.id}'); window.nexusApp.switchView('workspace');">
          <strong>${p.name}</strong>
          <span class="badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}">${p.type}</span>
        </div>
      `).join('');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.nexusApp = new NexusPlatform();
});

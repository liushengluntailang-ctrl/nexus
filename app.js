/**
 * NEXUS PLATFORM — HYBRID STUDIO ENGINE (Phase 1, 2, 3 Integrated)
 * PlayCanvas 3D Engine + Monaco Editor + AI Patch Dispatcher
 */

// ==========================================
// 1. STATE STORE (仮想ファイルシステム & 3Dシーン状態)
// ==========================================
class NexusStore {
  constructor() {
    this.projects = this.loadProjects();
    this.activeProjectId = this.projects[0] ? this.projects[0].id : null;
    this.tasks = [
      { id: 't1', title: '3Dシーンにライトとキューブを配置', assignee: 'Llama Architect', status: 'done' },
      { id: 't2', title: 'Monaco Editor リアルタイムプレビュー接続', assignee: 'Qwen Developer', status: 'done' }
    ];
    this.logs = [];
    this.pendingApprovals = [];
  }

  loadProjects() {
    return [
      {
        id: 'proj_game_default',
        name: 'Cyber Drone 3D Arena',
        type: 'GAME',
        desc: 'PlayCanvas 3D Engineで動作するリアルタイム3Dゲーム空間',
        created: new Date().toLocaleDateString()
      },
      {
        id: 'proj_app_default',
        name: 'Neon Cyber Terminal',
        type: 'APP',
        desc: 'Monaco EditorによるHTML/CSS/JSライブプレビュー環境',
        created: new Date().toLocaleDateString(),
        files: {
          'index.html': `<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <div class="card">\n    <h1 id="title">⚡ NEXUS APP STUDIO</h1>\n    <p>Monaco Editorでリアルタイムに編集可能です。</p>\n    <button id="btn" onclick="handleClick()">CLICK ME</button>\n  </div>\n  <script src="main.js"><\/script>\n</body>\n</html>`,
          'style.css': `body {\n  background: #090b10;\n  color: #00f3ff;\n  font-family: sans-serif;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n  margin: 0;\n}\n.card {\n  background: #151b26;\n  border: 1px solid #00f3ff;\n  padding: 24px;\n  border-radius: 8px;\n  text-align: center;\n  box-shadow: 0 0 20px rgba(0, 243, 255, 0.2);\n}\nbutton {\n  background: #00f3ff;\n  color: #000;\n  border: none;\n  padding: 8px 16px;\n  font-weight: bold;\n  border-radius: 4px;\n  cursor: pointer;\n}`,
          'main.js': `function handleClick() {\n  const title = document.getElementById('title');\n  title.textContent = '🔥 AI CODE EXECUTED!';\n  title.style.color = '#00ffaa';\n  console.log('Button clicked in sandbox');\n}`
        }
      }
    ];
  }

  getActiveProject() {
    return this.projects.find(p => p.id === this.activeProjectId) || this.projects[0];
  }

  log(agent, message) {
    this.logs.unshift({ time: new Date().toLocaleTimeString(), agent, message });
    if (this.logs.length > 40) this.logs.pop();
  }
}

// ==========================================
// 2. PLAYCANVAS GAME STUDIO CONTROLLER
// ==========================================
class PlayCanvasStudio {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.app = null;
    this.entities = [];
    this.selectedEntity = null;
    this.isPlaying = false;
    this.initEngine();
  }

  initEngine() {
    if (typeof pc === 'undefined') {
      console.warn('PlayCanvas library not loaded yet');
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

      // Camera
      const camera = new pc.Entity('Main Camera');
      camera.addComponent('camera', { clearColor: new pc.Color(0.04, 0.05, 0.07) });
      camera.setPosition(0, 3, 6);
      camera.lookAt(0, 0, 0);
      this.app.root.addChild(camera);
      this.entities.push(camera);

      // Light
      const light = new pc.Entity('Directional Light');
      light.addComponent('light', { type: 'directional', color: new pc.Color(1, 1, 1), intensity: 1.2 });
      light.setEulerAngles(45, 30, 0);
      this.app.root.addChild(light);
      this.entities.push(light);

      // Main Cyber Cube
      const cube = new pc.Entity('Cyber Cube');
      cube.addComponent('render', { type: 'box' });
      cube.setPosition(0, 0.5, 0);
      this.app.root.addChild(cube);
      this.entities.push(cube);

      // Material
      const mat = new pc.StandardMaterial();
      mat.diffuse = new pc.Color(0, 0.9, 1);
      mat.emissive = new pc.Color(0, 0.2, 0.3);
      mat.update();
      cube.render.material = mat;

      // Update Loop (Rotate Cube)
      this.app.on('update', (dt) => {
        if (cube) {
          cube.rotate(15 * dt, 25 * dt, 0);
        }
      });

      console.log('✔ PlayCanvas 3D Engine initialized successfully');
    } catch (e) {
      console.error('Failed to init PlayCanvas:', e);
    }
  }

  addEntity(type = 'box', name = 'New Object') {
    if (!this.app) return;
    const entity = new pc.Entity(name);
    entity.addComponent('render', { type });
    entity.setPosition((Math.random() - 0.5) * 4, 0.5, (Math.random() - 0.5) * 4);
    
    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(Math.random(), Math.random(), Math.random());
    mat.update();
    entity.render.material = mat;

    this.app.root.addChild(entity);
    this.entities.push(entity);
    this.renderHierarchy();
    return entity;
  }

  renderHierarchy() {
    const container = document.getElementById('game-hierarchy-list');
    if (!container) return;
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
      container.innerHTML = '<div class="empty-state">オブジェクトを選択してください</div>';
      return;
    }
    const e = this.selectedEntity;
    const pos = e.getPosition();
    container.innerHTML = `
      <div class="prop-group">
        <div class="prop-label">Entity Name</div>
        <input type="text" class="form-input" value="${e.name}" onchange="window.gameStudio.updateName(this.value)">
      </div>
      <div class="prop-group">
        <div class="prop-label">Position (X, Y, Z)</div>
        <div class="prop-row">
          <input type="number" class="form-input" value="${pos.x.toFixed(2)}" step="0.5" onchange="window.gameStudio.updatePos('x', this.value)">
          <input type="number" class="form-input" value="${pos.y.toFixed(2)}" step="0.5" onchange="window.gameStudio.updatePos('y', this.value)">
          <input type="number" class="form-input" value="${pos.z.toFixed(2)}" step="0.5" onchange="window.gameStudio.updatePos('z', this.value)">
        </div>
      </div>
    `;
  }

  updatePos(axis, val) {
    if (!this.selectedEntity) return;
    const pos = this.selectedEntity.getPosition();
    pos[axis] = parseFloat(val);
    this.selectedEntity.setPosition(pos);
  }

  updateName(val) {
    if (this.selectedEntity) {
      this.selectedEntity.name = val;
      this.renderHierarchy();
    }
  }
}

// ==========================================
// 3. MONACO EDITOR & APP STUDIO CONTROLLER
// ==========================================
class MonacoStudio {
  constructor(editorContainerId, previewIframeId) {
    this.container = document.getElementById(editorContainerId);
    this.previewFrame = document.getElementById(previewIframeId);
    this.editor = null;
    this.currentFile = 'index.html';
    this.files = {};
    this.initMonaco();
  }

  initMonaco() {
    if (typeof require === 'undefined') {
      setTimeout(() => this.initMonaco(), 200);
      return;
    }

    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      this.editor = monaco.editor.create(this.container, {
        value: this.files['index.html'] || '',
        language: 'html',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 13,
        minimap: { enabled: false },
        padding: { top: 12 }
      });

      this.editor.onDidChangeModelContent(() => {
        this.files[this.currentFile] = this.editor.getValue();
        this.triggerLivePreview();
      });

      console.log('✔ Monaco Editor loaded successfully');
      this.triggerLivePreview();
    });
  }

  loadProjectFiles(files) {
    this.files = { ...files };
    this.switchFile('index.html');
  }

  switchFile(fileName) {
    this.currentFile = fileName;
    if (!this.editor) return;

    let lang = 'html';
    if (fileName.endsWith('.css')) lang = 'css';
    if (fileName.endsWith('.js')) lang = 'javascript';

    monaco.editor.setModelLanguage(this.editor.getModel(), lang);
    this.editor.setValue(this.files[fileName] || '');

    document.querySelectorAll('.file-item').forEach(el => {
      el.classList.toggle('active', el.dataset.file === fileName);
    });
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
// 4. MAIN PLATFORM ORCHESTRATOR
// ==========================================
class NexusPlatform {
  constructor() {
    this.store = new NexusStore();
    this.currentView = 'dashboard';

    this.initUIEvents();
    this.render();

    // Studio エンジンの初期化
    window.gameStudio = new PlayCanvasStudio('playcanvas-canvas');
    window.appStudio = new MonacoStudio('monaco-editor-container', 'app-preview-frame');

    // 初期プロジェクトのロード
    this.selectProject(this.store.activeProjectId);
  }

  initUIEvents() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });

    // Modals
    document.getElementById('btn-quick-new-proj').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-open-create-modal').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-close-proj-modal').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-cancel-proj').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-submit-proj').addEventListener('click', () => this.handleCreateProject());

    // Game Studio Controls
    document.getElementById('btn-add-cube').addEventListener('click', () => {
      window.gameStudio.addEntity('box', 'Cube ' + (window.gameStudio.entities.length + 1));
      this.showToast('Cube added to 3D Scene');
    });
    document.getElementById('btn-add-sphere').addEventListener('click', () => {
      window.gameStudio.addEntity('sphere', 'Sphere ' + (window.gameStudio.entities.length + 1));
      this.showToast('Sphere added to 3D Scene');
    });
    document.getElementById('btn-toggle-play').addEventListener('click', (e) => {
      this.showToast('PlayCanvas 3D Game Loop Active');
    });

    // App Studio Controls
    document.querySelectorAll('.file-item').forEach(item => {
      item.addEventListener('click', () => window.appStudio.switchFile(item.dataset.file));
    });
    document.getElementById('btn-run-code').addEventListener('click', () => {
      window.appStudio.triggerLivePreview();
      this.showToast('Preview Refreshed');
    });

    // AI Chat
    document.getElementById('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAIChat();
    });

    // Approval Gate
    document.getElementById('gate-btn-approve').addEventListener('click', () => this.handleApproval(true));
    document.getElementById('gate-btn-reject').addEventListener('click', () => this.handleApproval(false));
  }

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.nexus-view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.add('active');
    const navBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Workspace切り替え時のレイアウト調整
    if (viewName === 'workspace') {
      const p = this.store.getActiveProject();
      if (p.type === 'GAME' && window.gameStudio.app) {
        window.gameStudio.app.resizeCanvas();
        window.gameStudio.renderHierarchy();
      } else if (p.type === 'APP' && window.appStudio.editor) {
        window.appStudio.editor.layout();
      }
    }
    this.render();
  }

  selectProject(id) {
    this.store.activeProjectId = id;
    const p = this.store.getActiveProject();
    this.showToast(`Switched to: ${p.name}`);

    // UIバッジ更新
    document.getElementById('header-active-project').textContent = `${p.type === 'GAME' ? '🎮' : '💻'} ${p.name}`;
    document.getElementById('workspace-title').textContent = p.name;
    document.getElementById('workspace-type-badge').textContent = `${p.type} STUDIO`;
    document.getElementById('workspace-type-badge').className = `badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}`;

    // スタジオ表示切り替え
    const gameContainer = document.getElementById('studio-game-container');
    const appContainer = document.getElementById('studio-app-container');
    const gameControls = document.getElementById('workspace-controls-game');
    const appControls = document.getElementById('workspace-controls-app');

    if (p.type === 'GAME') {
      gameContainer.style.display = 'flex';
      appContainer.style.display = 'none';
      gameControls.style.display = 'flex';
      appControls.style.display = 'none';
      setTimeout(() => {
        if (window.gameStudio.app) {
          window.gameStudio.app.resizeCanvas();
          window.gameStudio.renderHierarchy();
        }
      }, 50);
    } else {
      gameContainer.style.display = 'none';
      appContainer.style.display = 'flex';
      gameControls.style.display = 'none';
      appControls.style.display = 'flex';
      if (window.appStudio) {
        window.appStudio.loadProjectFiles(p.files);
      }
    }
  }

  // AI Direct Commander with Live Workspace Application
  handleAIChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    const chatContainer = document.getElementById('chat-messages');
    chatContainer.innerHTML += `<div class="chat-bubble user">${msg}</div>`;
    input.value = '';

    const p = this.store.getActiveProject();
    const typing = document.createElement('div');
    typing.className = 'chat-bubble agent';
    typing.textContent = 'Qwen Developer is generating patch...';
    chatContainer.appendChild(typing);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    setTimeout(() => {
      let patchPreview = '';
      if (p.type === 'GAME') {
        patchPreview = `// [Qwen] PlayCanvas Entity Injection\n+ const entity = new pc.Entity('AI_${msg.slice(0, 10)}');\n+ entity.addComponent('render', { type: 'sphere' });\n+ entity.setPosition(0, 2, 0);\n+ app.root.addChild(entity);`;
        this.currentPendingPatch = () => {
          window.gameStudio.addEntity('sphere', 'AI Sphere');
        };
      } else {
        patchPreview = `// [Qwen] Monaco Editor Code Injection\n+ // Added based on instruction: "${msg}"\n+ <div class="ai-generated-box" style="border:1px solid #00f3ff; margin-top:10px; padding:10px;">\n+   ✨ AI Generated Component (${msg})\n+ </div>`;
        this.currentPendingPatch = () => {
          const currentHtml = window.appStudio.files['index.html'] || '';
          window.appStudio.files['index.html'] = currentHtml.replace('</div>', `  <div style="border:1px dashed #00f3ff; padding:10px; margin-top:12px;">✨ AI Added: ${msg}</div>\n  </div>`);
          window.appStudio.switchFile('index.html');
          window.appStudio.triggerLivePreview();
        };
      }

      typing.textContent = `[Qwen] 変更差分を生成しました。Human Approval Gateへ送出します。`;

      // 承認ゲートを表示
      document.getElementById('gate-diff-content').textContent = patchPreview;
      document.getElementById('modal-approval-gate').classList.add('active');
    }, 700);
  }

  handleApproval(approved) {
    document.getElementById('modal-approval-gate').classList.remove('active');
    if (approved && this.currentPendingPatch) {
      this.currentPendingPatch();
      this.showToast('AI Patch Applied to Studio!');
      this.store.log('Human Gate', 'AIのコード/シーン変更を承認して適用しました。');
      this.switchView('workspace');
    } else {
      this.showToast('Change rejected.');
    }
    this.currentPendingPatch = null;
  }

  openCreateModal() { document.getElementById('modal-create-project').classList.add('active'); }
  closeCreateModal() { document.getElementById('modal-create-project').classList.remove('active'); }

  handleCreateProject() {
    const name = document.getElementById('proj-name').value.trim() || 'New Studio Project';
    const type = document.querySelector('input[name="studio-type"]:checked').value;
    const newProj = {
      id: 'proj_' + Date.now(),
      name,
      type,
      desc: type === 'GAME' ? 'PlayCanvas 3D Game' : 'Monaco Web IDE App',
      created: new Date().toLocaleDateString(),
      files: type === 'APP' ? this.store.projects[1].files : undefined
    };
    this.store.projects.unshift(newProj);
    this.closeCreateModal();
    this.selectProject(newProj.id);
    this.switchView('workspace');
  }

  showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
  }

  render() {
    document.getElementById('stat-proj-count').textContent = this.store.projects.length;
    document.getElementById('dash-recent-projects').innerHTML = this.store.projects.map(p => `
      <div class="compact-proj-item" onclick="nexusApp.selectProject('${p.id}'); nexusApp.switchView('workspace');">
        <div><strong>${p.name}</strong> <span class="badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}">${p.type} STUDIO</span></div>
        <button class="btn btn-xs btn-primary">起動</button>
      </div>
    `).join('');

    document.getElementById('projects-grid').innerHTML = this.store.projects.map(p => `
      <div class="project-card ${p.id === this.store.activeProjectId ? 'active-proj' : ''}">
        <div>
          <span class="badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}">${p.type} STUDIO</span>
          <div class="project-card-title">${p.name}</div>
          <div class="project-card-desc">${p.desc}</div>
        </div>
        <div class="project-card-footer">
          <span style="font-size:10px; color:var(--text-subtle);">${p.created}</span>
          <button class="btn btn-xs btn-primary" onclick="nexusApp.selectProject('${p.id}'); nexusApp.switchView('workspace');">スタジオを開く</button>
        </div>
      </div>
    `).join('');

    document.getElementById('dash-activity-log').innerHTML = this.store.logs.map(l => `
      <div class="log-entry"><span style="color:var(--text-subtle)">${l.time}</span> [${l.agent}] ${l.message}</div>
    `).join('');
  }
}

let nexusApp;
window.addEventListener('DOMContentLoaded', () => {
  nexusApp = new NexusPlatform();
});

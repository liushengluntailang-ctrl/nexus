/**
 * NEXUS PLATFORM — HYBRID STUDIO ENGINE
 * Fixed: Project Creation, LocalStorage Persistence, Global Scope, Monaco & PlayCanvas
 */

const STORAGE_PROJECTS_KEY = 'nexus_studio_projects_v2';

// デフォルトの初期プロジェクトテンプレート
const DEFAULT_PROJECTS = [
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

// ==========================================
// 1. STATE STORE (LocalStorage 永続化対応)
// ==========================================
class NexusStore {
  constructor() {
    this.projects = this.loadProjects();
    this.activeProjectId = this.projects[0] ? this.projects[0].id : null;
    this.logs = [];
    this.pendingApprovals = [];
  }

  loadProjects() {
    try {
      const saved = localStorage.getItem(STORAGE_PROJECTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('LocalStorage load error:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_PROJECTS));
  }

  saveProjects() {
    try {
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(this.projects));
    } catch (e) {
      console.error('LocalStorage save error:', e);
    }
  }

  getActiveProject() {
    return this.projects.find(p => p.id === this.activeProjectId) || this.projects[0];
  }

  addProject(project) {
    this.projects.unshift(project);
    this.activeProjectId = project.id;
    this.saveProjects();
  }

  deleteProject(id) {
    this.projects = this.projects.filter(p => p.id !== id);
    if (this.activeProjectId === id) {
      this.activeProjectId = this.projects[0] ? this.projects[0].id : null;
    }
    this.saveProjects();
  }

  log(agent, message) {
    this.logs.unshift({ time: new Date().toLocaleTimeString(), agent, message });
    if (this.logs.length > 40) this.logs.pop();
  }
}

// ==========================================
// 2. PLAYCANVAS GAME STUDIO
// ==========================================
class PlayCanvasStudio {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.app = null;
    this.entities = [];
    this.selectedEntity = null;
    this.cube = null;
    this.initEngine();
  }

  initEngine() {
    if (typeof pc === 'undefined' || !this.canvas) return;

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

      // Cyber Cube
      this.cube = new pc.Entity('Cyber Cube');
      this.cube.addComponent('render', { type: 'box' });
      this.cube.setPosition(0, 0.5, 0);
      this.app.root.addChild(this.cube);
      this.entities.push(this.cube);

      const mat = new pc.StandardMaterial();
      mat.diffuse = new pc.Color(0, 0.9, 1);
      mat.emissive = new pc.Color(0, 0.2, 0.3);
      mat.update();
      this.cube.render.material = mat;

      this.app.on('update', (dt) => {
        if (this.cube) {
          this.cube.rotate(15 * dt, 25 * dt, 0);
        }
      });

      console.log('✔ PlayCanvas Engine Ready');
    } catch (e) {
      console.warn('PlayCanvas Init Warning:', e.message);
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
      if (container) container.innerHTML = '<div class="empty-state">オブジェクトを選択してください</div>';
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
// 3. MONACO EDITOR APP STUDIO
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

      console.log('✔ Monaco Editor Ready');
      this.triggerLivePreview();
    });
  }

  loadProjectFiles(files) {
    // filesが存在しない場合のフォールバック
    if (!files || typeof files !== 'object') {
      this.files = JSON.parse(JSON.stringify(DEFAULT_PROJECTS[1].files));
    } else {
      this.files = { ...files };
    }
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
// 4. PLATFORM ORCHESTRATOR
// ==========================================
class NexusPlatform {
  constructor() {
    this.store = new NexusStore();
    this.currentView = 'dashboard';

    this.initUIEvents();

    window.gameStudio = new PlayCanvasStudio('playcanvas-canvas');
    window.appStudio = new MonacoStudio('monaco-editor-container', 'app-preview-frame');

    this.render();
    if (this.store.activeProjectId) {
      this.selectProject(this.store.activeProjectId);
    }
  }

  initUIEvents() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });

    // Project Modals
    document.getElementById('btn-quick-new-proj').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-open-create-modal').addEventListener('click', () => this.openCreateModal());
    document.getElementById('btn-close-proj-modal').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-cancel-proj').addEventListener('click', () => this.closeCreateModal());
    document.getElementById('btn-submit-proj').addEventListener('click', () => this.handleCreateProject());

    // Studio Options Select
    document.querySelectorAll('.studio-option input').forEach(radio => {
      radio.addEventListener('change', (e) => {
        document.querySelectorAll('.studio-option').forEach(opt => opt.classList.remove('active'));
        e.target.closest('.studio-option').classList.add('active');
      });
    });

    // Game Controls
    document.getElementById('btn-add-cube').addEventListener('click', () => {
      window.gameStudio.addEntity('box', 'Cube ' + (window.gameStudio.entities.length + 1));
      this.showToast('Cube added to 3D Scene');
    });
    document.getElementById('btn-add-sphere').addEventListener('click', () => {
      window.gameStudio.addEntity('sphere', 'Sphere ' + (window.gameStudio.entities.length + 1));
      this.showToast('Sphere added to 3D Scene');
    });
    document.getElementById('btn-toggle-play').addEventListener('click', () => {
      this.showToast('PlayCanvas 3D Game Loop Active');
    });

    // App Controls
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

    if (viewName === 'workspace') {
      const p = this.store.getActiveProject();
      if (p.type === 'GAME' && window.gameStudio && window.gameStudio.app) {
        window.gameStudio.app.resizeCanvas();
        window.gameStudio.renderHierarchy();
      } else if (p.type === 'APP' && window.appStudio && window.appStudio.editor) {
        window.appStudio.editor.layout();
      }
    }
    this.render();
  }

  selectProject(id) {
    this.store.activeProjectId = id;
    const p = this.store.getActiveProject();
    if (!p) return;

    this.showToast(`Active Studio: ${p.name}`);

    document.getElementById('header-active-project').textContent = `${p.type === 'GAME' ? '🎮' : '💻'} ${p.name}`;
    document.getElementById('workspace-title').textContent = p.name;
    const badge = document.getElementById('workspace-type-badge');
    badge.textContent = `${p.type} STUDIO`;
    badge.className = `badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}`;

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
        if (window.gameStudio && window.gameStudio.app) {
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
    this.render();
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
    const nameInput = document.getElementById('proj-name');
    const name = nameInput.value.trim() || `Studio Project ${this.store.projects.length + 1}`;
    
    // 確実に選択されたスタジオ種別を取得
    const checkedRadio = document.querySelector('input[name="studio-type"]:checked');
    const type = checkedRadio ? checkedRadio.value : 'GAME';

    const newProj = {
      id: 'proj_' + Date.now(),
      name,
      type,
      desc: type === 'GAME' ? 'PlayCanvas 3D Game Studio' : 'Monaco Web IDE Studio',
      created: new Date().toLocaleDateString(),
      files: type === 'APP' ? JSON.parse(JSON.stringify(DEFAULT_PROJECTS[1].files)) : undefined
    };

    // 1. Storeへ保存 (LocalStorage自動永続化)
    this.store.addProject(newProj);
    this.store.log('Human', `プロジェクト [${name}] (${type} STUDIO) を新規作成しました。`);

    // 2. モーダルを閉じる
    this.closeCreateModal();

    // 3. UI一覧を再描画
    this.render();

    // 4. 新規プロジェクトのスタジオを開く
    this.selectProject(newProj.id);
    this.switchView('workspace');
    this.showToast(`Created & Launched: ${name}`);
  }

  deleteProject(id) {
    if (!confirm('このプロジェクトを削除しますか？')) return;
    this.store.deleteProject(id);
    this.render();
    if (this.store.activeProjectId) {
      this.selectProject(this.store.activeProjectId);
    }
    this.showToast('Project deleted');
  }

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
        patchPreview = `// [Qwen] PlayCanvas 3D Scene Injection\n+ const entity = new pc.Entity('AI_${msg.slice(0, 10)}');\n+ entity.addComponent('render', { type: 'sphere' });\n+ entity.setPosition(0, 2, 0);\n+ app.root.addChild(entity);`;
        this.currentPendingPatch = () => {
          window.gameStudio.addEntity('sphere', 'AI Sphere');
        };
      } else {
        patchPreview = `// [Qwen] Monaco Editor Code Injection\n+ <!-- Added by AI: "${msg}" -->\n+ <div style="border:1px dashed #00f3ff; padding:10px; margin-top:12px;">\n+   ✨ AI Generated: ${msg}\n+ </div>`;
        this.currentPendingPatch = () => {
          const currentHtml = window.appStudio.files['index.html'] || '';
          window.appStudio.files['index.html'] = currentHtml.replace('</div>', `  <div style="border:1px dashed #00f3ff; padding:10px; margin-top:12px;">✨ AI Added: ${msg}</div>\n  </div>`);
          window.appStudio.switchFile('index.html');
          window.appStudio.triggerLivePreview();
        };
      }

      typing.textContent = `[Qwen] 変更差分を生成しました。Human Approval Gateへ送出します。`;

      document.getElementById('gate-diff-content').textContent = patchPreview;
      document.getElementById('modal-approval-gate').classList.add('active');
    }, 600);
  }

  handleApproval(approved) {
    document.getElementById('modal-approval-gate').classList.remove('active');
    if (approved && this.currentPendingPatch) {
      this.currentPendingPatch();
      this.showToast('AI Patch Applied!');
      this.store.log('Human Gate', 'AIのコード/シーン変更を承認して適用しました。');
      this.switchView('workspace');
    } else {
      this.showToast('Change rejected.');
    }
    this.currentPendingPatch = null;
  }

  showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
  }

  render() {
    document.getElementById('stat-proj-count').textContent = this.store.projects.length;

    // Dashboard Recent Projects
    const dashRecent = document.getElementById('dash-recent-projects');
    if (dashRecent) {
      dashRecent.innerHTML = this.store.projects.map(p => `
        <div class="compact-proj-item" onclick="window.nexusApp.selectProject('${p.id}'); window.nexusApp.switchView('workspace');">
          <div>
            <strong>${p.name}</strong> 
            <span class="badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}">${p.type} STUDIO</span>
          </div>
          <button class="btn btn-xs btn-primary">起動</button>
        </div>
      `).join('');
    }

    // Projects Grid
    const projGrid = document.getElementById('projects-grid');
    if (projGrid) {
      projGrid.innerHTML = this.store.projects.map(p => `
        <div class="project-card ${p.id === this.store.activeProjectId ? 'active-proj' : ''}">
          <div>
            <span class="badge ${p.type === 'GAME' ? 'badge-game' : 'badge-app'}">${p.type} STUDIO</span>
            <div class="project-card-title">${p.name}</div>
            <div class="project-card-desc">${p.desc}</div>
          </div>
          <div class="project-card-footer">
            <span style="font-size:10px; color:var(--text-subtle);">${p.created}</span>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-xs btn-danger-subtle" onclick="window.nexusApp.deleteProject('${p.id}')">削除</button>
              <button class="btn btn-xs btn-primary" onclick="window.nexusApp.selectProject('${p.id}'); window.nexusApp.switchView('workspace');">スタジオを開く</button>
            </div>
          </div>
        </div>
      `).join('');
    }

    // Logs
    const logContainer = document.getElementById('dash-activity-log');
    if (logContainer) {
      logContainer.innerHTML = this.store.logs.map(l => `
        <div class="log-entry"><span style="color:var(--text-subtle)">${l.time}</span> [${l.agent}] ${l.message}</div>
      `).join('');
    }
  }
}

// グローバルスコープに明示的にバインド（HTMLのインラインonclickから参照可能にする）
window.addEventListener('DOMContentLoaded', () => {
  window.nexusApp = new NexusPlatform();
});
